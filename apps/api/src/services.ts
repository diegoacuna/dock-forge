import { prisma } from "@dockforge/db";
import { DockerRuntimeClient, resolveContainerByKey } from "@dockforge/docker-runtime";
import {
  getFolderLabel,
  canonicalizeContainerKey,
  formatDate,
  type BulkAddGroupContainersResult,
  type ContainersPageData,
  type ContainersRuntime,
  type ContainerSummary,
  type Group,
  type GroupsPageData,
  type GroupExecutionFolder,
  type GroupExecutionStage,
  type GroupContainer as GroupContainerDto,
  type GroupDetail,
  type GroupRun,
  type GroupRunStep,
} from "@dockforge/shared";
import { buildPlan, executePlan, validateGraph, type GraphEdge } from "@dockforge/orchestrator";

const includeGroup = {
  containers: true,
  edges: true,
  graphLayouts: true,
  executionFolders: {
    orderBy: {
      stage: "asc" as const,
    },
  },
  runs: {
    orderBy: {
      startedAt: "desc" as const,
    },
    take: 1,
  },
} as const;

export const dockerClient = new DockerRuntimeClient();
const CONTAINERS_TOUR_SEEN_KEY = "containersTourSeen";
const GROUPS_TOUR_SEEN_KEY = "groupsTourSeen";
const CONTAINERS_TOUR_PERSISTENCE_UNAVAILABLE_CODE = "CONTAINERS_TOUR_PERSISTENCE_UNAVAILABLE";
const GROUPS_TOUR_PERSISTENCE_UNAVAILABLE_CODE = "GROUPS_TOUR_PERSISTENCE_UNAVAILABLE";

const isMissingAppSettingTableError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "P2021";

const createContainersTourPersistenceUnavailableError = () => {
  const error = new Error("Containers tour persistence is unavailable until migrations are applied. Run `pnpm db:migrate`.");
  Object.assign(error, { code: CONTAINERS_TOUR_PERSISTENCE_UNAVAILABLE_CODE });
  return error;
};

const createGroupsTourPersistenceUnavailableError = () => {
  const error = new Error("Groups tour persistence is unavailable until migrations are applied. Run `pnpm db:migrate`.");
  Object.assign(error, { code: GROUPS_TOUR_PERSISTENCE_UNAVAILABLE_CODE });
  return error;
};

const readBooleanAppSetting = async (key: string) => {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key },
    });

    return {
      seen: setting?.value === "true",
      persistenceAvailable: true,
    };
  } catch (error) {
    if (isMissingAppSettingTableError(error)) {
      return {
        seen: false,
        persistenceAvailable: false,
      };
    }

    throw error;
  }
};

const writeBooleanAppSetting = async ({
  key,
  value,
  onPersistenceUnavailable,
}: {
  key: string;
  value: boolean;
  onPersistenceUnavailable: () => Error;
}) => {
  try {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: {
        key,
        value: String(value),
      },
    });
  } catch (error) {
    if (isMissingAppSettingTableError(error)) {
      throw onPersistenceUnavailable();
    }

    throw error;
  }
};

const classifyDockerRuntimeError = (error: unknown): ContainersRuntime => {
  const message = error instanceof Error ? error.message : "Unable to connect to Docker.";
  const lower = message.toLowerCase();
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: string }).code ?? "") : "";

  if (code === "ENOENT" || lower.includes("enoent") || lower.includes("no such file") || lower.includes("docker.sock")) {
    return {
      status: "unavailable",
      reason: "socket_missing",
      message,
    };
  }

  if (
    code === "ECONNREFUSED" ||
    code === "EACCES" ||
    lower.includes("connect econnrefused") ||
    lower.includes("permission denied") ||
    lower.includes("socket hang up")
  ) {
    return {
      status: "unavailable",
      reason: "connection_failed",
      message,
    };
  }

  return {
    status: "unavailable",
    reason: "docker_unavailable",
    message,
  };
};

const readContainersTourState = async () => {
  const setting = await readBooleanAppSetting(CONTAINERS_TOUR_SEEN_KEY);
  return {
    containersTourSeen: setting.seen,
    persistenceAvailable: setting.persistenceAvailable,
  };
};

const readGroupsTourState = async () => {
  const setting = await readBooleanAppSetting(GROUPS_TOUR_SEEN_KEY);
  return {
    groupsTourSeen: setting.seen,
    persistenceAvailable: setting.persistenceAvailable,
  };
};

const mapGroupContainer = (
  container: {
    id: string;
    groupId: string;
    containerKey: string;
    containerNameSnapshot: string;
    folderLabelSnapshot: string;
    lastResolvedDockerId: string | null;
    aliasName: string | null;
    notes: string | null;
    includeInStartAll: boolean;
    includeInStopAll: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  runtime?: ContainerSummary,
): GroupContainerDto => ({
  id: container.id,
  groupId: container.groupId,
  containerKey: container.containerKey,
  containerNameSnapshot: container.containerNameSnapshot,
  folderLabelSnapshot: container.folderLabelSnapshot,
  lastResolvedDockerId: container.lastResolvedDockerId,
  aliasName: container.aliasName,
  notes: container.notes,
  includeInStartAll: container.includeInStartAll,
  includeInStopAll: container.includeInStopAll,
  runtimeState: runtime?.state ?? "unknown",
  runtimeHealth: runtime?.health ?? "unknown",
  runtimeStatusText: runtime?.status ?? null,
  createdAt: container.createdAt.toISOString(),
  updatedAt: container.updatedAt.toISOString(),
});

const deriveFolderStagesFromEdges = (
  containers: Array<{ id: string; folderLabelSnapshot: string }>,
  edges: Array<{ fromGroupContainerId: string; toGroupContainerId: string }>,
) => {
  const folderLabels = [...new Set(containers.map((container) => container.folderLabelSnapshot))].sort((left, right) =>
    left.localeCompare(right),
  );

  if (folderLabels.length <= 1) {
    return [folderLabels];
  }

  const folderByContainerId = new Map(containers.map((container) => [container.id, container.folderLabelSnapshot]));
  const adjacency = new Map(folderLabels.map((label) => [label, new Set<string>()]));
  const inDegree = new Map(folderLabels.map((label) => [label, 0]));

  for (const edge of edges) {
    const fromFolder = folderByContainerId.get(edge.fromGroupContainerId);
    const toFolder = folderByContainerId.get(edge.toGroupContainerId);
    if (!fromFolder || !toFolder || fromFolder === toFolder) {
      continue;
    }

    const outgoing = adjacency.get(fromFolder);
    if (outgoing?.has(toFolder)) {
      continue;
    }

    outgoing?.add(toFolder);
    inDegree.set(toFolder, (inDegree.get(toFolder) ?? 0) + 1);
  }

  if ([...adjacency.values()].every((targets) => targets.size === 0)) {
    return [folderLabels];
  }

  const queue = folderLabels.filter((label) => (inDegree.get(label) ?? 0) === 0).sort((left, right) => left.localeCompare(right));
  const stages: string[][] = [];

  while (queue.length) {
    const currentStage = [...queue].sort((left, right) => left.localeCompare(right));
    queue.length = 0;
    stages.push(currentStage);

    for (const current of currentStage) {
      const nextFolders = [...(adjacency.get(current) ?? [])].sort((left, right) => left.localeCompare(right));
      for (const next of nextFolders) {
        const nextDegree = (inDegree.get(next) ?? 0) - 1;
        inDegree.set(next, nextDegree);
        if (nextDegree === 0) {
          queue.push(next);
        }
      }
    }

    queue.sort((left, right) => left.localeCompare(right));
  }

  return stages.flat().length === folderLabels.length ? stages : [folderLabels];
};

const resolveExecutionFolderStages = (
  containers: Array<{ id: string; folderLabelSnapshot: string }>,
  persistedFolders: Array<{ folderLabel: string; stage: number }>,
  edges: Array<{ fromGroupContainerId: string; toGroupContainerId: string }>,
) => {
  const availableFolders = [...new Set(containers.map((container) => container.folderLabelSnapshot))];

  if (availableFolders.length === 0) {
    return [] as string[][];
  }

  if (persistedFolders.length === 0) {
    return deriveFolderStagesFromEdges(containers, edges);
  }

  const groupedPersisted = new Map<number, string[]>();
  for (const folder of [...persistedFolders].sort((left, right) => left.stage - right.stage || left.folderLabel.localeCompare(right.folderLabel))) {
    if (!availableFolders.includes(folder.folderLabel)) {
      continue;
    }

    const current = groupedPersisted.get(folder.stage) ?? [];
    if (!current.includes(folder.folderLabel)) {
      current.push(folder.folderLabel);
      groupedPersisted.set(folder.stage, current);
    }
  }

  const persistedStages = [...groupedPersisted.entries()]
    .sort(([leftStage], [rightStage]) => leftStage - rightStage)
    .map(([, folderLabels]) => folderLabels.sort((left, right) => left.localeCompare(right)))
    .filter((folderLabels) => folderLabels.length > 0);
  const persistedFolderLabels = persistedStages.flat();
  const remaining = availableFolders
    .filter((folderLabel) => !persistedFolderLabels.includes(folderLabel))
    .sort((left, right) => left.localeCompare(right));

  return [...persistedStages, ...remaining.map((folderLabel) => [folderLabel])];
};

const mapExecutionFolders = (
  containers: Array<{ id: string; folderLabelSnapshot: string }>,
  persistedFolders: Array<{ folderLabel: string; stage: number }>,
  edges: Array<{ fromGroupContainerId: string; toGroupContainerId: string }>,
): GroupExecutionFolder[] => {
  const stages = resolveExecutionFolderStages(containers, persistedFolders, edges);
  const counts = containers.reduce<Map<string, number>>((accumulator, container) => {
    accumulator.set(container.folderLabelSnapshot, (accumulator.get(container.folderLabelSnapshot) ?? 0) + 1);
    return accumulator;
  }, new Map());

  return stages.flatMap((folderLabels, stage) =>
    folderLabels.map((folderLabel) => ({
      folderLabel,
      stage,
      containerCount: counts.get(folderLabel) ?? 0,
    })),
  );
};

const mapExecutionStages = (executionFolders: GroupExecutionFolder[]): GroupExecutionStage[] => {
  const grouped = new Map<number, GroupExecutionFolder[]>();

  for (const folder of executionFolders) {
    const current = grouped.get(folder.stage) ?? [];
    current.push(folder);
    grouped.set(folder.stage, current);
  }

  return [...grouped.entries()]
    .sort(([leftStage], [rightStage]) => leftStage - rightStage)
    .map(([stage, folders]) => ({
      stage,
      folders: [...folders].sort((left, right) => left.folderLabel.localeCompare(right.folderLabel)),
    }));
};

const buildExecutionEdges = (
  groupId: string,
  containers: Array<{ id: string; folderLabelSnapshot: string }>,
  executionFolders: GroupExecutionFolder[],
): GraphEdge[] => {
  const membersByFolder = containers.reduce<Map<string, string[]>>((accumulator, container) => {
    const current = accumulator.get(container.folderLabelSnapshot) ?? [];
    current.push(container.id);
    accumulator.set(container.folderLabelSnapshot, current);
    return accumulator;
  }, new Map());

  const edges: GraphEdge[] = [];
  const stages = mapExecutionStages(executionFolders);
  for (let index = 0; index < stages.length - 1; index += 1) {
    const currentFolders = stages[index]?.folders.map((folder) => folder.folderLabel) ?? [];
    const nextFolders = stages[index + 1]?.folders.map((folder) => folder.folderLabel) ?? [];

    for (const currentFolder of currentFolders) {
      for (const nextFolder of nextFolders) {
        for (const sourceId of membersByFolder.get(currentFolder) ?? []) {
          for (const targetId of membersByFolder.get(nextFolder) ?? []) {
            edges.push({
              groupId,
              fromGroupContainerId: sourceId,
              toGroupContainerId: targetId,
            });
          }
        }
      }
    }
  }

  return edges;
};

const mapGroupRunStep = (step: {
  id: string;
  groupRunId: string;
  groupContainerId: string | null;
  containerKey: string | null;
  containerNameSnapshot: string | null;
  action: string;
  status: string;
  message: string | null;
  startedAt: Date;
  completedAt: Date | null;
  metadataJson: string | null;
}): GroupRunStep => ({
  id: step.id,
  groupRunId: step.groupRunId,
  groupContainerId: step.groupContainerId,
  containerKey: step.containerKey,
  containerNameSnapshot: step.containerNameSnapshot,
  action: step.action as GroupRunStep["action"],
  status: step.status as GroupRunStep["status"],
  message: step.message,
  startedAt: step.startedAt.toISOString(),
  completedAt: formatDate(step.completedAt),
  metadataJson: step.metadataJson,
});

const mapGroupRun = (run: {
  id: string;
  groupId: string;
  action: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  summaryJson: string | null;
  steps?: Parameters<typeof mapGroupRunStep>[0][];
}): GroupRun => ({
  id: run.id,
  groupId: run.groupId,
  action: run.action as GroupRun["action"],
  status: run.status as GroupRun["status"],
  startedAt: run.startedAt.toISOString(),
  completedAt: formatDate(run.completedAt),
  summaryJson: run.summaryJson,
  steps: run.steps?.map(mapGroupRunStep) ?? [],
});

export const listGroups = async () => {
  const groups = await prisma.group.findMany({
    include: includeGroup,
    orderBy: {
      createdAt: "desc",
    },
  });

  return groups.map((group: (typeof groups)[number]) => ({
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    color: group.color,
    memberCount: group.containers.length,
    dependencyCount: group.edges.length,
    lastRunStatus: (group.runs[0]?.status as Group["lastRunStatus"]) ?? null,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  }));
};

export const getGroupDetail = async (groupId: string): Promise<GroupDetail> => {
  const [group, runtimeContainers] = await Promise.all([
    prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        containers: true,
        edges: true,
        graphLayouts: true,
        executionFolders: {
          orderBy: { stage: "asc" },
        },
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    }),
    dockerClient.listContainers(),
  ]);

  const runtimeMap = new Map(runtimeContainers.map((container) => [container.containerKey, container]));

  const executionFolders = mapExecutionFolders(group.containers, group.executionFolders, group.edges);

  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    color: group.color,
    memberCount: group.containers.length,
    dependencyCount: group.edges.length,
    lastRunStatus: (group.runs[0]?.status as GroupDetail["lastRunStatus"]) ?? null,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    containers: group.containers.map((container: (typeof group.containers)[number]): GroupContainerDto =>
      mapGroupContainer(container, runtimeMap.get(container.containerKey)),
    ),
    edges: group.edges.map((edge: (typeof group.edges)[number]) => ({
      id: edge.id,
      groupId: edge.groupId,
      fromGroupContainerId: edge.fromGroupContainerId,
      toGroupContainerId: edge.toGroupContainerId,
      waitStrategy: edge.waitStrategy,
      timeoutSeconds: edge.timeoutSeconds,
      metadataJson: edge.metadataJson,
      createdAt: edge.createdAt.toISOString(),
    })),
    layouts: group.graphLayouts.map((layout: (typeof group.graphLayouts)[number]) => ({
      id: layout.id,
      groupId: layout.groupId,
      groupContainerId: layout.groupContainerId,
      positionX: layout.positionX,
      positionY: layout.positionY,
    })),
    executionFolders,
    executionStages: mapExecutionStages(executionFolders),
  };
};

export const listContainersWithGroups = async (filters: {
  state?: string;
  search?: string;
  groupId?: string;
  image?: string;
}) => {
  const [containers, memberships] = await Promise.all([
    dockerClient.listContainers(),
    prisma.groupContainer.findMany({
      include: {
        group: true,
      },
    }),
  ]);

  const membershipByKey = new Map<string, { groupId: string; groupName: string }[]>();

  for (const membership of memberships) {
    const current = membershipByKey.get(membership.containerKey) ?? [];
    current.push({ groupId: membership.groupId, groupName: membership.group.name });
    membershipByKey.set(membership.containerKey, current);
  }

  return containers
    .map((container) => {
      const groups = membershipByKey.get(container.containerKey) ?? [];
      return {
        ...container,
        groupIds: groups.map((group) => group.groupId),
        groupNames: groups.map((group) => group.groupName),
      };
    })
    .filter((container) => {
      if (filters.state && filters.state !== "all" && container.state !== filters.state) {
        if (!(filters.state === "unhealthy" && container.health === "unhealthy")) {
          return false;
        }
      }

      if (filters.search && !container.name.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }

      if (filters.groupId && !container.groupIds.includes(filters.groupId)) {
        return false;
      }

      if (filters.image && !container.image.toLowerCase().includes(filters.image.toLowerCase())) {
        return false;
      }

      return true;
    });
};

export const getContainersPageData = async (): Promise<ContainersPageData> => {
  const [containersResult, containersTourState] = await Promise.allSettled([listContainersWithGroups({}), readContainersTourState()]);
  const onboardingState =
    containersTourState.status === "fulfilled"
      ? containersTourState.value
      : { containersTourSeen: false, persistenceAvailable: false };

  if (containersResult.status === "fulfilled") {
    return {
      containers: containersResult.value,
      runtime: {
        status: "connected",
        reason: "unknown",
        message: null,
      },
      onboarding: onboardingState,
    };
  }

  return {
    containers: [],
    runtime: classifyDockerRuntimeError(containersResult.reason),
    onboarding: onboardingState,
  };
};

export const setContainersTourSeen = async (containersTourSeen: boolean) => {
  await writeBooleanAppSetting({
    key: CONTAINERS_TOUR_SEEN_KEY,
    value: containersTourSeen,
    onPersistenceUnavailable: createContainersTourPersistenceUnavailableError,
  });

  return {
    containersTourSeen,
  };
};

export const getGroupsPageData = async (): Promise<GroupsPageData> => {
  const [groups, groupsTourState] = await Promise.all([listGroups(), readGroupsTourState()]);

  return {
    groups,
    onboarding: groupsTourState,
  };
};

export const setGroupsTourSeen = async (groupsTourSeen: boolean) => {
  await writeBooleanAppSetting({
    key: GROUPS_TOUR_SEEN_KEY,
    value: groupsTourSeen,
    onPersistenceUnavailable: createGroupsTourPersistenceUnavailableError,
  });

  return {
    groupsTourSeen,
  };
};

export const getDashboard = async () => {
  const [containers, groups, runs] = await Promise.all([
    listContainersWithGroups({}),
    listGroups(),
    prisma.groupRun.findMany({
      include: {
        steps: {
          orderBy: { startedAt: "asc" },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: 10,
    }),
  ]);

  return {
    totalContainers: containers.length,
    runningContainers: containers.filter((container) => container.state === "running").length,
    stoppedContainers: containers.filter((container) => container.state === "exited" || container.state === "dead").length,
    unhealthyContainers: containers.filter((container) => container.health === "unhealthy").length,
    totalGroups: groups.length,
    recentGroupRuns: runs.map(mapGroupRun),
    orphanContainers: containers.filter((container) => container.groupIds.length === 0).length,
    groups,
  };
};

export const validateGroupGraph = async (groupId: string, edges?: GraphEdge[]) => {
  const group = await getGroupDetail(groupId);
  const validation = validateGraph(
    group.containers.map((container) => ({
      id: container.id,
      groupId: container.groupId,
      includeInStartAll: container.includeInStartAll,
      includeInStopAll: container.includeInStopAll,
    })),
    edges ??
      group.edges.map((edge) => ({
        id: edge.id,
        groupId: edge.groupId,
        fromGroupContainerId: edge.fromGroupContainerId,
        toGroupContainerId: edge.toGroupContainerId,
      })),
  );

  return validation;
};

export const getGroupPlan = async (groupId: string, action: "START" | "STOP" | "RESTART" | "START_CLEAN", targetGroupContainerId?: string | null) => {
  const group = await getGroupDetail(groupId);
  const planningEdges = buildExecutionEdges(groupId, group.containers, group.executionFolders);
  return buildPlan(
    action === "RESTART" || action === "START_CLEAN" ? "START" : action,
    groupId,
    group.containers,
    planningEdges,
    targetGroupContainerId ?? null,
  );
};

const createRunLogger = () => ({
  async markRunRunning(runId: string) {
    await prisma.groupRun.update({
      where: { id: runId },
      data: { status: "RUNNING" },
    });
  },
  async markRunCompleted(runId: string, status: "SUCCEEDED" | "FAILED", summary: Record<string, unknown>) {
    await prisma.groupRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: new Date(),
        summaryJson: JSON.stringify(summary),
      },
    });
  },
  async createRunStep(input: {
    runId: string;
    member: GroupContainerDto;
    action: "START" | "STOP" | "RESTART" | "WAIT_READY";
    status: "RUNNING";
    message?: string;
    metadata?: Record<string, unknown>;
  }) {
    const step = await prisma.groupRunStep.create({
      data: {
        groupRunId: input.runId,
        groupContainerId: input.member.id,
        containerKey: input.member.containerKey,
        containerNameSnapshot: input.member.containerNameSnapshot,
        action: input.action,
        status: input.status,
        message: input.message,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        startedAt: new Date(),
      },
    });

    return step.id;
  },
  async completeRunStep(stepId: string, input: { status: "SUCCEEDED" | "FAILED" | "SKIPPED"; message?: string; metadata?: Record<string, unknown> }) {
    await prisma.groupRunStep.update({
      where: { id: stepId },
      data: {
        status: input.status,
        message: input.message,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
        completedAt: new Date(),
      },
    });
  },
});

export const executeGroupAction = async ({
  groupId,
  action,
  dryRun,
  targetGroupContainerId,
}: {
  groupId: string;
  action: "START" | "STOP" | "RESTART" | "START_CLEAN";
  dryRun?: boolean;
  targetGroupContainerId?: string | null;
}) => {
  const group = await getGroupDetail(groupId);
  const graphEdges = buildExecutionEdges(groupId, group.containers, group.executionFolders);

  const actionForPlan = action === "RESTART" || action === "START_CLEAN" ? "START" : action;
  const plan = buildPlan(actionForPlan, groupId, group.containers, graphEdges, targetGroupContainerId ?? null);

  if (dryRun) {
    return {
      dryRun: true,
      plan,
    };
  }

  const run = await prisma.groupRun.create({
    data: {
      groupId,
      action,
      status: "PENDING",
      startedAt: new Date(),
    },
  });

  const resolveTargets = async () => {
    const targets = new Map<string, { member: GroupContainerDto; runtimeId: string; runtimeName: string }>();

    for (const member of group.containers) {
      const resolved = await resolveContainerByKey(dockerClient, member.containerKey, member.lastResolvedDockerId);
      if (resolved) {
        targets.set(member.id, {
          member,
          runtimeId: resolved.id,
          runtimeName: resolved.name,
        });

        await prisma.groupContainer.update({
          where: { id: member.id },
          data: {
            lastResolvedDockerId: resolved.id,
            containerNameSnapshot: resolved.name,
          },
        });
      }
    }

    return targets;
  };

  const targets = await resolveTargets();

  if (action === "START_CLEAN") {
    const stopPlan = buildPlan("STOP", groupId, group.containers, graphEdges, targetGroupContainerId ?? null);
    await executePlan({
      runId: run.id,
      plan: stopPlan,
      targets,
      runtime: dockerClient,
      logger: createRunLogger(),
    });
  }

  if (action === "RESTART") {
    const stopPlan = buildPlan("STOP", groupId, group.containers, graphEdges, targetGroupContainerId ?? null);
    await executePlan({
      runId: run.id,
      plan: stopPlan,
      targets,
      runtime: dockerClient,
      logger: createRunLogger(),
    });
  }

  await executePlan({
    runId: run.id,
    plan,
    targets,
    runtime: dockerClient,
    logger: createRunLogger(),
  });

  const completedRun = await prisma.groupRun.findUniqueOrThrow({
    where: { id: run.id },
    include: {
      steps: {
        orderBy: { startedAt: "asc" },
      },
    },
  });

  return mapGroupRun(completedRun);
};

export const listGroupRuns = async (groupId: string) => {
  const runs = await prisma.groupRun.findMany({
    where: { groupId },
    include: {
      steps: {
        orderBy: { startedAt: "asc" },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return runs.map(mapGroupRun);
};

export const getRunDetail = async (runId: string) => {
  const run = await prisma.groupRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      steps: {
        orderBy: { startedAt: "asc" },
      },
    },
  });

  return mapGroupRun(run);
};

export const listActivity = async () => {
  const runs = await prisma.groupRun.findMany({
    include: {
      steps: {
        orderBy: { startedAt: "asc" },
      },
      group: true,
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return runs.map((run: (typeof runs)[number]) => ({
    ...mapGroupRun(run),
    groupName: run.group.name,
  }));
};

export const ensureContainerMembershipPayload = async (groupId: string, containerKey: string) => {
  const container = await resolveContainerByKey(dockerClient, canonicalizeContainerKey(containerKey));
  if (!container) {
    throw new Error(`Container ${containerKey} could not be resolved`);
  }

  return container;
};

export const createGroupContainerMembership = async (input: {
  groupId: string;
  containerKey: string;
  containerNameSnapshot?: string;
  aliasName?: string | null;
  notes?: string | null;
  includeInStartAll?: boolean;
  includeInStopAll?: boolean;
}) => {
  const runtime = await ensureContainerMembershipPayload(input.groupId, input.containerKey);
  const created = await prisma.groupContainer.create({
    data: {
      groupId: input.groupId,
      containerKey: runtime.containerKey,
      containerNameSnapshot: input.containerNameSnapshot || runtime.name,
      folderLabelSnapshot: getFolderLabel(runtime.compose.workingDir),
      lastResolvedDockerId: runtime.id,
      aliasName: input.aliasName ?? null,
      notes: input.notes ?? null,
      includeInStartAll: input.includeInStartAll ?? true,
      includeInStopAll: input.includeInStopAll ?? true,
    },
  });

  return mapGroupContainer(created, runtime);
};

export const bulkAttachGroupContainers = async (groupId: string, containerKeys: string[]): Promise<BulkAddGroupContainersResult> => {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      containers: true,
    },
  });

  const existingKeys = new Set(group.containers.map((container) => container.containerKey));
  const added: GroupContainerDto[] = [];
  const skipped: string[] = [];

  for (const containerKey of containerKeys) {
    const canonicalKey = canonicalizeContainerKey(containerKey);
    if (existingKeys.has(canonicalKey)) {
      skipped.push(canonicalKey);
      continue;
    }

    const runtime = await ensureContainerMembershipPayload(groupId, canonicalKey);
    if (existingKeys.has(runtime.containerKey)) {
      skipped.push(runtime.containerKey);
      continue;
    }

    const created = await prisma.groupContainer.create({
      data: {
        groupId,
        containerKey: runtime.containerKey,
        containerNameSnapshot: runtime.name,
        folderLabelSnapshot: getFolderLabel(runtime.compose.workingDir),
        lastResolvedDockerId: runtime.id,
        includeInStartAll: true,
        includeInStopAll: true,
      },
    });

    existingKeys.add(runtime.containerKey);
    added.push(mapGroupContainer(created, runtime));
  }

  return { added, skipped };
};

export const saveGroupExecutionOrder = async (groupId: string, stages: string[][]) => {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      containers: true,
      edges: true,
      executionFolders: {
        orderBy: { stage: "asc" },
      },
    },
  });

  const knownFolders = [...new Set(group.containers.map((container) => container.folderLabelSnapshot))].sort((left, right) =>
    left.localeCompare(right),
  );
  const normalizedStages = stages
    .map((stage) => stage.map((folderLabel) => folderLabel.trim()).filter(Boolean))
    .filter((stage) => stage.length > 0);
  const requestedFolders = normalizedStages.flat();
  const uniqueRequestedFolders = [...new Set(requestedFolders)];

  if (requestedFolders.length !== uniqueRequestedFolders.length) {
    throw new Error("Execution order contains duplicate folders");
  }

  if (
    uniqueRequestedFolders.length !== knownFolders.length ||
    uniqueRequestedFolders.some((folderLabel) => !knownFolders.includes(folderLabel))
  ) {
    throw new Error("Execution order must include each attached folder exactly once");
  }

  const operations = [
    prisma.groupExecutionFolder.deleteMany({
      where: { groupId },
    }),
  ];

  if (uniqueRequestedFolders.length > 0) {
    operations.push(
      prisma.groupExecutionFolder.createMany({
        data: normalizedStages.flatMap((folderLabels, stage) =>
          folderLabels.map((folderLabel, indexWithinStage) => ({
            groupId,
            folderLabel,
            stage,
            position:
              normalizedStages
                .slice(0, stage)
                .reduce((count, currentStage) => count + currentStage.length, 0) + indexWithinStage,
          })),
        ),
      }),
    );
  }

  await prisma.$transaction(operations);

  return getGroupDetail(groupId);
};
