"use client";

import { Suspense, use, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ContainerSummary, GroupDetail, GroupRun, OrchestrationPlan } from "@dockforge/shared";
import { fetchJson, useApiQuery } from "@/lib/api";
import { resolveGroupDetailTab } from "@/lib/onboarding";
import { formatTimestamp } from "@/lib/utils";
import { ExecutionOrderPanel, GroupAttachOnboardingCallout, GroupAttachPanel } from "@/components/group-detail-panels";
import { GroupGraphPanel } from "@/components/group-graph-panel";
import { StateBadge } from "@/components/status";
import { Badge, Button, PageHeader, Panel } from "@/components/ui";
import { GroupedContainersTable } from "@/components/grouped-containers-table";
import { GROUP_DETAIL_TABS, groupContainerRowsByFolder, mapGroupContainersToRows, summarizeRunHistory } from "@/lib/grouped-containers";

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading group...</div>}>
      <GroupDetailPageContent params={params} />
    </Suspense>
  );
}

function GroupDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
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
  const { data: group } = useApiQuery<GroupDetail>(["group", resolvedParams.id], `/groups/${resolvedParams.id}`, 8_000);
  const { data: containers } = useApiQuery<ContainerSummary[]>(["containers"], "/containers", 8_000);
  const { data: runs } = useApiQuery<GroupRun[]>(["group-runs", resolvedParams.id], `/groups/${resolvedParams.id}/runs`, 8_000);
  const { data: plan } = useApiQuery<OrchestrationPlan>(["group-plan", resolvedParams.id], `/groups/${resolvedParams.id}/plan`);
  const showAttachOnboarding = onboardingMode === "attach";
  const groupContainerSections = useMemo(() => {
    if (!group) {
      return [];
    }

    return groupContainerRowsByFolder(
      mapGroupContainersToRows({
        containers: group.containers,
        runtimeContainers: containers ?? [],
      }),
    );
  }, [containers, group]);

  const runAction = async (action: "start" | "stop" | "restart" | "start-clean") => {
    await fetchJson(`/groups/${resolvedParams.id}/${action}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  };

  const handleTabClick = (nextTab: (typeof GROUP_DETAIL_TABS)[number]) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.push(`/groups/${resolvedParams.id}?${params.toString()}`);
  };

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
            <Button onClick={() => void runAction("start")}>Start Group</Button>
            <Button variant="secondary" onClick={() => void runAction("stop")}>Stop Group</Button>
            <Button variant="ghost" onClick={() => void runAction("restart")}>Restart Group</Button>
            <Button variant="ghost" onClick={() => void runAction("start-clean")}>Start Clean</Button>
          </>
        }
      />

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
            <GroupedContainersTable
              sections={groupContainerSections}
              emptyState={
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-900">No containers are attached to this group yet.</p>
                  <p className="mt-2 text-sm text-slate-600">Use the attach tools above to add containers and start building the group execution flow.</p>
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
