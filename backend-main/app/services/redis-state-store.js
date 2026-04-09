const { randomUUID } = require("node:crypto");

const { createClient } = require("redis");

const { createError } = require("../core/errors");

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RedisStateStore {
  constructor(options) {
    this.logger = options.logger;
    this.redisUrl = options.redisUrl;
    this.lockRetryMs = options.lockRetryMs;
    this.lockTimeoutMs = options.lockTimeoutMs;
    this.lockTtlMs = options.lockTtlMs;
    this.stateKey = `${options.redisKeyPrefix}:state`;
    this.lockKey = `${options.redisKeyPrefix}:lock`;
    this.commandClient = null;
    this.pubClient = null;
    this.subClient = null;
  }

  async connect() {
    if (this.commandClient) {
      return;
    }

    this.commandClient = createClient({
      url: this.redisUrl,
      socket: {
        reconnectStrategy(retries) {
          return Math.min(1000, 50 * retries);
        },
      },
    });

    this.pubClient = this.commandClient.duplicate();
    this.subClient = this.commandClient.duplicate();

    for (const client of [this.commandClient, this.pubClient, this.subClient]) {
      client.on("error", (error) => {
        this.logger.error({ error }, "redis client error");
      });
    }

    await Promise.all([
      this.commandClient.connect(),
      this.pubClient.connect(),
      this.subClient.connect(),
    ]);
  }

  async disconnect() {
    const clients = [this.commandClient, this.pubClient, this.subClient].filter(Boolean);
    await Promise.all(clients.map(async (client) => {
      try {
        await client.quit();
      } catch (_error) {
        try {
          client.destroy();
        } catch (_destroyError) {}
      }
    }));

    this.commandClient = null;
    this.pubClient = null;
    this.subClient = null;
  }

  async initialize(initialState) {
    await this.commandClient.set(this.stateKey, JSON.stringify(initialState), { NX: true });
  }

  async getState() {
    const raw = await this.commandClient.get(this.stateKey);
    return raw ? JSON.parse(raw) : null;
  }

  async setState(state) {
    await this.commandClient.set(this.stateKey, JSON.stringify(state));
    return state;
  }

  async withLock(handler) {
    const token = await this.acquireLock();

    try {
      return await handler();
    } finally {
      await this.releaseLock(token);
    }
  }

  async acquireLock() {
    const deadline = Date.now() + this.lockTimeoutMs;
    const token = randomUUID();

    while (Date.now() < deadline) {
      const acquired = await this.commandClient.set(this.lockKey, token, {
        NX: true,
        PX: this.lockTtlMs,
      });

      if (acquired) {
        return token;
      }

      await delay(this.lockRetryMs);
    }

    throw createError("INTERNAL_ERROR", {
      reason: "Unable to acquire Redis state lock.",
    });
  }

  async releaseLock(token) {
    try {
      await this.commandClient.eval(RELEASE_LOCK_SCRIPT, {
        arguments: [token],
        keys: [this.lockKey],
      });
    } catch (error) {
      this.logger.warn({ error }, "failed to release redis lock cleanly");
    }
  }

  hasRedisAdapterClients() {
    return Boolean(this.pubClient && this.subClient);
  }

  getRedisAdapterClients() {
    if (!this.hasRedisAdapterClients()) {
      return null;
    }

    return {
      pubClient: this.pubClient,
      subClient: this.subClient,
    };
  }
}

module.exports = { RedisStateStore };
