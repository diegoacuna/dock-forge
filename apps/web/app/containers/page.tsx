"use client";

import Link from "next/link";
import { Copy, Ellipsis, FileSearch, PlayCircle, Search, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ContainerLogEntry, ContainerLogsResponse, ContainerSummary, ContainersPageData, Group } from "@dockforge/shared";
import { buildApiUrl, fetchJson, useApiQuery } from "../../lib/api";
import { appendLogEntry, trimLogEntries } from "../../lib/container-logs";
import { getContainerOverflowMenuItems, getPrimaryContainerAction, type PendingContainerAction } from "../../lib/container-row-actions";
import { PageHeader, Panel, Input, Select, Button, Badge } from "../../components/ui";
import { shouldShowContainersOnboarding } from "../../lib/onboarding";
import { GroupedContainersTable } from "../../components/grouped-containers-table";
import { groupContainerRowsByFolder, mapRuntimeContainersToRows } from "../../lib/grouped-containers";

type PendingAction = {
  containerId: string;
  action: PendingContainerAction;
};

const actionLabels: Record<PendingAction["action"], { idle: string; pending: string }> = {
  start: { idle: "Start", pending: "Starting..." },
  stop: { idle: "Stop", pending: "Stopping..." },
  restart: { idle: "Restart", pending: "Restarting..." },
};

const logTailOptions = [100, 200, 500] as const;
const containersTourSteps = [
  {
    id: "overview",
    eyebrow: "Containers Area",
    title: "This section is your runtime control table",
    description:
      "Use the Containers page when you need to inspect an individual service, confirm state quickly, and move into logs or deeper Docker detail without leaving DockForge.",
    bullets: [
      "Every row reflects live Docker runtime data grouped by compose folder when available.",
      "Open the container name to jump into the full detail page with inspect JSON and terminal helpers.",
    ],
    icon: FileSearch,
  },
  {
    id: "filters",
    eyebrow: "Filters",
    title: "Narrow the list before you operate",
    description:
      "Use the state, search, and group filters to isolate the services you need before taking action, especially when several projects are running at once.",
    bullets: [
      "State filters help you isolate running, stopped, unhealthy, or restarting containers.",
      "Search and group filters reduce the list without leaving the live Containers view.",
    ],
    icon: Search,
  },
  {
    id: "row-actions",
    eyebrow: "Row Controls",
    title: "Each row exposes the key controls you need most",
    description:
      "The row gives you a fast path into detail, image-copy, runtime actions, and logs so you can inspect or intervene without context switching.",
    bullets: [
      "Name link opens container detail, and the copy button grabs the image URI for reuse elsewhere.",
      "Start, Stop, Restart, and Logs are the primary row actions for day-to-day runtime work.",
    ],
    icon: PlayCircle,
  },
] as const;

export default function ContainersPage() {
  const [state, setState] = useState("all");
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedLogsContainerId, setExpandedLogsContainerId] = useState<string | null>(null);
  const [openMenuContainerId, setOpenMenuContainerId] = useState<string | null>(null);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourMutationPending, setTourMutationPending] = useState(false);
  const [tourError, setTourError] = useState<string | null>(null);
  const [tourDismissed, setTourDismissed] = useState(false);
  const queryClient = useQueryClient();
  const { data: groups } = useApiQuery<Group[]>(["groups"], "/groups");
  const {
    data: pageData,
    error: pageDataError,
    isLoading: pageDataLoading,
    refetch,
  } = useApiQuery<ContainersPageData>(["containers-page-data"], "/containers/page-data", 8_000);
  const containers = useMemo(() => {
    const runtimeConnected = pageData?.runtime.status === "connected";
    if (!runtimeConnected) {
      return [];
    }

    let filtered = [...(pageData?.containers ?? [])];
    if (state !== "all") {
      filtered = filtered.filter((container) => {
        if (container.state === state) {
          return true;
        }

        return state === "unhealthy" && container.health === "unhealthy";
      });
    }

    if (search) {
      const normalizedSearch = search.toLowerCase();
      filtered = filtered.filter((container) => container.name.toLowerCase().includes(normalizedSearch));
    }

    if (groupId) {
      filtered = filtered.filter((container) => container.groupIds.includes(groupId));
    }

    return filtered;
  }, [groupId, pageData?.containers, pageData?.runtime.status, search, state]);
  const groupedContainers = useMemo(() => groupContainerRowsByFolder(mapRuntimeContainersToRows(containers)), [containers]);
  const showContainersOnboarding = shouldShowContainersOnboarding({
    runtimeStatus: pageData?.runtime.status ?? "connected",
    totalContainers: pageData?.containers.length ?? 0,
    seen: (pageData?.onboarding.containersTourSeen ?? false) || tourDismissed,
  });
  const showReplayTourButton =
    pageData?.runtime.status === "connected" &&
    (pageData?.containers.length ?? 0) > 0 &&
    !showContainersOnboarding;

  const isRestarting = (container: ContainerSummary) => container.state === "restarting";
  const isStopped = (container: ContainerSummary) => ["exited", "dead", "created"].includes(container.state);
  const isRowPending = (containerId: string) => pendingAction?.containerId === containerId;
  const isSpecificActionPending = (containerId: string, action: PendingAction["action"]) =>
    pendingAction?.containerId === containerId && pendingAction.action === action;

  const runAction = async (container: ContainerSummary, action: PendingAction["action"]) => {
    setActionError(null);
    setPendingAction({ containerId: container.id, action });

    try {
      await fetchJson(`/containers/${container.name}/${action}`, { method: "POST" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["containers-page-data"] }),
        queryClient.invalidateQueries({ queryKey: ["containers"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Failed to ${action} ${container.name}`);
    } finally {
      setPendingAction(null);
    }
  };

  const updateContainersTourSeen = async (seen: boolean) => {
    setTourMutationPending(true);
    setTourError(null);

    try {
      await fetchJson("/onboarding/containers-tour", {
        method: "POST",
        body: JSON.stringify({ containersTourSeen: seen }),
      });
      setTourDismissed(seen);
      await queryClient.invalidateQueries({ queryKey: ["containers-page-data"] });
      if (!seen) {
        setTourStepIndex(0);
      }
    } catch (error) {
      setTourError(error instanceof Error ? error.message : "Failed to update the containers tour state.");
    } finally {
      setTourMutationPending(false);
    }
  };

  useEffect(() => {
    if (!pageData?.onboarding.containersTourSeen) {
      setTourDismissed(false);
    }
  }, [pageData?.onboarding.containersTourSeen]);

  const toggleLogs = (containerId: string) => {
    setExpandedLogsContainerId((current) => (current === containerId ? null : containerId));
  };

  useEffect(() => {
    if (!openMenuContainerId) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof HTMLElement) || target.closest("[data-container-row-menu-root='true']")) {
        return;
      }

      setOpenMenuContainerId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuContainerId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuContainerId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Containers"
        description="Inspect every local container, filter by runtime state, and jump directly into detail views."
        actions={
          showReplayTourButton ? (
            <Button variant="ghost" disabled={tourMutationPending} onClick={() => void updateContainersTourSeen(false)}>
              Show tour again
            </Button>
          ) : undefined
        }
      />

      {pageDataLoading ? (
        <Panel>
          <p className="text-sm text-slate-600">Loading containers from Docker…</p>
        </Panel>
      ) : null}

      {!pageDataLoading && pageDataError ? (
        <UnavailableState
          title="Containers could not be loaded"
          description={pageDataError instanceof Error ? pageDataError.message : "The Containers page request failed."}
          actionLabel="Retry"
          onRetry={() => void refetch()}
        />
      ) : null}

      {!pageDataLoading && !pageDataError && pageData?.runtime.status === "unavailable" ? (
        <UnavailableState
          title="Docker is unavailable right now"
          description={
            pageData.runtime.message ??
            "DockForge could not reach the Docker socket, so live container data is temporarily unavailable."
          }
          actionLabel="Retry connection"
          onRetry={() => void refetch()}
        />
      ) : null}

      {!pageDataLoading && !pageDataError && pageData?.runtime.status === "connected" && (pageData.containers.length ?? 0) === 0 ? (
        <EmptyContainersState />
      ) : null}

      {!pageDataLoading && !pageDataError && pageData?.runtime.status === "connected" && (pageData.containers.length ?? 0) > 0 ? (
        <>
          {showContainersOnboarding ? (
            <ContainersOnboardingPanel
              stepIndex={tourStepIndex}
              onStepChange={setTourStepIndex}
              onDismiss={() => void updateContainersTourSeen(true)}
              pending={tourMutationPending}
              persistenceAvailable={pageData.onboarding.persistenceAvailable}
            />
          ) : null}

          <Panel className="grid gap-3 md:grid-cols-4">
            <Select value={state} onChange={(event) => setState(event.target.value)}>
              <option value="all">All states</option>
              <option value="running">Running</option>
              <option value="exited">Stopped</option>
              <option value="unhealthy">Unhealthy</option>
              <option value="restarting">Restarting</option>
            </Select>
            <Input placeholder="Search name" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              <option value="">All groups</option>
              {groups?.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
            <div className="flex items-center justify-end">
              <Badge tone="accent">
                {containers.length} visible of {pageData.containers.length}
              </Badge>
            </div>
          </Panel>

          <Panel>
            {actionError ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {actionError}
              </div>
            ) : null}
            {tourError ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{tourError}</div>
            ) : null}
            {!showContainersOnboarding && !pageData.onboarding.persistenceAvailable ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Containers tour persistence is unavailable until migrations are applied. Run <code>pnpm db:migrate</code>.
              </div>
            ) : null}
            {groupedContainers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-900">No containers match the current filters.</p>
                <p className="mt-2 text-sm text-slate-600">Adjust the filters to widen the result set and reveal more live containers.</p>
              </div>
            ) : (
              <GroupedContainersTable
                sections={groupedContainers}
                emptyState={null}
                getRowHref={(row) => `/containers/${row.detailTarget}`}
                renderActions={({ row }) => {
                  const container = containers.find((item) => item.containerKey === row.containerKey);
                  if (!container) {
                    return null;
                  }

                  const logsOpen = expandedLogsContainerId === container.id;
                  const pendingRowAction = pendingActionForContainer(container.id, isSpecificActionPending);
                  const primaryAction = getPrimaryContainerAction({
                    state: container.state,
                    isRowPending: isRowPending(container.id),
                    pendingAction: pendingRowAction,
                  });
                  const menuOpen = openMenuContainerId === container.id;

                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={primaryAction.action === "start" ? "success" : "danger"}
                        className="min-w-[5.75rem]"
                        disabled={primaryAction.disabled}
                        onClick={() => void runAction(container, primaryAction.action)}
                      >
                        {primaryAction.label}
                      </Button>
                      <Button variant={logsOpen ? "secondary" : "ghost"} onClick={() => toggleLogs(container.id)}>
                        {logsOpen ? "Hide Logs" : "Logs"}
                      </Button>
                      <div className="relative" data-container-row-menu-root="true">
                        <Button
                          variant="ghost"
                          aria-label={`Open actions for ${container.name}`}
                          aria-expanded={menuOpen}
                          className="h-10 w-10 rounded-2xl px-0"
                          onClick={() => setOpenMenuContainerId(menuOpen ? null : container.id)}
                        >
                          <Ellipsis className="mx-auto h-4 w-4" />
                        </Button>
                        {menuOpen ? (
                          <div className="absolute right-0 top-full z-10 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                            <button
                              type="button"
                              className="flex w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                              disabled={isRowPending(container.id) || isStopped(container) || isRestarting(container)}
                              onClick={() => {
                                setOpenMenuContainerId(null);
                                void runAction(container, "restart");
                              }}
                            >
                              {isSpecificActionPending(container.id, "restart") ? actionLabels.restart.pending : actionLabels.restart.idle}
                            </button>
                            {getContainerOverflowMenuItems(container.name)
                              .filter((item) => item.key === "terminal")
                              .map((item) => (
                                <Link
                                  key={item.key}
                                  href={item.href}
                                  className="mt-1 block rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
                                  onClick={() => setOpenMenuContainerId(null)}
                                >
                                  {item.label}
                                </Link>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                }}
                renderExpandedContent={({ row }) => {
                  const container = containers.find((item) => item.containerKey === row.containerKey);
                  if (!container || expandedLogsContainerId !== container.id) {
                    return null;
                  }

                  return <ContainerLogsPanel container={container} />;
                }}
              />
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

const UnavailableState = ({
  title,
  description,
  actionLabel,
  onRetry,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onRetry: () => void;
}) => (
  <Panel className="space-y-4">
    <Badge tone="danger">Docker unavailable</Badge>
    <div>
      <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={onRetry}>
        {actionLabel}
      </Button>
    </div>
  </Panel>
);

const EmptyContainersState = () => (
  <Panel className="space-y-4">
    <Badge tone="accent">No containers detected</Badge>
    <div>
      <h2 className="text-2xl font-semibold text-slate-950">Start a container to populate this page</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        DockForge is connected to Docker, but there are no containers to inspect yet. Once something is running or created locally, it will appear here automatically.
      </p>
    </div>
  </Panel>
);

const ContainersOnboardingPanel = ({
  stepIndex,
  onStepChange,
  onDismiss,
  pending,
  persistenceAvailable,
}: {
  stepIndex: number;
  onStepChange: (index: number) => void;
  onDismiss: () => void;
  pending: boolean;
  persistenceAvailable: boolean;
}) => {
  const currentStep = containersTourSteps[stepIndex];
  const Icon = currentStep.icon;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === containersTourSteps.length - 1;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-panel">
      <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <Badge tone="accent">Containers Tour</Badge>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3 text-orange-300">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{currentStep.eyebrow}</p>
                <h2 className="mt-2 text-3xl font-semibold leading-tight text-white">{currentStep.title}</h2>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">{currentStep.description}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {currentStep.bullets.map((bullet) => (
              <div key={bullet} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                {bullet}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" disabled={isFirstStep || pending} onClick={() => onStepChange(Math.max(stepIndex - 1, 0))}>
              Back
            </Button>
            <Button variant="ghost" disabled={pending} onClick={onDismiss}>
              Skip tour
            </Button>
            {!isLastStep ? (
              <Button variant="primary" disabled={pending} onClick={() => onStepChange(Math.min(stepIndex + 1, containersTourSteps.length - 1))}>
                Next
              </Button>
            ) : (
              <Button variant="primary" disabled={pending} onClick={onDismiss}>
                Finish tour
              </Button>
            )}
          </div>
          {!persistenceAvailable ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              DockForge cannot remember tour completion until migrations are applied. Run <code>pnpm db:migrate</code>.
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Tour progress</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  Step {stepIndex + 1} of {containersTourSteps.length}
                </p>
              </div>
              <div className="flex gap-2">
                {containersTourSteps.map((step, index) => (
                  <span
                    key={step.id}
                    className={`h-2.5 w-10 rounded-full ${index === stepIndex ? "bg-orange-400" : "bg-white/15"}`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {containersTourSteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onStepChange(index)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    index === stepIndex ? "border-orange-300 bg-orange-500/10 text-white" : "border-white/10 bg-white/0 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{step.eyebrow}</p>
                  <p className="mt-1 text-sm font-medium">{step.title}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-orange-300" />
                Filters narrow the list fast before you operate.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <div className="flex items-center gap-2">
                <Copy className="h-4 w-4 text-orange-300" />
                Copy image URI directly from the row when you need it elsewhere.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <div className="flex items-center gap-2">
                <Square className="h-4 w-4 text-orange-300" />
                Runtime buttons and inline logs cover the most common interventions.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const pendingActionForContainer = (
  containerId: string,
  isSpecificActionPending: (containerId: string, action: PendingAction["action"]) => boolean,
): PendingContainerAction | null => {
  if (isSpecificActionPending(containerId, "start")) {
    return "start";
  }

  if (isSpecificActionPending(containerId, "stop")) {
    return "stop";
  }

  if (isSpecificActionPending(containerId, "restart")) {
    return "restart";
  }

  return null;
};

const ContainerLogsPanel = ({ container }: { container: ContainerSummary }) => {
  const [tailLines, setTailLines] = useState<number>(200);
  const [live, setLive] = useState(false);
  const [entries, setEntries] = useState<ContainerLogEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | null = null;

    const loadSnapshot = async () => {
      setLoading(true);
      setError(null);

      try {
        const snapshot = await fetchJson<ContainerLogsResponse>(`/containers/${encodeURIComponent(container.name)}/logs?tail=${tailLines}`);
        if (!active) {
          return;
        }

        setEntries(trimLogEntries(snapshot.entries, tailLines));
        setTruncated(snapshot.truncated);
        setLoading(false);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : `Failed to load logs for ${container.name}`);
        setEntries([]);
        setLoading(false);
      }
    };

    if (!live) {
      void loadSnapshot();
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    eventSource = new EventSource(buildApiUrl(`/containers/${encodeURIComponent(container.name)}/logs/stream?tail=${tailLines}`));

    eventSource.addEventListener("snapshot", (event) => {
      if (!active) {
        return;
      }

      const snapshot = JSON.parse((event as MessageEvent<string>).data) as ContainerLogsResponse;
      setEntries(trimLogEntries(snapshot.entries, tailLines));
      setTruncated(snapshot.truncated);
      setLoading(false);
    });

    eventSource.addEventListener("log", (event) => {
      if (!active) {
        return;
      }

      const entry = JSON.parse((event as MessageEvent<string>).data) as ContainerLogEntry;
      setEntries((current) => appendLogEntry(current, entry, tailLines));
      setLoading(false);
    });

    eventSource.addEventListener("stream-error", (event) => {
      if (!active) {
        return;
      }

      const payload = JSON.parse((event as MessageEvent<string>).data) as { message: string };
      setError(payload.message);
      setLive(false);
      setLoading(false);
      eventSource?.close();
    });

    eventSource.onerror = () => {
      if (!active) {
        return;
      }

      setError(`Live log stream disconnected for ${container.name}`);
      setLive(false);
      setLoading(false);
      eventSource?.close();
    };

    return () => {
      active = false;
      eventSource?.close();
    };
  }, [container.name, live, refreshNonce, tailLines]);

  useEffect(() => {
    if (!scrollRef.current || loading || entries.length === 0) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, live, loading, tailLines]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Logs for {container.name}</p>
          <p className="text-xs text-slate-500">
            Showing the last {tailLines} lines{truncated ? " from a larger log stream" : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <span>Live</span>
            <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${live ? "bg-orange-500" : "bg-slate-300"}`}>
              <input
                type="checkbox"
                checked={live}
                onChange={(event) => setLive(event.target.checked)}
                className="peer sr-only"
                aria-label={`Toggle live logs for ${container.name}`}
              />
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition ${live ? "translate-x-5" : "translate-x-1"}`}
              />
            </span>
          </label>
          <Select value={String(tailLines)} onChange={(event) => setTailLines(Number(event.target.value))} className="w-auto min-w-[7rem]">
            {logTailOptions.map((option) => (
              <option key={option} value={option}>
                Last {option}
              </option>
            ))}
          </Select>
          <Button variant="ghost" disabled={live || loading} onClick={() => setRefreshNonce((current) => current + 1)}>
            Refresh
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="mt-4 max-h-96 overflow-y-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-100">
        {loading ? <p className="text-slate-400">Loading logs…</p> : null}
        {!loading && error ? <p className="text-rose-300">{error}</p> : null}
        {!loading && !error && entries.length === 0 ? <p className="text-slate-400">No logs available for this container.</p> : null}
        {!loading && !error && entries.length > 0 ? (
          <div className="space-y-1">
            {entries.map((entry, index) => (
              <div
                key={`${entry.timestamp ?? "no-timestamp"}-${index}`}
                className={entry.stream === "stderr" ? "text-amber-300" : "text-slate-100"}
              >
                {entry.timestamp ? <span className="mr-2 text-slate-500">{entry.timestamp}</span> : null}
                <span className="mr-2 uppercase text-[10px] tracking-[0.2em] text-slate-500">{entry.stream}</span>
                <span className="whitespace-pre-wrap break-words">{entry.message || " "}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
