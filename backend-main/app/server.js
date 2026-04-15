const http = require("http");
const { randomUUID } = require("node:crypto");

const { Server } = require("socket.io");

const { loadConfig, loadGameData, normalizeOrigin } = require("./core/config");
const { createLogger } = require("./core/logger");
const { serializeError } = require("./core/errors");
const { DEFAULT_HOST } = require("./models/constants");
const { createHttpApp } = require("./api/create-http-app");
const { createStateStore } = require("./services/create-state-store");
const { GameService } = require("./services/game-service");
const { RoundOrchestrator } = require("./services/round-orchestrator");
const { createSocketRuntime } = require("./sockets/create-socket-runtime");

function isOriginAllowed(origin, corsOrigins) {
  if (!origin || corsOrigins.includes("*")) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin ? corsOrigins.includes(normalizedOrigin) : false;
}

function buildHttpCorsOriginChecker(corsOrigins) {
  if (corsOrigins.includes("*")) {
    return (_origin, callback) => callback(null, true);
  }

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
    if (isOriginAllowed(req.headers.origin, corsOrigins)) {
      callback(null, true);
      return;
    }

    callback("Origin not allowed.", false);
  };
}

function createRealtimeGameServer(options = {}) {
  const logger = createLogger(options.logger);
  const config = loadConfig(options.env || process.env);
  const rounds = options.rounds || loadGameData(require("./models/constants").COMPANY_IDS);
  const store = options.store || createStateStore(config, logger);
  const gameService = new GameService({
    config,
    logger,
    now: options.now,
    rounds,
    store,
  });
  const serverState = {
    shuttingDown: false,
    startedAt: Date.now(),
  };
  const corsOriginChecker = buildHttpCorsOriginChecker(config.corsOrigins);
  const app = createHttpApp({
    corsOriginChecker,
    gameService,
    logger,
    serverState,
  });
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    allowRequest: buildSocketOriginGate(config.corsOrigins),
    cors: { origin: corsOriginChecker },
    httpCompression: false,
    perMessageDeflate: false,
    pingInterval: config.socketPingIntervalMs,
    pingTimeout: config.socketPingTimeoutMs,
    serveClient: false,
    transports: ["websocket", "polling"],
  });

  const orchestrator = new RoundOrchestrator({
    gameService,
    intervalMs: config.schedulerIntervalMs,
    logger,
    onResults: async (results) => {
      await socketRuntime.broadcastRoundResults(results);
    },
  });

  let listening = false;
  let shutdownPromise = null;
  let socketRuntime = null;

  async function start() {
    if (listening) {
      return { app, gameService, io, server: httpServer };
    }

    await gameService.initialize();

    socketRuntime = createSocketRuntime({
      clusterEnabled: false,
      config,
      gameService,
      instanceId: randomUUID(),
      io,
      isShuttingDown: () => serverState.shuttingDown,
      logger,
    });

    orchestrator.start();

    await new Promise((resolve) => {
      httpServer.listen(config.port, DEFAULT_HOST, () => {
        listening = true;
        resolve();
      });
    });

    return { app, gameService, io, server: httpServer };
  }

  async function shutdown(signal = "unknown") {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    serverState.shuttingDown = true;
    shutdownPromise = (async () => {
      await orchestrator.stop();
      io.local.emit("game:error", {
        code: "SERVER_SHUTDOWN",
        details: { signal },
        message: "Server is shutting down.",
      });

      await new Promise((resolve) => setTimeout(resolve, 25));

      await new Promise((resolve) => io.close(resolve));
      await new Promise((resolve) => {
        if (!listening) {
          resolve();
          return;
        }

        httpServer.close(() => {
          listening = false;
          resolve();
        });
      });
      await gameService.dispose();
    })();

    return shutdownPromise;
  }

  return {
    app,
    config,
    gameService,
    io,
    server: httpServer,
    shutdown,
    start,
  };
}

module.exports = { createRealtimeGameServer };
