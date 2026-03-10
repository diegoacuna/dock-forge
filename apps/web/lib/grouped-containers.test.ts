import { describe, expect, it } from "vitest";
import type { ContainerSummary, GroupContainer, GroupRun } from "@dockforge/shared";
import {
  GROUP_DETAIL_TABS,
  formatRunHistoryAction,
  groupContainerRowsByFolder,
  mapGroupContainersToRows,
  mapRuntimeContainersToRows,
  summarizeRunHistory,
} from "./grouped-containers";

const runtimeContainer: ContainerSummary = {
  id: "runtime-1",
  containerKey: "api",
  name: "api-1",
  image: "ghcr.io/acme/api:latest",
  imageId: "sha256:123",
  state: "running",
  status: "Up 2 minutes",
  health: "healthy",
  createdAt: "2026-03-09T12:00:00.000Z",
  ports: [{ privatePort: 3000, publicPort: 3000, type: "tcp", ip: "0.0.0.0", label: "3000:3000", }],
  compose: {
    project: "dock-forge",
    service: "api",
    workingDir: "/workspace/stacks/app",
    configFiles: [],
    rawLabels: {},
  },
  groupIds: ["group-1"],
  groupNames: ["Core Stack"],
};

const groupContainer: GroupContainer = {
  id: "group-container-1",
  groupId: "group-1",
  containerKey: "api",
  containerNameSnapshot: "api-snapshot",
  folderLabelSnapshot: "app",
  lastResolvedDockerId: "docker-1",
  aliasName: "API",
  notes: null,
  includeInStartAll: true,
  includeInStopAll: false,
  runtimeState: "running",
  runtimeHealth: "healthy",
  runtimeStatusText: "Up 2 minutes",
  createdAt: "2026-03-09T12:00:00.000Z",
  updatedAt: "2026-03-09T12:00:00.000Z",
};

describe("grouped container helpers", () => {
  it("keeps the group detail tabs in the intended order", () => {
    expect(GROUP_DETAIL_TABS).toEqual(["Overview", "Containers", "Execution Order", "Graph", "Run History"]);
  });

  it("groups runtime rows by folder name", () => {
    const rows = mapRuntimeContainersToRows([runtimeContainer, { ...runtimeContainer, id: "runtime-2", containerKey: "web", name: "web-1" }]);
    const sections = groupContainerRowsByFolder(rows);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.folderLabel).toBe("app");
    expect(sections[0]?.containers.map((row) => row.name)).toEqual(["api-1", "web-1"]);
  });

  it("prefers live runtime data when enriching group containers", () => {
    const [row] = mapGroupContainersToRows({ containers: [groupContainer], runtimeContainers: [runtimeContainer] });

    expect(row.name).toBe("API");
    expect(row.image).toBe("ghcr.io/acme/api:latest");
    expect(row.ports).toEqual(["3000:3000"]);
    expect(row.groupNames).toEqual(["Core Stack"]);
    expect(row.source).toBe("runtime");
  });

  it("falls back to stored group snapshots when runtime data is missing", () => {
    const [row] = mapGroupContainersToRows({ containers: [groupContainer], runtimeContainers: [] });

    expect(row.name).toBe("API");
    expect(row.image).toBe("Runtime unavailable");
    expect(row.folderLabel).toBe("app");
    expect(row.ports).toEqual([]);
    expect(row.source).toBe("group");
  });

  it("summarizes run history for the reframed tab", () => {
    const run: GroupRun = {
      id: "run-1",
      groupId: "group-1",
      action: "START_CLEAN",
      status: "SUCCEEDED",
      startedAt: "2026-03-09T12:00:00.000Z",
      completedAt: "2026-03-09T12:01:00.000Z",
      summaryJson: null,
      steps: [],
    };

    expect(formatRunHistoryAction(run.action)).toBe("START CLEAN");
    expect(summarizeRunHistory(run)).toMatchObject({
      actionLabel: "START CLEAN",
      status: "SUCCEEDED",
      stepCount: 0,
    });
  });
});
