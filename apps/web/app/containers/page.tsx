"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ContainerLogEntry, ContainerLogsResponse, ContainerSummary, Group } from "@dockforge/shared";
import { buildApiUrl, fetchJson, useApiQuery } from "../../lib/api";
import { appendLogEntry, trimLogEntries } from "../../lib/container-logs";
import { PageHeader, Panel, Table, Input, Select, Button, CopyButton } from "../../components/ui";
import { StateBadge } from "../../components/status";
import { getFolderLabel, shortenImageName } from "../../lib/utils";

type PendingAction = {
  containerId: string;
  action: "start" | "stop" | "restart";
};

const actionLabels: Record<PendingAction["action"], { idle: string; pending: string }> = {
  start: { idle: "Start", pending: "Starting..." },
  stop: { idle: "Stop", pending: "Stopping..." },
  restart: { idle: "Restart", pending: "Restarting..." },
};

const logTailOptions = [100, 200, 500] as const;

export default function ContainersPage() {
  const [state, setState] = useState("all");
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedImageForContainerId, setCopiedImageForContainerId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [expandedLogsContainerId, setExpandedLogsContainerId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: groups } = useApiQuery<Group[]>(["groups"], "/groups");
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (search) params.set("search", search);
    if (groupId) params.set("groupId", groupId);
    return params.toString();
  }, [state, search, groupId]);
  const { data } = useApiQuery<ContainerSummary[]>(["containers", queryString], `/containers?${queryString}`, 8_000);
  const groupedContainers = useMemo(() => {
    const buckets = new Map<string, ContainerSummary[]>();

    for (const container of data ?? []) {
      const folderLabel = getFolderLabel(container.compose.workingDir);
      const current = buckets.get(folderLabel) ?? [];
      current.push(container);
      buckets.set(folderLabel, current);
    }

    return [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([folderLabel, containers]) => ({
        folderLabel,
        containers: [...containers].sort((left, right) => left.name.localeCompare(right.name)),
      }));
  }, [data]);

  const isRunning = (container: ContainerSummary) => container.state === "running";
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
        queryClient.invalidateQueries({ queryKey: ["containers"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Failed to ${action} ${container.name}`);
    } finally {
      setPendingAction(null);
    }
  };

  const handleImageCopied = (containerId: string) => {
    setCopiedImageForContainerId(containerId);
    window.setTimeout(() => {
      setCopiedImageForContainerId((current) => (current === containerId ? null : current));
    }, 2000);
  };

  const toggleFolder = (folderLabel: string) => {
    setCollapsedFolders((current) => ({
      ...current,
      [folderLabel]: !current[folderLabel],
    }));
  };

  const toggleLogs = (containerId: string) => {
    setExpandedLogsContainerId((current) => (current === containerId ? null : containerId));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Containers" description="Inspect every local container, filter by runtime state, and jump directly into detail views." />
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
      </Panel>

      <Panel>
        {actionError ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </div>
        ) : null}
        <Table>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Ports</th>
              <th className="px-3 py-2">Groups</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groupedContainers.map((group) => (
              <GroupRows
                key={group.folderLabel}
                folderLabel={group.folderLabel}
                containers={group.containers}
                isRunning={isRunning}
                isRestarting={isRestarting}
                isStopped={isStopped}
                isRowPending={isRowPending}
                isSpecificActionPending={isSpecificActionPending}
                runAction={runAction}
                isCollapsed={!!collapsedFolders[group.folderLabel]}
                onToggle={() => toggleFolder(group.folderLabel)}
                onImageCopied={handleImageCopied}
                copiedImageForContainerId={copiedImageForContainerId}
                expandedLogsContainerId={expandedLogsContainerId}
                onToggleLogs={toggleLogs}
              />
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}

const GroupRows = ({
  folderLabel,
  containers,
  isRunning,
  isRestarting,
  isStopped,
  isRowPending,
  isSpecificActionPending,
  runAction,
  isCollapsed,
  onToggle,
  onImageCopied,
  copiedImageForContainerId,
  expandedLogsContainerId,
  onToggleLogs,
}: {
  folderLabel: string;
  containers: ContainerSummary[];
  isRunning: (container: ContainerSummary) => boolean;
  isRestarting: (container: ContainerSummary) => boolean;
  isStopped: (container: ContainerSummary) => boolean;
  isRowPending: (containerId: string) => boolean;
  isSpecificActionPending: (containerId: string, action: PendingAction["action"]) => boolean;
  runAction: (container: ContainerSummary, action: PendingAction["action"]) => Promise<void>;
  isCollapsed: boolean;
  onToggle: () => void;
  onImageCopied: (containerId: string) => void;
  copiedImageForContainerId: string | null;
  expandedLogsContainerId: string | null;
  onToggleLogs: (containerId: string) => void;
}) => (
  <>
    <tr className="bg-transparent">
      <td colSpan={5} className="px-3 pb-2 pt-5">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between border-b border-slate-200 pb-2 text-left"
        >
          <div className="flex items-center gap-2">
            {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
            <div>
              <p className="text-sm font-semibold text-slate-900">{folderLabel}</p>
              <p className="text-xs text-slate-500">
                {containers.length} container{containers.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </button>
      </td>
    </tr>
    {!isCollapsed &&
      containers.map((container) => {
        const logsOpen = expandedLogsContainerId === container.id;

        return (
          <FragmentRows
            key={container.id}
            row={
              <tr className="rounded-2xl bg-slate-50">
                <td className="px-3 py-4">
                  <Link href={`/containers/${container.name}`} className="font-medium text-slate-950">
                    {container.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span title={container.image} className="truncate">
                      {shortenImageName(container.image)}
                    </span>
                    <div className="relative flex items-center">
                      <CopyButton
                        text={container.image}
                        label="Copy image URI"
                        iconOnly
                        onCopied={() => onImageCopied(container.id)}
                      />
                      {copiedImageForContainerId === container.id ? (
                        <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white shadow-sm">
                          Image URI copied
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{container.compose.project ?? folderLabel}</p>
                </td>
                <td className="px-3 py-4">
                  <StateBadge state={container.state} health={container.health} />
                </td>
                <td className="px-3 py-4 text-slate-700">{container.ports.map((port) => port.label).join(", ") || "—"}</td>
                <td className="px-3 py-4 text-slate-700">{container.groupNames.join(", ") || "—"}</td>
                <td className="px-3 py-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="success"
                      disabled={isRowPending(container.id) || isRunning(container) || isRestarting(container)}
                      onClick={() => void runAction(container, "start")}
                    >
                      {isSpecificActionPending(container.id, "start") ? actionLabels.start.pending : actionLabels.start.idle}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={isRowPending(container.id) || isStopped(container) || isRestarting(container)}
                      onClick={() => void runAction(container, "stop")}
                    >
                      {isSpecificActionPending(container.id, "stop") ? actionLabels.stop.pending : actionLabels.stop.idle}
                    </Button>
                    <Button
                      variant="warning"
                      disabled={isRowPending(container.id) || isStopped(container) || isRestarting(container)}
                      onClick={() => void runAction(container, "restart")}
                    >
                      {isSpecificActionPending(container.id, "restart") ? actionLabels.restart.pending : actionLabels.restart.idle}
                    </Button>
                    <Button variant={logsOpen ? "secondary" : "ghost"} onClick={() => onToggleLogs(container.id)}>
                      {logsOpen ? "Hide Logs" : "Logs"}
                    </Button>
                  </div>
                </td>
              </tr>
            }
            logsRow={
              logsOpen ? (
                <tr className="bg-white">
                  <td colSpan={5} className="px-3 pb-4">
                    <ContainerLogsPanel container={container} />
                  </td>
                </tr>
              ) : null
            }
          />
        );
      })}
  </>
);

const FragmentRows = ({ row, logsRow }: { row: ReactNode; logsRow: ReactNode }) => (
  <>
    {row}
    {logsRow}
  </>
);

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
