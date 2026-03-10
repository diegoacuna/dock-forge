import { describe, expect, it, vi } from "vitest";
import { buildPlan, executePlan, reverseTopologicalLayers, topologicalLayers, validateGraph } from "./index.js";

const members = [
  {
    id: "db",
    groupId: "group-1",
    containerKey: "postgres",
    containerNameSnapshot: "postgres",
    folderLabelSnapshot: "infra",
    lastResolvedDockerId: null,
    aliasName: null,
    notes: null,
    includeInStartAll: true,
    includeInStopAll: true,
    runtimeState: "unknown" as const,
    runtimeHealth: "unknown" as const,
    runtimeStatusText: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "migrate",
    groupId: "group-1",
    containerKey: "migrate",
    containerNameSnapshot: "migrate",
    folderLabelSnapshot: "infra",
    lastResolvedDockerId: null,
    aliasName: null,
    notes: null,
    includeInStartAll: true,
    includeInStopAll: true,
    runtimeState: "unknown" as const,
    runtimeHealth: "unknown" as const,
    runtimeStatusText: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "web",
    groupId: "group-1",
    containerKey: "web",
    containerNameSnapshot: "web",
    folderLabelSnapshot: "app",
    lastResolvedDockerId: null,
    aliasName: null,
    notes: null,
    includeInStartAll: true,
    includeInStopAll: true,
    runtimeState: "unknown" as const,
    runtimeHealth: "unknown" as const,
    runtimeStatusText: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const edges = [
  { groupId: "group-1", fromGroupContainerId: "db", toGroupContainerId: "migrate" },
  { groupId: "group-1", fromGroupContainerId: "migrate", toGroupContainerId: "web" },
];

describe("orchestrator graph", () => {
  it("rejects cycles", () => {
    const result = validateGraph(
      members.map(({ id, groupId, includeInStartAll, includeInStopAll }) => ({ id, groupId, includeInStartAll, includeInStopAll })),
      [...edges, { groupId: "group-1", fromGroupContainerId: "web", toGroupContainerId: "db" }],
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("cycle"))).toBe(true);
  });

  it("builds forward topological layers", () => {
    expect(
      topologicalLayers(
        members.map(({ id, groupId, includeInStartAll, includeInStopAll }) => ({ id, groupId, includeInStartAll, includeInStopAll })),
        edges,
      ),
    ).toEqual([["db"], ["migrate"], ["web"]]);
  });

  it("builds reverse stop layers", () => {
    expect(
      reverseTopologicalLayers(
        members.map(({ id, groupId, includeInStartAll, includeInStopAll }) => ({ id, groupId, includeInStartAll, includeInStopAll })),
        edges,
      ),
    ).toEqual([["web"], ["migrate"], ["db"]]);
  });

  it("isolates target dependency subtree for start planning", () => {
    const plan = buildPlan("START", "group-1", members, edges, "web");
    expect(plan.orderedGroupContainerIds).toEqual(["db", "migrate", "web"]);
  });

  it("rejects cross-group edges", () => {
    const result = validateGraph(
      [
        ...members.map(({ id, groupId, includeInStartAll, includeInStopAll }) => ({ id, groupId, includeInStartAll, includeInStopAll })),
        { id: "cache", groupId: "group-2", includeInStartAll: true, includeInStopAll: true },
      ],
      [...edges, { groupId: "group-1", fromGroupContainerId: "db", toGroupContainerId: "cache" }],
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("within one group"))).toBe(true);
  });

  it("builds stop plan in reverse order", () => {
    const plan = buildPlan("STOP", "group-1", members, edges);
    expect(plan.layers.map((layer) => layer.members.map((member) => member.id))).toEqual([["web"], ["migrate"], ["db"]]);
  });
});

describe("orchestrator execution", () => {
  const createLogger = () => ({
    markRunRunning: vi.fn().mockResolvedValue(undefined),
    markRunCompleted: vi.fn().mockResolvedValue(undefined),
    createRunStep: vi.fn().mockResolvedValue("step-id"),
    completeRunStep: vi.fn().mockResolvedValue(undefined),
  });

  it("marks already running start targets as skipped", async () => {
    const logger = createLogger();
    const plan = buildPlan("START", "group-1", [members[0]], []);

    await executePlan({
      runId: "run-1",
      plan,
      targets: new Map([
        [
          "db",
          {
            member: members[0],
            runtimeId: "docker-db",
            runtimeName: "postgres",
          },
        ],
      ]),
      runtime: {
        startContainer: vi.fn().mockResolvedValue({
          outcome: "skipped",
          message: "Container docker-db is already running",
          metadata: {
            noopReason: "already_running",
            runtimeStateBefore: "running",
            runtimeStateAfter: "running",
          },
        }),
        stopContainer: vi.fn(),
        waitForReady: vi.fn().mockResolvedValue({
          status: "ready",
          reason: "running",
          metadata: {
            runtimeStateAfter: "running",
          },
        }),
      },
      logger,
    });

    expect(logger.completeRunStep).toHaveBeenCalledWith(
      "step-id",
      expect.objectContaining({
        status: "SKIPPED",
        metadata: expect.objectContaining({ noopReason: "already_running" }),
      }),
    );
  });

  it("does not fail when readiness completes via exit code 0", async () => {
    const logger = createLogger();
    logger.createRunStep.mockResolvedValueOnce("start-step").mockResolvedValueOnce("wait-step");
    const plan = buildPlan("START", "group-1", [members[0]], []);

    await executePlan({
      runId: "run-2",
      plan,
      targets: new Map([
        [
          "db",
          {
            member: members[0],
            runtimeId: "docker-db",
            runtimeName: "postgres",
          },
        ],
      ]),
      runtime: {
        startContainer: vi.fn().mockResolvedValue({
          outcome: "performed",
          message: "Container docker-db started",
          metadata: {
            runtimeStateBefore: "created",
            runtimeStateAfter: "running",
          },
        }),
        stopContainer: vi.fn(),
        waitForReady: vi.fn().mockResolvedValue({
          status: "completed",
          reason: "exited",
          metadata: {
            runtimeStateBefore: "exited",
            runtimeStateAfter: "exited",
            exitCode: 0,
            exitReason: "exited",
            oomKilled: false,
          },
        }),
      },
      logger,
    });

    expect(logger.markRunCompleted).toHaveBeenCalledWith(
      "run-2",
      "SUCCEEDED",
      expect.objectContaining({ action: "START" }),
    );
  });

  it("fails when readiness returns a non-zero exit code", async () => {
    const logger = createLogger();
    logger.createRunStep.mockResolvedValueOnce("start-step").mockResolvedValueOnce("wait-step");
    const plan = buildPlan("START", "group-1", [members[0]], []);

    await expect(
      executePlan({
        runId: "run-3",
        plan,
        targets: new Map([
          [
            "db",
            {
              member: members[0],
              runtimeId: "docker-db",
              runtimeName: "postgres",
            },
          ],
        ]),
        runtime: {
          startContainer: vi.fn().mockResolvedValue({
            outcome: "performed",
            message: "Container docker-db started",
            metadata: {
              runtimeStateBefore: "created",
              runtimeStateAfter: "running",
            },
          }),
          stopContainer: vi.fn(),
          waitForReady: vi.fn().mockResolvedValue({
            status: "failed",
            reason: "process exited with code 1",
            metadata: {
              runtimeStateBefore: "exited",
              runtimeStateAfter: "exited",
              exitCode: 1,
              exitReason: "process exited with code 1",
              oomKilled: false,
            },
          }),
        },
        logger,
      }),
    ).rejects.toThrow("Readiness failed");

    expect(logger.markRunCompleted).toHaveBeenCalledWith(
      "run-3",
      "FAILED",
      expect.objectContaining({ action: "START" }),
    );
  });
});
