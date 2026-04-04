const TEAM_LIMIT = 12;
const TOTAL_ROUNDS = 6;
const COMPANY_IDS = ['reliance', 'hdfc_bank', 'infosys', 'yes_bank', 'byjus', 'adani'];
const STARTING_PURSE_VALUE = 100000; // ₹1,00,000 starting cash in purse
const DEFAULT_PORT = 3000;
const DEFAULT_ROUND_DURATION_MS = 60000; // 60 seconds for investment decisions
const MAX_ROUND_DURATION_MS = 3600000;
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
  STARTING_PURSE_VALUE,
  TEAM_LIMIT,
  TOTAL_ROUNDS,
};
