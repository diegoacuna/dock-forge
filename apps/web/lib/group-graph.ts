import { countRuntimeStatuses, getAggregateRuntimeStatus, type GroupContainer, type GroupDetail, type RuntimeStatusCounts, type GroupStatus } from "@dockforge/shared";

export type FolderAggregateStatus = GroupStatus;

export type FolderContainerStatus = {
  id: string;
  name: string;
  detailTarget: string;
  runtimeState: GroupContainer["runtimeState"];
  runtimeHealth: GroupContainer["runtimeHealth"];
  runtimeStatusText: string | null;
  source: "runtime" | "snapshot";
};

export type FolderGraphSummary = {
  folderLabel: string;
  stage: number;
  totalContainers: number;
  runningCount: number;
  stoppedCount: number;
  restartingCount: number;
  unhealthyCount: number;
  unknownCount: number;
  aggregateStatus: FolderAggregateStatus;
  containers: FolderContainerStatus[];
};

export type FolderAggregateCounts = RuntimeStatusCounts;

const getContainerDisplayName = (container: GroupContainer) => container.aliasName || container.containerNameSnapshot;

export const getFolderAggregateStatus = (counts: FolderAggregateCounts): FolderAggregateStatus => getAggregateRuntimeStatus(counts);

export const buildFolderGraphSummaries = (group: Pick<GroupDetail, "containers" | "executionStages">): FolderGraphSummary[] => {
  const containersByFolder = group.containers.reduce<Map<string, GroupContainer[]>>((accumulator, container) => {
    const current = accumulator.get(container.folderLabelSnapshot) ?? [];
    current.push(container);
    accumulator.set(container.folderLabelSnapshot, current);
    return accumulator;
  }, new Map());

  return group.executionStages.flatMap((stage) =>
    stage.folders.map((folder) => {
      const containers = [...(containersByFolder.get(folder.folderLabel) ?? [])]
        .sort((left, right) => getContainerDisplayName(left).localeCompare(getContainerDisplayName(right)))
        .map<FolderContainerStatus>((container) => ({
          id: container.id,
          name: getContainerDisplayName(container),
          detailTarget: container.containerNameSnapshot,
          runtimeState: container.runtimeState,
          runtimeHealth: container.runtimeHealth,
          runtimeStatusText: container.runtimeStatusText,
          source: container.lastResolvedDockerId ? "runtime" : "snapshot",
        }));

      const statusCounts = countRuntimeStatuses(containers);
      const summaryBase = {
        folderLabel: folder.folderLabel,
        stage: stage.stage,
        ...statusCounts,
        containers,
      };

      return {
        ...summaryBase,
        aggregateStatus: getFolderAggregateStatus(summaryBase),
      };
    }),
  );
};

export const getInitialSelectedFolderLabel = (folders: FolderGraphSummary[]) => folders[0]?.folderLabel ?? null;
