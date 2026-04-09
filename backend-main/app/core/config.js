const path = require("path");

const {
  DEFAULT_LOCK_RETRY_MS,
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_LOCK_TTL_MS,
  DEFAULT_PORT,
  DEFAULT_REDIS_KEY_PREFIX,
  DEFAULT_ROUND_DURATION_MS,
  DEFAULT_SCHEDULER_INTERVAL_MS,
  DEFAULT_SOCKET_PING_INTERVAL_MS,
  DEFAULT_SOCKET_PING_TIMEOUT_MS,
  MAX_ROUND_DURATION_MS,
  TOTAL_ROUNDS,
} = require("../models/constants");
const { createError } = require("./errors");

function parseIntegerEnv(rawValue, fallback, name) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value)) {
    throw createError("INVALID_CONFIG", { name, reason: "Must be an integer." });
  }

  return value;
}

function normalizeOrigin(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  if (value === "*") {
    return "*";
  }

  try {
    return new URL(value).origin;
  } catch (_error) {
    return value.replace(/\/+$/, "");
  }
}

function parseCorsOrigins(rawValue) {
  if (!rawValue) {
    return ["*"];
  }

  const origins = String(rawValue)
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  if (origins.includes("*")) {
    return ["*"];
  }

  return origins.length > 0 ? [...new Set(origins)] : ["*"];
}

function validateRoundDurationMs(roundDurationMs, runtimeEnv = process.env.NODE_ENV) {
  if (!Number.isInteger(roundDurationMs)) {
    throw createError("INVALID_CONFIG", {
      name: "ROUND_DURATION_MS",
      reason: "Must be an integer.",
    });
  }

  const minDuration = runtimeEnv === "test" ? 10 : 5000;
  if (roundDurationMs < minDuration || roundDurationMs > MAX_ROUND_DURATION_MS) {
    throw createError("INVALID_CONFIG", {
      name: "ROUND_DURATION_MS",
      reason: `Must be between ${minDuration} and ${MAX_ROUND_DURATION_MS}.`,
    });
  }

  return roundDurationMs;
}

function loadConfig(env = process.env) {
  const runtimeEnv = env.NODE_ENV || process.env.NODE_ENV;
  const adminSecret = env.ADMIN_SECRET ? String(env.ADMIN_SECRET).trim() : "";
  if (!adminSecret) {
    throw createError("INVALID_CONFIG", {
      name: "ADMIN_SECRET",
      reason: "ADMIN_SECRET is required.",
    });
  }

  const totalRounds = parseIntegerEnv(env.TOTAL_ROUNDS, TOTAL_ROUNDS, "TOTAL_ROUNDS");
  const roundDurationMs = validateRoundDurationMs(
    parseIntegerEnv(env.ROUND_DURATION_MS, DEFAULT_ROUND_DURATION_MS, "ROUND_DURATION_MS"),
    runtimeEnv
  );
  const redisUrl = env.REDIS_URL ? String(env.REDIS_URL).trim() : "";

  return {
    adminSecret,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
    lockRetryMs: parseIntegerEnv(env.REDIS_LOCK_RETRY_MS, DEFAULT_LOCK_RETRY_MS, "REDIS_LOCK_RETRY_MS"),
    lockTimeoutMs: parseIntegerEnv(env.REDIS_LOCK_TIMEOUT_MS, DEFAULT_LOCK_TIMEOUT_MS, "REDIS_LOCK_TIMEOUT_MS"),
    lockTtlMs: parseIntegerEnv(env.REDIS_LOCK_TTL_MS, DEFAULT_LOCK_TTL_MS, "REDIS_LOCK_TTL_MS"),
    port: parseIntegerEnv(env.PORT, DEFAULT_PORT, "PORT"),
    redisKeyPrefix: String(env.REDIS_KEY_PREFIX || DEFAULT_REDIS_KEY_PREFIX).trim() || DEFAULT_REDIS_KEY_PREFIX,
    redisUrl,
    roundDurationMs,
    schedulerIntervalMs: parseIntegerEnv(
      env.SCHEDULER_INTERVAL_MS,
      runtimeEnv === "test" ? 20 : DEFAULT_SCHEDULER_INTERVAL_MS,
      "SCHEDULER_INTERVAL_MS"
    ),
    socketPingIntervalMs: parseIntegerEnv(
      env.SOCKET_PING_INTERVAL_MS,
      DEFAULT_SOCKET_PING_INTERVAL_MS,
      "SOCKET_PING_INTERVAL_MS"
    ),
    socketPingTimeoutMs: parseIntegerEnv(
      env.SOCKET_PING_TIMEOUT_MS,
      DEFAULT_SOCKET_PING_TIMEOUT_MS,
      "SOCKET_PING_TIMEOUT_MS"
    ),
    totalRounds,
    useInMemoryStore: runtimeEnv === "test" || String(env.ALLOW_IN_MEMORY_STORE || "").toLowerCase() === "true",
  };
}

function validateGameData(data, companyIds) {
  if (!Array.isArray(data)) {
    throw createError("INVALID_SIGNAL_DECK", { reason: "Game data must be an array of rounds." });
  }

  if (data.length !== TOTAL_ROUNDS) {
    throw createError("INVALID_SIGNAL_DECK", {
      reason: `Game data must have exactly ${TOTAL_ROUNDS} rounds. Found ${data.length}.`,
    });
  }

  const requiredRoundFields = ["id", "year", "title", "context", "companies", "yearlyReturn", "yearEndReveal"];
  const requiredCompanyFields = ["id", "name", "sector", "newsFeed"];
  const validSourceTypes = ["verified_press", "social_rumor", "sponsored_content", "analyst_note"];

  for (let roundIndex = 0; roundIndex < data.length; roundIndex += 1) {
    const round = data[roundIndex];

    for (const field of requiredRoundFields) {
      if (!round[field]) {
        throw createError("INVALID_SIGNAL_DECK", {
          reason: `Round ${roundIndex + 1} missing field: ${field}`,
        });
      }
    }

    if (!Array.isArray(round.companies) || round.companies.length === 0) {
      throw createError("INVALID_SIGNAL_DECK", {
        reason: `Round ${roundIndex + 1} must have companies array.`,
      });
    }

    for (const company of round.companies) {
      for (const field of requiredCompanyFields) {
        if (!company[field]) {
          throw createError("INVALID_SIGNAL_DECK", {
            reason: `Round ${roundIndex + 1}, company ${company.id ?? "?"} missing: ${field}`,
          });
        }
      }

      if (!companyIds.includes(company.id)) {
        throw createError("INVALID_SIGNAL_DECK", { reason: `Unknown company id: ${company.id}` });
      }

      if (!Array.isArray(company.newsFeed) || company.newsFeed.length === 0) {
        throw createError("INVALID_SIGNAL_DECK", {
          reason: `Round ${roundIndex + 1}, company ${company.id} must have newsFeed array.`,
        });
      }

      for (const news of company.newsFeed) {
        if (!news.id || !news.headline || !news.detail || !news.source) {
          throw createError("INVALID_SIGNAL_DECK", {
            reason: `Round ${roundIndex + 1}, company ${company.id} has invalid news item.`,
          });
        }

        if (!validSourceTypes.includes(news.sourceType)) {
          throw createError("INVALID_SIGNAL_DECK", {
            reason: `Round ${roundIndex + 1}, company ${company.id} news item ${news.id} has invalid sourceType.`,
          });
        }

        if (
          typeof news.credibilityScore !== "number" ||
          news.credibilityScore < 0 ||
          news.credibilityScore > 100
        ) {
          throw createError("INVALID_SIGNAL_DECK", {
            reason: `Round ${roundIndex + 1}, company ${company.id} news item ${news.id} has invalid credibilityScore.`,
          });
        }
      }
    }

    for (const companyId of companyIds) {
      if (typeof round.yearlyReturn[companyId] !== "number") {
        throw createError("INVALID_SIGNAL_DECK", {
          reason: `Round ${roundIndex + 1} missing yearly return for ${companyId}`,
        });
      }
    }
  }

  return data;
}

function loadGameData(companyIds) {
  const dataPath = path.join(__dirname, "..", "..", "src", "data", "portfolio-game.json");
  const data = require(dataPath);
  return validateGameData(data, companyIds);
}

module.exports = {
  loadConfig,
  loadGameData,
  normalizeOrigin,
  parseCorsOrigins,
  validateGameData,
  validateRoundDurationMs,
};
