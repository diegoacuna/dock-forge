// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GroupDetail } from "@dockforge/shared";
import { GroupGraphPanel } from "./group-graph-panel";

afterEach(() => {
  cleanup();
});

const createGroupContainer = (overrides: Partial<GroupDetail["containers"][number]> = {}): GroupDetail["containers"][number] => ({
  id: overrides.id ?? "container-1",
  groupId: "group-1",
  containerKey: overrides.containerKey ?? overrides.id ?? "container-1",
  containerNameSnapshot: overrides.containerNameSnapshot ?? "service-1",
  folderLabelSnapshot: overrides.folderLabelSnapshot ?? "infra",
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

const createGroupDetail = (): GroupDetail => ({
  id: "group-1",
  name: "Core Stack",
  slug: "core-stack",
  description: null,
  color: "#f97316",
  memberCount: 3,
  dependencyCount: 0,
  lastRunStatus: null,
  createdAt: "2026-03-09T12:00:00.000Z",
  updatedAt: "2026-03-09T12:00:00.000Z",
  containers: [
    createGroupContainer({ id: "db", containerNameSnapshot: "db", folderLabelSnapshot: "infra", runtimeState: "running", runtimeHealth: "healthy" }),
    createGroupContainer({ id: "api", containerNameSnapshot: "api", aliasName: "API", folderLabelSnapshot: "app", runtimeState: "restarting", runtimeHealth: "healthy" }),
    createGroupContainer({
      id: "worker",
      containerNameSnapshot: "worker",
      folderLabelSnapshot: "app",
      runtimeState: "exited",
      runtimeHealth: "unknown",
      lastResolvedDockerId: null,
      runtimeStatusText: null,
    }),
  ],
  edges: [],
  layouts: [],
  executionFolders: [
    { folderLabel: "infra", stage: 0, containerCount: 1 },
    { folderLabel: "app", stage: 1, containerCount: 2 },
  ],
  executionStages: [
    {
      stage: 0,
      folders: [{ folderLabel: "infra", stage: 0, containerCount: 1 }],
    },
    {
      stage: 1,
      folders: [{ folderLabel: "app", stage: 1, containerCount: 2 }],
    },
  ],
});

describe("GroupGraphPanel", () => {
  it("renders one column per execution stage", () => {
    render(<GroupGraphPanel group={createGroupDetail()} />);

    expect(screen.getByTestId("graph-stage-1")).toBeTruthy();
    expect(screen.getByTestId("graph-stage-2")).toBeTruthy();
  });

  it("renders folder nodes in their stage columns", () => {
    render(<GroupGraphPanel group={createGroupDetail()} />);

    expect(screen.getByTestId("graph-node-infra")).toBeTruthy();
    expect(screen.getByTestId("graph-node-app")).toBeTruthy();
  });

  it("selects the first folder by default and shows its containers", () => {
    render(<GroupGraphPanel group={createGroupDetail()} />);

    const inspector = screen.getByTestId("graph-inspector");

    expect(inspector.textContent).toContain("infra");
    expect(inspector.textContent).toContain("db");
  });

  it("updates the inspector when another folder node is clicked", () => {
    render(<GroupGraphPanel group={createGroupDetail()} />);

    fireEvent.click(screen.getByTestId("graph-node-app"));

    const inspector = screen.getByTestId("graph-inspector");

    expect(inspector.textContent).toContain("app");
    expect(inspector.textContent).toContain("API");
    expect(inspector.textContent).toContain("worker");
    expect(inspector.textContent).toContain("Snapshot only");
  });

  it("links listed containers in the inspector to their container profile pages", () => {
    render(<GroupGraphPanel group={createGroupDetail()} />);

    const dbLink = screen.getByRole("link", { name: /db/i });
    expect(dbLink.getAttribute("href")).toBe("/containers/db");

    fireEvent.click(screen.getByTestId("graph-node-app"));

    const apiLink = screen.getByRole("link", { name: /API/i });
    const workerLink = screen.getByRole("link", { name: /worker/i });

    expect(apiLink.getAttribute("href")).toBe("/containers/api");
    expect(workerLink.getAttribute("href")).toBe("/containers/worker");
  });

  it("shows the empty state when the group has no execution stages", () => {
    render(
      <GroupGraphPanel
        group={{
          ...createGroupDetail(),
          containers: [],
          memberCount: 0,
          executionFolders: [],
          executionStages: [],
        }}
      />,
    );

    expect(screen.getByText("No execution graph yet.")).toBeTruthy();
  });
});
