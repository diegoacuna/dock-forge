import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import {
  canonicalizeContainerKey,
  containerLogsQuerySchema,
  addGroupContainerSchema,
  bulkAddGroupContainersSchema,
  completeInstallSchema,
  containersTourUpdateSchema,
  createDependencyEdgeSchema,
  createGroupSchema,
  groupsTourUpdateSchema,
  listContainersQuerySchema,
  orchestrationExecuteSchema,
  saveGraphLayoutSchema,
  saveExecutionOrderSchema,
  terminalClientMessageSchema,
  type TerminalDebugSnapshot,
  updateInstallConfigSchema,
  updateGroupContainerSchema,
  updateGroupSchema,
  validateGraphSchema,
  type TerminalServerMessage,
} from "@dockforge/shared";
import { prisma } from "@dockforge/db";
import { WebSocketServer, type WebSocket } from "ws";
import {
  bulkAttachGroupContainers,
  completeInstall,
  createGroupContainerMembership,
  dockerClient,
  executeGroupAction,
  getContainersPageData,
  getDashboard,
  getGroupDetail,
  getGroupPlan,
  getGroupsPageData,
  getInstallStatus,
  getRunDetail,
  listActivity,
  listContainersWithGroups,
  listGroupRuns,
  listGroups,
  saveGroupExecutionOrder,
  setContainersTourSeen,
  setGroupsTourSeen,
  updateInstallConfig,
  validateGroupGraph,
} from "./services.js";

const parseBody = <T>(schema: { parse: (input: unknown) => T }, input: unknown) => schema.parse(input);

type TerminalSocketLike = {
  send: (payload: string) => void;
  close: () => void;
};

type TerminalDiagnosticsLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
};

const toHttpError = (app: ReturnType<typeof Fastify>, error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.toLowerCase().includes("not found")) {
    return app.httpErrors.notFound(message);
  }

  return app.httpErrors.internalServerError(message);
};

const sendTerminalMessage = (socket: TerminalSocketLike, message: TerminalServerMessage) => {
  socket.send(JSON.stringify(message));
};

const parseTerminalPayload = (raw: unknown) => {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : typeof raw === "string" ? raw : "";
  return terminalClientMessageSchema.parse(JSON.parse(text));
};

const getTerminalDebugSnapshot = async (request: { params: { idOrName: string }; protocol?: string; headers: { host?: string } }) => {
  const detail = await dockerClient.getContainerDetail(request.params.idOrName);
  const protocol = request.protocol === "https" ? "wss" : "ws";
  const host = request.headers.host ?? "localhost:4000";

  const snapshot: TerminalDebugSnapshot = {
    resolvedSocketUrl: `${protocol}://${host}/api/containers/${encodeURIComponent(request.params.idOrName)}/terminal/ws`,
    containerIdOrName: request.params.idOrName,
    containerName: detail.overview.name,
    containerState: detail.overview.state,
    connectable: detail.overview.state === "running",
    terminalCommands: detail.terminalCommands,
  };

  return snapshot;
};

export const createTerminalSocketController = ({
  idOrName,
  socket,
  logger,
  connectionId,
}: {
  idOrName: string;
  socket: TerminalSocketLike;
  logger: TerminalDiagnosticsLogger;
  connectionId: string;
}) => {
  let session: Awaited<ReturnType<typeof dockerClient.openContainerTerminal>> | null = null;
  let firstMessageSeen = false;

  const closeSession = () => {
    session?.close();
    session = null;
  };

  logger.info({ connectionId, idOrName }, "[terminal-debug] websocket handler entered");

  const handleMessage = async (raw: unknown) => {
    try {
      if (!firstMessageSeen) {
        firstMessageSeen = true;
        logger.info({ connectionId, idOrName }, "[terminal-debug] first client message received");
      }

      const message = parseTerminalPayload(raw);
      logger.info({ connectionId, idOrName, messageType: message.type }, "[terminal-debug] parsed terminal message");

      if (message.type === "start") {
        closeSession();
        logger.info(
          { connectionId, idOrName, shell: message.shell, cols: message.cols, rows: message.rows },
          "[terminal-debug] terminal start requested",
        );
        session = await dockerClient.openContainerTerminal(
          idOrName,
          {
            shell: message.shell,
            cols: message.cols,
            rows: message.rows,
          },
          {
            onOutput: (data) => {
              sendTerminalMessage(socket, { type: "output", data });
            },
            onExit: (exitCode) => {
              session = null;
              sendTerminalMessage(socket, { type: "exit", exitCode });
            },
            onError: (error) => {
              sendTerminalMessage(socket, { type: "error", message: error.message });
            },
          },
        );

        const inspect = await dockerClient.inspectContainer(idOrName);
        logger.info(
          { connectionId, idOrName, containerName: canonicalizeContainerKey(inspect.Name ?? idOrName) },
          "[terminal-debug] docker terminal open succeeded",
        );
        sendTerminalMessage(socket, {
          type: "ready",
          containerName: canonicalizeContainerKey(inspect.Name ?? idOrName),
          shell: message.shell,
        });
        return;
      }

      if (!session) {
        sendTerminalMessage(socket, { type: "error", message: "Terminal session is not connected" });
        return;
      }

      if (message.type === "input") {
        session.write(message.data);
        return;
      }

      if (message.type === "resize") {
        await session.resize(message.cols, message.rows);
        return;
      }

      closeSession();
      socket.close();
    } catch (error) {
      logger.error(
        {
          connectionId,
          idOrName,
          error: error instanceof Error ? error.message : "Unexpected terminal error",
        },
        "[terminal-debug] terminal message handling failed",
      );
      sendTerminalMessage(socket, {
        type: "error",
        message: error instanceof Error ? error.message : "Unexpected terminal error",
      });
    }
  };

  const handleClose = () => {
    logger.info({ connectionId, idOrName }, "[terminal-debug] socket close handler invoked");
    closeSession();
  };

  return { handleMessage, handleClose };
};

export const buildApp = () => {
  const app = Fastify({ logger: true });
  const terminalWss = new WebSocketServer({ noServer: true });

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  app.register(sensible);

  app.get("/api/health", async () => {
    await dockerClient.ping();
    return { ok: true };
  });

  app.get("/api/install/status", async () => getInstallStatus());
  app.post("/api/install/complete", async (request) => {
    const body = parseBody(completeInstallSchema, request.body);
    try {
      return await completeInstall(body);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: string }).code ?? "") : "";
      if (code === "INSTALL_PERSISTENCE_UNAVAILABLE") {
        throw app.httpErrors.conflict(error instanceof Error ? error.message : "Install persistence is unavailable.");
      }

      throw error;
    }
  });
  app.put("/api/install/config", async (request) => {
    const body = parseBody(updateInstallConfigSchema, request.body);
    try {
      return await updateInstallConfig(body);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: string }).code ?? "") : "";
      if (code === "INSTALL_PERSISTENCE_UNAVAILABLE") {
        throw app.httpErrors.conflict(error instanceof Error ? error.message : "Install persistence is unavailable.");
      }

      throw error;
    }
  });

  app.get("/api/dashboard", async () => getDashboard());

  app.get("/api/containers", async (request) => {
    const query = listContainersQuerySchema.parse(request.query);
    return listContainersWithGroups(query);
  });
  app.get("/api/containers/page-data", async () => getContainersPageData());
  app.post("/api/onboarding/containers-tour", async (request) => {
    const body = parseBody(containersTourUpdateSchema, request.body);
    try {
      return await setContainersTourSeen(body.containersTourSeen);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: string }).code ?? "") : "";
      if (code === "CONTAINERS_TOUR_PERSISTENCE_UNAVAILABLE") {
        throw app.httpErrors.conflict(error instanceof Error ? error.message : "Containers tour persistence is unavailable.");
      }

      throw error;
    }
  });
  app.post("/api/onboarding/groups-tour", async (request) => {
    const body = parseBody(groupsTourUpdateSchema, request.body);
    try {
      return await setGroupsTourSeen(body.groupsTourSeen);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: string }).code ?? "") : "";
      if (code === "GROUPS_TOUR_PERSISTENCE_UNAVAILABLE") {
        throw app.httpErrors.conflict(error instanceof Error ? error.message : "Groups tour persistence is unavailable.");
      }

      throw error;
    }
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
  app.get("/api/containers/:idOrName/terminal/debug", async (request) => {
    try {
      return await getTerminalDebugSnapshot({
        params: request.params as { idOrName: string },
        protocol: request.protocol,
        headers: { host: request.headers.host },
      });
    } catch (error) {
      throw toHttpError(app, error);
    }
  });
  app.get("/api/containers/:idOrName/terminal/ws", async (request, reply) => {
    app.log.info(
      {
        idOrName: (request.params as { idOrName: string }).idOrName,
        connection: request.headers.connection,
        upgrade: request.headers.upgrade,
        secWebsocketKey: request.headers["sec-websocket-key"],
        secWebsocketVersion: request.headers["sec-websocket-version"],
        origin: request.headers.origin,
        userAgent: request.headers["user-agent"],
      },
      "[terminal-debug] websocket fallback handler hit",
    );
    reply.code(426).send({
      error: "WebSocket upgrade required",
    });
  });

  const terminalPathPattern = /^\/api\/containers\/([^/]+)\/terminal\/ws$/;
  const handleTerminalUpgrade = (request: import("node:http").IncomingMessage, socket: import("node:net").Socket, head: Buffer) => {
    const requestUrl = request.url ? new URL(request.url, `http://${request.headers.host ?? "localhost"}`) : null;
    const pathname = requestUrl?.pathname ?? "";
    const match = terminalPathPattern.exec(pathname);

    if (!match) {
      return;
    }

    const idOrName = decodeURIComponent(match[1]);
    const connectionId = randomUUID();
    app.log.info(
      {
        connectionId,
        idOrName,
        connection: request.headers.connection,
        upgrade: request.headers.upgrade,
        secWebsocketKey: request.headers["sec-websocket-key"],
        secWebsocketVersion: request.headers["sec-websocket-version"],
        origin: request.headers.origin,
      },
      "[terminal-debug] raw upgrade handler matched terminal route",
    );

    terminalWss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      const controller = createTerminalSocketController({
        idOrName,
        socket: ws,
        logger: {
          info: (payload, message) => app.log.info(payload, message),
          error: (payload, message) => app.log.error(payload, message),
        },
        connectionId,
      });

      app.log.info({ connectionId, idOrName }, "[terminal-debug] raw websocket upgrade completed");

      ws.on("message", (message: Buffer | ArrayBuffer | Buffer[]) => {
        const payload = Array.isArray(message) ? Buffer.concat(message) : Buffer.isBuffer(message) ? message : Buffer.from(message);
        void controller.handleMessage(payload);
      });
      ws.on("close", (code: number, reason: Buffer) => {
        app.log.info(
          {
            connectionId,
            idOrName,
            code,
            reason: reason.toString("utf8"),
          },
          "[terminal-debug] socket closed",
        );
        controller.handleClose();
      });
      ws.on("error", (error: Error) => {
        app.log.error(
          {
            connectionId,
            idOrName,
            error: error.message,
          },
          "[terminal-debug] socket error",
        );
        controller.handleClose();
      });
    });
  };

  app.server.on("upgrade", handleTerminalUpgrade);
  app.addHook("onClose", async () => {
    app.server.off("upgrade", handleTerminalUpgrade);
    await new Promise<void>((resolve, reject) => {
      terminalWss.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
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
  app.get("/api/groups/page-data", async () => getGroupsPageData());
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
    return createGroupContainerMembership({
      groupId: (request.params as { id: string }).id,
      containerKey: body.containerKey,
      containerNameSnapshot: body.containerNameSnapshot,
      aliasName: body.aliasName,
      notes: body.notes,
      includeInStartAll: body.includeInStartAll,
      includeInStopAll: body.includeInStopAll,
    });
  });
  app.post("/api/groups/:id/containers/bulk", async (request) => {
    const body = parseBody(bulkAddGroupContainersSchema, request.body);
    return bulkAttachGroupContainers((request.params as { id: string }).id, body.containerKeys);
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
  app.put("/api/groups/:id/execution-order", async (request) => {
    const body = parseBody(saveExecutionOrderSchema, request.body);
    return saveGroupExecutionOrder((request.params as { id: string }).id, body.stages);
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
