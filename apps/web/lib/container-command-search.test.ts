import { describe, expect, it } from "vitest";
import type { ContainerSummary, Group } from "@dockforge/shared";
import { searchCommandPalette } from "./container-command-search";

const createContainer = (overrides: Partial<ContainerSummary> = {}): ContainerSummary => ({
  id: overrides.id ?? "container-1",
  containerKey: overrides.containerKey ?? "api",
  name: overrides.name ?? "api-1",
  image: overrides.image ?? "ghcr.io/acme/api:latest",
  imageId: overrides.imageId ?? "sha256:123",
  state: overrides.state ?? "running",
  status: overrides.status ?? "Up 2 minutes",
  health: overrides.health ?? "healthy",
  createdAt: overrides.createdAt ?? "2026-03-25T18:00:00.000Z",
  ports: overrides.ports ?? [],
  compose: overrides.compose ?? {
    project: "dockforge",
    service: "api",
    workingDir: "/workspace",
    configFiles: [],
    rawLabels: {},
  },
  groupIds: overrides.groupIds ?? [],
  groupNames: overrides.groupNames ?? [],
});

const createGroup = (overrides: Partial<Group> = {}): Group => ({
  id: overrides.id ?? "group-1",
  name: overrides.name ?? "Misc",
  slug: overrides.slug ?? "misc",
  description: overrides.description ?? "General purpose stack",
  color: overrides.color ?? null,
  memberCount: overrides.memberCount ?? 2,
  dependencyCount: overrides.dependencyCount ?? 1,
  groupStatus: overrides.groupStatus ?? "running",
  lastRunStatus: overrides.lastRunStatus ?? null,
  createdAt: overrides.createdAt ?? "2026-03-25T18:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-03-25T18:00:00.000Z",
});

describe("command palette search", () => {
  it("returns alphabetized containers when the query is empty", () => {
    const results = searchCommandPalette(
      [createContainer({ name: "web-1", containerKey: "web" }), createContainer({ name: "api-1", containerKey: "api" })],
      [createGroup({ name: "Misc", slug: "misc" })],
      "",
    );

    expect(results.map((result) => result.name)).toEqual(["api-1", "web-1"]);
    expect(results.every((result) => result.kind === "container")).toBe(true);
  });

  it("returns the main group result for an exact group-name query", () => {
    const results = searchCommandPalette([], [createGroup({ id: "group-misc", name: "Misc", slug: "misc" })], "misc");

    expect(results[0]).toMatchObject({
      id: "group:group-misc",
      kind: "group",
      name: "Misc",
      href: "/groups/group-misc",
    });
  });

  it("matches groups by slug too", () => {
    const results = searchCommandPalette([], [createGroup({ id: "group-ops", name: "Operations", slug: "ops" })], "ops");

    expect(results[0]).toMatchObject({
      id: "group:group-ops",
      kind: "group",
      href: "/groups/group-ops",
    });
  });

  it("returns a graph shortcut above the main group when the query includes a section alias", () => {
    const results = searchCommandPalette([], [createGroup({ id: "group-misc", name: "Misc", slug: "misc" })], "misc graph");

    expect(results[0]).toMatchObject({
      id: "group-section:group-misc:Graph",
      kind: "group-section",
      href: "/groups/group-misc?tab=Graph",
      sectionLabel: "Graph",
    });
    expect(results[1]).toMatchObject({
      id: "group:group-misc",
      kind: "group",
    });
  });

  it("supports multiple section aliases for the same group", () => {
    const runsResults = searchCommandPalette([], [createGroup({ id: "group-misc", name: "Misc", slug: "misc" })], "misc runs");
    const executionResults = searchCommandPalette([], [createGroup({ id: "group-misc", name: "Misc", slug: "misc" })], "misc execution");

    expect(runsResults[0]).toMatchObject({
      kind: "group-section",
      sectionLabel: "Run History",
      href: "/groups/group-misc?tab=Run%20History",
    });
    expect(executionResults[0]).toMatchObject({
      kind: "group-section",
      sectionLabel: "Execution Order",
      href: "/groups/group-misc?tab=Execution%20Order",
    });
  });

  it("does not emit section shortcuts for a plain group-name query", () => {
    const results = searchCommandPalette([], [createGroup({ id: "group-misc", name: "Misc", slug: "misc" })], "misc");

    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("group");
  });

  it("keeps sensible ranking when a container and a group both match", () => {
    const results = searchCommandPalette(
      [createContainer({ id: "container-misc", name: "misc-api", containerKey: "misc-api" })],
      [createGroup({ id: "group-misc", name: "Misc", slug: "misc" })],
      "misc",
    );

    expect(results[0]).toMatchObject({
      kind: "group",
      id: "group:group-misc",
    });
    expect(results[1]).toMatchObject({
      kind: "container",
      id: "container-misc",
    });
  });

  it("limits the merged results list", () => {
    const containers = Array.from({ length: 6 }, (_, index) =>
      createContainer({
        id: `container-${index}`,
        name: `service-${index}`,
        containerKey: `service-${index}`,
      }),
    );
    const groups = Array.from({ length: 6 }, (_, index) =>
      createGroup({
        id: `group-${index}`,
        name: `Service Group ${index}`,
        slug: `service-group-${index}`,
      }),
    );

    expect(searchCommandPalette(containers, groups, "service", 5)).toHaveLength(5);
  });
});
