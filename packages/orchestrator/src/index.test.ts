import { describe, expect, it } from "vitest";
import { buildPlan, reverseTopologicalLayers, topologicalLayers, validateGraph } from "./index.js";

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
