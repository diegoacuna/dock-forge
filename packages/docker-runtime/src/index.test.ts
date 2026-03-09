import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { DockerRuntimeClient, parseDockerLogChunk, resolveContainerByKey } from "./index.js";

const encodeFrame = (streamType: 1 | 2, message: string) => {
  const payload = Buffer.from(message, "utf8");
  const header = Buffer.alloc(8);
  header[0] = streamType;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
};

describe("resolveContainerByKey", () => {
  it("prefers current name over last known id", async () => {
    const client = {
      listContainers: vi.fn().mockResolvedValue([
        {
          id: "new-id",
          containerKey: "postgres",
          name: "postgres",
        },
        {
          id: "old-id",
          containerKey: "old-postgres",
          name: "old-postgres",
        },
      ]),
    };

    const resolved = await resolveContainerByKey(client as never, "postgres", "old-id");

    expect(resolved?.id).toBe("new-id");
  });
});

describe("parseDockerLogChunk", () => {
  it("parses multiplexed stdout and stderr entries in order", () => {
    const chunk = Buffer.concat([
      encodeFrame(1, "2026-03-07T12:00:00.000000000Z hello\n"),
      encodeFrame(2, "2026-03-07T12:00:01.000000000Z boom\n"),
    ]);

    expect(parseDockerLogChunk(chunk)).toEqual([
      {
        timestamp: "2026-03-07T12:00:00.000000000Z",
        stream: "stdout",
        message: "hello",
      },
      {
        timestamp: "2026-03-07T12:00:01.000000000Z",
        stream: "stderr",
        message: "boom",
      },
    ]);
  });

  it("parses plain tty logs as stdout", () => {
    const chunk = Buffer.from("2026-03-07T12:00:00.000000000Z hello\n");

    expect(parseDockerLogChunk(chunk)).toEqual([
      {
        timestamp: "2026-03-07T12:00:00.000000000Z",
        stream: "stdout",
        message: "hello",
      },
    ]);
  });
});

describe("DockerRuntimeClient log helpers", () => {
  it("tails logs and marks the response truncated when it fills the requested limit", async () => {
    const logs = Buffer.concat([
      encodeFrame(1, "2026-03-07T12:00:00.000000000Z one\n"),
      encodeFrame(1, "2026-03-07T12:00:01.000000000Z two\n"),
    ]);
    const inspect = vi.fn().mockResolvedValue({ Id: "container-1" });
    const logsMethod = vi.fn().mockResolvedValue(logs);
    const client = new DockerRuntimeClient();

    Object.assign(client as object, {
      docker: {
        getContainer: vi.fn().mockReturnValue({ inspect, logs: logsMethod }),
      },
    });

    const result = await client.getContainerLogs("postgres", { tailLines: 1_500 });

    expect(logsMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        tail: 1000,
        timestamps: true,
      }),
    );
    expect(result.tailLines).toBe(1000);
    expect(result.truncated).toBe(false);
    expect(result.entries).toHaveLength(2);
  });

  it("returns an empty entries array for containers without logs", async () => {
    const inspect = vi.fn().mockResolvedValue({ Id: "container-1" });
    const client = new DockerRuntimeClient();

    Object.assign(client as object, {
      docker: {
        getContainer: vi.fn().mockReturnValue({
          inspect,
          logs: vi.fn().mockResolvedValue(Buffer.alloc(0)),
        }),
      },
    });

    const result = await client.getContainerLogs("postgres", { tailLines: 200 });

    expect(result.entries).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("surfaces lookup failures when starting a live log stream", async () => {
    const client = new DockerRuntimeClient();

    Object.assign(client as object, {
      docker: {
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockRejectedValue(new Error("missing")),
        }),
        listContainers: vi.fn().mockResolvedValue([]),
      },
    });

    await expect(client.streamContainerLogs("missing", { onEntry: vi.fn() })).rejects.toThrow("Container missing not found");
  });

  it("closes a live log stream cleanly", async () => {
    const stream = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn> };
    stream.destroy = vi.fn();
    const inspect = vi.fn().mockResolvedValue({ Id: "container-1" });
    const client = new DockerRuntimeClient();

    Object.assign(client as object, {
      docker: {
        getContainer: vi.fn().mockReturnValue({
          inspect,
          logs: vi.fn().mockResolvedValue(stream),
        }),
      },
    });

    const onEntry = vi.fn();
    const session = await client.streamContainerLogs("postgres", { onEntry });
    stream.emit("data", encodeFrame(1, "2026-03-07T12:00:00.000000000Z hello\n"));
    session.close();

    expect(onEntry).toHaveBeenCalledWith({
      timestamp: "2026-03-07T12:00:00.000000000Z",
      stream: "stdout",
      message: "hello",
    });
    expect(stream.destroy).toHaveBeenCalled();
  });
});

describe("DockerRuntimeClient terminal helpers", () => {
  it("opens a tty exec session with the selected shell", async () => {
    const stream = new EventEmitter() as EventEmitter & {
      write: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      off: typeof EventEmitter.prototype.off;
      on: typeof EventEmitter.prototype.on;
    };
    stream.write = vi.fn();
    stream.destroy = vi.fn();
    const execStart = vi.fn().mockResolvedValue(stream);
    const execResize = vi.fn().mockResolvedValue(undefined);
    const execInspect = vi.fn().mockResolvedValue({ ExitCode: 0 });
    const execFactory = vi.fn().mockResolvedValue({
      start: execStart,
      resize: execResize,
      inspect: execInspect,
    });
    const inspect = vi.fn().mockResolvedValue({
      Id: "container-1",
      Name: "/postgres",
      State: { Status: "running" },
    });
    const client = new DockerRuntimeClient();

    Object.assign(client as object, {
      docker: {
        getContainer: vi.fn().mockReturnValue({
          inspect,
          exec: execFactory,
        }),
      },
    });

    const onOutput = vi.fn();
    const onExit = vi.fn();
    const session = await client.openContainerTerminal(
      "postgres",
      { shell: "sh", cols: 120, rows: 40 },
      { onOutput, onExit },
    );

    expect(execFactory).toHaveBeenCalledWith({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ["sh"],
      ConsoleSize: [40, 120],
      Tty: true,
    });
    expect(execStart).toHaveBeenCalledWith({
      hijack: true,
      stdin: true,
      Tty: true,
    });

    stream.emit("data", Buffer.from("echo hello\r\n"));
    expect(onOutput).toHaveBeenCalledWith("echo hello\r\n");

    session.write("pwd\n");
    expect(stream.write).toHaveBeenCalledWith("pwd\n");

    await session.resize(90, 20);
    expect(execResize).toHaveBeenCalledWith({ h: 20, w: 90 });

    stream.emit("end");
    await Promise.resolve();
    expect(onExit).toHaveBeenCalledWith(0);

    session.close();
    expect(stream.destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects non-running containers", async () => {
    const inspect = vi.fn().mockResolvedValue({
      Id: "container-1",
      State: { Status: "exited" },
    });
    const client = new DockerRuntimeClient();

    Object.assign(client as object, {
      docker: {
        getContainer: vi.fn().mockReturnValue({
          inspect,
          exec: vi.fn(),
        }),
      },
    });

    await expect(
      client.openContainerTerminal("postgres", { shell: "bash", cols: 80, rows: 24 }, { onOutput: vi.fn() }),
    ).rejects.toThrow("Container postgres is not running");
  });

  it("closes the underlying terminal stream exactly once", async () => {
    const stream = new EventEmitter() as EventEmitter & {
      write: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      off: typeof EventEmitter.prototype.off;
      on: typeof EventEmitter.prototype.on;
    };
    stream.write = vi.fn();
    stream.destroy = vi.fn();
    const client = new DockerRuntimeClient();

    Object.assign(client as object, {
      docker: {
        getContainer: vi.fn().mockReturnValue({
          inspect: vi.fn().mockResolvedValue({
            Id: "container-1",
            State: { Status: "running" },
          }),
          exec: vi.fn().mockResolvedValue({
            start: vi.fn().mockResolvedValue(stream),
            resize: vi.fn().mockResolvedValue(undefined),
            inspect: vi.fn().mockResolvedValue({ ExitCode: null }),
          }),
        }),
      },
    });

    const session = await client.openContainerTerminal("postgres", { shell: "sh", cols: 80, rows: 24 }, { onOutput: vi.fn() });

    session.close();
    session.close();

    expect(stream.destroy).toHaveBeenCalledTimes(1);
  });
});
