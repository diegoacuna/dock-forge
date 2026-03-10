import type { GroupContainer, GroupRunStepMetadata, OrchestrationPlan } from "@dockforge/shared";

export type GraphNode = Pick<GroupContainer, "id" | "groupId" | "includeInStartAll" | "includeInStopAll">;
export type GraphEdge = {
  id?: string;
  groupId: string;
  fromGroupContainerId: string;
  toGroupContainerId: string;
};

export type GraphValidationResult = {
  valid: boolean;
  errors: string[];
};

export type PlanAction = "START" | "STOP" | "RESTART" | "START_CLEAN";

export const validateGraph = (nodes: GraphNode[], edges: GraphEdge[]): GraphValidationResult => {
  const errors: string[] = [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of edges) {
    if (edge.fromGroupContainerId === edge.toGroupContainerId) {
      errors.push(`Self-edge is not allowed for ${edge.fromGroupContainerId}`);
    }

    const from = nodeMap.get(edge.fromGroupContainerId);
    const to = nodeMap.get(edge.toGroupContainerId);

    if (!from || !to) {
      errors.push(`Edge references unknown nodes: ${edge.fromGroupContainerId} -> ${edge.toGroupContainerId}`);
      continue;
    }

    if (from.groupId !== edge.groupId || to.groupId !== edge.groupId || from.groupId !== to.groupId) {
      errors.push(`Edge ${edge.fromGroupContainerId} -> ${edge.toGroupContainerId} must stay within one group`);
    }
  }

  if (detectCycle(nodes, edges).hasCycle) {
    errors.push("Dependency graph contains a cycle");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const detectCycle = (nodes: GraphNode[], edges: GraphEdge[]) => {
  const adjacency = new Map<string, string[]>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.fromGroupContainerId)?.push(edge.toGroupContainerId);
  }

  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) {
      path.push(nodeId);
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (visit(neighbor)) {
        path.push(nodeId);
        return true;
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  for (const node of nodes) {
    if (visit(node.id)) {
      return { hasCycle: true, path: path.reverse() };
    }
  }

  return { hasCycle: false, path: [] as string[] };
};

export const topologicalLayers = (nodes: GraphNode[], edges: GraphEdge[], options?: { targetNodeId?: string | null; mode?: "start" | "stop" }) => {
  const validation = validateGraph(nodes, edges);
  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  const targetSet = options?.targetNodeId ? collectTargetSubgraph(nodes, edges, options.targetNodeId, options.mode ?? "start") : null;
  const filteredNodes = targetSet ? nodes.filter((node) => targetSet.has(node.id)) : nodes;
  const filteredEdges = targetSet
    ? edges.filter((edge) => targetSet.has(edge.fromGroupContainerId) && targetSet.has(edge.toGroupContainerId))
    : edges;

  const inDegree = new Map(filteredNodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>(filteredNodes.map((node) => [node.id, []]));

  for (const edge of filteredEdges) {
    inDegree.set(edge.toGroupContainerId, (inDegree.get(edge.toGroupContainerId) ?? 0) + 1);
    outgoing.get(edge.fromGroupContainerId)?.push(edge.toGroupContainerId);
  }

  const queue = filteredNodes.filter((node) => (inDegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const layers: string[][] = [];

  while (queue.length) {
    const currentLayer = [...queue];
    queue.length = 0;
    layers.push(currentLayer);

    for (const nodeId of currentLayer) {
      for (const neighbor of outgoing.get(nodeId) ?? []) {
        const nextDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, nextDegree);
        if (nextDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
  }

  if (layers.flat().length !== filteredNodes.length) {
    throw new Error("Failed to compute topological layers");
  }

  return layers;
};

export const reverseTopologicalLayers = (nodes: GraphNode[], edges: GraphEdge[], targetNodeId?: string | null) =>
  topologicalLayers(nodes, edges, { targetNodeId, mode: "stop" }).reverse();

const collectTargetSubgraph = (nodes: GraphNode[], edges: GraphEdge[], targetNodeId: string, mode: "start" | "stop") => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(targetNodeId)) {
    throw new Error(`Unknown target node ${targetNodeId}`);
  }

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    const from = mode === "start" ? edge.toGroupContainerId : edge.fromGroupContainerId;
    const to = mode === "start" ? edge.fromGroupContainerId : edge.toGroupContainerId;
    adjacency.get(from)?.push(to);
  }

  const visited = new Set<string>();
  const stack = [targetNodeId];

  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next);
    }
  }

  return visited;
};

export const buildPlan = (
  action: PlanAction,
  groupId: string,
  members: GroupContainer[],
  edges: GraphEdge[],
  targetGroupContainerId?: string | null,
): OrchestrationPlan => {
  const nodes = members.map((member) => ({
    id: member.id,
    groupId: member.groupId,
    includeInStartAll: member.includeInStartAll,
    includeInStopAll: member.includeInStopAll,
  }));

  const layers =
    action === "STOP"
      ? reverseTopologicalLayers(nodes, edges, targetGroupContainerId)
      : topologicalLayers(nodes, edges, { targetNodeId: targetGroupContainerId, mode: "start" });

  const membershipMap = new Map(members.map((member) => [member.id, member]));
  const orderedGroupContainerIds = layers.flat();

  return {
    action,
    targetGroupId: groupId,
    targetGroupContainerId: targetGroupContainerId ?? null,
    layers: layers.map((layer, index) => ({
      index,
      members: layer.map((memberId) => membershipMap.get(memberId)).filter(Boolean) as GroupContainer[],
    })),
    orderedGroupContainerIds,
  };
};

type RuntimeTarget = {
  member: GroupContainer;
  runtimeId: string;
  runtimeName: string;
};

type RuntimeActionResult = {
  outcome: "performed" | "skipped";
  message: string;
  metadata: GroupRunStepMetadata;
};

type RuntimeWaitResult = {
  status: "ready" | "completed" | "failed";
  reason: string;
  metadata: GroupRunStepMetadata;
};

export type ExecutionLogger = {
  markRunRunning(runId: string): Promise<void>;
  markRunCompleted(runId: string, status: "SUCCEEDED" | "FAILED", summary: Record<string, unknown>): Promise<void>;
  createRunStep(input: {
    runId: string;
    member: GroupContainer;
    action: "START" | "STOP" | "RESTART" | "WAIT_READY";
    status: "RUNNING";
    message?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string>;
  completeRunStep(stepId: string, input: {
    status: "SUCCEEDED" | "FAILED" | "SKIPPED";
    message?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
};

export type RuntimeExecutor = {
  startContainer(idOrName: string): Promise<RuntimeActionResult>;
  stopContainer(idOrName: string): Promise<RuntimeActionResult>;
  waitForReady(idOrName: string, options?: { timeoutMs?: number }): Promise<RuntimeWaitResult>;
};

export const executePlan = async ({
  runId,
  plan,
  targets,
  runtime,
  logger,
  manageRunState = true,
}: {
  runId: string;
  plan: OrchestrationPlan;
  targets: Map<string, RuntimeTarget>;
  runtime: RuntimeExecutor;
  logger: ExecutionLogger;
  manageRunState?: boolean;
}) => {
  if (manageRunState) {
    await logger.markRunRunning(runId);
  }

  try {
    for (const layer of plan.layers) {
      for (const member of layer.members) {
        const target = targets.get(member.id);

        if (!target) {
          throw new Error(`Could not resolve runtime target for ${member.containerKey}`);
        }

        if (plan.action === "STOP" && !member.includeInStopAll) {
          continue;
        }

        if (plan.action !== "STOP" && !member.includeInStartAll) {
          continue;
        }

        const action = plan.action === "STOP" ? "STOP" : "START";
        const stepId = await logger.createRunStep({
          runId,
          member,
          action,
          status: "RUNNING",
          message: `${action} ${target.runtimeName}`,
        });

        try {
          const actionResult = action === "STOP" ? await runtime.stopContainer(target.runtimeId) : await runtime.startContainer(target.runtimeId);

          await logger.completeRunStep(stepId, {
            status: actionResult.outcome === "skipped" ? "SKIPPED" : "SUCCEEDED",
            message: actionResult.message,
            metadata: actionResult.metadata,
          });
        } catch (error) {
          await logger.completeRunStep(stepId, {
            status: "FAILED",
            message: error instanceof Error ? error.message : "Unknown runtime error",
          });
          throw error;
        }

        if (action === "START") {
          const waitStepId = await logger.createRunStep({
            runId,
            member,
            action: "WAIT_READY",
            status: "RUNNING",
            message: `Waiting for ${target.runtimeName} readiness`,
          });

          const readiness = await runtime.waitForReady(target.runtimeId);
          await logger.completeRunStep(waitStepId, {
            status: readiness.status === "failed" ? "FAILED" : "SUCCEEDED",
            message: readiness.reason,
            metadata: readiness.metadata,
          });

          if (readiness.status === "failed") {
            throw new Error(`Readiness failed for ${target.runtimeName}: ${readiness.reason}`);
          }
        }
      }
    }

    if (manageRunState) {
      await logger.markRunCompleted(runId, "SUCCEEDED", {
        action: plan.action,
        completedMembers: plan.orderedGroupContainerIds,
      });
    }
  } catch (error) {
    if (manageRunState) {
      await logger.markRunCompleted(runId, "FAILED", {
        action: plan.action,
        failed: error instanceof Error ? error.message : "Unknown execution failure",
      });
    }
    throw error;
  }
};
