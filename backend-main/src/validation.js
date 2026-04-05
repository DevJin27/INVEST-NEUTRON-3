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

  const minDuration = process.env.NODE_ENV === 'test' ? 10 : 5000;
  if (roundDurationMs < minDuration || roundDurationMs > MAX_ROUND_DURATION_MS) {
    throw createError('INVALID_CONFIG', {
      name: 'ROUND_DURATION_MS',
      reason: `Must be between ${minDuration} and ${MAX_ROUND_DURATION_MS}.`,
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

  const dataPath = path.join(__dirname, 'data', 'portfolio-game.json');
  const data = require(dataPath);
  const totalRounds = parseIntegerEnv(env.TOTAL_ROUNDS, TOTAL_ROUNDS, 'TOTAL_ROUNDS');
  if (totalRounds < 1 || totalRounds > data.length) {
    throw createError('INVALID_CONFIG', { reason: `TOTAL_ROUNDS must be between 1 and ${data.length}` });
  }

  return {
    adminSecret,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
    port,
    roundDurationMs,
    totalRounds,
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
  const requiredCompanyFields = ['id', 'name', 'sector', 'newsFeed'];

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
      
      if (!Array.isArray(company.newsFeed) || company.newsFeed.length === 0) {
        throw createError('INVALID_SIGNAL_DECK', { reason: `Round ${i + 1}, company ${company.id} must have newsFeed array.` });
      }
      for (const news of company.newsFeed) {
        if (!news.id || !news.headline || !news.detail || !news.source) {
          throw createError('INVALID_SIGNAL_DECK', { reason: `Round ${i + 1}, company ${company.id} has invalid news item.` });
        }
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


module.exports = {
  loadConfig,
  loadGameData,
  parseCorsOrigins,
  validateGameData,
  validateRoundDurationMs,
};
