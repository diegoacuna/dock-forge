import { afterEach, describe, expect, it, vi } from "vitest";

const getContainerLogs = vi.fn();
const streamContainerLogs = vi.fn();
const openContainerTerminal = vi.fn();
const getContainerDetail = vi.fn();

vi.mock("@dockforge/db", () => ({
  prisma: {},
}));

vi.mock("./services.js", () => ({
  bulkAttachGroupContainers: vi.fn(),
  completeInstall: vi.fn(async (payload: unknown) => ({
    installCompleted: true,
    persistenceAvailable: true,
    config: payload,
  })),
  createGroupContainerMembership: vi.fn(),
  dockerClient: {
    ping: vi.fn().mockResolvedValue({ ok: true }),
    getContainerDetail,
    inspectContainer: vi.fn(),
    getContainerLogs,
    streamContainerLogs,
    openContainerTerminal,
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
  getContainersPageData: vi.fn().mockResolvedValue({
    containers: [],
    runtime: { status: "connected", reason: "unknown", message: null },
    onboarding: { containersTourSeen: false, persistenceAvailable: true },
  }),
  getDashboard: vi.fn(),
  getGroupDetail: vi.fn(),
  getGroupPlan: vi.fn(),
  getGroupsPageData: vi.fn().mockResolvedValue({
    groups: [],
    onboarding: { groupsTourSeen: false, persistenceAvailable: true },
  }),
  getInstallStatus: vi.fn().mockResolvedValue({
    installCompleted: false,
    persistenceAvailable: true,
    config: {
      dockerConnectionMode: "socket",
      dockerSocketPath: "/var/run/docker.sock",
      dockerHost: null,
    },
  }),
  getRunDetail: vi.fn(),
  listActivity: vi.fn(),
  listContainersWithGroups: vi.fn().mockResolvedValue([]),
  listGroupRuns: vi.fn(),
  listGroups: vi.fn().mockResolvedValue([]),
  saveGroupExecutionOrder: vi.fn(),
  setContainersTourSeen: vi.fn(async (value: boolean) => ({ containersTourSeen: value })),
  setGroupsTourSeen: vi.fn(async (value: boolean) => ({ groupsTourSeen: value })),
  updateInstallConfig: vi.fn(async (payload: unknown) => ({
    installCompleted: true,
    persistenceAvailable: true,
    config: payload,
  })),
  validateGroupGraph: vi.fn(),
}));

describe("container log routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns install status", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/install/status",
    });

    expect(response.statusCode).toBe(200);
    expect(services.getInstallStatus).toHaveBeenCalled();
    expect(response.json()).toEqual({
      installCompleted: false,
      persistenceAvailable: true,
      config: {
        dockerConnectionMode: "socket",
        dockerSocketPath: "/var/run/docker.sock",
        dockerHost: null,
      },
    });

    await app.close();
  });

  it("completes install and persists docker config", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/install/complete",
      payload: {
        dockerConnectionMode: "host",
        dockerSocketPath: null,
        dockerHost: "tcp://127.0.0.1:2375",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(services.completeInstall).toHaveBeenCalledWith({
      dockerConnectionMode: "host",
      dockerSocketPath: null,
      dockerHost: "tcp://127.0.0.1:2375",
    });

    await app.close();
  });

  it("updates persisted install config", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    const response = await app.inject({
      method: "PUT",
      url: "/api/install/config",
      payload: {
        dockerConnectionMode: "socket",
        dockerSocketPath: "/custom/docker.sock",
        dockerHost: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(services.updateInstallConfig).toHaveBeenCalledWith({
      dockerConnectionMode: "socket",
      dockerSocketPath: "/custom/docker.sock",
      dockerHost: null,
    });

    await app.close();
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

  it("returns a terminal debug snapshot", async () => {
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    getContainerDetail.mockResolvedValue({
      overview: {
        name: "postgres",
        state: "running",
      },
      terminalCommands: [{ label: "Shell (sh)", command: "docker exec -it postgres sh" }],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/containers/postgres/terminal/debug",
      headers: {
        host: "localhost:4000",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      resolvedSocketUrl: "ws://localhost:4000/api/containers/postgres/terminal/ws",
      containerIdOrName: "postgres",
      containerName: "postgres",
      containerState: "running",
      connectable: true,
      terminalCommands: [{ label: "Shell (sh)", command: "docker exec -it postgres sh" }],
    });

    await app.close();
  });

  it("returns containers page data from the dedicated endpoint", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    vi.mocked(services.getContainersPageData).mockResolvedValue({
      containers: [
        {
          id: "c1",
          containerKey: "api",
          name: "api",
          image: "nginx:latest",
          imageId: null,
          state: "running",
          status: "Up 1 minute",
          health: "healthy",
          createdAt: null,
          ports: [],
          compose: {
            project: null,
            service: null,
            workingDir: null,
            configFiles: [],
            rawLabels: {},
          },
          groupIds: [],
          groupNames: [],
        },
      ],
      runtime: {
        status: "connected",
        reason: "unknown",
        message: null,
      },
      onboarding: {
        containersTourSeen: true,
        persistenceAvailable: true,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/containers/page-data",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      containers: [
        expect.objectContaining({
          id: "c1",
          name: "api",
        }),
      ],
      runtime: {
        status: "connected",
        reason: "unknown",
        message: null,
      },
      onboarding: {
        containersTourSeen: true,
        persistenceAvailable: true,
      },
    });

    await app.close();
  });

  it("persists containers onboarding state", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/onboarding/containers-tour",
      payload: { containersTourSeen: true },
    });

    expect(response.statusCode).toBe(200);
    expect(services.setContainersTourSeen).toHaveBeenCalledWith(true);
    expect(response.json()).toEqual({ containersTourSeen: true });

    await app.close();
  });

  it("returns a conflict when containers onboarding persistence is unavailable", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    vi.mocked(services.setContainersTourSeen).mockRejectedValueOnce(
      Object.assign(new Error("Containers tour persistence is unavailable until migrations are applied. Run `pnpm db:migrate`."), {
        code: "CONTAINERS_TOUR_PERSISTENCE_UNAVAILABLE",
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/onboarding/containers-tour",
      payload: { containersTourSeen: true },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("pnpm db:migrate"),
      }),
    );

    await app.close();
  });

  it("returns groups page data from the dedicated endpoint", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    vi.mocked(services.getGroupsPageData).mockResolvedValue({
      groups: [
        {
          id: "group-1",
          name: "Platform",
          slug: "platform",
          description: null,
          color: null,
          memberCount: 2,
          dependencyCount: 1,
          groupStatus: "running",
          lastRunStatus: null,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-02T00:00:00.000Z",
        },
      ],
      onboarding: {
        groupsTourSeen: true,
        persistenceAvailable: true,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/groups/page-data",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      groups: [
        expect.objectContaining({
          id: "group-1",
          name: "Platform",
        }),
      ],
      onboarding: {
        groupsTourSeen: true,
        persistenceAvailable: true,
      },
    });

    await app.close();
  });

  it("persists groups onboarding state", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/onboarding/groups-tour",
      payload: { groupsTourSeen: true },
    });

    expect(response.statusCode).toBe(200);
    expect(services.setGroupsTourSeen).toHaveBeenCalledWith(true);
    expect(response.json()).toEqual({ groupsTourSeen: true });

    await app.close();
  });

  it("returns a conflict when groups onboarding persistence is unavailable", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    vi.mocked(services.setGroupsTourSeen).mockRejectedValueOnce(
      Object.assign(new Error("Groups tour persistence is unavailable until migrations are applied. Run `pnpm db:migrate`."), {
        code: "GROUPS_TOUR_PERSISTENCE_UNAVAILABLE",
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/onboarding/groups-tour",
      payload: { groupsTourSeen: true },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("pnpm db:migrate"),
      }),
    );

    await app.close();
  });
});

describe("group routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a pending run launch payload for start actions", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    vi.mocked(services.executeGroupAction).mockResolvedValue({
      runId: "run-1",
      run: {
        id: "run-1",
        groupId: "group-1",
        action: "START",
        status: "PENDING",
        startedAt: "2026-03-10T12:00:00.000Z",
        completedAt: null,
        summaryJson: null,
        steps: [],
      },
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/start",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(services.executeGroupAction).toHaveBeenCalledWith({
      groupId: "group-1",
      action: "START",
    });
    expect(response.json()).toEqual({
      runId: "run-1",
      run: {
        id: "run-1",
        groupId: "group-1",
        action: "START",
        status: "PENDING",
        startedAt: "2026-03-10T12:00:00.000Z",
        completedAt: null,
        summaryJson: null,
        steps: [],
      },
    });

    await app.close();
  });

  it("accepts bulk container attach payloads", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    vi.mocked(services.bulkAttachGroupContainers).mockResolvedValue({
      added: [],
      skipped: ["api"],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/containers/bulk",
      payload: { containerKeys: ["api"] },
    });

    expect(response.statusCode).toBe(200);
    expect(services.bulkAttachGroupContainers).toHaveBeenCalledWith("group-1", ["api"]);

    await app.close();
  });

  it("accepts execution order updates", async () => {
    const services = await import("./services.js");
    const { buildApp } = await import("./app.js");
    const app = buildApp();

    vi.mocked(services.saveGroupExecutionOrder).mockResolvedValue({
      id: "group-1",
      name: "Platform",
      slug: "platform",
      description: null,
      color: null,
      memberCount: 0,
      dependencyCount: 0,
      groupStatus: "unknown",
      lastRunStatus: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      containers: [],
      edges: [],
      layouts: [],
      executionFolders: [],
      executionStages: [],
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/execution-order",
      payload: { stages: [["infra", "app"]] },
    });

    expect(response.statusCode).toBe(200);
    expect(services.saveGroupExecutionOrder).toHaveBeenCalledWith("group-1", [["infra", "app"]]);

    await app.close();
  });
});

describe("terminal socket controller", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error frame for invalid shell payloads", async () => {
    const { createTerminalSocketController } = await import("./app.js");
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
    };
    const controller = createTerminalSocketController({
      idOrName: "postgres",
      socket,
      logger,
      connectionId: "conn-1",
    });

    await controller.handleMessage(JSON.stringify({ type: "start", shell: "fish", cols: 80, rows: 24 }));

    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    expect(openContainerTerminal).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "conn-1" }), expect.stringContaining("failed"));
  });

  it("delegates start, input, resize, and close to the runtime terminal session", async () => {
    const services = await import("./services.js");
    const { createTerminalSocketController } = await import("./app.js");
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const session = {
      write: vi.fn(),
      resize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };
    openContainerTerminal.mockResolvedValue(session);
    vi.mocked(services.dockerClient.inspectContainer).mockResolvedValue({
      Name: "/postgres",
    } as never);
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
    };
    const controller = createTerminalSocketController({
      idOrName: "postgres",
      socket,
      logger,
      connectionId: "conn-2",
    });

    await controller.handleMessage(JSON.stringify({ type: "start", shell: "sh", cols: 100, rows: 30 }));
    await controller.handleMessage(JSON.stringify({ type: "input", data: "pwd\n" }));
    await controller.handleMessage(JSON.stringify({ type: "resize", cols: 90, rows: 20 }));
    await controller.handleMessage(JSON.stringify({ type: "close" }));

    expect(openContainerTerminal).toHaveBeenCalledWith(
      "postgres",
      { shell: "sh", cols: 100, rows: 30 },
      expect.objectContaining({
        onOutput: expect.any(Function),
        onExit: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ready"'));
    expect(session.write).toHaveBeenCalledWith("pwd\n");
    expect(session.resize).toHaveBeenCalledWith(90, 20);
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "conn-2", messageType: "start" }), expect.stringContaining("parsed"));
  });

  it("emits an error frame when terminal start fails", async () => {
    const { createTerminalSocketController } = await import("./app.js");
    openContainerTerminal.mockRejectedValue(new Error("Container postgres is not running"));
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const socket = {
      send: vi.fn(),
      close: vi.fn(),
    };
    const controller = createTerminalSocketController({
      idOrName: "postgres",
      socket,
      logger,
      connectionId: "conn-3",
    });

    await controller.handleMessage(JSON.stringify({ type: "start", shell: "bash", cols: 80, rows: 24 }));

    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining("not running"));
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "conn-3" }), expect.stringContaining("failed"));
  });
});
