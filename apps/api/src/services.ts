import { prisma } from "@dockforge/db";
import { DockerRuntimeClient, resolveContainerByKey } from "@dockforge/docker-runtime";
import {
  getFolderLabel,
  canonicalizeContainerKey,
  formatDate,
  type DockerConnectionMode,
  type BulkAddGroupContainersResult,
  type ContainersPageData,
  type ContainersRuntime,
  type ContainerSummary,
  type Group,
  type GroupsPageData,
  type GroupExecutionFolder,
  type GroupExecutionStage,
  type GroupContainer as GroupContainerDto,
  type GroupDetail,
  groupRunStepMetadataSchema,
  type GroupActionLaunch,
  type InstallConfig,
  type InstallStatus,
  type GroupRun,
  type GroupRunStep,
  type GroupRunStepMetadata,
} from "@dockforge/shared";
import { buildPlan, executePlan, validateGraph, type GraphEdge } from "@dockforge/orchestrator";
import { config } from "./config.js";

const includeGroup = {
  containers: true,
  edges: true,
  graphLayouts: true,
  executionFolders: {
    orderBy: {
      stage: "asc" as const,
    },
  },
  runs: {
    orderBy: {
      startedAt: "desc" as const,
    },
    take: 1,
  },
} as const;

const CONTAINERS_TOUR_SEEN_KEY = "containersTourSeen";
const GROUPS_TOUR_SEEN_KEY = "groupsTourSeen";
const INSTALL_COMPLETED_KEY = "installCompleted";
const DOCKER_CONNECTION_MODE_KEY = "dockerConnectionMode";
const DOCKER_SOCKET_PATH_KEY = "dockerSocketPath";
const DOCKER_HOST_KEY = "dockerHost";
const CONTAINERS_TOUR_PERSISTENCE_UNAVAILABLE_CODE = "CONTAINERS_TOUR_PERSISTENCE_UNAVAILABLE";
const GROUPS_TOUR_PERSISTENCE_UNAVAILABLE_CODE = "GROUPS_TOUR_PERSISTENCE_UNAVAILABLE";
const INSTALL_PERSISTENCE_UNAVAILABLE_CODE = "INSTALL_PERSISTENCE_UNAVAILABLE";

const isMissingAppSettingTableError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "P2021";

const createContainersTourPersistenceUnavailableError = () => {
  const error = new Error("Containers tour persistence is unavailable until migrations are applied. Run `pnpm db:migrate`.");
  Object.assign(error, { code: CONTAINERS_TOUR_PERSISTENCE_UNAVAILABLE_CODE });
  return error;
};

const createGroupsTourPersistenceUnavailableError = () => {
  const error = new Error("Groups tour persistence is unavailable until migrations are applied. Run `pnpm db:migrate`.");
  Object.assign(error, { code: GROUPS_TOUR_PERSISTENCE_UNAVAILABLE_CODE });
  return error;
};

const createInstallPersistenceUnavailableError = () => {
  const error = new Error("Install persistence is unavailable until migrations are applied. Run `pnpm db:migrate`.");
  Object.assign(error, { code: INSTALL_PERSISTENCE_UNAVAILABLE_CODE });
  return error;
};

const readAppSetting = async (key: string) => {
  try {
    return {
      setting: await prisma.appSetting.findUnique({
        where: { key },
      }),
      persistenceAvailable: true,
    };
  } catch (error) {
    if (isMissingAppSettingTableError(error)) {
      return {
        seen: false,
        persistenceAvailable: false,
      };
    }

    throw error;
  }
};

const readBooleanAppSetting = async (key: string) => {
  const result = await readAppSetting(key);
  return {
    value: result.setting?.value === "true",
    persistenceAvailable: result.persistenceAvailable,
  };
};

const readStringAppSetting = async (key: string) => {
  const result = await readAppSetting(key);
  return {
    value: result.setting?.value ?? null,
    persistenceAvailable: result.persistenceAvailable,
  };
};

const writeBooleanAppSetting = async ({
  key,
  value,
  onPersistenceUnavailable,
}: {
  key: string;
  value: boolean;
  onPersistenceUnavailable: () => Error;
}) => {
  try {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: {
        key,
        value: String(value),
      },
    });
  } catch (error) {
    if (isMissingAppSettingTableError(error)) {
      throw onPersistenceUnavailable();
    }

    throw error;
  }
};

const writeStringAppSetting = async ({
  key,
  value,
  onPersistenceUnavailable,
}: {
  key: string;
  value: string;
  onPersistenceUnavailable: () => Error;
}) => {
  try {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: {
        key,
        value,
      },
    });
  } catch (error) {
    if (isMissingAppSettingTableError(error)) {
      throw onPersistenceUnavailable();
    }

    throw error;
  }
};

const writeAppSettings = async ({
  entries,
  onPersistenceUnavailable,
}: {
  entries: Array<{ key: string; value: string }>;
  onPersistenceUnavailable: () => Error;
}) => {
  try {
    await prisma.$transaction(
      entries.map((entry) =>
        prisma.appSetting.upsert({
          where: { key: entry.key },
          update: { value: entry.value },
          create: entry,
        }),
      ),
    );
  } catch (error) {
    if (isMissingAppSettingTableError(error)) {
      throw onPersistenceUnavailable();
    }

    throw error;
  }
};

const normalizeInstallConfig = (configValue: {
  dockerConnectionMode: string | null;
  dockerSocketPath: string | null;
  dockerHost: string | null;
}): InstallConfig => {
  const fallbackMode = config.dockerHost ? "host" : "socket";
  const dockerConnectionMode = (
    configValue.dockerConnectionMode === "host" || configValue.dockerConnectionMode === "socket"
      ? configValue.dockerConnectionMode
      : fallbackMode
  ) as DockerConnectionMode;

  const savedSocketPath = (configValue.dockerSocketPath ?? "").trim();
  const savedDockerHost = (configValue.dockerHost ?? "").trim();

  return {
    dockerConnectionMode,
    dockerSocketPath:
      dockerConnectionMode === "socket" ? savedSocketPath || config.dockerSocketPath || "/var/run/docker.sock" : null,
    dockerHost: dockerConnectionMode === "host" ? savedDockerHost || config.dockerHost || null : null,
  };
};

const readInstallConfig = async () => {
  const [mode, socketPath, dockerHost] = await Promise.all([
    readStringAppSetting(DOCKER_CONNECTION_MODE_KEY),
    readStringAppSetting(DOCKER_SOCKET_PATH_KEY),
    readStringAppSetting(DOCKER_HOST_KEY),
  ]);

  return {
    config: normalizeInstallConfig({
      dockerConnectionMode: mode.value,
      dockerSocketPath: socketPath.value,
      dockerHost: dockerHost.value,
    }),
    persistenceAvailable: mode.persistenceAvailable && socketPath.persistenceAvailable && dockerHost.persistenceAvailable,
  };
};

const toInstallSettingsEntries = (installConfig: InstallConfig) => [
  {
    key: DOCKER_CONNECTION_MODE_KEY,
    value: installConfig.dockerConnectionMode,
  },
  {
    key: DOCKER_SOCKET_PATH_KEY,
    value: installConfig.dockerConnectionMode === "socket" ? installConfig.dockerSocketPath ?? "" : "",
  },
  {
    key: DOCKER_HOST_KEY,
    value: installConfig.dockerConnectionMode === "host" ? installConfig.dockerHost ?? "" : "",
  },
];

const createDockerRuntimeClient = async () => {
  const effectiveConfig = await readEffectiveDockerConnectionConfig();
  return new DockerRuntimeClient({
    dockerHost: effectiveConfig.dockerConnectionMode === "host" ? effectiveConfig.dockerHost ?? undefined : undefined,
    socketPath: effectiveConfig.dockerConnectionMode === "socket" ? effectiveConfig.dockerSocketPath ?? undefined : undefined,
  });
};

const withDockerClient = async <T>(callback: (client: DockerRuntimeClient) => Promise<T>) => {
  const client = await createDockerRuntimeClient();
  return callback(client);
};

type RuntimeDockerClient = {
  ping: () => Promise<{ ok: boolean }>;
  listContainers: () => Promise<Awaited<ReturnType<DockerRuntimeClient["listContainers"]>>>;
  inspectContainer: (idOrName: string) => Promise<Awaited<ReturnType<DockerRuntimeClient["inspectContainer"]>>>;
  getContainerDetail: (idOrName: string) => Promise<Awaited<ReturnType<DockerRuntimeClient["getContainerDetail"]>>>;
  getContainerLogs: (
    idOrName: string,
    options?: { tailLines?: number },
  ) => Promise<Awaited<ReturnType<DockerRuntimeClient["getContainerLogs"]>>>;
  streamContainerLogs: (
    idOrName: string,
    callbacks: Parameters<DockerRuntimeClient["streamContainerLogs"]>[1],
  ) => Promise<Awaited<ReturnType<DockerRuntimeClient["streamContainerLogs"]>>>;
  openContainerTerminal: (
    idOrName: string,
    options: Parameters<DockerRuntimeClient["openContainerTerminal"]>[1],
    callbacks: Parameters<DockerRuntimeClient["openContainerTerminal"]>[2],
  ) => Promise<Awaited<ReturnType<DockerRuntimeClient["openContainerTerminal"]>>>;
  startContainer: (idOrName: string) => Promise<Awaited<ReturnType<DockerRuntimeClient["startContainer"]>>>;
  stopContainer: (idOrName: string) => Promise<Awaited<ReturnType<DockerRuntimeClient["stopContainer"]>>>;
  restartContainer: (idOrName: string) => Promise<void>;
  waitForReady: (
    idOrName: string,
    options?: { timeoutMs?: number },
  ) => Promise<Awaited<ReturnType<DockerRuntimeClient["waitForReady"]>>>;
  listVolumes: () => Promise<Awaited<ReturnType<DockerRuntimeClient["listVolumes"]>>>;
  inspectVolume: (name: string) => Promise<Awaited<ReturnType<DockerRuntimeClient["inspectVolume"]>>>;
  listNetworks: () => Promise<Awaited<ReturnType<DockerRuntimeClient["listNetworks"]>>>;
  inspectNetwork: (id: string) => Promise<Awaited<ReturnType<DockerRuntimeClient["inspectNetwork"]>>>;
};

const readInstallCompletedState = async () => {
  const setting = await readBooleanAppSetting(INSTALL_COMPLETED_KEY);
  return {
    installCompleted: setting.value,
    persistenceAvailable: setting.persistenceAvailable,
  };
};

export const readEffectiveDockerConnectionConfig = async (): Promise<InstallConfig> => {
  const installConfig = await readInstallConfig();
  return installConfig.config;
};

export const getInstallStatus = async (): Promise<InstallStatus> => {
  const [installState, installConfig] = await Promise.all([readInstallCompletedState(), readInstallConfig()]);

  return {
    installCompleted: installState.installCompleted,
    persistenceAvailable: installState.persistenceAvailable && installConfig.persistenceAvailable,
    config: installConfig.config,
  };
};

export const completeInstall = async (installConfig: InstallConfig): Promise<InstallStatus> => {
  await writeAppSettings({
    entries: [
      { key: INSTALL_COMPLETED_KEY, value: "true" },
      ...toInstallSettingsEntries(installConfig),
    ],
    onPersistenceUnavailable: createInstallPersistenceUnavailableError,
  });

  return {
    installCompleted: true,
    persistenceAvailable: true,
    config: normalizeInstallConfig(installConfig),
  };
};

export const updateInstallConfig = async (installConfig: InstallConfig): Promise<InstallStatus> => {
  await writeAppSettings({
    entries: toInstallSettingsEntries(installConfig),
    onPersistenceUnavailable: createInstallPersistenceUnavailableError,
  });

  const installState = await readInstallCompletedState();

  return {
    installCompleted: installState.installCompleted,
    persistenceAvailable: installState.persistenceAvailable,
    config: normalizeInstallConfig(installConfig),
  };
};

export const dockerClient: RuntimeDockerClient = {
  ping: () => withDockerClient((client) => client.ping()),
  listContainers: () => withDockerClient((client) => client.listContainers()),
  inspectContainer: (idOrName: string) => withDockerClient((client) => client.inspectContainer(idOrName)),
  getContainerDetail: (idOrName: string) => withDockerClient((client) => client.getContainerDetail(idOrName)),
  getContainerLogs: (idOrName: string, options?: { tailLines?: number }) =>
    withDockerClient((client) => client.getContainerLogs(idOrName, options)),
  streamContainerLogs: (idOrName: string, callbacks: Parameters<DockerRuntimeClient["streamContainerLogs"]>[1]) =>
    withDockerClient((client) => client.streamContainerLogs(idOrName, callbacks)),
  openContainerTerminal: (
    idOrName: string,
    options: Parameters<DockerRuntimeClient["openContainerTerminal"]>[1],
    callbacks: Parameters<DockerRuntimeClient["openContainerTerminal"]>[2],
  ) => withDockerClient((client) => client.openContainerTerminal(idOrName, options, callbacks)),
  startContainer: (idOrName: string) => withDockerClient((client) => client.startContainer(idOrName)),
  stopContainer: (idOrName: string) => withDockerClient((client) => client.stopContainer(idOrName)),
  restartContainer: (idOrName: string) => withDockerClient((client) => client.restartContainer(idOrName)),
  waitForReady: (idOrName: string, options?: { timeoutMs?: number }) => withDockerClient((client) => client.waitForReady(idOrName, options)),
  listVolumes: () => withDockerClient((client) => client.listVolumes()),
  inspectVolume: (name: string) => withDockerClient((client) => client.inspectVolume(name)),
  listNetworks: () => withDockerClient((client) => client.listNetworks()),
  inspectNetwork: (id: string) => withDockerClient((client) => client.inspectNetwork(id)),
};

const classifyDockerRuntimeError = (error: unknown): ContainersRuntime => {
  const message = error instanceof Error ? error.message : "Unable to connect to Docker.";
  const lower = message.toLowerCase();
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: string }).code ?? "") : "";

  if (code === "ENOENT" || lower.includes("enoent") || lower.includes("no such file") || lower.includes("docker.sock")) {
    return {
      status: "unavailable",
      reason: "socket_missing",
      message,
    };
  }

  if (
    code === "ECONNREFUSED" ||
    code === "EACCES" ||
    lower.includes("connect econnrefused") ||
    lower.includes("permission denied") ||
    lower.includes("socket hang up")
  ) {
    return {
      status: "unavailable",
      reason: "connection_failed",
      message,
    };
  }

  return {
    status: "unavailable",
    reason: "docker_unavailable",
    message,
  };
};

const readContainersTourState = async () => {
  const setting = await readBooleanAppSetting(CONTAINERS_TOUR_SEEN_KEY);
  return {
    containersTourSeen: setting.value,
    persistenceAvailable: setting.persistenceAvailable,
  };
};

const readGroupsTourState = async () => {
  const setting = await readBooleanAppSetting(GROUPS_TOUR_SEEN_KEY);
  return {
    groupsTourSeen: setting.value,
    persistenceAvailable: setting.persistenceAvailable,
  };
};

const mapGroupContainer = (
  container: {
    id: string;
    groupId: string;
    containerKey: string;
    containerNameSnapshot: string;
    folderLabelSnapshot: string;
    lastResolvedDockerId: string | null;
    aliasName: string | null;
    notes: string | null;
    includeInStartAll: boolean;
    includeInStopAll: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  runtime?: ContainerSummary,
): GroupContainerDto => ({
  id: container.id,
  groupId: container.groupId,
  containerKey: container.containerKey,
  containerNameSnapshot: container.containerNameSnapshot,
  folderLabelSnapshot: container.folderLabelSnapshot,
  lastResolvedDockerId: container.lastResolvedDockerId,
  aliasName: container.aliasName,
  notes: container.notes,
  includeInStartAll: container.includeInStartAll,
  includeInStopAll: container.includeInStopAll,
  runtimeState: runtime?.state ?? "unknown",
  runtimeHealth: runtime?.health ?? "unknown",
  runtimeStatusText: runtime?.status ?? null,
  createdAt: container.createdAt.toISOString(),
  updatedAt: container.updatedAt.toISOString(),
});

const deriveFolderStagesFromEdges = (
  containers: Array<{ id: string; folderLabelSnapshot: string }>,
  edges: Array<{ fromGroupContainerId: string; toGroupContainerId: string }>,
) => {
  const folderLabels = [...new Set(containers.map((container) => container.folderLabelSnapshot))].sort((left, right) =>
    left.localeCompare(right),
  );

  if (folderLabels.length <= 1) {
    return [folderLabels];
  }

  const folderByContainerId = new Map(containers.map((container) => [container.id, container.folderLabelSnapshot]));
  const adjacency = new Map(folderLabels.map((label) => [label, new Set<string>()]));
  const inDegree = new Map(folderLabels.map((label) => [label, 0]));

  for (const edge of edges) {
    const fromFolder = folderByContainerId.get(edge.fromGroupContainerId);
    const toFolder = folderByContainerId.get(edge.toGroupContainerId);
    if (!fromFolder || !toFolder || fromFolder === toFolder) {
      continue;
    }

    const outgoing = adjacency.get(fromFolder);
    if (outgoing?.has(toFolder)) {
      continue;
    }

    outgoing?.add(toFolder);
    inDegree.set(toFolder, (inDegree.get(toFolder) ?? 0) + 1);
  }

  if ([...adjacency.values()].every((targets) => targets.size === 0)) {
    return [folderLabels];
  }

  const queue = folderLabels.filter((label) => (inDegree.get(label) ?? 0) === 0).sort((left, right) => left.localeCompare(right));
  const stages: string[][] = [];

  while (queue.length) {
    const currentStage = [...queue].sort((left, right) => left.localeCompare(right));
    queue.length = 0;
    stages.push(currentStage);

    for (const current of currentStage) {
      const nextFolders = [...(adjacency.get(current) ?? [])].sort((left, right) => left.localeCompare(right));
      for (const next of nextFolders) {
        const nextDegree = (inDegree.get(next) ?? 0) - 1;
        inDegree.set(next, nextDegree);
        if (nextDegree === 0) {
          queue.push(next);
        }
      }
    }

    queue.sort((left, right) => left.localeCompare(right));
  }

  return stages.flat().length === folderLabels.length ? stages : [folderLabels];
};

const resolveExecutionFolderStages = (
  containers: Array<{ id: string; folderLabelSnapshot: string }>,
  persistedFolders: Array<{ folderLabel: string; stage: number }>,
  edges: Array<{ fromGroupContainerId: string; toGroupContainerId: string }>,
) => {
  const availableFolders = [...new Set(containers.map((container) => container.folderLabelSnapshot))];

  if (availableFolders.length === 0) {
    return [] as string[][];
  }

  if (persistedFolders.length === 0) {
    return deriveFolderStagesFromEdges(containers, edges);
  }

  const groupedPersisted = new Map<number, string[]>();
  for (const folder of [...persistedFolders].sort((left, right) => left.stage - right.stage || left.folderLabel.localeCompare(right.folderLabel))) {
    if (!availableFolders.includes(folder.folderLabel)) {
      continue;
    }

    const current = groupedPersisted.get(folder.stage) ?? [];
    if (!current.includes(folder.folderLabel)) {
      current.push(folder.folderLabel);
      groupedPersisted.set(folder.stage, current);
    }
  }

  const persistedStages = [...groupedPersisted.entries()]
    .sort(([leftStage], [rightStage]) => leftStage - rightStage)
    .map(([, folderLabels]) => folderLabels.sort((left, right) => left.localeCompare(right)))
    .filter((folderLabels) => folderLabels.length > 0);
  const persistedFolderLabels = persistedStages.flat();
  const remaining = availableFolders
    .filter((folderLabel) => !persistedFolderLabels.includes(folderLabel))
    .sort((left, right) => left.localeCompare(right));

  return [...persistedStages, ...remaining.map((folderLabel) => [folderLabel])];
};

const mapExecutionFolders = (
  containers: Array<{ id: string; folderLabelSnapshot: string }>,
  persistedFolders: Array<{ folderLabel: string; stage: number }>,
  edges: Array<{ fromGroupContainerId: string; toGroupContainerId: string }>,
): GroupExecutionFolder[] => {
  const stages = resolveExecutionFolderStages(containers, persistedFolders, edges);
  const counts = containers.reduce<Map<string, number>>((accumulator, container) => {
    accumulator.set(container.folderLabelSnapshot, (accumulator.get(container.folderLabelSnapshot) ?? 0) + 1);
    return accumulator;
  }, new Map());

  return stages.flatMap((folderLabels, stage) =>
    folderLabels.map((folderLabel) => ({
      folderLabel,
      stage,
      containerCount: counts.get(folderLabel) ?? 0,
    })),
  );
};

const mapExecutionStages = (executionFolders: GroupExecutionFolder[]): GroupExecutionStage[] => {
  const grouped = new Map<number, GroupExecutionFolder[]>();

  for (const folder of executionFolders) {
    const current = grouped.get(folder.stage) ?? [];
    current.push(folder);
    grouped.set(folder.stage, current);
  }

  return [...grouped.entries()]
    .sort(([leftStage], [rightStage]) => leftStage - rightStage)
    .map(([stage, folders]) => ({
      stage,
      folders: [...folders].sort((left, right) => left.folderLabel.localeCompare(right.folderLabel)),
    }));
};

const buildExecutionEdges = (
  groupId: string,
  containers: Array<{ id: string; folderLabelSnapshot: string }>,
  executionFolders: GroupExecutionFolder[],
): GraphEdge[] => {
  const membersByFolder = containers.reduce<Map<string, string[]>>((accumulator, container) => {
    const current = accumulator.get(container.folderLabelSnapshot) ?? [];
    current.push(container.id);
    accumulator.set(container.folderLabelSnapshot, current);
    return accumulator;
  }, new Map());

  const edges: GraphEdge[] = [];
  const stages = mapExecutionStages(executionFolders);
  for (let index = 0; index < stages.length - 1; index += 1) {
    const currentFolders = stages[index]?.folders.map((folder) => folder.folderLabel) ?? [];
    const nextFolders = stages[index + 1]?.folders.map((folder) => folder.folderLabel) ?? [];

    for (const currentFolder of currentFolders) {
      for (const nextFolder of nextFolders) {
        for (const sourceId of membersByFolder.get(currentFolder) ?? []) {
          for (const targetId of membersByFolder.get(nextFolder) ?? []) {
            edges.push({
              groupId,
              fromGroupContainerId: sourceId,
              toGroupContainerId: targetId,
            });
          }
        }
      }
    }
  }

  return edges;
};

const parseRunStepMetadata = (metadataJson: string | null): GroupRunStepMetadata | null => {
  if (!metadataJson) {
    return null;
  }

  try {
    return groupRunStepMetadataSchema.parse(JSON.parse(metadataJson));
  } catch {
    return null;
  }
};

const mapGroupRunStep = (step: {
  id: string;
  groupRunId: string;
  groupContainerId: string | null;
  containerKey: string | null;
  containerNameSnapshot: string | null;
  action: string;
  status: string;
  message: string | null;
  startedAt: Date;
  completedAt: Date | null;
  metadataJson: string | null;
}): GroupRunStep => ({
  id: step.id,
  groupRunId: step.groupRunId,
  groupContainerId: step.groupContainerId,
  containerKey: step.containerKey,
  containerNameSnapshot: step.containerNameSnapshot,
  action: step.action as GroupRunStep["action"],
  status: step.status as GroupRunStep["status"],
  message: step.message,
  startedAt: step.startedAt.toISOString(),
  completedAt: formatDate(step.completedAt),
  metadataJson: step.metadataJson,
  metadata: parseRunStepMetadata(step.metadataJson),
});

const mapGroupRun = (run: {
  id: string;
  groupId: string;
  action: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  summaryJson: string | null;
  steps?: Parameters<typeof mapGroupRunStep>[0][];
}): GroupRun => ({
  id: run.id,
  groupId: run.groupId,
  action: run.action as GroupRun["action"],
  status: run.status as GroupRun["status"],
  startedAt: run.startedAt.toISOString(),
  completedAt: formatDate(run.completedAt),
  summaryJson: run.summaryJson,
  steps: run.steps?.map(mapGroupRunStep) ?? [],
});

export const listGroups = async () => {
  const groups = await prisma.group.findMany({
    include: includeGroup,
    orderBy: {
      createdAt: "desc",
    },
  });

  return groups.map((group: (typeof groups)[number]) => ({
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    color: group.color,
    memberCount: group.containers.length,
    dependencyCount: group.edges.length,
    lastRunStatus: (group.runs[0]?.status as Group["lastRunStatus"]) ?? null,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  }));
};

export const getGroupDetail = async (groupId: string): Promise<GroupDetail> => {
  const [group, runtimeContainers] = await Promise.all([
    prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        containers: true,
        edges: true,
        graphLayouts: true,
        executionFolders: {
          orderBy: { stage: "asc" },
        },
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    }),
    dockerClient.listContainers(),
  ]);

  const runtimeMap = new Map(runtimeContainers.map((container) => [container.containerKey, container]));

  const executionFolders = mapExecutionFolders(group.containers, group.executionFolders, group.edges);

  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    color: group.color,
    memberCount: group.containers.length,
    dependencyCount: group.edges.length,
    lastRunStatus: (group.runs[0]?.status as GroupDetail["lastRunStatus"]) ?? null,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    containers: group.containers.map((container: (typeof group.containers)[number]): GroupContainerDto =>
      mapGroupContainer(container, runtimeMap.get(container.containerKey)),
    ),
    edges: group.edges.map((edge: (typeof group.edges)[number]) => ({
      id: edge.id,
      groupId: edge.groupId,
      fromGroupContainerId: edge.fromGroupContainerId,
      toGroupContainerId: edge.toGroupContainerId,
      waitStrategy: edge.waitStrategy,
      timeoutSeconds: edge.timeoutSeconds,
      metadataJson: edge.metadataJson,
      createdAt: edge.createdAt.toISOString(),
    })),
    layouts: group.graphLayouts.map((layout: (typeof group.graphLayouts)[number]) => ({
      id: layout.id,
      groupId: layout.groupId,
      groupContainerId: layout.groupContainerId,
      positionX: layout.positionX,
      positionY: layout.positionY,
    })),
    executionFolders,
    executionStages: mapExecutionStages(executionFolders),
  };
};

export const listContainersWithGroups = async (filters: {
  state?: string;
  search?: string;
  groupId?: string;
  image?: string;
}) => {
  const [containers, memberships] = await Promise.all([
    dockerClient.listContainers(),
    prisma.groupContainer.findMany({
      include: {
        group: true,
      },
    }),
  ]);

  const membershipByKey = new Map<string, { groupId: string; groupName: string }[]>();

  for (const membership of memberships) {
    const current = membershipByKey.get(membership.containerKey) ?? [];
    current.push({ groupId: membership.groupId, groupName: membership.group.name });
    membershipByKey.set(membership.containerKey, current);
  }

  return containers
    .map((container) => {
      const groups = membershipByKey.get(container.containerKey) ?? [];
      return {
        ...container,
        groupIds: groups.map((group) => group.groupId),
        groupNames: groups.map((group) => group.groupName),
      };
    })
    .filter((container) => {
      if (filters.state && filters.state !== "all" && container.state !== filters.state) {
        if (!(filters.state === "unhealthy" && container.health === "unhealthy")) {
          return false;
        }
      }

      if (filters.search && !container.name.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }

      if (filters.groupId && !container.groupIds.includes(filters.groupId)) {
        return false;
      }

      if (filters.image && !container.image.toLowerCase().includes(filters.image.toLowerCase())) {
        return false;
      }

      return true;
    });
};

export const getContainersPageData = async (): Promise<ContainersPageData> => {
  const [containersResult, containersTourState] = await Promise.allSettled([listContainersWithGroups({}), readContainersTourState()]);
  const onboardingState =
    containersTourState.status === "fulfilled"
      ? containersTourState.value
      : { containersTourSeen: false, persistenceAvailable: false };

  if (containersResult.status === "fulfilled") {
    return {
      containers: containersResult.value,
      runtime: {
        status: "connected",
        reason: "unknown",
        message: null,
      },
      onboarding: onboardingState,
    };
  }

  return {
    containers: [],
    runtime: classifyDockerRuntimeError(containersResult.reason),
    onboarding: onboardingState,
  };
};

export const setContainersTourSeen = async (containersTourSeen: boolean) => {
  await writeBooleanAppSetting({
    key: CONTAINERS_TOUR_SEEN_KEY,
    value: containersTourSeen,
    onPersistenceUnavailable: createContainersTourPersistenceUnavailableError,
  });

  return {
    containersTourSeen,
  };
};

export const getGroupsPageData = async (): Promise<GroupsPageData> => {
  const [groups, groupsTourState] = await Promise.all([listGroups(), readGroupsTourState()]);

  return {
    groups,
    onboarding: groupsTourState,
  };
};

export const setGroupsTourSeen = async (groupsTourSeen: boolean) => {
  await writeBooleanAppSetting({
    key: GROUPS_TOUR_SEEN_KEY,
    value: groupsTourSeen,
    onPersistenceUnavailable: createGroupsTourPersistenceUnavailableError,
  });

  return {
    groupsTourSeen,
  };
};

export const getDashboard = async () => {
  const [containers, groups, runs] = await Promise.all([
    listContainersWithGroups({}),
    listGroups(),
    prisma.groupRun.findMany({
      include: {
        steps: {
          orderBy: { startedAt: "asc" },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: 10,
    }),
  ]);

  return {
    totalContainers: containers.length,
    runningContainers: containers.filter((container) => container.state === "running").length,
    stoppedContainers: containers.filter((container) => container.state === "exited" || container.state === "dead").length,
    unhealthyContainers: containers.filter((container) => container.health === "unhealthy").length,
    totalGroups: groups.length,
    recentGroupRuns: runs.map(mapGroupRun),
    orphanContainers: containers.filter((container) => container.groupIds.length === 0).length,
    groups,
  };
};

export const validateGroupGraph = async (groupId: string, edges?: GraphEdge[]) => {
  const group = await getGroupDetail(groupId);
  const validation = validateGraph(
    group.containers.map((container) => ({
      id: container.id,
      groupId: container.groupId,
      includeInStartAll: container.includeInStartAll,
      includeInStopAll: container.includeInStopAll,
    })),
    edges ??
      group.edges.map((edge) => ({
        id: edge.id,
        groupId: edge.groupId,
        fromGroupContainerId: edge.fromGroupContainerId,
        toGroupContainerId: edge.toGroupContainerId,
      })),
  );

  return validation;
};

export const getGroupPlan = async (groupId: string, action: "START" | "STOP" | "RESTART" | "START_CLEAN", targetGroupContainerId?: string | null) => {
  const group = await getGroupDetail(groupId);
  const planningEdges = buildExecutionEdges(groupId, group.containers, group.executionFolders);
  return buildPlan(
    action === "RESTART" || action === "START_CLEAN" ? "START" : action,
    groupId,
    group.containers,
    planningEdges,
    targetGroupContainerId ?? null,
  );
};

const createRunLogger = () => ({
  async markRunRunning(runId: string) {
    await prisma.groupRun.update({
      where: { id: runId },
      data: { status: "RUNNING" },
    });
  },
  async markRunCompleted(runId: string, status: "SUCCEEDED" | "FAILED", summary: Record<string, unknown>) {
    await prisma.groupRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: new Date(),
        summaryJson: JSON.stringify(summary),
      },
    });
  },
  async createRunStep(input: {
    runId: string;
    member: GroupContainerDto;
    action: "START" | "STOP" | "RESTART" | "WAIT_READY";
    status: "RUNNING";
    message?: string;
    metadata?: Record<string, unknown>;
  }) {
    const step = await prisma.groupRunStep.create({
      data: {
        groupRunId: input.runId,
        groupContainerId: input.member.id,
        containerKey: input.member.containerKey,
        containerNameSnapshot: input.member.containerNameSnapshot,
        action: input.action,
        status: input.status,
        message: input.message,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        startedAt: new Date(),
      },
    });

    return step.id;
  },
  async completeRunStep(stepId: string, input: { status: "SUCCEEDED" | "FAILED" | "SKIPPED"; message?: string; metadata?: Record<string, unknown> }) {
    await prisma.groupRunStep.update({
      where: { id: stepId },
      data: {
        status: input.status,
        message: input.message,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
        completedAt: new Date(),
      },
    });
  },
});

const fetchRunWithSteps = async (runId: string) =>
  prisma.groupRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      steps: {
        orderBy: { startedAt: "asc" },
      },
    },
  });

const resolveGroupRuntimeTargets = async (members: GroupContainerDto[]) => {
  const targets = new Map<string, { member: GroupContainerDto; runtimeId: string; runtimeName: string }>();

  for (const member of members) {
    const resolved = await resolveContainerByKey(dockerClient, member.containerKey, member.lastResolvedDockerId);
    if (!resolved) {
      continue;
    }

    targets.set(member.id, {
      member,
      runtimeId: resolved.id,
      runtimeName: resolved.name,
    });

    await prisma.groupContainer.update({
      where: { id: member.id },
      data: {
        lastResolvedDockerId: resolved.id,
        containerNameSnapshot: resolved.name,
      },
    });
  }

  return targets;
};

const runGroupActionInBackground = async ({
  runId,
  groupId,
  action,
  targetGroupContainerId,
}: {
  runId: string;
  groupId: string;
  action: "START" | "STOP" | "RESTART" | "START_CLEAN";
  targetGroupContainerId?: string | null;
}) => {
  const logger = createRunLogger();

  try {
    const group = await getGroupDetail(groupId);
    const graphEdges = buildExecutionEdges(groupId, group.containers, group.executionFolders);
    const actionForPlan = action === "RESTART" || action === "START_CLEAN" ? "START" : action;
    const plan = buildPlan(actionForPlan, groupId, group.containers, graphEdges, targetGroupContainerId ?? null);
    const targets = await resolveGroupRuntimeTargets(group.containers);

    await logger.markRunRunning(runId);

    if (action === "START_CLEAN" || action === "RESTART") {
      const stopPlan = buildPlan("STOP", groupId, group.containers, graphEdges, targetGroupContainerId ?? null);
      await executePlan({
        runId,
        plan: stopPlan,
        targets,
        runtime: dockerClient,
        logger,
        manageRunState: false,
      });
    }

    await executePlan({
      runId,
      plan,
      targets,
      runtime: dockerClient,
      logger,
      manageRunState: false,
    });

    await logger.markRunCompleted(runId, "SUCCEEDED", {
      action,
      completedMembers: plan.orderedGroupContainerIds,
    });
  } catch (error) {
    await logger.markRunCompleted(runId, "FAILED", {
      action,
      failed: error instanceof Error ? error.message : "Unknown execution failure",
    });
  }
};

export const executeGroupAction = async ({
  groupId,
  action,
  dryRun,
  targetGroupContainerId,
}: {
  groupId: string;
  action: "START" | "STOP" | "RESTART" | "START_CLEAN";
  dryRun?: boolean;
  targetGroupContainerId?: string | null;
}): Promise<GroupActionLaunch | { dryRun: true; plan: ReturnType<typeof buildPlan> }> => {
  const group = await getGroupDetail(groupId);
  const graphEdges = buildExecutionEdges(groupId, group.containers, group.executionFolders);

  const actionForPlan = action === "RESTART" || action === "START_CLEAN" ? "START" : action;
  const plan = buildPlan(actionForPlan, groupId, group.containers, graphEdges, targetGroupContainerId ?? null);

  if (dryRun) {
    return {
      dryRun: true,
      plan,
    };
  }

  const run = await prisma.groupRun.create({
    data: {
      groupId,
      action,
      status: "PENDING",
      startedAt: new Date(),
    },
  });

  void runGroupActionInBackground({
    runId: run.id,
    groupId,
    action,
    targetGroupContainerId,
  });

  const pendingRun = await fetchRunWithSteps(run.id);

  return {
    runId: run.id,
    run: mapGroupRun(pendingRun),
  };
};

export const listGroupRuns = async (groupId: string) => {
  const runs = await prisma.groupRun.findMany({
    where: { groupId },
    include: {
      steps: {
        orderBy: { startedAt: "asc" },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return runs.map(mapGroupRun);
};

export const getRunDetail = async (runId: string) => {
  const run = await prisma.groupRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      steps: {
        orderBy: { startedAt: "asc" },
      },
    },
  });

  return mapGroupRun(run);
};

export const listActivity = async () => {
  const runs = await prisma.groupRun.findMany({
    include: {
      steps: {
        orderBy: { startedAt: "asc" },
      },
      group: true,
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return runs.map((run: (typeof runs)[number]) => ({
    ...mapGroupRun(run),
    groupName: run.group.name,
  }));
};

export const ensureContainerMembershipPayload = async (groupId: string, containerKey: string) => {
  const container = await resolveContainerByKey(dockerClient, canonicalizeContainerKey(containerKey));
  if (!container) {
    throw new Error(`Container ${containerKey} could not be resolved`);
  }

  return container;
};

export const createGroupContainerMembership = async (input: {
  groupId: string;
  containerKey: string;
  containerNameSnapshot?: string;
  aliasName?: string | null;
  notes?: string | null;
  includeInStartAll?: boolean;
  includeInStopAll?: boolean;
}) => {
  const runtime = await ensureContainerMembershipPayload(input.groupId, input.containerKey);
  const created = await prisma.groupContainer.create({
    data: {
      groupId: input.groupId,
      containerKey: runtime.containerKey,
      containerNameSnapshot: input.containerNameSnapshot || runtime.name,
      folderLabelSnapshot: getFolderLabel(runtime.compose.workingDir),
      lastResolvedDockerId: runtime.id,
      aliasName: input.aliasName ?? null,
      notes: input.notes ?? null,
      includeInStartAll: input.includeInStartAll ?? true,
      includeInStopAll: input.includeInStopAll ?? true,
    },
  });

  return mapGroupContainer(created, runtime);
};

export const bulkAttachGroupContainers = async (groupId: string, containerKeys: string[]): Promise<BulkAddGroupContainersResult> => {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      containers: true,
    },
  });

  const existingKeys = new Set(group.containers.map((container) => container.containerKey));
  const added: GroupContainerDto[] = [];
  const skipped: string[] = [];

  for (const containerKey of containerKeys) {
    const canonicalKey = canonicalizeContainerKey(containerKey);
    if (existingKeys.has(canonicalKey)) {
      skipped.push(canonicalKey);
      continue;
    }

    const runtime = await ensureContainerMembershipPayload(groupId, canonicalKey);
    if (existingKeys.has(runtime.containerKey)) {
      skipped.push(runtime.containerKey);
      continue;
    }

    const created = await prisma.groupContainer.create({
      data: {
        groupId,
        containerKey: runtime.containerKey,
        containerNameSnapshot: runtime.name,
        folderLabelSnapshot: getFolderLabel(runtime.compose.workingDir),
        lastResolvedDockerId: runtime.id,
        includeInStartAll: true,
        includeInStopAll: true,
      },
    });

    existingKeys.add(runtime.containerKey);
    added.push(mapGroupContainer(created, runtime));
  }

  return { added, skipped };
};

export const saveGroupExecutionOrder = async (groupId: string, stages: string[][]) => {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      containers: true,
      edges: true,
      executionFolders: {
        orderBy: { stage: "asc" },
      },
    },
  });

  const knownFolders = [...new Set(group.containers.map((container) => container.folderLabelSnapshot))].sort((left, right) =>
    left.localeCompare(right),
  );
  const normalizedStages = stages
    .map((stage) => stage.map((folderLabel) => folderLabel.trim()).filter(Boolean))
    .filter((stage) => stage.length > 0);
  const requestedFolders = normalizedStages.flat();
  const uniqueRequestedFolders = [...new Set(requestedFolders)];

  if (requestedFolders.length !== uniqueRequestedFolders.length) {
    throw new Error("Execution order contains duplicate folders");
  }

  if (
    uniqueRequestedFolders.length !== knownFolders.length ||
    uniqueRequestedFolders.some((folderLabel) => !knownFolders.includes(folderLabel))
  ) {
    throw new Error("Execution order must include each attached folder exactly once");
  }

  const operations = [
    prisma.groupExecutionFolder.deleteMany({
      where: { groupId },
    }),
  ];

  if (uniqueRequestedFolders.length > 0) {
    operations.push(
      prisma.groupExecutionFolder.createMany({
        data: normalizedStages.flatMap((folderLabels, stage) =>
          folderLabels.map((folderLabel, indexWithinStage) => ({
            groupId,
            folderLabel,
            stage,
            position:
              normalizedStages
                .slice(0, stage)
                .reduce((count, currentStage) => count + currentStage.length, 0) + indexWithinStage,
          })),
        ),
      }),
    );
  }

  await prisma.$transaction(operations);

  return getGroupDetail(groupId);
};
