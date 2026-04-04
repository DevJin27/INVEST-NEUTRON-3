const TEAM_LIMIT = 10;
const TOTAL_ROUNDS = 6; // fixed to data file
const COMPANY_IDS = ['reliance', 'hdfc_bank', 'infosys', 'yes_bank', 'byjus', 'adani'];
const STARTING_PORTFOLIO_VALUE = 10000; // ₹10,000 normalized starting value
const DEFAULT_PORT = 3000;
const DEFAULT_ROUND_DURATION_MS = 30000; // 30 seconds — more decisions needed
const MAX_ROUND_DURATION_MS = 120000;
const GRACE_WINDOW_MS = 200;
const ADMIN_ACTION_RATE_LIMIT_MS = 500;
const AUDIT_LOG_LIMIT = 200;

const GAME_PHASES = Object.freeze({
  IDLE: 'idle',
  LIVE: 'live',
  PAUSED: 'paused',
  RESULTS: 'results',
  FINISHED: 'finished',
});

module.exports = {
  ADMIN_ACTION_RATE_LIMIT_MS,
  AUDIT_LOG_LIMIT,
  COMPANY_IDS,
  DEFAULT_PORT,
  DEFAULT_ROUND_DURATION_MS,
  GAME_PHASES,
  GRACE_WINDOW_MS,
  MAX_ROUND_DURATION_MS,
  STARTING_PORTFOLIO_VALUE,
  TEAM_LIMIT,
  TOTAL_ROUNDS,
};
