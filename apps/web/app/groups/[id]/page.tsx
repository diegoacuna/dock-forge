"use client";

import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ContainerSummary, GroupDetail, GroupRun, OrchestrationPlan } from "@dockforge/shared";
import { fetchJson, useApiQuery } from "../../../lib/api";
import { getInitialGroupDetailTab } from "../../../lib/onboarding";
import { formatTimestamp } from "../../../lib/utils";
import { ExecutionOrderPanel, GroupAttachOnboardingCallout, GroupAttachPanel } from "../../../components/group-detail-panels";
import { GroupGraphPanel } from "../../../components/group-graph-panel";
import { StateBadge } from "../../../components/status";
import { Button, PageHeader, Panel, Table } from "../../../components/ui";

const tabs = ["Overview", "Containers", "Graph", "Execution Order", "Activity"] as const;

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const onboardingMode = searchParams.get("onboarding");
  const [tab, setTab] = useState<(typeof tabs)[number]>(getInitialGroupDetailTab(onboardingMode) as (typeof tabs)[number]);
  const { data: group } = useApiQuery<GroupDetail>(["group", resolvedParams.id], `/groups/${resolvedParams.id}`, 8_000);
  const { data: containers } = useApiQuery<ContainerSummary[]>(["containers"], "/containers", 8_000);
  const { data: runs } = useApiQuery<GroupRun[]>(["group-runs", resolvedParams.id], `/groups/${resolvedParams.id}/runs`, 8_000);
  const { data: plan } = useApiQuery<OrchestrationPlan>(["group-plan", resolvedParams.id], `/groups/${resolvedParams.id}/plan`);
  const showAttachOnboarding = onboardingMode === "attach";

  const runAction = async (action: "start" | "stop" | "restart" | "start-clean") => {
    await fetchJson(`/groups/${resolvedParams.id}/${action}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={group?.name ?? "Group"}
        description={group?.description ?? "Group orchestration center with graph editing and run history."}
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
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
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
          {containers ? <GroupAttachPanel group={group} containers={containers} /> : null}
          <Panel>
            <Table>
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-3 py-2">Container</th>
                  <th className="px-3 py-2">Folder</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Start all</th>
                  <th className="px-3 py-2">Stop all</th>
                </tr>
              </thead>
              <tbody>
                {group.containers.map((container) => (
                  <tr key={container.id} className="bg-slate-50">
                    <td className="px-3 py-4">
                      <p className="font-medium text-slate-950">{container.aliasName || container.containerNameSnapshot}</p>
                      <p className="text-xs text-slate-500">{container.containerKey}</p>
                    </td>
                    <td className="px-3 py-4 text-slate-700">{container.folderLabelSnapshot}</td>
                    <td className="px-3 py-4"><StateBadge state={container.runtimeState} health={container.runtimeHealth} /></td>
                    <td className="px-3 py-4">{container.includeInStartAll ? "Yes" : "No"}</td>
                    <td className="px-3 py-4">{container.includeInStopAll ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </div>
      ) : null}

      {tab === "Graph" && group ? <GroupGraphPanel group={group} /> : null}

      {tab === "Execution Order" && group ? <ExecutionOrderPanel group={group} /> : null}

      {tab === "Activity" && runs ? (
        <Panel className="space-y-3">
          {runs.map((run) => (
            <div key={run.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-950">{run.action.replaceAll("_", " ")}</p>
                  <p className="text-sm text-slate-500">{formatTimestamp(run.startedAt)}</p>
                </div>
                <StateBadge state={run.status.toLowerCase()} />
              </div>
              <div className="mt-4 space-y-2">
                {run.steps.map((step) => (
                  <div key={step.id} className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                    {step.action} · {step.containerNameSnapshot ?? step.containerKey ?? "group"} · {step.message ?? step.status}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      ) : null}
    </div>
  );
}
