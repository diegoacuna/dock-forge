"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ContainerSummary, GroupActionLaunch, GroupDetail, GroupRun, GroupRunStep, GroupStatus, OrchestrationPlan } from "@dockforge/shared";
import { fetchJson, useApiQuery } from "../../../lib/api";
import { resolveGroupDetailTab } from "../../../lib/onboarding";
import { formatTimestamp } from "../../../lib/utils";
import { ExecutionOrderPanel, GroupAttachOnboardingCallout, GroupAttachPanel } from "../../../components/group-detail-panels";
import { GroupGraphPanel } from "../../../components/group-graph-panel";
import { StateBadge } from "../../../components/status";
import { Badge, Button, Input, PageHeader, Panel } from "../../../components/ui";
import { GroupedContainersTable } from "../../../components/grouped-containers-table";
import { GROUP_DETAIL_TABS, groupContainerRowsByFolder, mapGroupContainersToRows, summarizeRunHistory } from "../../../lib/grouped-containers";

type GroupAction = "start" | "stop" | "restart" | "start-clean";

type ActionModalState = {
  isOpen: boolean;
  action: GroupAction | null;
  runId: string | null;
  run: GroupRun | null;
  isLaunching: boolean;
  error: string | null;
  hasRefreshedFinalState: boolean;
};

const initialActionModalState: ActionModalState = {
  isOpen: false,
  action: null,
  runId: null,
  run: null,
  isLaunching: false,
  error: null,
  hasRefreshedFinalState: false,
};

const RUNNING_STATUSES = new Set<GroupRun["status"]>(["PENDING", "RUNNING"]);
const ACTION_BUTTONS: Array<{
  action: GroupAction;
  label: string;
  variant?: "secondary" | "ghost";
}> = [
  { action: "start", label: "Start Group" },
  { action: "stop", label: "Stop Group", variant: "secondary" },
  { action: "restart", label: "Restart Group", variant: "ghost" },
  { action: "start-clean", label: "Start Clean", variant: "ghost" },
];

const getActionLabel = (action: GroupAction | GroupRun["action"] | null) => {
  switch (action) {
    case "start":
    case "START":
      return "Start Group";
    case "stop":
    case "STOP":
      return "Stop Group";
    case "restart":
    case "RESTART":
      return "Restart Group";
    case "start-clean":
    case "START_CLEAN":
      return "Start Clean";
    default:
      return "Group Action";
  }
};

const getStepTone = (step: GroupRunStep) => {
  if (step.status === "FAILED") return "danger" as const;
  if (step.status === "RUNNING") return "accent" as const;
  if (step.status === "SKIPPED") return "warning" as const;
  if (step.metadata?.exitCode === 0) return "neutral" as const;
  return "success" as const;
};

const getRunTone = (run: GroupRun | null, error: string | null, isLaunching: boolean) => {
  if (error) return "danger" as const;
  if (!run) return isLaunching ? ("accent" as const) : ("neutral" as const);
  if (RUNNING_STATUSES.has(run.status)) return "accent" as const;
  return run.status === "FAILED" ? ("danger" as const) : ("success" as const);
};

const getStepDetail = (step: GroupRunStep) => {
  if (step.metadata?.exitCode === 0) {
    return "Exited normally with code 0.";
  }

  if (step.metadata?.noopReason === "already_running") {
    return "No Docker action was needed because the container was already running.";
  }

  if (step.metadata?.noopReason === "already_stopped") {
    return "No Docker action was needed because the container was already stopped.";
  }

  if (step.metadata?.exitCode != null) {
    return `Exit code ${step.metadata.exitCode}${step.metadata.oomKilled ? " · OOM killed" : ""}`;
  }

  return null;
};

const getVisibleGroupActions = (groupStatus: GroupStatus) => {
  if (groupStatus === "running") {
    return ACTION_BUTTONS.filter((button) => button.action !== "start");
  }

  if (groupStatus === "stopped") {
    return ACTION_BUTTONS.filter((button) => button.action !== "stop");
  }

  return ACTION_BUTTONS;
};

export function GroupDetailPageContent({ resolvedParams }: { resolvedParams: { id: string } }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const onboardingMode = searchParams.get("onboarding");
  const requestedTab = searchParams.get("tab");
  const tab = resolveGroupDetailTab({
    onboardingParam: onboardingMode,
    requestedTab,
    allowedTabs: GROUP_DETAIL_TABS,
  }) as (typeof GROUP_DETAIL_TABS)[number];
  const [attachPanelOpen, setAttachPanelOpen] = useState(false);
  const [containerSearch, setContainerSearch] = useState("");
  const [actionModal, setActionModal] = useState<ActionModalState>(initialActionModalState);
  const { data: group } = useApiQuery<GroupDetail>(["group", resolvedParams.id], `/groups/${resolvedParams.id}`, 8_000);
  const { data: containers } = useApiQuery<ContainerSummary[]>(["containers"], "/containers", 8_000);
  const { data: runs } = useApiQuery<GroupRun[]>(["group-runs", resolvedParams.id], `/groups/${resolvedParams.id}/runs`, 8_000);
  const { data: plan } = useApiQuery<OrchestrationPlan>(["group-plan", resolvedParams.id], `/groups/${resolvedParams.id}/plan`);
  const showAttachOnboarding = onboardingMode === "attach";
  const groupContainerSections = useMemo(() => {
    if (!group) {
      return [];
    }

    const rows = mapGroupContainersToRows({
      containers: group.containers,
      runtimeContainers: containers ?? [],
    });
    const normalizedSearch = containerSearch.trim().toLowerCase();
    const filteredRows = normalizedSearch
      ? rows.filter((row) =>
          [row.name, row.containerKey, row.groupMembership?.snapshotName ?? ""].some((value) => value.toLowerCase().includes(normalizedSearch)),
        )
      : rows;

    return groupContainerRowsByFolder(filteredRows);
  }, [containerSearch, containers, group]);

  const runAction = async (action: GroupAction) => {
    setActionModal({
      isOpen: true,
      action,
      runId: null,
      run: null,
      isLaunching: true,
      error: null,
      hasRefreshedFinalState: false,
    });

    try {
      const launch = await fetchJson<GroupActionLaunch>(`/groups/${resolvedParams.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      setActionModal({
        isOpen: true,
        action,
        runId: launch.runId,
        run: launch.run,
        isLaunching: false,
        error: null,
        hasRefreshedFinalState: false,
      });
    } catch (error) {
      setActionModal({
        isOpen: true,
        action,
        runId: null,
        run: null,
        isLaunching: false,
        error: error instanceof Error ? error.message : "Unable to start group action.",
        hasRefreshedFinalState: false,
      });
    }
  };

  useEffect(() => {
    if (!actionModal.runId || actionModal.isLaunching || !actionModal.run || !RUNNING_STATUSES.has(actionModal.run.status)) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const nextRun = await fetchJson<GroupRun>(`/group-runs/${actionModal.runId}`);
        if (!cancelled) {
          setActionModal((current) => (current.runId === nextRun.id ? { ...current, run: nextRun, error: null } : current));
        }
      } catch (error) {
        if (!cancelled) {
          setActionModal((current) =>
            current.runId === actionModal.runId
              ? { ...current, error: error instanceof Error ? error.message : "Unable to refresh run progress." }
              : current,
          );
        }
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [actionModal.runId, actionModal.run, actionModal.isLaunching]);

  useEffect(() => {
    if (!actionModal.run || actionModal.hasRefreshedFinalState || RUNNING_STATUSES.has(actionModal.run.status)) {
      return;
    }

    let cancelled = false;

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["group", resolvedParams.id] }),
      queryClient.invalidateQueries({ queryKey: ["group-runs", resolvedParams.id] }),
      queryClient.invalidateQueries({ queryKey: ["containers"] }),
    ]).then(() => {
      if (!cancelled) {
        setActionModal((current) => ({ ...current, hasRefreshedFinalState: true }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [actionModal.run, actionModal.hasRefreshedFinalState, queryClient, resolvedParams.id]);

  const handleTabClick = (nextTab: (typeof GROUP_DETAIL_TABS)[number]) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.push(`/groups/${resolvedParams.id}?${params.toString()}`);
  };

  const orchestrationBusy = actionModal.isLaunching || (actionModal.run != null && RUNNING_STATUSES.has(actionModal.run.status));
  const visibleGroupActions = getVisibleGroupActions(group?.groupStatus ?? "unknown");

  return (
    <div className="space-y-6">
      <PageHeader
        title={group?.name ?? "Group"}
        description={group?.description ?? "Group orchestration center with shared container membership, execution flow, and run history."}
        titlePrefix={
          <span
            className="h-6 w-6 rounded-lg border border-slate-200 shadow-sm"
            style={{ backgroundColor: group?.color ?? "#e2e8f0" }}
            aria-hidden="true"
          />
        }
        actions={
          <>
            {visibleGroupActions.map((button) => (
              <Button
                key={button.action}
                disabled={orchestrationBusy}
                variant={button.variant}
                onClick={() => void runAction(button.action)}
              >
                {button.label}
              </Button>
            ))}
          </>
        }
      />

      {actionModal.isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Orchestration progress</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">{getActionLabel(actionModal.run?.action ?? actionModal.action)}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {actionModal.run ? `Started ${formatTimestamp(actionModal.run.startedAt)}` : "Preparing orchestration run..."}
                </p>
              </div>
              <Button variant="ghost" disabled={orchestrationBusy} onClick={() => setActionModal(initialActionModalState)}>
                Close
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge tone={getRunTone(actionModal.run, actionModal.error, actionModal.isLaunching)}>
                {actionModal.error ? "Launch failed" : actionModal.run?.status ?? (actionModal.isLaunching ? "PENDING" : "WAITING")}
              </Badge>
              {actionModal.runId ? <Badge tone="neutral">Run {actionModal.runId}</Badge> : null}
            </div>

            {actionModal.error ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{actionModal.error}</div>
            ) : null}

            {actionModal.isLaunching && !actionModal.run ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Creating run and starting background execution.
              </div>
            ) : null}

            {actionModal.run ? (
              <div className="mt-6 space-y-3">
                {actionModal.run.steps.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Waiting for the first orchestration step to be recorded.
                  </div>
                ) : (
                  actionModal.run.steps.map((step) => (
                    <div key={step.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-950">
                            {step.action} · {step.containerNameSnapshot ?? step.containerKey ?? "group"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">{step.message ?? step.status}</p>
                        </div>
                        <Badge tone={getStepTone(step)}>{step.status}</Badge>
                      </div>
                      {getStepDetail(step) ? <p className="mt-3 text-sm text-slate-500">{getStepDetail(step)}</p> : null}
                      <p className="mt-3 text-xs text-slate-500">
                        Started {formatTimestamp(step.startedAt)}
                        {step.completedAt ? ` · Completed ${formatTimestamp(step.completedAt)}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {GROUP_DETAIL_TABS.map((item) => (
          <button
            key={item}
            onClick={() => handleTabClick(item)}
            className={`rounded-2xl px-4 py-2 text-sm ${tab === item ? "bg-slate-950 text-white" : "bg-white text-slate-700"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" && group ? (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Panel>
              <h2 className="text-lg font-semibold text-slate-950">Group summary</h2>
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p><strong>Slug:</strong> {group.slug}</p>
                <p><strong>Containers:</strong> {group.memberCount}</p>
                <p>
                  <strong>Live status:</strong> <span className="inline-flex align-middle"><StateBadge state={group.groupStatus} /></span>
                </p>
                <p><strong>Attached folders:</strong> {group.executionFolders.length}</p>
                <p><strong>Execution stages:</strong> {group.executionStages.length}</p>
                <p><strong>Last run:</strong> {group.lastRunStatus ?? "—"}</p>
              </div>
            </Panel>
            <Panel>
              <h2 className="text-lg font-semibold text-slate-950">Folders in this group</h2>
              <div className="mt-4 space-y-3">
                {group.executionStages.map((stage) => (
                  <div key={`stage-${stage.stage}`} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">Stage {stage.stage + 1}</p>
                      <p className="text-sm text-slate-500">
                        {stage.folders.length} folder{stage.folders.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {stage.folders.map((folder) => (
                        <span key={folder.folderLabel} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                          {folder.folderLabel} · {folder.containerCount}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {group.executionFolders.length === 0 ? <p className="text-sm text-slate-500">No folders attached yet.</p> : null}
              </div>
            </Panel>
          </div>
          <Panel>
            <h2 className="text-lg font-semibold text-slate-950">Preview plan</h2>
            <div className="mt-4 space-y-3">
              {plan?.layers.map((layer) => (
                <div key={layer.index} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-950">Stage {layer.index + 1}</p>
                  <p className="mt-2 text-sm text-slate-600">{layer.members.map((member) => member.aliasName || member.containerNameSnapshot).join(", ")}</p>
                </div>
              ))}
            </div>
          </Panel>
          {containers ? (
            <GroupAttachPanel
              group={group}
              containers={containers}
              title="Quick attach"
              description="Add one container fast or bulk-attach all current containers from a folder without leaving the overview."
            />
          ) : null}
        </div>
      ) : null}

      {tab === "Containers" && group ? (
        <div className="space-y-6">
          {containers && showAttachOnboarding ? <GroupAttachOnboardingCallout group={group} containers={containers} /> : null}
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Attach containers</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Add individual services or entire folders to this group. Expand this section when you want to change membership.
                </p>
              </div>
              <Button variant="ghost" className="inline-flex min-w-[11rem] items-center justify-center" onClick={() => setAttachPanelOpen((current) => !current)}>
                {attachPanelOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="ml-2">{attachPanelOpen ? "Hide attach tools" : "Show attach tools"}</span>
              </Button>
            </div>
            {attachPanelOpen && containers ? (
              <div className="mt-5">
                <GroupAttachPanel group={group} containers={containers} showHeader={false} />
              </div>
            ) : null}
          </Panel>
          <Panel>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-950">Attached containers</h2>
              <p className="mt-2 text-sm text-slate-600">
                Review the live runtime state for every attached container, grouped by folder, before adjusting execution order or graph dependencies.
              </p>
            </div>
            <div className="mb-4 max-w-md">
              <label className="block text-xs uppercase tracking-[0.2em] text-slate-500" htmlFor="group-container-search">
                Search attached containers
              </label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="group-container-search"
                  value={containerSearch}
                  onChange={(event) => setContainerSearch(event.target.value)}
                  placeholder="Search by name or container key"
                  className="pl-9"
                />
              </div>
            </div>
            <GroupedContainersTable
              sections={groupContainerSections}
              emptyState={
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-900">
                    {containerSearch.trim() ? "No attached containers match this search." : "No containers are attached to this group yet."}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {containerSearch.trim()
                      ? "Try a different container name or key."
                      : "Use the attach tools above to add containers and start building the group execution flow."}
                  </p>
                </div>
              }
              getRowHref={(row) => `/containers/${row.detailTarget}`}
              renderActions={({ row }) => (
                <div className="flex flex-wrap gap-2">
                  <Badge tone={row.groupMembership?.includeInStartAll ? "success" : "neutral"}>
                    {row.groupMembership?.includeInStartAll ? "Included in start all" : "Skipped by start all"}
                  </Badge>
                  <Badge tone={row.groupMembership?.includeInStopAll ? "accent" : "neutral"}>
                    {row.groupMembership?.includeInStopAll ? "Included in stop all" : "Skipped by stop all"}
                  </Badge>
                  {row.source === "group" ? <Badge tone="danger">Runtime snapshot only</Badge> : null}
                </div>
              )}
              renderExpandedContent={({ row }) =>
                row.groupMembership ? (
                  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Alias</p>
                      <p className="mt-2">{row.groupMembership.aliasName ?? "No alias"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Snapshot Name</p>
                      <p className="mt-2">{row.groupMembership.snapshotName}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Container Key</p>
                      <p className="mt-2 break-all">{row.containerKey}</p>
                    </div>
                  </div>
                ) : null
              }
            />
          </Panel>
        </div>
      ) : null}

      {tab === "Graph" && group ? <GroupGraphPanel group={group} /> : null}

      {tab === "Execution Order" && group ? <ExecutionOrderPanel group={group} /> : null}

      {tab === "Run History" ? (
        <div className="space-y-6">
          <Panel className="space-y-4">
            <Badge tone="accent">Run History</Badge>
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">Track this group’s orchestration runs</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Use this view when you need to understand what happened during a group start, stop, restart, or clean start. Each run shows the overall result and the exact execution steps that DockForge recorded.
              </p>
            </div>
          </Panel>
          {!runs || runs.length === 0 ? (
            <Panel className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-950">No run history yet</h3>
              <p className="text-sm text-slate-600">
                The first orchestration run for this group will appear here with its step-by-step execution log. Start, stop, or restart the group to create the first history entry.
              </p>
            </Panel>
          ) : (
            runs.map((run) => {
              const summary = summarizeRunHistory(run);

              return (
                <Panel key={run.id} className="space-y-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Run summary</p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-950">{summary.actionLabel}</h3>
                      <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
                        <span>Started {formatTimestamp(summary.startedAt)}</span>
                        <span>Completed {formatTimestamp(summary.completedAt)}</span>
                        <span>{summary.stepCount} step{summary.stepCount === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <StateBadge state={summary.status.toLowerCase()} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Execution steps</p>
                    {run.steps.map((step) => (
                      <div key={step.id} className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">
                          {step.action} · {step.containerNameSnapshot ?? step.containerKey ?? "group"}
                        </p>
                        <p className="mt-1">{step.message ?? step.status}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          Started {formatTimestamp(step.startedAt)}
                          {step.completedAt ? ` · Completed ${formatTimestamp(step.completedAt)}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
