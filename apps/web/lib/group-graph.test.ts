import { describe, expect, it } from "vitest";
import type { GroupDetail } from "@dockforge/shared";
import { buildFolderGraphSummaries, getFolderAggregateStatus, getInitialSelectedFolderLabel } from "./group-graph";

const createGroupContainer = (overrides: Partial<GroupDetail["containers"][number]> = {}): GroupDetail["containers"][number] => ({
  id: overrides.id ?? "container-1",
  groupId: "group-1",
  containerKey: overrides.containerKey ?? overrides.id ?? "container-1",
  containerNameSnapshot: overrides.containerNameSnapshot ?? "service-1",
  folderLabelSnapshot: overrides.folderLabelSnapshot ?? "app",
  lastResolvedDockerId: overrides.lastResolvedDockerId === undefined ? "docker-1" : overrides.lastResolvedDockerId,
  aliasName: overrides.aliasName ?? null,
  notes: null,
  includeInStartAll: true,
  includeInStopAll: true,
  runtimeState: overrides.runtimeState ?? "running",
  runtimeHealth: overrides.runtimeHealth ?? "healthy",
  runtimeStatusText: overrides.runtimeStatusText ?? "Up 2 minutes",
  createdAt: "2026-03-09T12:00:00.000Z",
  updatedAt: "2026-03-09T12:00:00.000Z",
});

const createGroupDetail = (containers: GroupDetail["containers"]): GroupDetail => ({
  id: "group-1",
  name: "Core Stack",
  slug: "core-stack",
  description: null,
  color: "#f97316",
  memberCount: containers.length,
  dependencyCount: 0,
  groupStatus: "running",
  lastRunStatus: null,
  createdAt: "2026-03-09T12:00:00.000Z",
  updatedAt: "2026-03-09T12:00:00.000Z",
  containers,
  edges: [],
  layouts: [],
  executionFolders: [
    {
      folderLabel: "app",
      stage: 0,
      containerCount: containers.length,
    },
  ],
  executionStages: [
    {
      stage: 0,
      folders: [
        {
          folderLabel: "app",
          stage: 0,
          containerCount: containers.length,
        },
      ],
    },
  ],
});

describe("group graph helpers", () => {
  it("marks a folder as running when every container is running", () => {
    const summary = buildFolderGraphSummaries(
      createGroupDetail([createGroupContainer({ id: "api" }), createGroupContainer({ id: "web", containerNameSnapshot: "web" })]),
    )[0];

    expect(summary?.aggregateStatus).toBe("running");
    expect(summary?.runningCount).toBe(2);
  });

  it("marks a folder as stopped when every container is stopped", () => {
    const summary = buildFolderGraphSummaries(
      createGroupDetail([
        createGroupContainer({ id: "api", runtimeState: "exited", runtimeHealth: "unknown" }),
        createGroupContainer({ id: "worker", runtimeState: "created", runtimeHealth: "unknown" }),
      ]),
    )[0];

    expect(summary?.aggregateStatus).toBe("stopped");
    expect(summary?.stoppedCount).toBe(2);
  });

  it("prefers error when any container is unhealthy", () => {
    const status = getFolderAggregateStatus({
      totalContainers: 2,
      runningCount: 1,
      stoppedCount: 0,
      restartingCount: 1,
      unhealthyCount: 1,
      unknownCount: 0,
    });

    expect(status).toBe("error");
  });

  it("prefers restarting when containers are restarting without unhealthy members", () => {
    const status = getFolderAggregateStatus({
      totalContainers: 2,
      runningCount: 1,
      stoppedCount: 0,
      restartingCount: 1,
      unhealthyCount: 0,
      unknownCount: 0,
    });

    expect(status).toBe("restarting");
  });

  it("marks mixed running and stopped states as degraded", () => {
    const status = getFolderAggregateStatus({
      totalContainers: 2,
      runningCount: 1,
      stoppedCount: 1,
      restartingCount: 0,
      unhealthyCount: 0,
      unknownCount: 0,
    });

    expect(status).toBe("degraded");
  });

  it("falls back to unknown when the only signal is missing runtime state", () => {
    const summary = buildFolderGraphSummaries(
      createGroupDetail([
        createGroupContainer({
          id: "api",
          runtimeState: "unknown",
          runtimeHealth: "unknown",
          runtimeStatusText: null,
          lastResolvedDockerId: null,
        }),
      ]),
    )[0];

    expect(summary?.aggregateStatus).toBe("unknown");
    expect(summary?.unknownCount).toBe(1);
  });

  it("defaults selection to the first folder in stage order", () => {
    const summaries = buildFolderGraphSummaries({
      containers: [createGroupContainer({ id: "api", folderLabelSnapshot: "infra" }), createGroupContainer({ id: "web", folderLabelSnapshot: "app" })],
      executionStages: [
        {
          stage: 0,
          folders: [{ folderLabel: "infra", stage: 0, containerCount: 1 }],
        },
        {
          stage: 1,
          folders: [{ folderLabel: "app", stage: 1, containerCount: 1 }],
        },
      ],
    });

    expect(getInitialSelectedFolderLabel(summaries)).toBe("infra");
  });
});
