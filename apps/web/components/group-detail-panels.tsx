"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { BulkAddGroupContainersResult, ContainerSummary, GroupDetail } from "@dockforge/shared";
import { getFolderLabel } from "@dockforge/shared";
import { useApiMutation } from "../lib/api";
import { StateBadge } from "./status";
import { Badge, Button, Input, Panel } from "./ui";

type AttachmentFeedback = {
  added: number;
  skipped: string[];
};

const summarizeFeedback = (result: BulkAddGroupContainersResult): AttachmentFeedback => ({
  added: result.added.length,
  skipped: result.skipped,
});

export const GroupAttachPanel = ({
  group,
  containers,
  title = "Attach containers",
  description = "Search individual containers or bulk-attach all current containers from a folder.",
  showHeader = true,
}: {
  group: GroupDetail;
  containers: ContainerSummary[];
  title?: string;
  description?: string;
  showHeader?: boolean;
}) => {
  const [containerQuery, setContainerQuery] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  const [selectedContainerKey, setSelectedContainerKey] = useState<string | null>(null);
  const [selectedFolderLabel, setSelectedFolderLabel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AttachmentFeedback | null>(null);
  const deferredContainerQuery = useDeferredValue(containerQuery);
  const deferredFolderQuery = useDeferredValue(folderQuery);
  const attachedKeys = useMemo(() => new Set(group.containers.map((container) => container.containerKey)), [group.containers]);

  const attachMutation = useApiMutation<{ containerKeys: string[] }, BulkAddGroupContainersResult>({
    method: "POST",
    path: `/groups/${group.id}/containers/bulk`,
    invalidate: [["group", group.id], ["groups"], ["containers"], ["dashboard"]],
  });

  const folderGroups = useMemo(() => {
    const buckets = new Map<
      string,
      {
        folderLabel: string;
        containers: ContainerSummary[];
      }
    >();

    for (const container of containers) {
      const folderLabel = getFolderLabel(container.compose.workingDir);
      const current = buckets.get(folderLabel) ?? { folderLabel, containers: [] };
      current.containers.push(container);
      buckets.set(folderLabel, current);
    }

    return [...buckets.values()]
      .map((entry) => ({
        ...entry,
        containers: [...entry.containers].sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.folderLabel.localeCompare(right.folderLabel));
  }, [containers]);

  const filteredContainers = useMemo(() => {
    const query = deferredContainerQuery.trim().toLowerCase();

    return folderGroups
      .map((entry) => ({
        ...entry,
        containers: entry.containers.filter((container) => {
          const haystack = [
            container.name,
            container.image,
            entry.folderLabel,
            container.compose.project ?? "",
          ]
            .join(" ")
            .toLowerCase();

          return haystack.includes(query);
        }),
      }))
      .filter((entry) => entry.containers.length > 0);
  }, [deferredContainerQuery, folderGroups]);

  const filteredFolders = useMemo(() => {
    const query = deferredFolderQuery.trim().toLowerCase();

    return folderGroups
      .map((entry) => {
        const attachedCount = entry.containers.filter((container) => attachedKeys.has(container.containerKey)).length;
        return {
          ...entry,
          attachedCount,
          availableCount: entry.containers.length - attachedCount,
        };
      })
      .filter((entry) => {
        if (!query) {
          return true;
        }

        const haystack = [entry.folderLabel, ...entry.containers.map((container) => container.compose.project ?? "")]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
  }, [attachedKeys, deferredFolderQuery, folderGroups]);

  useEffect(() => {
    if (selectedContainerKey && attachedKeys.has(selectedContainerKey)) {
      setSelectedContainerKey(null);
    }
  }, [attachedKeys, selectedContainerKey]);

  useEffect(() => {
    if (selectedFolderLabel) {
      const stillVisible = filteredFolders.some((folder) => folder.folderLabel === selectedFolderLabel);
      if (!stillVisible) {
        setSelectedFolderLabel(null);
      }
    }
  }, [filteredFolders, selectedFolderLabel]);

  const attachContainer = async () => {
    if (!selectedContainerKey) {
      return;
    }

    const result = await attachMutation.mutateAsync({ containerKeys: [selectedContainerKey] });
    setFeedback(summarizeFeedback(result));
    if (result.added.length > 0) {
      setSelectedContainerKey(null);
      setContainerQuery("");
    }
  };

  const attachFolder = async () => {
    if (!selectedFolderLabel) {
      return;
    }

    const folder = folderGroups.find((entry) => entry.folderLabel === selectedFolderLabel);
    if (!folder) {
      return;
    }

    const result = await attachMutation.mutateAsync({
      containerKeys: folder.containers.map((container) => container.containerKey),
    });
    setFeedback(summarizeFeedback(result));
  };

  return (
    <Panel className="space-y-5">
      {showHeader ? (
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Added {feedback.added} container{feedback.added === 1 ? "" : "s"}
          {feedback.skipped.length > 0 ? `, skipped ${feedback.skipped.length} already attached container${feedback.skipped.length === 1 ? "" : "s"}.` : "."}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Single container</p>
              <p className="text-sm text-slate-500">Search by name, image, folder, or compose project.</p>
            </div>
            <Button disabled={!selectedContainerKey || attachMutation.isPending} onClick={() => void attachContainer()}>
              {attachMutation.isPending ? "Attaching..." : "Attach container"}
            </Button>
          </div>
          <Input
            placeholder="Search containers"
            value={containerQuery}
            onChange={(event) => setContainerQuery(event.target.value)}
          />
          <div className="max-h-80 overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="space-y-4">
              {filteredContainers.map((folder) => (
                <div key={folder.folderLabel} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{folder.folderLabel}</p>
                    <span className="text-xs text-slate-400">{folder.containers.length} shown</span>
                  </div>
                  <div className="space-y-2">
                    {folder.containers.map((container) => {
                      const attached = attachedKeys.has(container.containerKey);
                      const selected = selectedContainerKey === container.containerKey;

                      return (
                        <button
                          key={container.id}
                          type="button"
                          disabled={attached}
                          onClick={() => setSelectedContainerKey(container.containerKey)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            attached
                              ? "cursor-not-allowed border-slate-200 bg-white/70 opacity-60"
                              : selected
                                ? "border-orange-300 bg-orange-50"
                                : "border-slate-200 bg-white hover:border-orange-200"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-950">{container.name}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">{container.image}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge tone="neutral">{container.compose.project ?? folder.folderLabel}</Badge>
                                {attached ? <Badge tone="accent">Already in this group</Badge> : null}
                                {!attached && container.groupNames.length > 0 ? <Badge tone="neutral">{container.groupNames.join(", ")}</Badge> : null}
                              </div>
                            </div>
                            <StateBadge state={container.state} health={container.health} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredContainers.length === 0 ? (
                <p className="rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">No containers match this search.</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Attach folder</p>
              <p className="text-sm text-slate-500">Bulk-add all current containers detected inside one folder.</p>
            </div>
            <Button disabled={!selectedFolderLabel || attachMutation.isPending} onClick={() => void attachFolder()}>
              {attachMutation.isPending ? "Attaching..." : "Attach folder"}
            </Button>
          </div>
          <Input placeholder="Search folders" value={folderQuery} onChange={(event) => setFolderQuery(event.target.value)} />
          <div className="max-h-80 overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="space-y-2">
              {filteredFolders.map((folder) => {
                const selected = selectedFolderLabel === folder.folderLabel;
                const fullyAttached = folder.availableCount === 0;

                return (
                  <button
                    key={folder.folderLabel}
                    type="button"
                    disabled={fullyAttached}
                    onClick={() => setSelectedFolderLabel(folder.folderLabel)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      fullyAttached
                        ? "cursor-not-allowed border-slate-200 bg-white/70 opacity-60"
                        : selected
                          ? "border-orange-300 bg-orange-50"
                          : "border-slate-200 bg-white hover:border-orange-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{folder.folderLabel}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {folder.containers.length} total · {folder.availableCount} available · {folder.attachedCount} already attached
                        </p>
                      </div>
                      {fullyAttached ? <Badge tone="accent">Fully attached</Badge> : <Badge tone="neutral">Folder</Badge>}
                    </div>
                  </button>
                );
              })}
              {filteredFolders.length === 0 ? (
                <p className="rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">No folders match this search.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
};

export const GroupAttachOnboardingCallout = ({
  group,
  containers,
}: {
  group: GroupDetail;
  containers: ContainerSummary[];
}) => {
  const attachedKeys = new Set(group.containers.map((container) => container.containerKey));
  const availableContainers = containers.filter((container) => !attachedKeys.has(container.containerKey));
  const hasAvailableContainers = availableContainers.length > 0;
  const hasDetectedContainers = containers.length > 0;

  return (
    <Panel className="border-orange-200 bg-orange-50/70">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-orange-700">Onboarding</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Attach containers to this group next</h2>
          </div>

          {hasAvailableContainers ? (
            <p className="max-w-3xl text-sm text-slate-700">
              Your group is ready. The fastest path is usually <strong>Attach folder</strong>, which pulls in all current
              containers from one detected working directory. If you only need part of the stack, use <strong>Single container</strong>.
            </p>
          ) : null}

          {!hasDetectedContainers ? (
            <p className="max-w-3xl text-sm text-slate-700">
              DockForge has not detected local containers yet, so there is nothing to attach right now. Start or create your
              containers first, then return here to continue onboarding.
            </p>
          ) : null}

          {hasDetectedContainers && !hasAvailableContainers ? (
            <p className="max-w-3xl text-sm text-slate-700">
              DockForge detected containers, but there are no unattached containers available for this group right now. Review
              the runtime inventory and return here if the stack changes.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{availableContainers.length} ready to attach</Badge>
            <Badge tone="neutral">{group.containers.length} already in this group</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/containers">
            <Button variant="ghost">Open Containers</Button>
          </Link>
        </div>
      </div>
    </Panel>
  );
};

export const ExecutionOrderPanel = ({ group }: { group: GroupDetail }) => {
  const [stagedFolders, setStagedFolders] = useState(group.executionStages.map((stage) => stage.folders.map((folder) => folder.folderLabel)));
  const [saved, setSaved] = useState(false);
  const saveMutation = useApiMutation<{ stages: string[][] }, GroupDetail>({
    method: "PUT",
    path: `/groups/${group.id}/execution-order`,
    invalidate: [["group", group.id], ["group-plan", group.id]],
  });

  const stagesWithContainers = useMemo(() => {
    const containerNamesByFolder = group.containers.reduce<Map<string, string[]>>((accumulator, container) => {
      const current = accumulator.get(container.folderLabelSnapshot) ?? [];
      current.push(container.aliasName || container.containerNameSnapshot);
      accumulator.set(container.folderLabelSnapshot, current);
      return accumulator;
    }, new Map());

    return stagedFolders.map((folderLabels, stage) => ({
      stage,
      folders: folderLabels.map((folderLabel) => ({
        folderLabel,
        containers: [...(containerNamesByFolder.get(folderLabel) ?? [])].sort((left, right) => left.localeCompare(right)),
      })),
    }));
  }, [group.containers, stagedFolders]);

  useEffect(() => {
    setStagedFolders(group.executionStages.map((stage) => stage.folders.map((folder) => folder.folderLabel)));
  }, [group.executionStages]);

  const persistedStages = group.executionStages.map((stage) => stage.folders.map((folder) => folder.folderLabel));
  const hasChanges = JSON.stringify(stagedFolders) !== JSON.stringify(persistedStages);

  const normalizeStages = (stages: string[][]) =>
    stages
      .map((stage) => [...new Set(stage)])
      .filter((stage) => stage.length > 0);

  const updateStages = (updater: (current: string[][]) => string[][]) => {
    setStagedFolders((current) => normalizeStages(updater(current.map((stage) => [...stage]))));
    setSaved(false);
  };

  const moveStage = (stageIndex: number, direction: -1 | 1) => {
    updateStages((current) => {
      const targetIndex = stageIndex + direction;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [movedStage] = next.splice(stageIndex, 1);
      next.splice(targetIndex, 0, movedStage);
      return next;
    });
  };

  const mergeFolderWithAdjacentStage = (stageIndex: number, folderLabel: string, direction: -1 | 1) => {
    updateStages((current) => {
      const targetIndex = stageIndex + direction;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = current.map((stage) => [...stage]);
      next[stageIndex] = next[stageIndex].filter((folder) => folder !== folderLabel);
      next[targetIndex] = [...next[targetIndex], folderLabel].sort((left, right) => left.localeCompare(right));
      return next;
    });
  };

  const splitFolderIntoOwnStage = (stageIndex: number, folderLabel: string) => {
    updateStages((current) => {
      if ((current[stageIndex] ?? []).length <= 1) {
        return current;
      }

      const next = current.map((stage) => [...stage]);
      next[stageIndex] = next[stageIndex].filter((folder) => folder !== folderLabel);
      next.splice(stageIndex + 1, 0, [folderLabel]);
      return next;
    });
  };

  const saveOrder = async () => {
    await saveMutation.mutateAsync({ stages: stagedFolders });
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <Panel>
        <h2 className="text-lg font-semibold text-slate-950">Execution Order</h2>
        <p className="mt-2 text-sm text-slate-600">
          Folders in the same stage execute in parallel. DockForge starts stages from top to bottom and stops them in reverse order.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Containers inside the same folder execute together. Use stage grouping when two folders do not depend on each other.
          </p>
          <Button disabled={!hasChanges || saveMutation.isPending} onClick={() => void saveOrder()}>
            {saveMutation.isPending ? "Saving..." : hasChanges ? "Save order" : saved ? "Saved" : "Up to date"}
          </Button>
        </div>
      </Panel>

      <div className="space-y-3">
        {stagesWithContainers.map((stage) => (
          <Panel key={`stage-${stage.stage}`}>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Stage {stage.stage + 1}</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">
                  {stage.folders.length} folder{stage.folders.length === 1 ? "" : "s"} in parallel
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" disabled={stage.stage === 0} onClick={() => moveStage(stage.stage, -1)}>
                  Move stage earlier
                </Button>
                <Button
                  variant="ghost"
                  disabled={stage.stage === stagesWithContainers.length - 1}
                  onClick={() => moveStage(stage.stage, 1)}
                >
                  Move stage later
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {stage.folders.map((folder) => (
                <div key={folder.folderLabel} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-950">{folder.folderLabel}</h4>
                      <p className="mt-2 text-sm text-slate-500">
                        {folder.containers.length} container{folder.containers.length === 1 ? "" : "s"} in this folder
                      </p>
                      <p className="mt-2 text-sm text-slate-700">{folder.containers.join(", ") || "No containers attached to this folder."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" disabled={stage.stage === 0} onClick={() => mergeFolderWithAdjacentStage(stage.stage, folder.folderLabel, -1)}>
                        Join previous stage
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={stage.stage === stagesWithContainers.length - 1}
                        onClick={() => mergeFolderWithAdjacentStage(stage.stage, folder.folderLabel, 1)}
                      >
                        Join next stage
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={stage.folders.length === 1}
                        onClick={() => splitFolderIntoOwnStage(stage.stage, folder.folderLabel)}
                      >
                        Make own stage
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ))}
        {stagesWithContainers.length === 0 ? (
          <Panel>
            <p className="text-sm text-slate-500">Attach containers first. Execution stages appear once the group has at least one folder.</p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
};
