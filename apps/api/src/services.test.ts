import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  appSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  group: {
    findMany: vi.fn(),
  },
  groupRun: {
    findMany: vi.fn(),
  },
  groupContainer: {
    findMany: vi.fn(),
  },
};

const dockerState = {
  listContainers: vi.fn(),
};

vi.mock("@dockforge/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@dockforge/docker-runtime", () => ({
  DockerRuntimeClient: vi.fn().mockImplementation(() => ({
    listContainers: dockerState.listContainers,
  })),
  resolveContainerByKey: vi.fn(),
}));

vi.mock("@dockforge/orchestrator", () => ({
  buildPlan: vi.fn(),
  executePlan: vi.fn(),
  validateGraph: vi.fn(),
}));

describe("containers page services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValue(null);
    mockPrisma.groupContainer.findMany.mockResolvedValue([]);
  });

  it("returns connected runtime state when docker containers are available", async () => {
    dockerState.listContainers.mockResolvedValue([
      {
        Id: "abc123",
        Names: ["/api"],
        Image: "nginx:latest",
        ImageID: "sha256:123",
        State: "running",
        Status: "Up 2 minutes",
        Created: 1_700_000_000,
        Ports: [],
        Labels: {},
      },
    ]);

    const { getContainersPageData } = await import("./services.js");
    const result = await getContainersPageData();

    expect(result.runtime).toEqual({
      status: "connected",
      reason: "unknown",
      message: null,
    });
    expect(result.containers).toHaveLength(1);
    expect(result.onboarding).toEqual({ containersTourSeen: false, persistenceAvailable: true });
  });

  it("maps missing docker socket errors to unavailable runtime state", async () => {
    dockerState.listContainers.mockRejectedValue(Object.assign(new Error("connect ENOENT /var/run/docker.sock"), { code: "ENOENT" }));

    const { getContainersPageData } = await import("./services.js");
    const result = await getContainersPageData();

    expect(result).toEqual({
      containers: [],
      runtime: {
        status: "unavailable",
        reason: "socket_missing",
        message: "connect ENOENT /var/run/docker.sock",
      },
      onboarding: {
        containersTourSeen: false,
        persistenceAvailable: true,
      },
    });
  });

  it("persists containers tour seen state in app settings", async () => {
    const { setContainersTourSeen } = await import("./services.js");
    const result = await setContainersTourSeen(true);

    expect(mockPrisma.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "containersTourSeen" },
      update: { value: "true" },
      create: { key: "containersTourSeen", value: "true" },
    });
    expect(result).toEqual({ containersTourSeen: true });
  });

  it("reports persistence unavailable when the app settings table is missing", async () => {
    mockPrisma.appSetting.upsert.mockRejectedValueOnce({
      code: "P2021",
    });

    const { setContainersTourSeen } = await import("./services.js");
    await expect(setContainersTourSeen(true)).rejects.toMatchObject({
      code: "CONTAINERS_TOUR_PERSISTENCE_UNAVAILABLE",
      message: expect.stringContaining("pnpm db:migrate"),
    });
  });

  it("returns groups page data with onboarding state", async () => {
    mockPrisma.group.findMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Platform",
        slug: "platform",
        description: null,
        color: null,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-02T00:00:00.000Z"),
        containers: [],
        edges: [],
        graphLayouts: [],
        executionFolders: [],
        runs: [],
      },
    ]);

    const { getGroupsPageData } = await import("./services.js");
    const result = await getGroupsPageData();

    expect(result).toEqual({
      groups: [
        {
          id: "group-1",
          name: "Platform",
          slug: "platform",
          description: null,
          color: null,
          memberCount: 0,
          dependencyCount: 0,
          lastRunStatus: null,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-02T00:00:00.000Z",
        },
      ],
      onboarding: {
        groupsTourSeen: false,
        persistenceAvailable: true,
      },
    });
  });

  it("reports groups persistence unavailable when the app settings table is missing on read", async () => {
    mockPrisma.appSetting.findUnique.mockRejectedValueOnce({
      code: "P2021",
    });
    mockPrisma.group.findMany.mockResolvedValue([]);

    const { getGroupsPageData } = await import("./services.js");
    const result = await getGroupsPageData();

    expect(result).toEqual({
      groups: [],
      onboarding: {
        groupsTourSeen: false,
        persistenceAvailable: false,
      },
    });
  });

  it("persists groups tour seen state in app settings", async () => {
    const { setGroupsTourSeen } = await import("./services.js");
    const result = await setGroupsTourSeen(true);

    expect(mockPrisma.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "groupsTourSeen" },
      update: { value: "true" },
      create: { key: "groupsTourSeen", value: "true" },
    });
    expect(result).toEqual({ groupsTourSeen: true });
  });

  it("reports groups persistence unavailable when the app settings table is missing on write", async () => {
    mockPrisma.appSetting.upsert.mockRejectedValueOnce({
      code: "P2021",
    });

    const { setGroupsTourSeen } = await import("./services.js");
    await expect(setGroupsTourSeen(true)).rejects.toMatchObject({
      code: "GROUPS_TOUR_PERSISTENCE_UNAVAILABLE",
      message: expect.stringContaining("pnpm db:migrate"),
    });
  });
});
