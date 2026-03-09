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
  getDashboard: vi.fn(),
  getGroupDetail: vi.fn(),
  getGroupPlan: vi.fn(),
  getRunDetail: vi.fn(),
  listActivity: vi.fn(),
  listContainersWithGroups: vi.fn().mockResolvedValue([]),
  listGroupRuns: vi.fn(),
  listGroups: vi.fn().mockResolvedValue([]),
  saveGroupExecutionOrder: vi.fn(),
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
});

describe("group routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
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
