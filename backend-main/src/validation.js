const path = require('path');
const {
  COMPANY_IDS,
  DEFAULT_PORT,
  DEFAULT_ROUND_DURATION_MS,
  MAX_ROUND_DURATION_MS,
  TOTAL_ROUNDS,
} = require('./constants');
const { createError } = require('./errors');

function parseIntegerEnv(rawValue, fallback, name) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return fallback;
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(value)) throw createError('INVALID_CONFIG', { name, reason: 'Must be an integer.' });
  return value;
}

function parseCorsOrigins(rawValue) {
  if (!rawValue) return ['*'];
  const origins = String(rawValue).split(',').map((s) => s.trim()).filter(Boolean);
  return origins.length > 0 ? origins : ['*'];
}

function validateRoundDurationMs(roundDurationMs) {
  if (!Number.isInteger(roundDurationMs)) {
    throw createError('INVALID_CONFIG', { name: 'ROUND_DURATION_MS', reason: 'Must be an integer.' });
  }

  if (roundDurationMs <= 0 || roundDurationMs > MAX_ROUND_DURATION_MS) {
    throw createError('INVALID_CONFIG', {
      name: 'ROUND_DURATION_MS',
      reason: `Must be between 1 and ${MAX_ROUND_DURATION_MS}.`,
    });
  }

  return roundDurationMs;
}

function loadConfig(env = process.env) {
  const adminSecret = env.ADMIN_SECRET ? String(env.ADMIN_SECRET).trim() : '';
  if (!adminSecret) throw createError('INVALID_CONFIG', { name: 'ADMIN_SECRET', reason: 'ADMIN_SECRET is required.' });

  const port = parseIntegerEnv(env.PORT, DEFAULT_PORT, 'PORT');
  const roundDurationMs = validateRoundDurationMs(
    parseIntegerEnv(env.ROUND_DURATION_MS, DEFAULT_ROUND_DURATION_MS, 'ROUND_DURATION_MS')
  );

  return {
    adminSecret,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
    port,
    roundDurationMs,
    totalRounds: TOTAL_ROUNDS,
  };
}

/**
 * Validates the portfolio game data loaded from portfolio-game.json.
 * Returns the validated array of rounds.
 */
function validateGameData(data) {
  if (!Array.isArray(data)) throw createError('INVALID_SIGNAL_DECK', { reason: 'Game data must be an array of rounds.' });
  if (data.length !== TOTAL_ROUNDS) {
    throw createError('INVALID_SIGNAL_DECK', {
      reason: `Game data must have exactly ${TOTAL_ROUNDS} rounds. Found ${data.length}.`,
    });
  }

  const requiredRoundFields = ['id', 'year', 'title', 'context', 'companies', 'yearlyReturn', 'yearEndReveal'];
  const requiredCompanyFields = ['id', 'name', 'sector', 'headline', 'detail'];

  for (let i = 0; i < data.length; i++) {
    const round = data[i];
    for (const field of requiredRoundFields) {
      if (!round[field]) throw createError('INVALID_SIGNAL_DECK', { reason: `Round ${i + 1} missing field: ${field}` });
    }

    if (!Array.isArray(round.companies) || round.companies.length === 0) {
      throw createError('INVALID_SIGNAL_DECK', { reason: `Round ${i + 1} must have companies array.` });
    }

    for (const company of round.companies) {
      for (const field of requiredCompanyFields) {
        if (!company[field]) {
          throw createError('INVALID_SIGNAL_DECK', { reason: `Round ${i + 1}, company ${company.id ?? '?'} missing: ${field}` });
        }
      }
      if (!COMPANY_IDS.includes(company.id)) {
        throw createError('INVALID_SIGNAL_DECK', { reason: `Unknown company id: ${company.id}` });
      }
    }

    for (const companyId of COMPANY_IDS) {
      if (typeof round.yearlyReturn[companyId] !== 'number') {
        throw createError('INVALID_SIGNAL_DECK', { reason: `Round ${i + 1} missing yearly return for ${companyId}` });
      }
    }
  }

  return data;
}

function loadGameData() {
  const dataPath = path.join(__dirname, 'data', 'portfolio-game.json');
  const data = require(dataPath);
  return validateGameData(data);
}

/**
 * Validates a team's allocation submission.
 * Returns the cleaned allocation object or throws.
 */
function validateAllocation(rawAllocation) {
  if (!rawAllocation || typeof rawAllocation !== 'object' || Array.isArray(rawAllocation)) {
    throw createError('INVALID_DECISION', { reason: 'Allocation must be an object.' });
  }

  let total = 0;
  const cleaned = {};

  for (const companyId of COMPANY_IDS) {
    const val = rawAllocation[companyId];
    const parsed = Number(val ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw createError('INVALID_DECISION', { reason: `Invalid value for ${companyId}: must be a non-negative number.` });
    }
    cleaned[companyId] = Math.round(parsed);
    total += cleaned[companyId];
  }

  if (Math.abs(total - 100) > 1) {
    throw createError('INVALID_DECISION', { reason: `Allocations must sum to 100. Got ${total}.` });
  }

  // Normalize to exactly 100 if off by 1 due to rounding
  if (total !== 100) {
    const diff = 100 - total;
    // Add rounding diff to the largest allocation
    const largest = COMPANY_IDS.reduce((a, b) => (cleaned[a] >= cleaned[b] ? a : b));
    cleaned[largest] += diff;
  }

  return cleaned;
}

module.exports = {
  loadConfig,
  loadGameData,
  parseCorsOrigins,
  validateAllocation,
  validateGameData,
  validateRoundDurationMs,
};
