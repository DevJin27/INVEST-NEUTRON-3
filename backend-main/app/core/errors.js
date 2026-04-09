const DEFAULT_ERROR_MESSAGES = Object.freeze({
  INVALID_CONFIG: "Server configuration is invalid.",
  INVALID_SIGNAL_DECK: "Signal deck is invalid.",
  AUTH_REQUIRED: "Admin authentication is required for this action.",
  INVALID_ADMIN_SECRET: "The provided admin secret is invalid.",
  FORBIDDEN: "This action is not allowed for the current connection.",
  TEAM_LIMIT_REACHED: "The maximum number of teams has already joined.",
  INVALID_TEAM: "The provided team information is invalid.",
  INVALID_DECISION: "The submitted decision is invalid.",
  INVALID_COMPANY: "The selected company is invalid.",
  INVALID_AMOUNT: "The submitted amount is invalid.",
  INSUFFICIENT_FUNDS: "The team does not have enough available cash for that investment.",
  INSUFFICIENT_INVESTMENT: "The team has not invested enough in that company to withdraw that amount.",
  ROUND_NOT_ACTIVE: "No round is currently accepting submissions.",
  ROUND_PAUSED: "The round is paused and not accepting submissions.",
  ROUND_CLOSED: "The round is already closed.",
  ALREADY_SUBMITTED: "This team has already submitted for the current round.",
  ADMIN_RATE_LIMITED: "Admin actions are temporarily rate limited.",
  SERVER_SHUTDOWN: "Server is shutting down.",
  NO_MORE_ROUNDS: "No more rounds are available in the current game.",
  INVALID_PHASE: "This action is not valid in the current game phase.",
  INTERNAL_ERROR: "Unexpected server error.",
});

class AppError extends Error {
  constructor(code, message, details) {
    super(message || DEFAULT_ERROR_MESSAGES[code] || DEFAULT_ERROR_MESSAGES.INTERNAL_ERROR);
    this.code = code || "INTERNAL_ERROR";
    this.details = details;
  }
}

function createError(code, details, message) {
  return new AppError(code, message, details);
}

function serializeError(error) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: DEFAULT_ERROR_MESSAGES.INTERNAL_ERROR,
  };
}

function failure(error) {
  return { ok: false, error: serializeError(error) };
}

function success(data) {
  return { ok: true, data };
}

module.exports = {
  AppError,
  DEFAULT_ERROR_MESSAGES,
  createError,
  failure,
  serializeError,
  success,
};
