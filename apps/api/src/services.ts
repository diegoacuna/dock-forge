import { prisma } from "@dockforge/db";
import { DockerRuntimeClient, resolveContainerByKey } from "@dockforge/docker-runtime";
import {
  canonicalizeContainerKey,
  formatDate,
  type ContainerSummary,
  type Group,
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
  runs: {
    orderBy: {
      startedAt: "desc" as const,
    },
    take: 1,
  },
} as const;

export const dockerClient = new DockerRuntimeClient();

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
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    }),
    dockerClient.listContainers(),
  ]);

  const runtimeMap = new Map(runtimeContainers.map((container) => [container.containerKey, container]));

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
    containers: group.containers.map((container: (typeof group.containers)[number]): GroupContainerDto => {
      const runtime = runtimeMap.get(container.containerKey);
      return {
        id: container.id,
        groupId: container.groupId,
        containerKey: container.containerKey,
        containerNameSnapshot: container.containerNameSnapshot,
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
      };
    }),
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
  return buildPlan(
    action === "RESTART" || action === "START_CLEAN" ? "START" : action,
    groupId,
    group.containers,
    group.edges.map((edge) => ({
      id: edge.id,
      groupId: edge.groupId,
      fromGroupContainerId: edge.fromGroupContainerId,
      toGroupContainerId: edge.toGroupContainerId,
    })),
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
  const graphEdges = group.edges.map((edge) => ({
    id: edge.id,
    groupId: edge.groupId,
    fromGroupContainerId: edge.fromGroupContainerId,
    toGroupContainerId: edge.toGroupContainerId,
  }));

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
