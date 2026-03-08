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

export const groupDetailSchema = groupSchema.extend({
  description: z.string().nullable(),
  containers: z.array(groupContainerSchema),
  edges: z.array(dependencyEdgeSchema),
  layouts: z.array(graphLayoutSchema),
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
export type ContainerLogEntry = z.infer<typeof containerLogEntrySchema>;
export type ContainerLogsResponse = z.infer<typeof containerLogsResponseSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type ContainerState = z.infer<typeof containerStateSchema>;
export type Group = z.infer<typeof groupSchema>;
export type GroupContainer = z.infer<typeof groupContainerSchema>;
export type DependencyEdge = z.infer<typeof dependencyEdgeSchema>;
export type GroupDetail = z.infer<typeof groupDetailSchema>;
export type GroupRun = z.infer<typeof groupRunSchema>;
export type GroupRunStep = z.infer<typeof groupRunStepSchema>;
export type OrchestrationPlan = z.infer<typeof orchestrationPlanSchema>;
export type DashboardData = z.infer<typeof dashboardSchema>;
export type VolumeSummary = z.infer<typeof volumeSummarySchema>;
export type VolumeDetail = z.infer<typeof volumeDetailSchema>;
export type NetworkSummary = z.infer<typeof networkSummarySchema>;
export type NetworkDetail = z.infer<typeof networkDetailSchema>;

export const canonicalizeContainerKey = (name: string) => name.replace(/^\//, "").trim();

export const formatDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;
