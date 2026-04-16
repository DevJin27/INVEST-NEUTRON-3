const { ADMIN_ACTION_RATE_LIMIT_MS } = require("../models/constants");
const { createError, failure, serializeError, success } = require("../core/errors");

const SNAPSHOT_REFRESH_EVENT = "internal:snapshot-refresh";
const FORCE_DISCONNECT_EVENT = "internal:force-disconnect";

function createSocketRuntime(options) {
  const clusterEnabled = options.clusterEnabled;
  const gameService = options.gameService;
  const instanceId = options.instanceId;
  const io = options.io;
  const isShuttingDown = options.isShuttingDown;
  const logger = options.logger;
  const config = options.config;

  io.engine.on("connection_error", (error) => {
    logger.warn?.({
      code: error.code,
      context: error.context,
      message: error.message,
      reqUrl: error.req?.url,
    }, "socket connection rejected");
  });

  io.on(SNAPSHOT_REFRESH_EVENT, async (payload = {}) => {
    if (payload.instanceId === instanceId) {
      return;
    }

    await refreshLocalSnapshots(payload.scope || "all");
  });

  io.on(FORCE_DISCONNECT_EVENT, async (payload = {}) => {
    if (payload.instanceId === instanceId) {
      return;
    }

    await forceDisconnectLocal(payload.socketId, payload.errorPayload);
  });

  function assertServerAvailable() {
    if (isShuttingDown()) {
      throw createError("SERVER_SHUTDOWN");
    }
  }

  function assertAdmin(socket) {
    if (!socket.data.isAdmin) {
      throw createError("AUTH_REQUIRED");
    }
  }

  function assertAdminRateLimit(socket) {
    const now = Date.now();
    const lastAdminActionAt = socket.data.lastAdminActionAt || 0;
    if (now - lastAdminActionAt < ADMIN_ACTION_RATE_LIMIT_MS) {
      throw createError("ADMIN_RATE_LIMITED", {
        retryAfterMs: ADMIN_ACTION_RATE_LIMIT_MS - (now - lastAdminActionAt),
      });
    }

    socket.data.lastAdminActionAt = now;
  }

  async function safeRecordAudit(entry) {
    try {
      await gameService.recordAuditEntry(entry);
    } catch (error) {
      logger.warn?.({ entry, error }, "failed to persist audit entry");
    }
  }

  function emitLocalPayload(socket, event, payload) {
    if (!socket.connected) {
      return;
    }

    socket.emit(event, payload);
  }

  async function emitSnapshotToSocket(socket, sharedState) {
    if (!socket.connected) {
      return;
    }

    const state = sharedState || await gameService.getCurrentState();
    emitLocalPayload(
      socket,
      "game:snapshot",
      gameService.buildViewerSnapshot(state, socket.data)
    );
  }

  async function refreshLocalSnapshots(scope = "all") {
    const sharedState = await gameService.getCurrentState();
    const sockets = io.of("/").sockets;

    await Promise.all(
      [...sockets.values()].map(async (socket) => {
        if (scope === "admins" && !socket.data.isAdmin) {
          return;
        }

        await emitSnapshotToSocket(socket, sharedState);
      })
    );
  }

  async function refreshSnapshots(scope = "all") {
    await refreshLocalSnapshots(scope);

    if (clusterEnabled) {
      io.serverSideEmit(SNAPSHOT_REFRESH_EVENT, {
        instanceId,
        scope,
      });
    }
  }

  async function forceDisconnectLocal(socketId, errorPayload) {
    if (!socketId) {
      return;
    }

    const targetSocket = io.of("/").sockets.get(socketId);
    if (!targetSocket) {
      return;
    }

    emitLocalPayload(targetSocket, "game:error", errorPayload);
    targetSocket.disconnect(true);
  }

  async function forceDisconnectSocket(socketId, errorPayload) {
    await forceDisconnectLocal(socketId, errorPayload);

    if (clusterEnabled) {
      io.serverSideEmit(FORCE_DISCONNECT_EVENT, {
        errorPayload,
        instanceId,
        socketId,
      });
    }
  }

  async function broadcastRoundResults(results) {
    io.emit("round:results", results);
    await refreshSnapshots("all");
  }

  async function runAdminAction(socket, action, handler, ack, options = {}) {
    const respond = typeof ack === "function" ? ack : () => {};

    try {
      assertServerAvailable();
      assertAdmin(socket);
      assertAdminRateLimit(socket);

      const result = await handler();
      await safeRecordAudit({
        action,
        result: "success",
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      respond(success(result));

      if (options.refreshSnapshots) {
        await refreshSnapshots(options.refreshSnapshots);
      }

      if (options.emitEvent) {
        io.emit(options.emitEvent.name, options.emitEvent.payload(result));
      }

      if (options.onSuccess) {
        await options.onSuccess(result);
      }
    } catch (error) {
      await safeRecordAudit({
        action,
        details: { error: serializeError(error) },
        result: "error",
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
      respond(failure(error));
    }
  }

  io.on("connection", (socket) => {
    socket.data = {
      ...socket.data,
      isAdmin: false,
      lastAdminActionAt: 0,
      teamId: null,
    };

    void emitSnapshotToSocket(socket);

    socket.on("admin:authenticate", async (payload = {}, ack) => {
      const respond = typeof ack === "function" ? ack : () => {};

      try {
        assertServerAvailable();

        if (socket.data.teamId) {
          throw createError("FORBIDDEN", {
            reason: "Team controllers cannot become admins.",
          });
        }

        if (String(payload.secret || "") !== config.adminSecret) {
          throw createError("INVALID_ADMIN_SECRET");
        }

        socket.data.isAdmin = true;
        socket.join("admins");

        await safeRecordAudit({
          action: "admin:authenticate",
          result: "success",
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });

        const snapshot = await gameService.getSnapshotForViewer(socket.data);
        respond(success({ authenticated: true, snapshot }));
        emitLocalPayload(socket, "game:snapshot", snapshot);
      } catch (error) {
        await safeRecordAudit({
          action: "admin:authenticate",
          details: { error: serializeError(error) },
          result: "error",
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
        respond(failure(error));
      }
    });

    socket.on("admin:start-game", async (_payload, ack) => {
      await runAdminAction(socket, "admin:start-game", async () => {
        const result = await gameService.startGame();
        return result;
      }, ack, {
        emitEvent: {
          name: "round:started",
          payload: (result) => result,
        },
        refreshSnapshots: "all",
      });
    });

    socket.on("admin:set-round-duration", async (payload = {}, ack) => {
      await runAdminAction(socket, "admin:set-round-duration", () => gameService.setRoundDuration(payload), ack, {
        refreshSnapshots: "all",
      });
    });

    socket.on("admin:next-round", async (_payload, ack) => {
      await runAdminAction(socket, "admin:next-round", async () => {
        const result = await gameService.nextRound();
        return result;
      }, ack, {
        emitEvent: {
          name: "round:started",
          payload: (result) => result,
        },
        refreshSnapshots: "all",
      });
    });

    socket.on("admin:pause-round", async (_payload, ack) => {
      await runAdminAction(socket, "admin:pause-round", () => gameService.pauseRound(), ack, {
        emitEvent: {
          name: "round:paused",
          payload: (result) => result,
        },
        refreshSnapshots: "all",
      });
    });

    socket.on("admin:resume-round", async (_payload, ack) => {
      await runAdminAction(socket, "admin:resume-round", () => gameService.resumeRound(), ack, {
        emitEvent: {
          name: "round:resumed",
          payload: (result) => result,
        },
        refreshSnapshots: "all",
      });
    });

    socket.on("admin:end-round", async (_payload, ack) => {
      await runAdminAction(socket, "admin:end-round", () => gameService.endRound(), ack, {
        onSuccess: async (result) => {
          if (result.results) {
            await broadcastRoundResults(result.results);
          }
        },
      });
    });

    socket.on("admin:reset-game", async (_payload, ack) => {
      await runAdminAction(socket, "admin:reset-game", () => gameService.resetGame(), ack, {
        refreshSnapshots: "all",
      });
    });

    socket.on("admin:clear-teams", async (_payload, ack) => {
      await runAdminAction(socket, "admin:clear-teams", () => gameService.clearTeams(), ack, {
        refreshSnapshots: "all",
      });
    });

    socket.on("admin:set-purse-value", async (payload = {}, ack) => {
      await runAdminAction(socket, "admin:set-purse-value", () => gameService.setPurseValue(payload), ack, {
        refreshSnapshots: "all",
      });
    });

    socket.on("admin:get-audit-log", async (_payload, ack) => {
      await runAdminAction(socket, "admin:get-audit-log", () => gameService.getAuditLogResponse(), ack);
    });

    socket.on("team:join", async (payload = {}, ack) => {
      const respond = typeof ack === "function" ? ack : () => {};

      try {
        assertServerAvailable();

        if (socket.data.isAdmin) {
          throw createError("FORBIDDEN", {
            reason: "Admin sockets cannot join as teams.",
          });
        }

        const result = await gameService.joinTeam({
          name: payload.name,
          socketId: socket.id,
          teamId: payload.teamId,
        });
        socket.data.teamId = result.team.teamId;

        respond(success({ team: result.team }));
        await refreshSnapshots("all");

        if (result.replacedSocketId) {
          await forceDisconnectSocket(result.replacedSocketId, {
            code: "FORBIDDEN",
            details: { teamId: result.team.teamId },
            message: "This team joined from another connection.",
          });
        }
      } catch (error) {
        respond(failure(error));
      }
    });

    socket.on("team:invest", async (payload = {}, ack) => {
      const respond = typeof ack === "function" ? ack : () => {};

      try {
        assertServerAvailable();
        const result = await gameService.invest({
          amount: payload.amount,
          companyId: payload.companyId,
          socketId: socket.id,
        });
        emitLocalPayload(socket, "investment:updated", { type: "invest", ...result });
        respond(success(result));
        await refreshSnapshots("all");
      } catch (error) {
        respond(failure(error));
      }
    });

    socket.on("team:withdraw", async (payload = {}, ack) => {
      const respond = typeof ack === "function" ? ack : () => {};

      try {
        assertServerAvailable();
        const result = await gameService.withdraw({
          amount: payload.amount,
          companyId: payload.companyId,
          socketId: socket.id,
        });
        emitLocalPayload(socket, "investment:updated", { type: "withdraw", ...result });
        respond(success(result));
        await refreshSnapshots("all");
      } catch (error) {
        respond(failure(error));
      }
    });

    socket.on("team:submit", async (_payload = {}, ack) => {
      const respond = typeof ack === "function" ? ack : () => {};

      try {
        assertServerAvailable();
        const result = await gameService.submitInvestments({ socketId: socket.id });
        emitLocalPayload(socket, "round:submission-status", {
          accepted: true,
          investments: result.investments,
          round: result.round,
          teamId: result.teamId,
        });
        respond(success(result));
        await refreshSnapshots("all");
      } catch (error) {
        emitLocalPayload(socket, "round:submission-status", {
          accepted: false,
          error: serializeError(error),
        });
        respond(failure(error));
      }
    });

    socket.on("disconnect", async () => {
      try {
        const disconnectedTeam = await gameService.disconnectSocket(socket.id);
        if (disconnectedTeam) {
          await refreshSnapshots("all");
        }
      } catch (error) {
        logger.warn?.({ error, socketId: socket.id }, "failed to process socket disconnect");
      }
    });
  });

  return {
    broadcastRoundResults,
    emitSnapshotToSocket,
    forceDisconnectSocket,
    refreshSnapshots,
  };
}

module.exports = { createSocketRuntime };
