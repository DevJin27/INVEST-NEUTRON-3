const { createError } = require("../core/errors");
const { MemoryStateStore } = require("./memory-state-store");
const { RedisStateStore } = require("./redis-state-store");

function createStateStore(config, logger) {
  if (config.redisUrl) {
    return new RedisStateStore({
      lockRetryMs: config.lockRetryMs,
      lockTimeoutMs: config.lockTimeoutMs,
      lockTtlMs: config.lockTtlMs,
      logger,
      redisKeyPrefix: config.redisKeyPrefix,
      redisUrl: config.redisUrl,
    });
  }

  if (config.useInMemoryStore) {
    logger.warn?.("REDIS_URL is not configured; using the in-memory test store.");
    return new MemoryStateStore();
  }

  throw createError("INVALID_CONFIG", {
    name: "REDIS_URL",
    reason: "REDIS_URL is required for non-test deployments.",
  });
}

module.exports = { createStateStore };
