import type { ContainerSummary, GroupContainer, GroupRun } from "@dockforge/shared";
import { getFolderLabel } from "./utils";

export type GroupedContainerRow = {
  id: string;
  containerKey: string;
  name: string;
  detailTarget: string;
  image: string;
  state: string;
  health: string | null;
  folderLabel: string;
  projectLabel: string;
  ports: string[];
  groupNames: string[];
  source: "runtime" | "group";
  groupMembership?: {
    includeInStartAll: boolean;
    includeInStopAll: boolean;
    aliasName: string | null;
    snapshotName: string;
  };
};

export type GroupedContainersSection = {
  folderLabel: string;
  containers: GroupedContainerRow[];
};

export const groupContainerRowsByFolder = (containers: GroupedContainerRow[]): GroupedContainersSection[] => {
  const buckets = new Map<string, GroupedContainerRow[]>();

  for (const container of containers) {
    const current = buckets.get(container.folderLabel) ?? [];
    current.push(container);
    buckets.set(container.folderLabel, current);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([folderLabel, items]) => ({
      folderLabel,
      containers: [...items].sort((left, right) => left.name.localeCompare(right.name)),
    }));
};

export const mapRuntimeContainersToRows = (containers: ContainerSummary[]): GroupedContainerRow[] =>
  containers.map((container) => ({
    id: container.id,
    containerKey: container.containerKey,
    name: container.name,
    detailTarget: container.name,
    image: container.image,
    state: container.state,
    health: container.health,
    folderLabel: getFolderLabel(container.compose.workingDir),
    projectLabel: container.compose.project ?? getFolderLabel(container.compose.workingDir),
    ports: container.ports.map((port) => port.label),
    groupNames: container.groupNames,
    source: "runtime",
  }));

export const mapGroupContainersToRows = ({
  containers,
  runtimeContainers,
}: {
  containers: GroupContainer[];
  runtimeContainers: ContainerSummary[];
}): GroupedContainerRow[] => {
  const runtimeMap = new Map(runtimeContainers.map((container) => [container.containerKey, container]));

  return containers.map((container) => {
    const runtime = runtimeMap.get(container.containerKey);

    return {
      id: container.id,
      containerKey: container.containerKey,
      name: container.aliasName || runtime?.name || container.containerNameSnapshot,
      detailTarget: runtime?.name ?? container.containerNameSnapshot,
      image: runtime?.image ?? "Runtime unavailable",
      state: runtime?.state ?? container.runtimeState,
      health: runtime?.health ?? container.runtimeHealth,
      folderLabel: runtime ? getFolderLabel(runtime.compose.workingDir) : container.folderLabelSnapshot,
      projectLabel: runtime?.compose.project ?? container.folderLabelSnapshot,
      ports: runtime?.ports.map((port) => port.label) ?? [],
      groupNames: runtime?.groupNames ?? [],
      source: runtime ? "runtime" : "group",
      groupMembership: {
        includeInStartAll: container.includeInStartAll,
        includeInStopAll: container.includeInStopAll,
        aliasName: container.aliasName,
        snapshotName: container.containerNameSnapshot,
      },
    };
  });
};

export const GROUP_DETAIL_TABS = ["Overview", "Containers", "Execution Order", "Graph", "Run History"] as const;

export const formatRunHistoryAction = (action: GroupRun["action"]) => action.replaceAll("_", " ");

export const summarizeRunHistory = (run: GroupRun) => ({
  actionLabel: formatRunHistoryAction(run.action),
  stepCount: run.steps.length,
  completedAt: run.completedAt,
  startedAt: run.startedAt,
  status: run.status,
});
