const path = require("path");

const {
  DEFAULT_PORT,
  DEFAULT_ROUND_DURATION_MS,
  DEFAULT_TOTAL_ROUNDS,
  FULL_SIGNAL_COUNT,
  MAX_ROUND_DURATION_MS,
  SIGNAL_TYPE_ALPHA,
  SIGNAL_TYPE_NOISE,
  SIGNAL_VALUE_MAX,
  SIGNAL_VALUE_MIN,
} = require("./constants");
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

function parseCorsOrigins(rawValue) {
  if (!rawValue) {
    return ["*"];
  }

  const origins = String(rawValue)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : ["*"];
}

function loadConfig(env = process.env, deckSize = FULL_SIGNAL_COUNT) {
  const adminSecret = env.ADMIN_SECRET ? String(env.ADMIN_SECRET).trim() : "";

  if (!adminSecret) {
    throw createError("INVALID_CONFIG", { name: "ADMIN_SECRET", reason: "ADMIN_SECRET is required." });
  }

  const port = parseIntegerEnv(env.PORT, DEFAULT_PORT, "PORT");
  const roundDurationMs = parseIntegerEnv(env.ROUND_DURATION_MS, DEFAULT_ROUND_DURATION_MS, "ROUND_DURATION_MS");
  const totalRounds = parseIntegerEnv(env.TOTAL_ROUNDS, DEFAULT_TOTAL_ROUNDS, "TOTAL_ROUNDS");

  if (roundDurationMs <= 0 || roundDurationMs > MAX_ROUND_DURATION_MS) {
    throw createError("INVALID_CONFIG", {
      name: "ROUND_DURATION_MS",
      reason: `ROUND_DURATION_MS must be between 1 and ${MAX_ROUND_DURATION_MS}.`,
    });
  }

  if (totalRounds <= 0 || totalRounds > deckSize) {
    throw createError("INVALID_CONFIG", {
      name: "TOTAL_ROUNDS",
      reason: `TOTAL_ROUNDS must be between 1 and ${deckSize}.`,
    });
  }

  return {
    adminSecret,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
    deckSize,
    port,
    roundDurationMs,
    totalRounds,
  };
}

function validateSignalDeck(deck) {
  if (!Array.isArray(deck)) {
    throw createError("INVALID_SIGNAL_DECK", { reason: "Signal deck must be an array." });
  }

  if (deck.length !== FULL_SIGNAL_COUNT) {
    throw createError("INVALID_SIGNAL_DECK", {
      reason: `Signal deck must contain exactly ${FULL_SIGNAL_COUNT} signals.`,
      actualCount: deck.length,
    });
  }

  const counts = {
    [SIGNAL_TYPE_ALPHA]: 0,
    [SIGNAL_TYPE_NOISE]: 0,
  };

  const seenIds = new Set();

  deck.forEach((signal, index) => {
    if (!signal || typeof signal !== "object") {
      throw createError("INVALID_SIGNAL_DECK", { reason: "Each signal must be an object.", index });
    }

    const requiredFields = ["id", "text", "type", "value", "credibility"];
    for (const field of requiredFields) {
      if (signal[field] === undefined || signal[field] === null || signal[field] === "") {
        throw createError("INVALID_SIGNAL_DECK", {
          reason: `Signal field '${field}' is required.`,
          index,
          signalId: signal.id,
        });
      }
    }

    if (seenIds.has(signal.id)) {
      throw createError("INVALID_SIGNAL_DECK", {
        reason: "Signal ids must be unique.",
        signalId: signal.id,
      });
    }
    seenIds.add(signal.id);

    if (![SIGNAL_TYPE_ALPHA, SIGNAL_TYPE_NOISE].includes(signal.type)) {
      throw createError("INVALID_SIGNAL_DECK", {
        reason: "Signal type must be ALPHA or NOISE.",
        signalId: signal.id,
      });
    }

    if (!Number.isInteger(signal.value) || signal.value < SIGNAL_VALUE_MIN || signal.value > SIGNAL_VALUE_MAX) {
      throw createError("INVALID_SIGNAL_DECK", {
        reason: `Signal value must be an integer between ${SIGNAL_VALUE_MIN} and ${SIGNAL_VALUE_MAX}.`,
        signalId: signal.id,
        value: signal.value,
      });
    }

    if (typeof signal.text !== "string" || signal.text.trim().length === 0) {
      throw createError("INVALID_SIGNAL_DECK", {
        reason: "Signal text must be a non-empty string.",
        signalId: signal.id,
      });
    }

    if (!Number.isFinite(signal.credibility)) {
      throw createError("INVALID_SIGNAL_DECK", {
        reason: "Signal credibility must be numeric.",
        signalId: signal.id,
      });
    }

    counts[signal.type] += 1;
  });

  if (counts[SIGNAL_TYPE_ALPHA] !== FULL_SIGNAL_COUNT / 2 || counts[SIGNAL_TYPE_NOISE] !== FULL_SIGNAL_COUNT / 2) {
    throw createError("INVALID_SIGNAL_DECK", {
      reason: "Signal deck must contain a 50/50 ALPHA to NOISE distribution.",
      counts,
    });
  }

  return deck;
}

function loadDefaultSignalDeck() {
  const deckPath = path.join(__dirname, "data", "signals.json");
  const deck = require(deckPath);
  return validateSignalDeck(deck);
}

module.exports = {
  loadConfig,
  loadDefaultSignalDeck,
  parseCorsOrigins,
  validateSignalDeck,
};
