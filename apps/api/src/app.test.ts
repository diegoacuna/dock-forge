import { afterEach, describe, expect, it, vi } from "vitest";

const getContainerLogs = vi.fn();
const streamContainerLogs = vi.fn();

vi.mock("@dockforge/db", () => ({
  prisma: {},
}));

vi.mock("./services.js", () => ({
  dockerClient: {
    ping: vi.fn().mockResolvedValue({ ok: true }),
    getContainerDetail: vi.fn(),
    inspectContainer: vi.fn(),
    getContainerLogs,
    streamContainerLogs,
    startContainer: vi.fn(),
    stopContainer: vi.fn(),
    restartContainer: vi.fn(),
    listVolumes: vi.fn(),
    inspectVolume: vi.fn(),
    listNetworks: vi.fn(),
    inspectNetwork: vi.fn(),
  },
  ensureContainerMembershipPayload: vi.fn(),
  executeGroupAction: vi.fn(),
  getDashboard: vi.fn(),
  getGroupDetail: vi.fn(),
  getGroupPlan: vi.fn(),
  getRunDetail: vi.fn(),
  listActivity: vi.fn(),
  listContainersWithGroups: vi.fn().mockResolvedValue([]),
  listGroupRuns: vi.fn(),
  listGroups: vi.fn().mockResolvedValue([]),
  validateGroupGraph: vi.fn(),
}));

describe("container log routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the default container log tail", async () => {
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    getContainerLogs.mockResolvedValue({
      containerIdOrName: "postgres",
      tailLines: 200,
      truncated: false,
      entries: [],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/containers/postgres/logs",
    });

    expect(response.statusCode).toBe(200);
    expect(getContainerLogs).toHaveBeenCalledWith("postgres", { tailLines: 200 });

    await app.close();
  });

  it("rejects oversized tail requests", async () => {
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/containers/postgres/logs?tail=5001",
    });

    expect(response.statusCode).toBe(400);
    expect(getContainerLogs).not.toHaveBeenCalled();

    await app.close();
  });
});
