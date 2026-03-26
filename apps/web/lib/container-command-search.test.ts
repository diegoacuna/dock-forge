import { describe, expect, it } from "vitest";
import type { ContainerSummary } from "@dockforge/shared";
import { searchContainersForCommandPalette } from "./container-command-search";

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

describe("container command search", () => {
  it("returns alphabetized containers when the query is empty", () => {
    const results = searchContainersForCommandPalette(
      [createContainer({ name: "web-1", containerKey: "web" }), createContainer({ name: "api-1", containerKey: "api" })],
      "",
    );

    expect(results.map((result) => result.name)).toEqual(["api-1", "web-1"]);
  });

  it("prefers exact and prefix name matches over weaker matches", () => {
    const results = searchContainersForCommandPalette(
      [
        createContainer({ id: "1", name: "api", containerKey: "service-api" }),
        createContainer({ id: "2", name: "api-worker", containerKey: "worker" }),
        createContainer({ id: "3", name: "payments", containerKey: "api-proxy" }),
      ],
      "api",
    );

    expect(results.map((result) => result.name)).toEqual(["api", "api-worker", "payments"]);
  });

  it("matches on image, project, and group metadata too", () => {
    expect(
      searchContainersForCommandPalette(
        [
          createContainer({
            name: "postgres",
            image: "postgres:16",
            compose: {
              project: "billing",
              service: "db",
              workingDir: "/workspace/billing",
              configFiles: [],
              rawLabels: {},
            },
            groupNames: ["Billing Stack"],
          }),
        ],
        "billing",
      )[0],
    ).toMatchObject({
      name: "postgres",
      projectLabel: "billing",
      groupLabel: "Billing Stack",
    });
  });

  it("limits the number of results", () => {
    const containers = Array.from({ length: 12 }, (_, index) =>
      createContainer({
        id: `container-${index}`,
        name: `service-${index}`,
        containerKey: `service-${index}`,
      }),
    );

    expect(searchContainersForCommandPalette(containers, "service", 5)).toHaveLength(5);
  });
});
