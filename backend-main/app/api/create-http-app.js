const cors = require("cors");
const express = require("express");

const { serializeError } = require("../core/errors");

function createHttpApp(options) {
  const app = express();
  const corsOriginChecker = options.corsOriginChecker;
  const gameService = options.gameService;
  const logger = options.logger;
  const serverState = options.serverState;

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger.info?.({
        durationMs: Date.now() - startedAt,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
      }, "http request completed");
    });
    next();
  });

  app.use(cors({ origin: corsOriginChecker }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", async (_req, res, next) => {
    try {
      res.json(await gameService.getHealth(serverState));
    } catch (error) {
      next(error);
    }
  });

  app.get("/state", async (_req, res, next) => {
    try {
      res.json(await gameService.getPublicState());
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    const serialized = serializeError(error);
    logger.error?.({ error, serialized }, "http request failed");
    res.status(serialized.code === "INTERNAL_ERROR" ? 500 : 400).json(serialized);
  });

  return app;
}

module.exports = { createHttpApp };
