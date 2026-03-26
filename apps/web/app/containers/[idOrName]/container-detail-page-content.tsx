"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { ContainerDetail } from "@dockforge/shared";
import { fetchJson, useApiQuery } from "@/lib/api";
import {
  CONTAINER_ACTION_FEEDBACK_TIMEOUT_MS,
  createContainerActionErrorFeedback,
  createPendingContainerActionFeedback,
  getContainerActionFeedbackLabel,
  getContainerActionFeedbackTone,
  isContainerActionBusy,
  markContainerActionWaitingForState,
  resolveContainerActionFeedback,
  type ContainerActionFeedback,
} from "@/lib/container-action-feedback";
import { CONTAINER_DETAIL_TABS, resolveContainerDetailTab } from "@/lib/container-detail-tabs";
import { getContainerDetailActions, type PendingContainerAction } from "@/lib/container-row-actions";
import { cn, formatTimestamp } from "@/lib/utils";
import { ContainerLogsPanel } from "@/components/container-logs-panel";
import { StateBadge } from "@/components/status";
import { Badge, Button, CopyButton, PageHeader, Panel } from "@/components/ui";
import { ContainerTerminalPanel } from "@/components/container-terminal-panel";

export function ContainerDetailPageContent({ resolvedParams }: { resolvedParams: { idOrName: string } }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [actionFeedback, setActionFeedback] = useState<ContainerActionFeedback>({ phase: "idle" });
  const busyAction = actionFeedback.phase === "pending" || actionFeedback.phase === "waiting_for_state" ? actionFeedback.action : null;
  const { data } = useApiQuery<ContainerDetail>(
    ["container", resolvedParams.idOrName],
    `/containers/${resolvedParams.idOrName}`,
    actionFeedback.phase === "waiting_for_state" ? 1_000 : 8_000,
  );
  const requestedTab = searchParams.get("tab");
  const tab = resolveContainerDetailTab(requestedTab) as (typeof CONTAINER_DETAIL_TABS)[number];

  const overview = data?.overview;
  const detailActions = overview
    ? getContainerDetailActions({
        state: overview.state,
        isActionPending: busyAction !== null,
        pendingAction: busyAction,
      })
    : [];

  const handleTabClick = (nextTab: (typeof CONTAINER_DETAIL_TABS)[number]) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.push(`/containers/${resolvedParams.idOrName}?${params.toString()}`);
  };

  const runAction = async (action: PendingContainerAction) => {
    if (!overview) {
      return;
    }

    setActionFeedback(createPendingContainerActionFeedback(action, overview));

    try {
      await fetchJson(`/containers/${resolvedParams.idOrName}/${action}`, { method: "POST" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["container", resolvedParams.idOrName] }),
        queryClient.invalidateQueries({ queryKey: ["containers-page-data"] }),
        queryClient.invalidateQueries({ queryKey: ["containers"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setActionFeedback((current) => (current.phase === "pending" && current.action === action ? markContainerActionWaitingForState(current) : current));
    } catch (error) {
      setActionFeedback(createContainerActionErrorFeedback(action, error instanceof Error ? error.message : `Failed to ${action} ${resolvedParams.idOrName}`));
    }
  };

  useEffect(() => {
    if (!overview) {
      return;
    }

    setActionFeedback((current) => resolveContainerActionFeedback(current, overview));
  }, [overview]);

  useEffect(() => {
    if (actionFeedback.phase !== "waiting_for_state" || !overview) {
      return;
    }

    const remainingMs = CONTAINER_ACTION_FEEDBACK_TIMEOUT_MS - (Date.now() - actionFeedback.startedAtMs);
    if (remainingMs <= 0) {
      setActionFeedback((current) => resolveContainerActionFeedback(current, overview, Date.now()));
      return;
    }

    const timer = window.setTimeout(() => {
      setActionFeedback((current) => resolveContainerActionFeedback(current, overview, Date.now()));
    }, remainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [actionFeedback, overview]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={overview?.name ?? resolvedParams.idOrName}
        titlePrefix={overview ? <StateBadge state={overview.state} health={overview.health} /> : undefined}
        description="Raw Docker inspect plus focused operational views."
        actions={
          overview ? (
            <div className="flex min-w-[18rem] flex-col gap-3 md:items-end">
              <div className="flex flex-wrap items-center gap-3">
                {detailActions.map((action) => (
                  <Button key={action.action} variant={action.variant} disabled={action.disabled} onClick={() => void runAction(action.action)}>
                    {action.label}
                  </Button>
                ))}
              </div>
              {actionFeedback.phase !== "idle" ? (
                <div
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-sm",
                    actionFeedback.phase === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
                    actionFeedback.phase === "error" && "border-rose-200 bg-rose-50 text-rose-900",
                    (actionFeedback.phase === "pending" || actionFeedback.phase === "waiting_for_state") &&
                      "border-orange-200 bg-orange-50 text-orange-900",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={getContainerActionFeedbackTone(actionFeedback)}>{getContainerActionFeedbackLabel(actionFeedback)}</Badge>
                    <span>{actionFeedback.message}</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        {CONTAINER_DETAIL_TABS.map((item) => (
          <button
            key={item}
            onClick={() => handleTabClick(item)}
            className={`rounded-2xl px-4 py-2 text-sm ${tab === item ? "bg-slate-950 text-white" : "bg-white text-slate-700"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" && overview ? (
        <Panel className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p><strong>Docker ID:</strong> {overview.id}</p>
            <p><strong>Image:</strong> {overview.image}</p>
            <p><strong>State:</strong> {overview.state}</p>
            <p><strong>Started:</strong> {formatTimestamp(overview.startedAt)}</p>
            <p><strong>Restart policy:</strong> {overview.restartPolicy ?? "—"}</p>
            <p><strong>Command:</strong> {overview.command ?? "—"}</p>
            <p><strong>Entrypoint:</strong> {overview.entrypoint.join(" ") || "—"}</p>
          </div>
          <div className="space-y-2">
            <p><strong>Ports:</strong> {overview.ports.map((port) => port.label).join(", ") || "—"}</p>
            <p><strong>Health:</strong> {overview.health}</p>
            <div>
              <strong>Labels</strong>
              <pre className="mt-2 rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.labels, null, 2)}</pre>
            </div>
          </div>
        </Panel>
      ) : null}

      {tab === "Environment" && overview ? (
        <Panel>
          <div className="mb-3 flex justify-end"><CopyButton text={overview.environment.join("\n")} /></div>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{overview.environment.join("\n")}</pre>
        </Panel>
      ) : null}

      {tab === "Mounts / Volumes" && overview ? (
        <Panel>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.mounts, null, 2)}</pre>
        </Panel>
      ) : null}

      {tab === "Networks" && overview ? (
        <Panel>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.networks, null, 2)}</pre>
        </Panel>
      ) : null}

      {tab === "Compose metadata" && overview ? (
        <Panel>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.compose, null, 2)}</pre>
        </Panel>
      ) : null}

      {tab === "Raw inspect" && overview ? (
        <Panel>
          <div className="mb-3 flex justify-end"><CopyButton text={JSON.stringify(overview.inspect, null, 2)} /></div>
          <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(overview.inspect, null, 2)}</pre>
        </Panel>
      ) : null}

      {tab === "Logs" && overview ? (
        <ContainerLogsPanel
          containerIdOrName={resolvedParams.idOrName}
          containerName={overview.name}
          searchMode="advanced"
          viewportClassName="min-h-[28rem] max-h-[40rem]"
        />
      ) : null}

      {tab === "Terminal" && data && overview ? (
        <ContainerTerminalPanel
          containerIdOrName={resolvedParams.idOrName}
          containerName={overview.name}
          containerState={overview.state}
          terminalCommands={data.terminalCommands}
        />
      ) : null}
    </div>
  );
}
