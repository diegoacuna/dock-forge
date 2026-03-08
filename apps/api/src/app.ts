import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import {
  containerLogsQuerySchema,
  addGroupContainerSchema,
  createDependencyEdgeSchema,
  createGroupSchema,
  listContainersQuerySchema,
  orchestrationExecuteSchema,
  saveGraphLayoutSchema,
  updateGroupContainerSchema,
  updateGroupSchema,
  validateGraphSchema,
} from "@dockforge/shared";
import { prisma } from "@dockforge/db";
import {
  dockerClient,
  ensureContainerMembershipPayload,
  executeGroupAction,
  getDashboard,
  getGroupDetail,
  getGroupPlan,
  getRunDetail,
  listActivity,
  listContainersWithGroups,
  listGroupRuns,
  listGroups,
  validateGroupGraph,
} from "./services.js";

const parseBody = <T>(schema: { parse: (input: unknown) => T }, input: unknown) => schema.parse(input);

const toHttpError = (app: ReturnType<typeof Fastify>, error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.toLowerCase().includes("not found")) {
    return app.httpErrors.notFound(message);
  }

  return app.httpErrors.internalServerError(message);
};

export const buildApp = () => {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true,
  });
  app.register(sensible);

  app.get("/api/health", async () => {
    await dockerClient.ping();
    return { ok: true };
  });

  app.get("/api/dashboard", async () => getDashboard());

  app.get("/api/containers", async (request) => {
    const query = listContainersQuerySchema.parse(request.query);
    return listContainersWithGroups(query);
  });

  app.get("/api/containers/:idOrName", async (request) => dockerClient.getContainerDetail((request.params as { idOrName: string }).idOrName));
  app.get("/api/containers/:idOrName/inspect", async (request) => dockerClient.inspectContainer((request.params as { idOrName: string }).idOrName));
  app.get("/api/containers/:idOrName/logs", async (request) => {
    try {
      const query = containerLogsQuerySchema.parse(request.query);
      return await dockerClient.getContainerLogs((request.params as { idOrName: string }).idOrName, {
        tailLines: query.tail,
      });
    } catch (error) {
      if (error && typeof error === "object" && "issues" in error) {
        throw app.httpErrors.badRequest(error instanceof Error ? error.message : "Invalid log query");
      }

      throw toHttpError(app, error);
    }
  });
  app.get("/api/containers/:idOrName/logs/stream", async (request, reply) => {
    const idOrName = (request.params as { idOrName: string }).idOrName;

    try {
      const query = containerLogsQuerySchema.parse(request.query);
      const snapshot = await dockerClient.getContainerLogs(idOrName, { tailLines: query.tail });

      let closed = false;
      let liveStream: Awaited<ReturnType<typeof dockerClient.streamContainerLogs>> | null = null;
      const closeStream = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(heartbeat);
        liveStream?.close();

        if (!reply.raw.destroyed) {
          reply.raw.end();
        }

        request.raw.off("close", closeStream);
        request.raw.off("error", closeStream);
      };

      reply.hijack();
      const originHeader = request.headers.origin;
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...(originHeader ? { "Access-Control-Allow-Origin": originHeader, Vary: "Origin" } : {}),
      });
      reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

      const heartbeat = setInterval(() => {
        if (!reply.raw.destroyed) {
          reply.raw.write(": keep-alive\n\n");
        }
      }, 15_000);

      request.raw.on("close", closeStream);
      request.raw.on("error", closeStream);
      liveStream = await dockerClient.streamContainerLogs(idOrName, {
        onEntry: (entry) => {
          if (!reply.raw.destroyed) {
            reply.raw.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
          }
        },
        onError: (error) => {
          if (!reply.raw.destroyed) {
            reply.raw.write(`event: stream-error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
          }

          closeStream();
        },
      });
    } catch (error) {
      if (error && typeof error === "object" && "issues" in error) {
        throw app.httpErrors.badRequest(error instanceof Error ? error.message : "Invalid log query");
      }

      if (reply.raw.headersSent) {
        if (!reply.raw.destroyed) {
          reply.raw.write(`event: stream-error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "Unexpected error" })}\n\n`);
          reply.raw.end();
        }

        return;
      }

      throw toHttpError(app, error);
    }
  });
  app.get("/api/containers/:idOrName/terminal-commands", async (request) => {
    const detail = await dockerClient.getContainerDetail((request.params as { idOrName: string }).idOrName);
    return detail.terminalCommands;
  });
  app.post("/api/containers/:idOrName/start", async (request) => {
    await dockerClient.startContainer((request.params as { idOrName: string }).idOrName);
    return { ok: true };
  });
  app.post("/api/containers/:idOrName/stop", async (request) => {
    await dockerClient.stopContainer((request.params as { idOrName: string }).idOrName);
    return { ok: true };
  });
  app.post("/api/containers/:idOrName/restart", async (request) => {
    await dockerClient.restartContainer((request.params as { idOrName: string }).idOrName);
    return { ok: true };
  });

  app.get("/api/volumes", async () => dockerClient.listVolumes());
  app.get("/api/volumes/:name", async (request) => dockerClient.inspectVolume((request.params as { name: string }).name));
  app.get("/api/networks", async () => dockerClient.listNetworks());
  app.get("/api/networks/:id", async (request) => dockerClient.inspectNetwork((request.params as { id: string }).id));

  app.get("/api/groups", async () => listGroups());
  app.post("/api/groups", async (request) => {
    const body = parseBody(createGroupSchema, request.body);
    return prisma.group.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        color: body.color ?? null,
      },
    });
  });
  app.get("/api/groups/:id", async (request) => getGroupDetail((request.params as { id: string }).id));
  app.patch("/api/groups/:id", async (request) => {
    const body = parseBody(updateGroupSchema, request.body);
    return prisma.group.update({
      where: { id: (request.params as { id: string }).id },
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        color: body.color,
      },
    });
  });
  app.delete("/api/groups/:id", async (request) => {
    await prisma.group.delete({
      where: { id: (request.params as { id: string }).id },
    });
    return { ok: true };
  });

  app.post("/api/groups/:id/containers", async (request) => {
    const body = parseBody(addGroupContainerSchema, request.body);
    const runtime = await ensureContainerMembershipPayload((request.params as { id: string }).id, body.containerKey);

    return prisma.groupContainer.create({
      data: {
        groupId: (request.params as { id: string }).id,
        containerKey: runtime.containerKey,
        containerNameSnapshot: body.containerNameSnapshot || runtime.name,
        lastResolvedDockerId: runtime.id,
        aliasName: body.aliasName ?? null,
        notes: body.notes ?? null,
        includeInStartAll: body.includeInStartAll ?? true,
        includeInStopAll: body.includeInStopAll ?? true,
      },
    });
  });
  app.patch("/api/groups/:id/containers/:groupContainerId", async (request) => {
    const body = parseBody(updateGroupContainerSchema, request.body);
    return prisma.groupContainer.update({
      where: { id: (request.params as { groupContainerId: string }).groupContainerId },
      data: {
        aliasName: body.aliasName,
        notes: body.notes,
        includeInStartAll: body.includeInStartAll,
        includeInStopAll: body.includeInStopAll,
        lastResolvedDockerId: body.lastResolvedDockerId,
      },
    });
  });
  app.delete("/api/groups/:id/containers/:groupContainerId", async (request) => {
    await prisma.groupContainer.delete({
      where: { id: (request.params as { groupContainerId: string }).groupContainerId },
    });
    return { ok: true };
  });

  app.get("/api/groups/:id/graph", async (request) => getGroupDetail((request.params as { id: string }).id));
  app.post("/api/groups/:id/edges", async (request) => {
    const groupId = (request.params as { id: string }).id;
    const body = parseBody(createDependencyEdgeSchema, request.body);
    const group = await getGroupDetail(groupId);
    const endpointIds = new Set(group.containers.map((container) => container.id));

    if (!endpointIds.has(body.fromGroupContainerId) || !endpointIds.has(body.toGroupContainerId)) {
      throw app.httpErrors.badRequest("Dependency edge endpoints must belong to the group");
    }

    const validation = await validateGroupGraph(groupId, [
      ...group.edges.map((edge) => ({
        id: edge.id,
        groupId: edge.groupId,
        fromGroupContainerId: edge.fromGroupContainerId,
        toGroupContainerId: edge.toGroupContainerId,
      })),
      {
        groupId,
        fromGroupContainerId: body.fromGroupContainerId,
        toGroupContainerId: body.toGroupContainerId,
      },
    ]);

    if (!validation.valid) {
      throw app.httpErrors.badRequest(validation.errors.join(", "));
    }

    return prisma.dependencyEdge.create({
      data: {
        groupId,
        fromGroupContainerId: body.fromGroupContainerId,
        toGroupContainerId: body.toGroupContainerId,
        waitStrategy: body.waitStrategy ?? null,
        timeoutSeconds: body.timeoutSeconds ?? null,
        metadataJson: body.metadataJson ?? null,
      },
    });
  });
  app.delete("/api/groups/:id/edges/:edgeId", async (request) => {
    await prisma.dependencyEdge.delete({
      where: { id: (request.params as { edgeId: string }).edgeId },
    });
    return { ok: true };
  });
  app.post("/api/groups/:id/validate-graph", async (request) => {
    const body = parseBody(validateGraphSchema, request.body);
    return validateGroupGraph(
      (request.params as { id: string }).id,
      body.edges.map((edge) => ({
        groupId: (request.params as { id: string }).id,
        fromGroupContainerId: edge.fromGroupContainerId,
        toGroupContainerId: edge.toGroupContainerId,
      })),
    );
  });
  app.post("/api/groups/:id/layout", async (request) => {
    const groupId = (request.params as { id: string }).id;
    const body = parseBody(saveGraphLayoutSchema, request.body);

    await prisma.$transaction(
      body.layouts.map((layout) =>
        prisma.groupGraphLayout.upsert({
          where: {
            groupId_groupContainerId: {
              groupId,
              groupContainerId: layout.groupContainerId,
            },
          },
          update: {
            positionX: layout.positionX,
            positionY: layout.positionY,
          },
          create: {
            groupId,
            groupContainerId: layout.groupContainerId,
            positionX: layout.positionX,
            positionY: layout.positionY,
          },
        }),
      ),
    );

    return getGroupDetail(groupId);
  });

  app.get("/api/groups/:id/plan", async (request) => {
    const query = orchestrationExecuteSchema.parse(request.query);
    return getGroupPlan((request.params as { id: string }).id, "START", query.targetGroupContainerId);
  });
  app.post("/api/groups/:id/start", async (request) =>
    executeGroupAction({
      groupId: (request.params as { id: string }).id,
      action: "START",
      ...parseBody(orchestrationExecuteSchema, request.body),
    }),
  );
  app.post("/api/groups/:id/stop", async (request) =>
    executeGroupAction({
      groupId: (request.params as { id: string }).id,
      action: "STOP",
      ...parseBody(orchestrationExecuteSchema, request.body),
    }),
  );
  app.post("/api/groups/:id/restart", async (request) =>
    executeGroupAction({
      groupId: (request.params as { id: string }).id,
      action: "RESTART",
      ...parseBody(orchestrationExecuteSchema, request.body),
    }),
  );
  app.post("/api/groups/:id/start-clean", async (request) =>
    executeGroupAction({
      groupId: (request.params as { id: string }).id,
      action: "START_CLEAN",
      ...parseBody(orchestrationExecuteSchema, request.body),
    }),
  );
  app.get("/api/groups/:id/runs", async (request) => listGroupRuns((request.params as { id: string }).id));
  app.get("/api/group-runs/:id", async (request) => getRunDetail((request.params as { id: string }).id));
  app.get("/api/activity", async () => listActivity());

  return app;
};
