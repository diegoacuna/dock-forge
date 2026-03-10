"use client";

import Link from "next/link";
import React from "react";
import { ArrowRight, FolderTree } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GroupDetail } from "@dockforge/shared";
import { buildFolderGraphSummaries, getInitialSelectedFolderLabel, type FolderGraphSummary } from "../lib/group-graph";
import { cn } from "../lib/utils";
import { StateBadge } from "./status";
import { Badge, Panel } from "./ui";

const statusCountConfig = [
  { key: "runningCount", label: "running" },
  { key: "stoppedCount", label: "stopped" },
  { key: "restartingCount", label: "restarting" },
  { key: "unhealthyCount", label: "errors" },
  { key: "unknownCount", label: "unknown" },
] as const satisfies ReadonlyArray<{ key: keyof FolderGraphSummary; label: string }>;

export const GroupGraphPanel = ({ group }: { group: GroupDetail }) => {
  const folderSummaries = useMemo(() => buildFolderGraphSummaries(group), [group]);
  const [selectedFolderLabel, setSelectedFolderLabel] = useState<string | null>(() => getInitialSelectedFolderLabel(folderSummaries));

  useEffect(() => {
    setSelectedFolderLabel((current) => {
      if (current && folderSummaries.some((folder) => folder.folderLabel === current)) {
        return current;
      }

      return getInitialSelectedFolderLabel(folderSummaries);
    });
  }, [folderSummaries]);

  const selectedFolder = folderSummaries.find((folder) => folder.folderLabel === selectedFolderLabel) ?? null;

  return (
    <Panel className="space-y-5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Execution Graph</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Stages run from left to right. Folders inside the same column execute in parallel, and selecting a folder reveals the live
            container breakdown without leaving the graph.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <Badge tone="neutral">Stage columns</Badge>
          <Badge tone="accent">Parallel folders</Badge>
          <Badge tone="success">Live runtime signals</Badge>
        </div>
      </div>

      {group.executionStages.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">No execution graph yet.</p>
          <p className="mt-2 text-sm text-slate-600">Attach containers first. Stage columns appear once the group has at least one folder.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max items-start gap-4">
              {group.executionStages.map((stage, stageIndex) => (
                <div key={`stage-${stage.stage}`} className="flex items-start gap-4">
                  <section
                    aria-label={`Stage ${stage.stage + 1}`}
                    className="w-[19rem] shrink-0 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4"
                    data-testid={`graph-stage-${stage.stage + 1}`}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Stage {stage.stage + 1}</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-950">Runs in parallel</h3>
                      </div>
                      <Badge tone="neutral">
                        {stage.folders.length} folder{stage.folders.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="mt-4 space-y-3">
                      {stage.folders.map((folder) => {
                        const summary = folderSummaries.find((entry) => entry.folderLabel === folder.folderLabel);
                        if (!summary) {
                          return null;
                        }

                        const isSelected = selectedFolderLabel === summary.folderLabel;

                        return (
                          <button
                            key={summary.folderLabel}
                            type="button"
                            onClick={() => setSelectedFolderLabel(summary.folderLabel)}
                            className={cn(
                              "w-full rounded-3xl border px-4 py-4 text-left transition",
                              isSelected
                                ? "border-orange-300 bg-white shadow-[0_14px_40px_rgba(249,115,22,0.14)]"
                                : "border-slate-200 bg-white/90 hover:border-slate-300 hover:bg-white",
                            )}
                            aria-pressed={isSelected}
                            data-testid={`graph-node-${summary.folderLabel}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-slate-500">
                                  <FolderTree className="h-4 w-4" />
                                  <span className="text-xs uppercase tracking-[0.2em]">Folder</span>
                                </div>
                                <h4 className="mt-2 truncate text-base font-semibold text-slate-950">{summary.folderLabel}</h4>
                                <p className="mt-1 text-sm text-slate-600">
                                  {summary.totalContainers} container{summary.totalContainers === 1 ? "" : "s"}
                                </p>
                              </div>
                              <StateBadge state={summary.aggregateStatus} />
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {statusCountConfig.flatMap((item) => {
                                const count = summary[item.key];
                                if (typeof count !== "number" || count === 0) {
                                  return [];
                                }

                                return (
                                  <span
                                    key={`${summary.folderLabel}-${item.key}`}
                                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                                  >
                                    {count} {item.label}
                                  </span>
                                );
                              })}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  {stageIndex < group.executionStages.length - 1 ? (
                    <div className="hidden min-h-[10rem] items-center pt-24 lg:flex" aria-hidden="true">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <div className="h-8 w-px bg-slate-300" />
                        <ArrowRight className="h-5 w-5" />
                        <div className="h-8 w-px bg-slate-300" />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <FolderInspector folder={selectedFolder} />
        </div>
      )}
    </Panel>
  );
};

const FolderInspector = ({ folder }: { folder: FolderGraphSummary | null }) => (
  <aside className="min-h-[20rem] rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white" data-testid="graph-inspector">
    {folder ? (
      <div className="space-y-5">
        <div className="border-b border-white/10 pb-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Selected Folder</p>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold">{folder.folderLabel}</h3>
              <p className="mt-2 text-sm text-slate-300">Stage {folder.stage + 1} · {folder.totalContainers} runtime members</p>
            </div>
            <StateBadge state={folder.aggregateStatus} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InspectorStat label="Running" value={folder.runningCount} />
          <InspectorStat label="Stopped" value={folder.stoppedCount} />
          <InspectorStat label="Restarting" value={folder.restartingCount} />
          <InspectorStat label="Errors" value={folder.unhealthyCount} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-white">Containers</p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Live status</p>
          </div>
          <div className="space-y-3">
            {folder.containers.map((container) => (
              <Link
                key={container.id}
                href={`/containers/${encodeURIComponent(container.detailTarget)}`}
                className="block rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{container.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{container.runtimeStatusText ?? "No runtime status text available"}</p>
                  </div>
                  <StateBadge state={container.runtimeState} health={container.runtimeHealth} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {container.runtimeHealth && container.runtimeHealth !== "unknown" ? (
                    <Badge tone={container.runtimeHealth === "unhealthy" ? "danger" : "success"}>{container.runtimeHealth}</Badge>
                  ) : null}
                  {container.source === "snapshot" ? <Badge tone="warning">Snapshot only</Badge> : <Badge tone="accent">Docker runtime</Badge>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    ) : (
      <div className="flex h-full min-h-[16rem] flex-col items-center justify-center text-center">
        <FolderTree className="h-10 w-10 text-slate-500" />
        <p className="mt-4 text-sm font-medium text-white">Select a folder node</p>
        <p className="mt-2 max-w-xs text-sm text-slate-400">Pick a stage card to inspect its containers, runtime health, and current status mix.</p>
      </div>
    )}
  </aside>
);

const InspectorStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
  </div>
);
