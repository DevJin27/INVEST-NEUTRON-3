const http = require('http');
const cors = require('cors');
const express = require('express');
const { Server } = require('socket.io');

const { AuditLog } = require('./audit-log');
const { ADMIN_ACTION_RATE_LIMIT_MS } = require('./constants');
const { createError, serializeError } = require('./errors');
const { GameEngine } = require('./game-engine');
const { createStateLock } = require('./mutex');
const { loadConfig, loadGameData, normalizeOrigin } = require('./validation');

function isOriginAllowed(origin, corsOrigins) {
  if (!origin || corsOrigins.includes('*')) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin ? corsOrigins.includes(normalizedOrigin) : false;
}

function buildHttpCorsOriginChecker(corsOrigins) {
  if (corsOrigins.includes('*')) return (_origin, callback) => callback(null, true);
  const allowedOrigins = new Set(corsOrigins);
  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  };
}

function buildSocketOriginGate(corsOrigins) {
  return (req, callback) => {
    const origin = req.headers.origin;
    if (isOriginAllowed(origin, corsOrigins)) {
      callback(null, true);
      return;
    }

    callback('Origin not allowed.', false);
  };
}

const success = (data) => ({ ok: true, data });
const failure = (error) => ({ ok: false, error: serializeError(error) });
const noop = () => {};

function createRealtimeGameServer(options = {}) {
  const logger = options.logger || console;
  const rounds = options.rounds || loadGameData();
  const config = loadConfig(options.env || process.env);
  const auditLog = options.auditLog || new AuditLog(undefined, logger);

  const engine = new GameEngine({
    auditLog,
    cancel: options.cancel,
    now: options.now,
    onRoundClosed: null,
    rounds,
    roundDurationMs: options.roundDurationMs ?? config.roundDurationMs,
    schedule: options.schedule,
    totalRounds: config.totalRounds,
  });

  const { withStateLock } = createStateLock();
  const app = express();
  const httpServer = http.createServer(app);
  const corsOriginChecker = buildHttpCorsOriginChecker(config.corsOrigins);
  const io = new Server(httpServer, {
    // Allow polling so the HTTP upgrade handshake works (needed for Render cold-starts)
    // and so Socket.io can negotiate the WebSocket upgrade properly.
    allowRequest: buildSocketOriginGate(config.corsOrigins),
    cors: { origin: corsOriginChecker },
    httpCompression: false,
    perMessageDeflate: false,
    serveClient: false,
    transports: ['polling', 'websocket'],
  });

  let listening = false;
  let shuttingDown = false;
  let shutdownPromise = null;
  const serverStartedAt = Date.now();

  // credentials: true is incompatible with wildcard CORS origins (browser rejects it).
  app.use(cors({ origin: corsOriginChecker }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      status: shuttingDown ? 'shutting-down' : 'ok',
      phase: engine.phase,
      currentRound: engine.round,
      totalRounds: engine.totalRounds,
      activeTeamsCount: engine.getActiveTeamsCount(),
      remainingMs: engine.getRemainingMs(),
      roundDurationMs: engine.roundDurationMs,
      uptimeMs: Date.now() - serverStartedAt,
    });
  });

  app.get('/state', (_req, res) => res.json(engine.getPublicState()));

  function emitSnapshotToSocket(socket) {
    if (!socket.connected) return;
    socket.emit('game:snapshot', engine.getSnapshotForViewer(socket.data));
  }

  function emitSnapshots(filterFn = () => true) {
    for (const socket of io.sockets.sockets.values()) {
      if (filterFn(socket)) emitSnapshotToSocket(socket);
    }
  }

  const emitSnapshotsToAdmins = () => emitSnapshots((s) => s.data.isAdmin);
  const emitSnapshotsToPublic = () => emitSnapshots(() => true);

  async function resolveRoundIfNeeded() {
    await withStateLock(async () => {
      const results = engine.evaluateRoundIfNeeded();
      if (!results) return;
      io.emit('round:results', results);
      emitSnapshotsToPublic();
    });
  }

  engine.setRoundCloseHandler(resolveRoundIfNeeded);

  function recordAdminAction(socket, action, result, details) {
    auditLog.add({
      action, result,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      ...(details ? { details } : {}),
    });
  }

  function assertServerAvailable() {
    if (shuttingDown || engine.isShuttingDown) throw createError('SERVER_SHUTDOWN');
  }

  function assertAdmin(socket) {
    if (!socket.data.isAdmin) throw createError('AUTH_REQUIRED');
  }

  function assertAdminRateLimit(socket) {
    const now = Date.now();
    const lastAt = socket.data.lastAdminActionAt || 0;
    if (now - lastAt < ADMIN_ACTION_RATE_LIMIT_MS) {
      throw createError('ADMIN_RATE_LIMITED', { retryAfterMs: ADMIN_ACTION_RATE_LIMIT_MS - (now - lastAt) });
    }
    socket.data.lastAdminActionAt = now;
  }

  async function runAdminAction(socket, action, handler, ack, opts = {}) {
    const respond = typeof ack === 'function' ? ack : noop;
    try {
      assertServerAvailable();
      assertAdmin(socket);
      assertAdminRateLimit(socket);
      const data = opts.useLock === false ? await handler() : await withStateLock(handler);
      recordAdminAction(socket, action, 'success');
      respond(success(data));
      return data;
    } catch (error) {
      recordAdminAction(socket, action, 'error', { error: serializeError(error) });
      respond(failure(error));
      return null;
    }
  }

  async function shutdown(signal = 'unknown') {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    engine.setShuttingDown(true);
    shutdownPromise = (async () => {
      io.emit('game:error', { code: 'SERVER_SHUTDOWN', message: 'Server is shutting down.', details: { signal } });
      await new Promise((resolve) => setTimeout(resolve, 10));
      engine.dispose();
      await new Promise((resolve) => io.close(resolve));
      await new Promise((resolve) => {
        if (!listening) { resolve(); return; }
        httpServer.close(() => { listening = false; resolve(); });
      });
    })();
    return shutdownPromise;
  }

  io.on('connection', (socket) => {
    socket.data = { ...socket.data, isAdmin: false, lastAdminActionAt: 0, teamId: null };
    emitSnapshotToSocket(socket);

    // ── Admin events ────────────────────────────────────────────────────────
    socket.on('admin:authenticate', async (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : noop;
      try {
        assertServerAvailable();
        if (socket.data.teamId) throw createError('FORBIDDEN', { reason: 'Team controllers cannot become admins.' });
        if (String(payload.secret || '') !== config.adminSecret) throw createError('INVALID_ADMIN_SECRET');
        socket.data.isAdmin = true;
        socket.join('admins');
        recordAdminAction(socket, 'admin:authenticate', 'success');
        respond(success({ authenticated: true, snapshot: engine.getSnapshotForViewer(socket.data) }));
        emitSnapshotToSocket(socket);
      } catch (error) {
        recordAdminAction(socket, 'admin:authenticate', 'error', { error: serializeError(error) });
        respond(failure(error));
      }
    });

    socket.on('admin:start-game', async (_payload, ack) => {
      await runAdminAction(socket, 'admin:start-game', async () => {
        const roundStarted = engine.startGame();
        io.emit('round:started', roundStarted);
        emitSnapshotsToPublic();
        return roundStarted;
      }, ack);
    });

    socket.on('admin:set-round-duration', async (payload = {}, ack) => {
      await runAdminAction(socket, 'admin:set-round-duration', async () => {
        const result = engine.setRoundDuration(payload);
        emitSnapshotsToPublic();
        return result;
      }, ack);
    });

    socket.on('admin:next-round', async (_payload, ack) => {
      await runAdminAction(socket, 'admin:next-round', async () => {
        const roundStarted = engine.nextRound();
        io.emit('round:started', roundStarted);
        emitSnapshotsToPublic();
        return roundStarted;
      }, ack);
    });

    socket.on('admin:pause-round', async (_payload, ack) => {
      await runAdminAction(socket, 'admin:pause-round', async () => {
        const result = engine.pauseRound();
        io.emit('round:paused', result);
        emitSnapshotsToPublic();
        return result;
      }, ack);
    });

    socket.on('admin:resume-round', async (_payload, ack) => {
      await runAdminAction(socket, 'admin:resume-round', async () => {
        const resumed = engine.resumeRound();
        io.emit('round:resumed', resumed);
        emitSnapshotsToPublic();
        return resumed;
      }, ack);
    });

    socket.on('admin:end-round', async (_payload, ack) => {
      await runAdminAction(socket, 'admin:end-round', async () => {
        const results = engine.forceEndRound();
        if (results) {
          io.emit('round:results', results);
          emitSnapshotsToPublic();
        }
        return { ended: true, results };
      }, ack);
    });

    socket.on('admin:reset-game', async (_payload, ack) => {
      await runAdminAction(socket, 'admin:reset-game', async () => {
        const snapshot = engine.resetGame();
        emitSnapshotsToPublic();
        return snapshot;
      }, ack);
    });

    socket.on('admin:set-purse-value', async (payload = {}, ack) => {
      await runAdminAction(socket, 'admin:set-purse-value', async () => {
        const result = engine.setPurseValue(payload);
        emitSnapshotsToPublic();
        return result;
      }, ack);
    });

    socket.on('admin:get-audit-log', async (_payload, ack) => {
      await runAdminAction(socket, 'admin:get-audit-log',
        async () => ({ entries: auditLog.list() }),
        ack, { useLock: false });
    });

    // ── Team events (Purse/Investment system) ────────────────────────────────
    socket.on('team:join', async (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : noop;
      try {
        assertServerAvailable();
        if (socket.data.isAdmin) throw createError('FORBIDDEN', { reason: 'Admin sockets cannot join as teams.' });

        const result = await withStateLock(async () =>
          engine.joinTeam({ name: payload.name, socketId: socket.id, teamId: payload.teamId })
        );
        socket.data.teamId = result.team.teamId;

        if (result.replacedSocketId) {
          const replacedSocket = io.sockets.sockets.get(result.replacedSocketId);
          if (replacedSocket) {
            replacedSocket.emit('game:error', {
              code: 'FORBIDDEN',
              message: 'This team joined from another connection.',
              details: { teamId: result.team.teamId },
            });
            replacedSocket.disconnect(true);
          }
        }

        emitSnapshotsToPublic();
        respond(success({ team: result.team }));
      } catch (error) {
        respond(failure(error));
      }
    });

    // Invest amount from purse into a company
    socket.on('team:invest', async (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : noop;
      try {
        assertServerAvailable();
        const result = await withStateLock(async () =>
          engine.invest({ socketId: socket.id, companyId: payload.companyId, amount: payload.amount })
        );
        socket.emit('investment:updated', { type: 'invest', ...result });
        emitSnapshotToSocket(socket);
        emitSnapshotsToAdmins();
        respond(success(result));
      } catch (error) {
        respond(failure(error));
      }
    });

    // Withdraw amount from company back to purse
    socket.on('team:withdraw', async (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : noop;
      try {
        assertServerAvailable();
        const result = await withStateLock(async () =>
          engine.withdraw({ socketId: socket.id, companyId: payload.companyId, amount: payload.amount })
        );
        socket.emit('investment:updated', { type: 'withdraw', ...result });
        emitSnapshotToSocket(socket);
        emitSnapshotsToAdmins();
        respond(success(result));
      } catch (error) {
        respond(failure(error));
      }
    });

    // Submit current investments for the round (freeze them)
    socket.on('team:submit', async (_payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : noop;
      try {
        assertServerAvailable();
        const result = await withStateLock(async () => engine.submitInvestments({ socketId: socket.id }));
        socket.emit('round:submission-status', {
          accepted: true,
          investments: result.investments,
          round: result.round,
          teamId: result.teamId,
        });
        emitSnapshotToSocket(socket);
        emitSnapshotsToAdmins();
        respond(success(result));
      } catch (error) {
        socket.emit('round:submission-status', { accepted: false, error: serializeError(error) });
        respond(failure(error));
      }
    });

    socket.on('disconnect', async () => {
      await withStateLock(async () => {
        const disconnectedTeam = engine.disconnectSocket(socket.id);
        if (disconnectedTeam) emitSnapshotsToPublic();
      });
    });
  });

  async function start() {
    if (listening) return { app, engine, io, server: httpServer };
    await new Promise((resolve) => {
      httpServer.listen(config.port, () => { listening = true; resolve(); });
    });
    return { app, engine, io, server: httpServer };
  }

  return { app, config, engine, io, server: httpServer, shutdown, start };
}

module.exports = { createRealtimeGameServer };
