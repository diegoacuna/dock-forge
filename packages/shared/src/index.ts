import { z } from "zod";

export const containerStateSchema = z.enum([
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
  "unknown",
]);

export const healthStatusSchema = z.enum(["healthy", "unhealthy", "starting", "none", "unknown"]);
export const runActionSchema = z.enum(["START", "STOP", "RESTART", "START_CLEAN"]);
export const runStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"]);
export const runStepActionSchema = z.enum(["START", "STOP", "RESTART", "WAIT_READY"]);

export const composeMetadataSchema = z.object({
  project: z.string().nullable(),
  service: z.string().nullable(),
  workingDir: z.string().nullable(),
  configFiles: z.array(z.string()).default([]),
  rawLabels: z.record(z.string()).default({}),
});

export const portBindingSchema = z.object({
  privatePort: z.number().nullable(),
  publicPort: z.number().nullable(),
  type: z.string(),
  ip: z.string().nullable(),
  label: z.string(),
});

export const containerSummarySchema = z.object({
  id: z.string(),
  containerKey: z.string(),
  name: z.string(),
  image: z.string(),
  imageId: z.string().nullable(),
  state: containerStateSchema,
  status: z.string(),
  health: healthStatusSchema,
  createdAt: z.string().nullable(),
  ports: z.array(portBindingSchema),
  compose: composeMetadataSchema,
  groupIds: z.array(z.string()).default([]),
  groupNames: z.array(z.string()).default([]),
});

export const containerOverviewSchema = containerSummarySchema.extend({
  command: z.string().nullable(),
  entrypoint: z.array(z.string()).default([]),
  restartPolicy: z.string().nullable(),
  startedAt: z.string().nullable(),
  labels: z.record(z.string()).default({}),
  environment: z.array(z.string()).default([]),
  mounts: z.array(
    z.object({
      type: z.string().nullable(),
      source: z.string().nullable(),
      destination: z.string().nullable(),
      mode: z.string().nullable(),
      rw: z.boolean().nullable(),
      name: z.string().nullable(),
    }),
  ),
  networks: z.array(
    z.object({
      networkName: z.string(),
      aliases: z.array(z.string()).default([]),
      ipAddress: z.string().nullable(),
      gateway: z.string().nullable(),
    }),
  ),
  inspect: z.unknown(),
});

export const terminalCommandSchema = z.object({
  label: z.string(),
  command: z.string(),
});

export const terminalShellSchema = z.enum(["sh", "bash"]);

export const terminalStartMessageSchema = z.object({
  type: z.literal("start"),
  shell: terminalShellSchema,
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const terminalInputMessageSchema = z.object({
  type: z.literal("input"),
  data: z.string(),
});

export const terminalResizeMessageSchema = z.object({
  type: z.literal("resize"),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const terminalCloseMessageSchema = z.object({
  type: z.literal("close"),
});

export const terminalClientMessageSchema = z.discriminatedUnion("type", [
  terminalStartMessageSchema,
  terminalInputMessageSchema,
  terminalResizeMessageSchema,
  terminalCloseMessageSchema,
]);

export const terminalReadyMessageSchema = z.object({
  type: z.literal("ready"),
  containerName: z.string(),
  shell: terminalShellSchema,
});

export const terminalOutputMessageSchema = z.object({
  type: z.literal("output"),
  data: z.string(),
});

export const terminalExitMessageSchema = z.object({
  type: z.literal("exit"),
  exitCode: z.number().int().nullable(),
});

export const terminalErrorMessageSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});

export const terminalServerMessageSchema = z.discriminatedUnion("type", [
  terminalReadyMessageSchema,
  terminalOutputMessageSchema,
  terminalExitMessageSchema,
  terminalErrorMessageSchema,
]);

export const terminalDebugSnapshotSchema = z.object({
  resolvedSocketUrl: z.string(),
  containerIdOrName: z.string(),
  containerName: z.string(),
  containerState: containerStateSchema,
  connectable: z.boolean(),
  terminalCommands: z.array(terminalCommandSchema),
});

export const containerLogStreamSchema = z.enum(["stdout", "stderr"]);

export const containerLogEntrySchema = z.object({
  timestamp: z.string().nullable(),
  stream: containerLogStreamSchema,
  message: z.string(),
});

export const DEFAULT_CONTAINER_LOG_TAIL = 200;
export const MAX_CONTAINER_LOG_TAIL = 1000;

export const containerLogsResponseSchema = z.object({
  containerIdOrName: z.string(),
  tailLines: z.number().int().positive(),
  truncated: z.boolean(),
  entries: z.array(containerLogEntrySchema),
});

export const containerDetailSchema = z.object({
  overview: containerOverviewSchema,
  terminalCommands: z.array(terminalCommandSchema),
});

export const volumeSummarySchema = z.object({
  name: z.string(),
  driver: z.string().nullable(),
  mountpoint: z.string().nullable(),
  labels: z.record(z.string()).default({}),
  associatedContainersCount: z.number(),
});

export const volumeDetailSchema = volumeSummarySchema.extend({
  inspect: z.unknown(),
  containers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      destination: z.string().nullable(),
    }),
  ),
});

export const networkSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  driver: z.string().nullable(),
  scope: z.string().nullable(),
  subnet: z.string().nullable(),
  gateway: z.string().nullable(),
  connectedContainersCount: z.number(),
});

export const networkDetailSchema = networkSummarySchema.extend({
  inspect: z.unknown(),
  containers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      aliases: z.array(z.string()).default([]),
      ipv4Address: z.string().nullable(),
      ipv6Address: z.string().nullable(),
    }),
  ),
});

export const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  memberCount: z.number(),
  dependencyCount: z.number(),
  lastRunStatus: runStatusSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const groupContainerSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  containerKey: z.string(),
  containerNameSnapshot: z.string(),
  folderLabelSnapshot: z.string(),
  lastResolvedDockerId: z.string().nullable(),
  aliasName: z.string().nullable(),
  notes: z.string().nullable(),
  includeInStartAll: z.boolean(),
  includeInStopAll: z.boolean(),
  runtimeState: containerStateSchema,
  runtimeHealth: healthStatusSchema,
  runtimeStatusText: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const dependencyEdgeSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  fromGroupContainerId: z.string(),
  toGroupContainerId: z.string(),
  waitStrategy: z.string().nullable(),
  timeoutSeconds: z.number().nullable(),
  metadataJson: z.string().nullable(),
  createdAt: z.string(),
});

export const graphLayoutSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  groupContainerId: z.string(),
  positionX: z.number(),
  positionY: z.number(),
});

export const groupExecutionFolderSchema = z.object({
  folderLabel: z.string(),
  stage: z.number().int().nonnegative(),
  containerCount: z.number().int().nonnegative(),
});

export const groupExecutionStageSchema = z.object({
  stage: z.number().int().nonnegative(),
  folders: z.array(groupExecutionFolderSchema),
});

export const groupDetailSchema = groupSchema.extend({
  description: z.string().nullable(),
  containers: z.array(groupContainerSchema),
  edges: z.array(dependencyEdgeSchema),
  layouts: z.array(graphLayoutSchema),
  executionFolders: z.array(groupExecutionFolderSchema),
  executionStages: z.array(groupExecutionStageSchema),
});

export const orchestrationPlanLayerSchema = z.object({
  index: z.number(),
  members: z.array(groupContainerSchema),
});

export const orchestrationPlanSchema = z.object({
  action: runActionSchema,
  targetGroupId: z.string(),
  targetGroupContainerId: z.string().nullable(),
  layers: z.array(orchestrationPlanLayerSchema),
  orderedGroupContainerIds: z.array(z.string()),
});

export const groupRunStepSchema = z.object({
  id: z.string(),
  groupRunId: z.string(),
  groupContainerId: z.string().nullable(),
  containerKey: z.string().nullable(),
  containerNameSnapshot: z.string().nullable(),
  action: runStepActionSchema,
  status: runStatusSchema,
  message: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  metadataJson: z.string().nullable(),
});

export const groupRunSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  action: runActionSchema,
  status: runStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  summaryJson: z.string().nullable(),
  steps: z.array(groupRunStepSchema).default([]),
});

export const dashboardSchema = z.object({
  totalContainers: z.number(),
  runningContainers: z.number(),
  stoppedContainers: z.number(),
  unhealthyContainers: z.number(),
  totalGroups: z.number(),
  recentGroupRuns: z.array(groupRunSchema),
  orphanContainers: z.number(),
  groups: z.array(groupSchema),
});

export const containersRuntimeStatusSchema = z.enum(["connected", "unavailable"]);
export const containersRuntimeReasonSchema = z.enum(["docker_unavailable", "socket_missing", "connection_failed", "unknown"]);

export const containersRuntimeSchema = z.object({
  status: containersRuntimeStatusSchema,
  reason: containersRuntimeReasonSchema,
  message: z.string().nullable(),
});

export const containersOnboardingSchema = z.object({
  containersTourSeen: z.boolean(),
  persistenceAvailable: z.boolean(),
});

export const containersPageDataSchema = z.object({
  containers: z.array(containerSummarySchema),
  runtime: containersRuntimeSchema,
  onboarding: containersOnboardingSchema,
});

export const containersTourUpdateSchema = z.object({
  containersTourSeen: z.boolean(),
});

export const groupsOnboardingSchema = z.object({
  groupsTourSeen: z.boolean(),
  persistenceAvailable: z.boolean(),
});

export const groupsPageDataSchema = z.object({
  groups: z.array(groupSchema),
  onboarding: groupsOnboardingSchema,
});

export const groupsTourUpdateSchema = z.object({
  groupsTourSeen: z.boolean(),
});

export const createGroupSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export const updateGroupSchema = createGroupSchema.partial();

export const addGroupContainerSchema = z.object({
  containerKey: z.string().min(1),
  containerNameSnapshot: z.string().min(1),
  lastResolvedDockerId: z.string().nullable().optional(),
  aliasName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  includeInStartAll: z.boolean().optional(),
  includeInStopAll: z.boolean().optional(),
});

export const bulkAddGroupContainersSchema = z.object({
  containerKeys: z.array(z.string().min(1)).min(1),
});

export const bulkAddGroupContainersResultSchema = z.object({
  added: z.array(groupContainerSchema),
  skipped: z.array(z.string()),
});

export const updateGroupContainerSchema = z.object({
  aliasName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  includeInStartAll: z.boolean().optional(),
  includeInStopAll: z.boolean().optional(),
  lastResolvedDockerId: z.string().nullable().optional(),
});

export const createDependencyEdgeSchema = z.object({
  fromGroupContainerId: z.string(),
  toGroupContainerId: z.string(),
  waitStrategy: z.string().nullable().optional(),
  timeoutSeconds: z.number().int().positive().nullable().optional(),
  metadataJson: z.string().nullable().optional(),
});

export const validateGraphSchema = z.object({
  edges: z.array(
    z.object({
      fromGroupContainerId: z.string(),
      toGroupContainerId: z.string(),
    }),
  ),
});

export const saveGraphLayoutSchema = z.object({
  layouts: z.array(
    z.object({
      groupContainerId: z.string(),
      positionX: z.number(),
      positionY: z.number(),
    }),
  ),
});

export const saveExecutionOrderSchema = z.object({
  stages: z.array(z.array(z.string().min(1)).min(1)),
});

export const orchestrationExecuteSchema = z.object({
  dryRun: z.boolean().optional(),
  targetGroupContainerId: z.string().nullable().optional(),
});

export const listContainersQuerySchema = z.object({
  state: z.string().optional(),
  search: z.string().optional(),
  groupId: z.string().optional(),
  image: z.string().optional(),
});

export const containerLogsQuerySchema = z.object({
  tail: z.coerce.number().int().min(1).max(MAX_CONTAINER_LOG_TAIL).default(DEFAULT_CONTAINER_LOG_TAIL),
});

export type ContainerSummary = z.infer<typeof containerSummarySchema>;
export type ContainerOverview = z.infer<typeof containerOverviewSchema>;
export type ContainerDetail = z.infer<typeof containerDetailSchema>;
export type TerminalCommand = z.infer<typeof terminalCommandSchema>;
export type ContainerLogEntry = z.infer<typeof containerLogEntrySchema>;
export type ContainerLogsResponse = z.infer<typeof containerLogsResponseSchema>;
export type TerminalShell = z.infer<typeof terminalShellSchema>;
export type TerminalClientMessage = z.infer<typeof terminalClientMessageSchema>;
export type TerminalServerMessage = z.infer<typeof terminalServerMessageSchema>;
export type TerminalDebugSnapshot = z.infer<typeof terminalDebugSnapshotSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type ContainerState = z.infer<typeof containerStateSchema>;
export type Group = z.infer<typeof groupSchema>;
export type GroupContainer = z.infer<typeof groupContainerSchema>;
export type DependencyEdge = z.infer<typeof dependencyEdgeSchema>;
export type GroupExecutionFolder = z.infer<typeof groupExecutionFolderSchema>;
export type GroupExecutionStage = z.infer<typeof groupExecutionStageSchema>;
export type GroupDetail = z.infer<typeof groupDetailSchema>;
export type GroupRun = z.infer<typeof groupRunSchema>;
export type GroupRunStep = z.infer<typeof groupRunStepSchema>;
export type OrchestrationPlan = z.infer<typeof orchestrationPlanSchema>;
export type DashboardData = z.infer<typeof dashboardSchema>;
export type ContainersRuntime = z.infer<typeof containersRuntimeSchema>;
export type ContainersOnboarding = z.infer<typeof containersOnboardingSchema>;
export type ContainersPageData = z.infer<typeof containersPageDataSchema>;
export type GroupsOnboarding = z.infer<typeof groupsOnboardingSchema>;
export type GroupsPageData = z.infer<typeof groupsPageDataSchema>;
export type VolumeSummary = z.infer<typeof volumeSummarySchema>;
export type VolumeDetail = z.infer<typeof volumeDetailSchema>;
export type NetworkSummary = z.infer<typeof networkSummarySchema>;
export type NetworkDetail = z.infer<typeof networkDetailSchema>;
export type BulkAddGroupContainersResult = z.infer<typeof bulkAddGroupContainersResultSchema>;

export const canonicalizeContainerKey = (name: string) => name.replace(/^\//, "").trim();

export const getFolderLabel = (workingDir: string | null | undefined) => {
  if (!workingDir) {
    return "Standalone";
  }

  const normalized = workingDir.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);

  return segments.at(-1) || "Standalone";
};

export const formatDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;
