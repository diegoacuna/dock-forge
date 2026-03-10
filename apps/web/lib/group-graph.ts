import type { GroupContainer, GroupDetail } from "@dockforge/shared";

export type FolderAggregateStatus = "error" | "restarting" | "degraded" | "running" | "stopped" | "unknown";

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

export type FolderAggregateCounts = {
  totalContainers: number;
  runningCount: number;
  stoppedCount: number;
  restartingCount: number;
  unhealthyCount: number;
  unknownCount: number;
};

const getContainerDisplayName = (container: GroupContainer) => container.aliasName || container.containerNameSnapshot;

export const getFolderAggregateStatus = ({
  totalContainers,
  runningCount,
  stoppedCount,
  restartingCount,
  unhealthyCount,
  unknownCount,
}: FolderAggregateCounts): FolderAggregateStatus => {
  if (unhealthyCount > 0) {
    return "error";
  }

  if (restartingCount > 0) {
    return "restarting";
  }

  const activeKinds = [runningCount > 0, stoppedCount > 0, unknownCount > 0].filter(Boolean).length;
  if (activeKinds > 1) {
    return "degraded";
  }

  if (totalContainers > 0 && runningCount === totalContainers) {
    return "running";
  }

  if (totalContainers > 0 && stoppedCount === totalContainers) {
    return "stopped";
  }

  return "unknown";
};

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

      const summaryBase = {
        folderLabel: folder.folderLabel,
        stage: stage.stage,
        totalContainers: containers.length,
        runningCount: containers.filter((container) => container.runtimeState === "running").length,
        stoppedCount: containers.filter((container) => container.runtimeState === "exited" || container.runtimeState === "created").length,
        restartingCount: containers.filter((container) => container.runtimeState === "restarting").length,
        unhealthyCount: containers.filter((container) => container.runtimeHealth === "unhealthy").length,
        unknownCount: containers.filter((container) => !container.runtimeState || container.runtimeState === "unknown").length,
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
