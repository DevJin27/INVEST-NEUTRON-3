const {
  AUDIT_LOG_LIMIT,
  COMPANY_IDS,
  GAME_PHASES,
  STARTING_PURSE_VALUE,
} = require("./constants");

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function createEmptyInvestments() {
  return Object.fromEntries(COMPANY_IDS.map((companyId) => [companyId, 0]));
}

function createInitialState(config) {
  return {
    auditLog: [],
    closeAt: null,
    gameDataVersion: config.gameDataVersion || null,
    endsAt: null,
    lastRoundResults: null,
    phase: GAME_PHASES.IDLE,
    remainingMs: 0,
    round: 0,
    roundDurationMs: config.roundDurationMs,
    submissions: {},
    teams: {},
    totalRounds: config.totalRounds,
  };
}

function normalizeState(rawState, config) {
  const state = rawState ? cloneValue(rawState) : createInitialState(config);

  state.auditLog = Array.isArray(state.auditLog) ? state.auditLog.slice(-AUDIT_LOG_LIMIT) : [];
  state.closeAt = Number.isFinite(state.closeAt) ? state.closeAt : null;
  state.gameDataVersion = typeof state.gameDataVersion === "string" ? state.gameDataVersion : (config.gameDataVersion || null);
  state.endsAt = Number.isFinite(state.endsAt) ? state.endsAt : null;
  state.lastRoundResults = state.lastRoundResults || null;
  state.phase = Object.values(GAME_PHASES).includes(state.phase) ? state.phase : GAME_PHASES.IDLE;
  state.remainingMs = Number.isFinite(state.remainingMs) ? Math.max(0, Math.round(state.remainingMs)) : 0;
  state.round = Number.isInteger(state.round) ? Math.max(0, state.round) : 0;
  state.roundDurationMs = Number.isInteger(state.roundDurationMs)
    ? state.roundDurationMs
    : config.roundDurationMs;
  state.submissions = isRecord(state.submissions) ? state.submissions : {};
  state.teams = isRecord(state.teams) ? state.teams : {};
  state.totalRounds = Number.isInteger(state.totalRounds) ? state.totalRounds : config.totalRounds;

  for (const teamId of Object.keys(state.teams)) {
    const team = state.teams[teamId] || {};
    const investments = createEmptyInvestments();
    for (const companyId of COMPANY_IDS) {
      const rawAmount = team.investments?.[companyId];
      investments[companyId] = Number.isFinite(rawAmount) ? Math.max(0, Math.round(rawAmount)) : 0;
    }

    const totalInvested = sumInvestments(investments);
    const purse = Number.isFinite(team.purse) ? Math.max(0, Math.round(team.purse)) : STARTING_PURSE_VALUE;

    state.teams[teamId] = {
      connected: Boolean(team.connected),
      investments,
      name: String(team.name || teamId),
      purse,
      socketId: team.socketId ? String(team.socketId) : null,
      teamId,
      totalValue: Number.isFinite(team.totalValue) ? Math.round(team.totalValue) : purse + totalInvested,
    };
  }

  for (const teamId of Object.keys(state.submissions)) {
    const submission = state.submissions[teamId];
    if (!state.teams[teamId] || !isRecord(submission)) {
      delete state.submissions[teamId];
      continue;
    }

    const investments = createEmptyInvestments();
    for (const companyId of COMPANY_IDS) {
      const rawAmount = submission.investments?.[companyId];
      investments[companyId] = Number.isFinite(rawAmount) ? Math.max(0, Math.round(rawAmount)) : 0;
    }

    state.submissions[teamId] = {
      investments,
      socketId: submission.socketId ? String(submission.socketId) : null,
      submittedAt: Number.isFinite(submission.submittedAt) ? submission.submittedAt : Date.now(),
    };
  }

  return state;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sumInvestments(investments) {
  return Object.values(investments).reduce((total, amount) => total + amount, 0);
}

function getSafeRoundData(round) {
  if (!round) {
    return null;
  }

  const { yearEndReveal: _yearEndReveal, yearlyReturn: _yearlyReturn, ...safeRound } = round;
  return cloneValue(safeRound);
}

function getCurrentRound(rounds, state) {
  if (!state.round) {
    return null;
  }

  return rounds[state.round - 1] || null;
}

function getRemainingMs(state, now = Date.now()) {
  if (state.phase === GAME_PHASES.PAUSED) {
    return state.remainingMs;
  }

  if (state.phase !== GAME_PHASES.LIVE || !state.endsAt) {
    return 0;
  }

  return Math.max(0, state.endsAt - now);
}

function getLeaderboard(state) {
  return Object.values(state.teams)
    .map((team) => ({
      connected: team.connected,
      investments: cloneValue(team.investments),
      name: team.name,
      purse: team.purse,
      teamId: team.teamId,
      totalValue: team.totalValue,
    }))
    .sort((left, right) => {
      if (right.totalValue !== left.totalValue) {
        return right.totalValue - left.totalValue;
      }

      return left.name.localeCompare(right.name);
    });
}

function getActiveTeamsCount(state) {
  return Object.values(state.teams).filter((team) => team.connected).length;
}

function getTeamStatuses(state) {
  return getLeaderboard(state).map((team) => ({
    connected: team.connected,
    hasSubmitted: Boolean(state.submissions[team.teamId]),
    name: team.name,
    purse: team.purse,
    teamId: team.teamId,
    totalInvested: sumInvestments(team.investments),
    totalValue: team.totalValue,
  }));
}

function getViewerSubmission(state, teamId, now = Date.now()) {
  if (!teamId) {
    return {
      canSubmit: false,
      hasSubmitted: false,
      investments: createEmptyInvestments(),
      teamId: null,
    };
  }

  const team = state.teams[teamId];
  const submission = state.submissions[teamId] || null;

  return {
    canSubmit:
      Boolean(team) &&
      state.phase === GAME_PHASES.LIVE &&
      !submission &&
      now <= (state.closeAt || 0),
    hasSubmitted: Boolean(submission),
    investments: submission
      ? cloneValue(submission.investments)
      : team
        ? cloneValue(team.investments)
        : createEmptyInvestments(),
    teamId,
  };
}

function getMarketMood(state, now = Date.now()) {
  if (state.phase !== GAME_PHASES.LIVE) {
    return "stable";
  }

  const totalTeams = Object.keys(state.teams).length;
  if (totalTeams === 0) {
    return "stable";
  }

  const submittedRatio = Object.keys(state.submissions).length / totalTeams;
  const remainingMs = getRemainingMs(state, now);

  if (submittedRatio > 0.7 && remainingMs > 60000) {
    return "frenzy";
  }

  if (submittedRatio < 0.3 && remainingMs < 30000) {
    return "caution";
  }

  return "stable";
}

function buildBaseSnapshot(state, rounds, now = Date.now()) {
  return {
    activeTeamsCount: getActiveTeamsCount(state),
    currentRound: getSafeRoundData(getCurrentRound(rounds, state)),
    endsAt: state.endsAt,
    leaderboard: getLeaderboard(state),
    marketMood: getMarketMood(state, now),
    phase: state.phase,
    remainingMs: getRemainingMs(state, now),
    round: state.round,
    roundDurationMs: state.roundDurationMs,
    totalRounds: state.totalRounds,
  };
}

function buildViewerSnapshot(state, rounds, viewer, now = Date.now()) {
  const baseSnapshot = buildBaseSnapshot(state, rounds, now);

  if (viewer?.isAdmin) {
    return {
      ...baseSnapshot,
      auditLog: cloneValue(state.auditLog),
      lastRoundResults: state.lastRoundResults ? cloneValue(state.lastRoundResults) : null,
      teamSubmissions: getTeamStatuses(state),
    };
  }

  return {
    ...baseSnapshot,
    viewerSubmission: getViewerSubmission(state, viewer?.teamId || null, now),
  };
}

function buildPublicState(state, rounds, now = Date.now()) {
  return {
    ...buildBaseSnapshot(state, rounds, now),
    teamSubmissions: getTeamStatuses(state),
  };
}

function appendAuditEntry(state, entry) {
  state.auditLog.push(entry);
  if (state.auditLog.length > AUDIT_LOG_LIMIT) {
    state.auditLog.splice(0, state.auditLog.length - AUDIT_LOG_LIMIT);
  }

  return entry;
}

module.exports = {
  appendAuditEntry,
  buildBaseSnapshot,
  buildPublicState,
  buildViewerSnapshot,
  cloneValue,
  createEmptyInvestments,
  createInitialState,
  getActiveTeamsCount,
  getCurrentRound,
  getLeaderboard,
  getRemainingMs,
  getTeamStatuses,
  getViewerSubmission,
  getSafeRoundData,
  normalizeState,
  sumInvestments,
};
