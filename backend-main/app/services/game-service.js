const {
  ADMIN_ACTION_RATE_LIMIT_MS,
  COMPANY_IDS,
  GAME_PHASES,
  GRACE_WINDOW_MS,
  STARTING_PURSE_VALUE,
  TEAM_LIMIT,
} = require("../models/constants");
const {
  appendAuditEntry,
  buildPublicState,
  buildViewerSnapshot,
  createEmptyInvestments,
  createInitialState,
  getActiveTeamsCount,
  getCurrentRound,
  getLeaderboard,
  getRemainingMs,
  normalizeState,
  sumInvestments,
} = require("../models/game-state");
const { evaluateInvestments } = require("./scoring");
const { createError, serializeError } = require("../core/errors");
const { validateRoundDurationMs } = require("../core/config");

class GameService {
  constructor(options) {
    this.config = options.config;
    this.logger = options.logger;
    this.now = options.now || (() => Date.now());
    this.rounds = options.rounds;
    this.store = options.store;
  }

  async initialize() {
    await this.store.connect();
    await this.store.initialize(createInitialState(this.config));
  }

  async getCurrentState() {
    const state = await this.store.getState();
    return normalizeState(state, this.config);
  }

  buildViewerSnapshot(state, viewer) {
    return buildViewerSnapshot(normalizeState(state, this.config), this.rounds, viewer, this.now());
  }

  buildPublicState(state) {
    return buildPublicState(normalizeState(state, this.config), this.rounds, this.now());
  }

  async getPublicState() {
    const state = await this.getCurrentState();
    return this.buildPublicState(state);
  }

  async getSnapshotForViewer(viewer) {
    const state = await this.getCurrentState();
    return this.buildViewerSnapshot(state, viewer);
  }

  async getHealth(localServerState) {
    const state = await this.getCurrentState();
    return {
      status: localServerState.shuttingDown ? "shutting-down" : "ok",
      phase: state.phase,
      currentRound: state.round,
      totalRounds: state.totalRounds,
      activeTeamsCount: getActiveTeamsCount(state),
      remainingMs: getRemainingMs(state, this.now()),
      roundDurationMs: state.roundDurationMs,
      uptimeMs: this.now() - localServerState.startedAt,
    };
  }

  async recordAuditEntry(entry) {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      appendAuditEntry(state, entry);
      await this.store.setState(state);
      return entry;
    });
  }

  async getAuditLog() {
    const state = await this.getCurrentState();
    return state.auditLog;
  }

  async joinTeam({ name, socketId, teamId }) {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      const normalizedTeamId = String(teamId || "").trim();
      const normalizedName = String(name || normalizedTeamId).trim();

      if (!normalizedTeamId || !normalizedName) {
        throw createError("INVALID_TEAM", {
          reason: "teamId and name must be non-empty strings.",
        });
      }

      const previousTeam = findTeamBySocketId(state, socketId);
      if (previousTeam && previousTeam.teamId !== normalizedTeamId) {
        previousTeam.connected = false;
        previousTeam.socketId = null;
      }

      const existingTeam = state.teams[normalizedTeamId];
      if (!existingTeam && Object.keys(state.teams).length >= TEAM_LIMIT) {
        throw createError("TEAM_LIMIT_REACHED", { teamLimit: TEAM_LIMIT });
      }

      const replacedSocketId = existingTeam && existingTeam.socketId !== socketId
        ? existingTeam.socketId
        : null;

      const investments = existingTeam
        ? { ...existingTeam.investments }
        : createEmptyInvestments();
      const purse = existingTeam?.purse ?? STARTING_PURSE_VALUE;
      const totalInvested = sumInvestments(investments);

      state.teams[normalizedTeamId] = {
        connected: true,
        investments,
        name: normalizedName,
        purse,
        socketId,
        teamId: normalizedTeamId,
        totalValue: purse + totalInvested,
      };

      await this.store.setState(state);
      return {
        replacedSocketId,
        team: { ...state.teams[normalizedTeamId] },
      };
    });
  }

  async disconnectSocket(socketId) {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      const team = findTeamBySocketId(state, socketId);

      if (!team) {
        return null;
      }

      team.connected = false;
      team.socketId = null;
      await this.store.setState(state);
      return { ...team };
    });
  }

  async startGame() {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      if (state.phase !== GAME_PHASES.IDLE) {
        throw createError("INVALID_PHASE", { phase: state.phase });
      }

      state.phase = GAME_PHASES.IDLE;
      state.round = 0;
      state.endsAt = null;
      state.closeAt = null;
      state.remainingMs = 0;
      state.lastRoundResults = null;
      state.submissions = {};

      for (const team of Object.values(state.teams)) {
        team.purse = STARTING_PURSE_VALUE;
        team.investments = createEmptyInvestments();
        team.totalValue = STARTING_PURSE_VALUE;
      }

      const result = beginRound(state, this.rounds, this.now());
      await this.store.setState(state);
      return result;
    });
  }

  async setRoundDuration(payload) {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      if (state.phase !== GAME_PHASES.IDLE) {
        throw createError("INVALID_PHASE", {
          phase: state.phase,
          reason: "Round duration can only be changed before the game starts.",
        });
      }

      state.roundDurationMs = validateRoundDurationMs(
        Math.round(Number(payload.roundDurationMs)),
        process.env.NODE_ENV
      );

      await this.store.setState(state);
      return { roundDurationMs: state.roundDurationMs };
    });
  }

  async nextRound() {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      if (state.phase !== GAME_PHASES.RESULTS && state.phase !== GAME_PHASES.FINISHED) {
        throw createError("INVALID_PHASE", { phase: state.phase });
      }

      if (state.round >= state.totalRounds) {
        throw createError("NO_MORE_ROUNDS");
      }

      const result = beginRound(state, this.rounds, this.now());
      await this.store.setState(state);
      return result;
    });
  }

  async pauseRound() {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      if (state.phase !== GAME_PHASES.LIVE) {
        throw createError("INVALID_PHASE", { phase: state.phase });
      }

      if (this.now() > (state.closeAt || 0)) {
        throw createError("ROUND_CLOSED");
      }

      state.remainingMs = Math.max(0, (state.endsAt || this.now()) - this.now());
      state.phase = GAME_PHASES.PAUSED;

      await this.store.setState(state);
      return { remainingMs: state.remainingMs, round: state.round };
    });
  }

  async resumeRound() {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      if (state.phase !== GAME_PHASES.PAUSED) {
        throw createError("INVALID_PHASE", { phase: state.phase });
      }

      state.phase = GAME_PHASES.LIVE;
      state.endsAt = this.now() + state.remainingMs;
      state.closeAt = state.endsAt + GRACE_WINDOW_MS;

      await this.store.setState(state);
      return { endsAt: state.endsAt, remainingMs: state.remainingMs, round: state.round };
    });
  }

  async endRound() {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      if (state.phase !== GAME_PHASES.LIVE) {
        throw createError("INVALID_PHASE", {
          phase: state.phase,
          reason: "Can only end round during live phase.",
        });
      }

      const results = evaluateRound(state, this.rounds);
      await this.store.setState(state);
      return { ended: true, results };
    });
  }

  async resolveRoundIfDue() {
    const rawState = await this.store.getState();
    if (!rawState || rawState.phase !== GAME_PHASES.LIVE) {
      return null;
    }

    const currentState = normalizeState(rawState, this.config);
    if (!currentState.closeAt || this.now() < currentState.closeAt) {
      return null;
    }

    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      if (state.phase !== GAME_PHASES.LIVE) {
        return null;
      }

      if (!state.closeAt || this.now() < state.closeAt) {
        return null;
      }

      const results = evaluateRound(state, this.rounds);
      await this.store.setState(state);
      return results;
    });
  }

  async resetGame() {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);

      state.phase = GAME_PHASES.IDLE;
      state.round = 0;
      state.endsAt = null;
      state.closeAt = null;
      state.remainingMs = 0;
      state.lastRoundResults = null;
      state.submissions = {};

      for (const team of Object.values(state.teams)) {
        team.purse = STARTING_PURSE_VALUE;
        team.investments = createEmptyInvestments();
        team.totalValue = STARTING_PURSE_VALUE;
      }

      await this.store.setState(state);
      return buildPublicState(state, this.rounds, this.now());
    });
  }

  async setPurseValue(payload) {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      if (state.phase === GAME_PHASES.LIVE || state.phase === GAME_PHASES.PAUSED) {
        throw createError("INVALID_PHASE", {
          phase: state.phase,
          reason: "Overrides disabled during live rounds.",
        });
      }

      const normalizedTeamId = String(payload.teamId || "").trim();
      const team = state.teams[normalizedTeamId];
      if (!normalizedTeamId || !team) {
        throw createError("INVALID_TEAM", { teamId: normalizedTeamId });
      }

      if (!Number.isFinite(payload.value) || Number(payload.value) < 0) {
        throw createError("INVALID_CONFIG", {
          reason: "Purse value must be a non-negative number.",
        });
      }

      const purse = Math.round(Number(payload.value));
      const totalInvested = sumInvestments(team.investments);
      team.purse = purse;
      team.totalValue = purse + totalInvested;

      await this.store.setState(state);
      return {
        leaderboard: getLeaderboard(state),
        team: { ...team, investments: { ...team.investments } },
      };
    });
  }

  async getAuditLogResponse() {
    return { entries: await this.getAuditLog() };
  }

  async invest({ amount, companyId, socketId }) {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      assertAcceptingSubmissions(state, this.now());

      const team = findAuthorizedTeam(state, socketId);
      assertCompany(companyId);

      if (state.submissions[team.teamId]) {
        throw createError("ALREADY_SUBMITTED", { teamId: team.teamId });
      }

      const investAmount = Math.max(0, Math.round(Number(amount) || 0));
      if (investAmount <= 0) {
        throw createError("INVALID_AMOUNT", {
          reason: "Investment amount must be positive.",
        });
      }

      if (investAmount > team.purse) {
        throw createError("INSUFFICIENT_FUNDS", {
          purse: team.purse,
          requested: investAmount,
        });
      }

      team.purse -= investAmount;
      team.investments[companyId] += investAmount;
      team.totalValue = team.purse + sumInvestments(team.investments);

      await this.store.setState(state);
      return {
        amount: investAmount,
        companyId,
        invested: team.investments[companyId],
        purse: team.purse,
        teamId: team.teamId,
      };
    });
  }

  async withdraw({ amount, companyId, socketId }) {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      assertAcceptingSubmissions(state, this.now());

      const team = findAuthorizedTeam(state, socketId);
      assertCompany(companyId);

      if (state.submissions[team.teamId]) {
        throw createError("ALREADY_SUBMITTED", { teamId: team.teamId });
      }

      const withdrawAmount = Math.max(0, Math.round(Number(amount) || 0));
      if (withdrawAmount <= 0) {
        throw createError("INVALID_AMOUNT", {
          reason: "Withdrawal amount must be positive.",
        });
      }

      if (withdrawAmount > team.investments[companyId]) {
        throw createError("INSUFFICIENT_INVESTMENT", {
          companyId,
          invested: team.investments[companyId],
          requested: withdrawAmount,
        });
      }

      team.investments[companyId] -= withdrawAmount;
      team.purse += withdrawAmount;
      team.totalValue = team.purse + sumInvestments(team.investments);

      await this.store.setState(state);
      return {
        amount: withdrawAmount,
        companyId,
        invested: team.investments[companyId],
        purse: team.purse,
        teamId: team.teamId,
      };
    });
  }

  async submitInvestments({ socketId }) {
    return this.store.withLock(async () => {
      const state = normalizeState(await this.store.getState(), this.config);
      assertAcceptingSubmissions(state, this.now());

      const team = findAuthorizedTeam(state, socketId);
      if (state.submissions[team.teamId]) {
        throw createError("ALREADY_SUBMITTED", {
          round: state.round,
          teamId: team.teamId,
        });
      }

      const totalAllocated = sumInvestments(team.investments);
      if (totalAllocated <= 0) {
        throw createError("INVALID_DECISION", {
          reason: "Must invest before submitting.",
        });
      }

      state.submissions[team.teamId] = {
        investments: { ...team.investments },
        socketId,
        submittedAt: this.now(),
      };

      await this.store.setState(state);
      return {
        investments: { ...team.investments },
        round: state.round,
        teamId: team.teamId,
      };
    });
  }

  async dispose() {
    await this.store.disconnect();
  }
}

function assertCompany(companyId) {
  if (!COMPANY_IDS.includes(companyId)) {
    throw createError("INVALID_COMPANY", {
      companyId,
      reason: "Invalid company ID.",
    });
  }
}

function findTeamBySocketId(state, socketId) {
  return Object.values(state.teams).find((team) => team.socketId === socketId) || null;
}

function findAuthorizedTeam(state, socketId) {
  const team = findTeamBySocketId(state, socketId);
  if (!team) {
    throw createError("INVALID_TEAM", {
      reason: "Socket not associated with an active team.",
    });
  }

  if (team.socketId !== socketId) {
    throw createError("FORBIDDEN", {
      reason: "Socket is not the active controller.",
    });
  }

  return team;
}

function assertAcceptingSubmissions(state, now) {
  if (state.phase === GAME_PHASES.PAUSED) {
    throw createError("ROUND_PAUSED");
  }

  if (state.phase !== GAME_PHASES.LIVE) {
    throw createError("ROUND_NOT_ACTIVE");
  }

  if (now > (state.closeAt || 0)) {
    throw createError("ROUND_CLOSED");
  }
}

function beginRound(state, rounds, now) {
  if (state.round >= state.totalRounds || state.round >= rounds.length) {
    state.phase = GAME_PHASES.FINISHED;
    return {
      leaderboard: getLeaderboard(state),
      phase: state.phase,
    };
  }

  state.round += 1;
  state.phase = GAME_PHASES.LIVE;
  state.submissions = {};
  state.remainingMs = state.roundDurationMs;
  state.endsAt = now + state.roundDurationMs;
  state.closeAt = state.endsAt + GRACE_WINDOW_MS;

  return {
    endsAt: state.endsAt,
    round: state.round,
    roundData: getCurrentRound(rounds, state)
      ? buildPublicRound(getCurrentRound(rounds, state))
      : null,
  };
}

function buildPublicRound(round) {
  const { yearEndReveal: _yearEndReveal, yearlyReturn: _yearlyReturn, ...safeRound } = round;
  return safeRound;
}

function evaluateRound(state, rounds) {
  if (state.phase !== GAME_PHASES.LIVE) {
    return null;
  }

  const roundData = getCurrentRound(rounds, state);
  const teamOutcomes = getLeaderboard(state).map((entry) => {
    const submission = state.submissions[entry.teamId] || null;
    const team = state.teams[entry.teamId];
    const investmentsToEvaluate = submission ? submission.investments : team.investments;
    const result = evaluateInvestments(roundData, investmentsToEvaluate);
    const totalInvested = sumInvestments(team.investments);
    const newPurse = Math.round(team.purse + result.returns);

    team.purse = newPurse;
    team.totalValue = newPurse + totalInvested;

    return {
      breakdown: result.breakdown,
      connected: team.connected,
      didSubmit: submission !== null,
      investments: { ...investmentsToEvaluate },
      name: team.name,
      percentReturn: result.percentReturn,
      purse: newPurse,
      returns: result.returns,
      teamId: team.teamId,
      totalInvested: result.totalInvested,
      totalValue: team.totalValue,
    };
  });

  const results = {
    actualReturns: roundData.yearlyReturn,
    leaderboard: getLeaderboard(state),
    round: state.round,
    teamOutcomes,
    title: roundData.title,
    year: roundData.year,
    yearEndReveal: roundData.yearEndReveal,
    yearRange: roundData.yearRange,
  };

  state.phase = state.round >= state.totalRounds ? GAME_PHASES.FINISHED : GAME_PHASES.RESULTS;
  state.endsAt = null;
  state.closeAt = null;
  state.remainingMs = 0;
  state.lastRoundResults = results;

  return results;
}

module.exports = {
  ADMIN_ACTION_RATE_LIMIT_MS,
  GameService,
  serializeError,
};
