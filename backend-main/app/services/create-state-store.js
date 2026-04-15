const { createError } = require("../core/errors");
const { MemoryStateStore } = require("./memory-state-store");
const { NeonStateStore } = require("./neon-state-store");

function createStateStore(config, logger) {
  if (config.databaseUrl) {
    return new NeonStateStore({
      databaseUrl: config.databaseUrl,
      logger,
    });
  }

  if (config.useInMemoryStore) {
    logger.warn?.("DATABASE_URL is not configured; using the in-memory test store.");
    return new MemoryStateStore();
  }

  throw createError("INVALID_CONFIG", {
    name: "DATABASE_URL",
    reason: "DATABASE_URL is required for non-test deployments.",
  });
}

module.exports = { createStateStore };