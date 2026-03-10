import Docker from "dockerode";
import type { ContainerInfo, ContainerInspectInfo, NetworkInspectInfo, VolumeInspectInfo } from "dockerode";
import {
  DEFAULT_CONTAINER_LOG_TAIL,
  MAX_CONTAINER_LOG_TAIL,
  canonicalizeContainerKey,
  type ContainerLogEntry,
  type ContainerLogsResponse,
  type ContainerDetail,
  type ContainerOverview,
  type ContainerSummary,
  type ContainerState,
  type NetworkDetail,
  type NetworkSummary,
  type TerminalShell,
  type VolumeDetail,
  type VolumeSummary,
} from "@dockforge/shared";

export type DockerConnectionConfig = {
  dockerHost?: string;
  socketPath?: string;
};

type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

type LogStream = "stdout" | "stderr";

type LogStreamCallbacks = {
  onEntry: (entry: ContainerLogEntry) => void;
  onError?: (error: Error) => void;
};

export type TerminalSessionCallbacks = {
  onOutput: (data: string) => void;
  onExit?: (exitCode: number | null) => void;
  onError?: (error: Error) => void;
};

export type OpenContainerTerminalOptions = {
  shell: TerminalShell;
  cols: number;
  rows: number;
};

export type ContainerTerminalSession = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => Promise<void>;
  close: () => void;
};

const HEALTHCHECK_NONE = "none";

const parseDockerConfig = ({ dockerHost, socketPath }: DockerConnectionConfig = {}) => {
  const configuredHost = dockerHost ?? process.env.DOCKER_HOST;
  const configuredSocket = socketPath ?? process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock";

  if (configuredHost?.startsWith("unix://")) {
    return { socketPath: configuredHost.replace("unix://", "") };
  }

  if (configuredHost?.startsWith("tcp://")) {
    const url = new URL(configuredHost.replace("tcp://", "http://"));
    return { host: url.hostname, port: Number(url.port) };
  }

  return { socketPath: configuredSocket };
};

const parseHealth = (inspect: Partial<ContainerInspectInfo> | undefined) => {
  const health = inspect?.State?.Health?.Status;
  if (!health) {
    return HEALTHCHECK_NONE;
  }

  return health;
};

const inferHealthFromStatusText = (status: string | undefined) => {
  const lower = status?.toLowerCase() ?? "";
  if (lower.includes("unhealthy")) return "unhealthy";
  if (lower.includes("healthy")) return "healthy";
  if (lower.includes("health: starting")) return "starting";
  return HEALTHCHECK_NONE;
};

const extractComposeMetadata = (labels: Record<string, string | undefined> = {}) => ({
  project: labels["com.docker.compose.project"] ?? null,
  service: labels["com.docker.compose.service"] ?? null,
  workingDir: labels["com.docker.compose.project.working_dir"] ?? null,
  configFiles: labels["com.docker.compose.project.config_files"]
    ? labels["com.docker.compose.project.config_files"].split(",").map((value) => value.trim()).filter(Boolean)
    : [],
  rawLabels: Object.fromEntries(
    Object.entries(labels)
      .filter(([key, value]) => key.startsWith("com.docker.compose.") && value != null)
      .map(([key, value]) => [key, value as string]),
  ),
});

const mapPorts = (ports: ContainerInfo["Ports"] = []) =>
  ports.map((port) => ({
    privatePort: port.PrivatePort ?? null,
    publicPort: port.PublicPort ?? null,
    type: port.Type ?? "tcp",
    ip: port.IP ?? null,
    label:
      port.PublicPort != null
        ? `${port.IP ?? "0.0.0.0"}:${port.PublicPort}->${port.PrivatePort}/${port.Type ?? "tcp"}`
        : `${port.PrivatePort}/${port.Type ?? "tcp"}`,
  }));

const mapInspectPorts = (
  ports: NonNullable<ContainerInspectInfo["NetworkSettings"]>["Ports"] | undefined,
): ContainerOverview["ports"] => {
  const result: ContainerOverview["ports"] = [];

  for (const [privatePort, bindings] of Object.entries(ports ?? {})) {
    if (!bindings?.length) {
      result.push({
        privatePort: Number(privatePort.split("/")[0]) || null,
        publicPort: null,
        type: privatePort.split("/")[1] ?? "tcp",
        ip: null,
        label: privatePort,
      });
      continue;
    }

    for (const binding of bindings) {
      result.push({
        privatePort: Number(privatePort.split("/")[0]) || null,
        publicPort: binding.HostPort ? Number(binding.HostPort) : null,
        type: privatePort.split("/")[1] ?? "tcp",
        ip: binding.HostIp ?? null,
        label: `${binding.HostIp ?? "0.0.0.0"}:${binding.HostPort ?? ""}->${privatePort}`,
      });
    }
  }

  return result;
};

const mapContainerSummary = (container: ContainerInfo): ContainerSummary => {
  const name = canonicalizeContainerKey(container.Names?.[0] ?? container.Id);

  return {
    id: container.Id,
    containerKey: name,
    name,
    image: container.Image,
    imageId: container.ImageID ?? null,
    state: ((container.State as ContainerState | undefined) ?? "unknown") as ContainerSummary["state"],
    status: container.Status ?? container.State ?? "Unknown",
    health: inferHealthFromStatusText(container.Status) as ContainerSummary["health"],
    createdAt: container.Created ? new Date(container.Created * 1000).toISOString() : null,
    ports: mapPorts(container.Ports),
    compose: extractComposeMetadata(container.Labels ?? {}),
    groupIds: [],
    groupNames: [],
  };
};

const mapOverview = (inspect: ContainerInspectInfo): ContainerOverview => {
  const name = canonicalizeContainerKey(inspect.Name ?? inspect.Id);
  const networks = Object.entries(inspect.NetworkSettings?.Networks ?? {}).map(([networkName, network]) => ({
    networkName,
    aliases: network?.Aliases ?? [],
    ipAddress: network?.IPAddress ?? null,
    gateway: network?.Gateway ?? null,
  }));

  return {
    id: inspect.Id,
    containerKey: name,
    name,
    image: inspect.Config?.Image ?? inspect.Image,
    imageId: inspect.Image ?? null,
    state: (inspect.State?.Status as ContainerOverview["state"]) ?? "unknown",
    status: inspect.State?.Status ?? "unknown",
    health: parseHealth(inspect) as ContainerOverview["health"],
    createdAt: inspect.Created ? new Date(inspect.Created).toISOString() : null,
    compose: extractComposeMetadata(inspect.Config?.Labels ?? {}),
    ports: mapInspectPorts(inspect.NetworkSettings?.Ports),
    groupIds: [],
    groupNames: [],
    command: inspect.Config?.Cmd?.join(" ") ?? null,
    entrypoint: Array.isArray(inspect.Config?.Entrypoint)
      ? inspect.Config.Entrypoint
      : inspect.Config?.Entrypoint
        ? [inspect.Config.Entrypoint]
        : [],
    restartPolicy: inspect.HostConfig?.RestartPolicy?.Name ?? null,
    startedAt: inspect.State?.StartedAt ? new Date(inspect.State.StartedAt).toISOString() : null,
    labels: Object.fromEntries(Object.entries(inspect.Config?.Labels ?? {}).map(([key, value]) => [key, value ?? ""])),
    environment: inspect.Config?.Env ?? [],
    mounts: (inspect.Mounts ?? []).map((mount) => ({
      type: mount.Type ?? null,
      source: mount.Source ?? null,
      destination: mount.Destination ?? null,
      mode: mount.Mode ?? null,
      rw: mount.RW ?? null,
      name: mount.Name ?? null,
    })),
    networks,
    inspect,
  };
};

const mapNetworkSummary = (network: NetworkInspectInfo): NetworkSummary => {
  const config = network.IPAM?.Config?.[0];

  return {
    id: network.Id,
    name: network.Name,
    driver: network.Driver ?? null,
    scope: network.Scope ?? null,
    subnet: config?.Subnet ?? null,
    gateway: config?.Gateway ?? null,
    connectedContainersCount: Object.keys(network.Containers ?? {}).length,
  };
};

const parseTimestampedLine = (stream: LogStream, line: string): ContainerLogEntry => {
  const separatorIndex = line.indexOf(" ");
  const maybeTimestamp = separatorIndex > 0 ? line.slice(0, separatorIndex) : null;
  const timestamp = maybeTimestamp && !Number.isNaN(Date.parse(maybeTimestamp)) ? maybeTimestamp : null;

  return {
    timestamp,
    stream,
    message: timestamp ? line.slice(separatorIndex + 1) : line,
  };
};

const flushLineBuffer = (stream: LogStream, buffer: string, onEntry: (entry: ContainerLogEntry) => void) => {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    onEntry(parseTimestampedLine(stream, line));
  }

  return remainder;
};

class DockerLogParser {
  private mode: "unknown" | "multiplexed" | "plain" = "unknown";

  private frameBuffer = Buffer.alloc(0);

  private streamRemainders: Record<LogStream, string> = { stdout: "", stderr: "" };

  constructor(private readonly onEntry: (entry: ContainerLogEntry) => void) {}

  feed(chunk: Buffer) {
    if (!chunk.length) {
      return;
    }

    if (this.mode === "unknown") {
      this.mode = this.looksMultiplexed(chunk) ? "multiplexed" : "plain";
    }

    if (this.mode === "plain") {
      this.streamRemainders.stdout = flushLineBuffer("stdout", this.streamRemainders.stdout + chunk.toString("utf8"), this.onEntry);
      return;
    }

    this.frameBuffer = Buffer.concat([this.frameBuffer, chunk]);

    while (this.frameBuffer.length >= 8) {
      const streamType = this.frameBuffer[0];
      const frameSize = this.frameBuffer.readUInt32BE(4);

      if (![1, 2].includes(streamType)) {
        this.mode = "plain";
        this.streamRemainders.stdout = flushLineBuffer(
          "stdout",
          this.streamRemainders.stdout + this.frameBuffer.toString("utf8"),
          this.onEntry,
        );
        this.frameBuffer = Buffer.alloc(0);
        return;
      }

      if (this.frameBuffer.length < frameSize + 8) {
        return;
      }

      const payload = this.frameBuffer.subarray(8, 8 + frameSize);
      this.frameBuffer = this.frameBuffer.subarray(8 + frameSize);

      const stream = streamType === 2 ? "stderr" : "stdout";
      this.streamRemainders[stream] = flushLineBuffer(
        stream,
        this.streamRemainders[stream] + payload.toString("utf8"),
        this.onEntry,
      );
    }
  }

  flush() {
    if (this.mode === "multiplexed" && this.frameBuffer.length > 0) {
      this.streamRemainders.stdout = flushLineBuffer(
        "stdout",
        this.streamRemainders.stdout + this.frameBuffer.toString("utf8"),
        this.onEntry,
      );
      this.frameBuffer = Buffer.alloc(0);
    }

    for (const stream of Object.keys(this.streamRemainders) as LogStream[]) {
      const remainder = this.streamRemainders[stream];
      if (remainder.length > 0) {
        this.onEntry(parseTimestampedLine(stream, remainder));
        this.streamRemainders[stream] = "";
      }
    }
  }

  private looksMultiplexed(chunk: Buffer) {
    if (chunk.length < 8) {
      return false;
    }

    return [1, 2].includes(chunk[0]) && chunk[1] === 0 && chunk[2] === 0 && chunk[3] === 0;
  }
}

const clampLogTail = (tailLines?: number) => {
  const requestedTail = tailLines ?? DEFAULT_CONTAINER_LOG_TAIL;
  return Math.min(Math.max(requestedTail, 1), MAX_CONTAINER_LOG_TAIL);
};

const streamToBuffer = async (stream: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

export const parseDockerLogChunk = (chunk: Buffer) => {
  const entries: ContainerLogEntry[] = [];
  const parser = new DockerLogParser((entry) => entries.push(entry));
  parser.feed(chunk);
  parser.flush();
  return entries;
};

export class DockerRuntimeClient {
  private docker: Docker;

  constructor(config: DockerConnectionConfig = {}) {
    this.docker = new Docker(parseDockerConfig(config));
  }

  async ping() {
    await this.docker.ping();
    return { ok: true };
  }

  async listContainers() {
    const containers = await this.docker.listContainers({ all: true });
    return containers.map(mapContainerSummary);
  }

  async inspectContainer(idOrName: string) {
    try {
      return await (await this.resolveContainer(idOrName)).inspect();
    } catch {
      throw new Error(`Container ${idOrName} not found`);
    }
  }

  async getContainerDetail(idOrName: string): Promise<ContainerDetail> {
    const inspect = await this.inspectContainer(idOrName);
    const overview = mapOverview(inspect);

    return {
      overview,
      terminalCommands: this.getTerminalCommands(overview.name),
    };
  }

  getTerminalCommands(name: string) {
    return [
      { label: "Shell (sh)", command: `docker exec -it ${name} sh` },
      { label: "Shell (bash)", command: `docker exec -it ${name} bash` },
      { label: "Logs", command: `docker logs -f ${name}` },
      { label: "Inspect", command: `docker inspect ${name}` },
    ];
  }

  async getContainerLogs(idOrName: string, options: { tailLines?: number } = {}): Promise<ContainerLogsResponse> {
    const tailLines = clampLogTail(options.tailLines);
    const container = await this.resolveContainer(idOrName);
    const logs = await container.logs({
      follow: false,
      stdout: true,
      stderr: true,
      timestamps: true,
      tail: tailLines,
    });

    const payload = Buffer.isBuffer(logs) ? logs : await streamToBuffer(logs);
    const entries = parseDockerLogChunk(payload);

    return {
      containerIdOrName: idOrName,
      tailLines,
      truncated: entries.length >= tailLines,
      entries,
    };
  }

  async streamContainerLogs(idOrName: string, callbacks: LogStreamCallbacks) {
    const container = await this.resolveContainer(idOrName);
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      timestamps: true,
      tail: 0,
      since: Math.floor(Date.now() / 1000),
    });
    const parser = new DockerLogParser(callbacks.onEntry);

    const handleData = (chunk: Buffer | string) => {
      parser.feed(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    const handleEnd = () => {
      parser.flush();
    };
    const handleError = (error: Error) => {
      parser.flush();
      callbacks.onError?.(error);
    };

    stream.on("data", handleData);
    stream.on("end", handleEnd);
    stream.on("error", handleError);

    let closed = false;
    const close = () => {
      if (closed) {
        return;
      }

      closed = true;
      stream.off("data", handleData);
      stream.off("end", handleEnd);
      stream.off("error", handleError);
      parser.flush();
      (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
    };

    return { close };
  }

  async openContainerTerminal(
    idOrName: string,
    options: OpenContainerTerminalOptions,
    callbacks: TerminalSessionCallbacks,
  ): Promise<ContainerTerminalSession> {
    const container = await this.resolveContainer(idOrName);
    const inspect = await container.inspect();

    if (inspect.State?.Status !== "running") {
      throw new Error(`Container ${idOrName} is not running`);
    }

    const exec = await container.exec({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: [options.shell],
      ConsoleSize: [options.rows, options.cols],
      Tty: true,
    });
    const stream = await exec.start({
      hijack: true,
      stdin: true,
      Tty: true,
    });

    let closed = false;
    let exitReported = false;

    const reportExit = async () => {
      if (exitReported || closed) {
        return;
      }

      exitReported = true;

      try {
        const result = await exec.inspect();
        callbacks.onExit?.(result.ExitCode ?? null);
      } catch (error) {
        callbacks.onError?.(error instanceof Error ? error : new Error("Failed to inspect terminal exec"));
      }
    };

    const handleData = (chunk: Buffer | string) => {
      callbacks.onOutput(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
    };
    const handleEnd = () => {
      void reportExit();
    };
    const handleClose = () => {
      void reportExit();
    };
    const handleError = (error: Error) => {
      callbacks.onError?.(error);
    };

    stream.on("data", handleData);
    stream.on("end", handleEnd);
    stream.on("close", handleClose);
    stream.on("error", handleError);

    return {
      write: (data: string) => {
        if (closed) {
          return;
        }

        stream.write(data);
      },
      resize: async (cols: number, rows: number) => {
        if (closed) {
          return;
        }

        await exec.resize({ h: rows, w: cols });
      },
      close: () => {
        if (closed) {
          return;
        }

        closed = true;
        stream.off("data", handleData);
        stream.off("end", handleEnd);
        stream.off("close", handleClose);
        stream.off("error", handleError);
        (stream as NodeJS.ReadWriteStream & { destroy?: () => void }).destroy?.();
      },
    };
  }

  async startContainer(idOrName: string) {
    await this.docker.getContainer(idOrName).start();
  }

  async stopContainer(idOrName: string) {
    await this.docker.getContainer(idOrName).stop();
  }

  async restartContainer(idOrName: string) {
    await this.docker.getContainer(idOrName).restart();
  }

  async waitForReady(idOrName: string, options: WaitOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const intervalMs = options.intervalMs ?? 1_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const inspect = await this.inspectContainer(idOrName);
      const health = parseHealth(inspect);
      const status = inspect.State?.Status;

      if (health === "healthy") {
        return { ready: true, reason: "healthy" };
      }

      if (health === HEALTHCHECK_NONE && status === "running") {
        return { ready: true, reason: "running" };
      }

      if (health === "unhealthy" || status === "exited" || status === "dead") {
        return { ready: false, reason: `${health}:${status}` };
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return { ready: false, reason: "timeout" };
  }

  async listVolumes(): Promise<VolumeSummary[]> {
    const [volumesResponse, containers] = await Promise.all([
      this.docker.listVolumes(),
      this.docker.listContainers({ all: true }),
    ]);

    return (volumesResponse.Volumes ?? []).map((volume) => {
      const associatedContainersCount = containers.filter((container) =>
        (container.Mounts ?? []).some((mount) => mount.Name === volume.Name),
      ).length;

      return {
        name: volume.Name,
        driver: volume.Driver ?? null,
        mountpoint: volume.Mountpoint ?? null,
        labels: Object.fromEntries(Object.entries(volume.Labels ?? {}).map(([key, value]) => [key, value ?? ""])),
        associatedContainersCount,
      };
    });
  }

  async inspectVolume(name: string): Promise<VolumeDetail> {
    const [inspect, containers] = await Promise.all([
      this.docker.getVolume(name).inspect(),
      this.docker.listContainers({ all: true }),
    ]);

    return {
      name: inspect.Name,
      driver: inspect.Driver ?? null,
      mountpoint: inspect.Mountpoint ?? null,
      labels: Object.fromEntries(Object.entries(inspect.Labels ?? {}).map(([key, value]) => [key, value ?? ""])),
      associatedContainersCount: containers.filter((container) =>
        (container.Mounts ?? []).some((mount) => mount.Name === name),
      ).length,
      inspect,
      containers: containers
        .filter((container) => (container.Mounts ?? []).some((mount) => mount.Name === name))
        .map((container) => ({
          id: container.Id,
          name: canonicalizeContainerKey(container.Names?.[0] ?? container.Id),
          destination: container.Mounts?.find((mount) => mount.Name === name)?.Destination ?? null,
        })),
    };
  }

  async listNetworks(): Promise<NetworkSummary[]> {
    const networks = await this.docker.listNetworks();
    const detailed = await Promise.all(networks.map((network) => this.docker.getNetwork(network.Id).inspect()));
    return detailed.map(mapNetworkSummary);
  }

  async inspectNetwork(id: string): Promise<NetworkDetail> {
    const inspect = await this.docker.getNetwork(id).inspect();

    return {
      ...mapNetworkSummary(inspect),
      inspect,
      containers: Object.entries(inspect.Containers ?? {}).map(([containerId, container]) => ({
        id: containerId,
        name: container.Name ?? containerId,
        aliases: [],
        ipv4Address: container.IPv4Address ?? null,
        ipv6Address: container.IPv6Address ?? null,
      })),
    };
  }

  private async resolveContainer(idOrName: string) {
    const directContainer = this.docker.getContainer(idOrName);

    try {
      await directContainer.inspect();
      return directContainer;
    } catch {
      const containers = await this.docker.listContainers({ all: true });
      const match = containers.find((entry) =>
        [entry.Id, ...(entry.Names ?? []).map((name) => canonicalizeContainerKey(name))].includes(
          canonicalizeContainerKey(idOrName),
        ),
      );

      if (!match) {
        throw new Error(`Container ${idOrName} not found`);
      }

      return this.docker.getContainer(match.Id);
    }
  }
}

export type RuntimeContainerRef = {
  id: string;
  name: string;
  containerKey: string;
};

export const resolveContainerByKey = async (
  client: Pick<DockerRuntimeClient, "listContainers">,
  containerKey: string,
  lastKnownId?: string | null,
) => {
  const containers = await client.listContainers();
  const normalizedKey = canonicalizeContainerKey(containerKey);
  const byName = containers.find((container) => container.containerKey === normalizedKey);

  if (byName) {
    return byName;
  }

  if (lastKnownId) {
    return containers.find((container) => container.id === lastKnownId) ?? null;
  }

  return null;
};
