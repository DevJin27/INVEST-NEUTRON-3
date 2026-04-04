const {
  COMPANY_IDS,
  GAME_PHASES,
  GRACE_WINDOW_MS,
  STARTING_PURSE_VALUE,
  TEAM_LIMIT,
} = require('./constants');
const { createError } = require('./errors');
const { evaluateInvestments } = require('./scoring');
const { validateRoundDurationMs } = require('./validation');

function createEmptyInvestments() {
  return Object.fromEntries(COMPANY_IDS.map((id) => [id, 0]));
}

class GameEngine {
  constructor(options) {
    this.rounds = Array.isArray(options.rounds) ? options.rounds : [];
    this.roundDurationMs = options.roundDurationMs;
    this.totalRounds = options.totalRounds;
    this.auditLog = options.auditLog;
    this.now = options.now || (() => Date.now());
    this.schedule = options.schedule || setTimeout;
    this.cancel = options.cancel || clearTimeout;
    this.onRoundClosed = options.onRoundClosed || null;

    this.teams = new Map(); // teamId -> { teamId, name, purse, investments, totalValue, connected, socketId }
    this.socketToTeam = new Map();
    this.submissions = new Map(); // teamId -> { investments: {...}, submittedAt } - freeze investments at round end
    this.roundTimer = null;
    this.phase = GAME_PHASES.IDLE;
    this.round = 0;
    this.currentRoundData = null;
    this.endsAt = null;
    this.closeAt = null;
    this.remainingMs = 0;
    this.isShuttingDown = false;
    this.lastRoundResults = null;
  }

  setRoundCloseHandler(handler) { this.onRoundClosed = handler; }
  setShuttingDown(value) { this.isShuttingDown = Boolean(value); }
  dispose() { this.clearRoundTimer(); }

  clearRoundTimer() {
    if (this.roundTimer) {
      this.cancel(this.roundTimer);
      this.roundTimer = null;
    }
  }

  isRoundInProgress() {
    return this.phase === GAME_PHASES.LIVE || this.phase === GAME_PHASES.PAUSED;
  }

  getActiveTeamsCount() {
    let count = 0;
    for (const team of this.teams.values()) {
      if (team.connected) count++;
    }
    return count;
  }

  getRemainingMs() {
    if (this.phase === GAME_PHASES.PAUSED) return this.remainingMs;
    if (this.phase !== GAME_PHASES.LIVE || !this.endsAt) return 0;
    return Math.max(0, this.endsAt - this.now());
  }

  getLeaderboard() {
    return [...this.teams.values()]
      .map((team) => ({
        teamId: team.teamId,
        name: team.name,
        purse: team.purse,
        investments: { ...team.investments },
        totalValue: team.totalValue,
        connected: team.connected,
      }))
      .sort((a, b) => {
        if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
        return a.name.localeCompare(b.name);
      });
  }

  getTeamSubmission(teamId) {
    const submission = teamId ? this.submissions.get(teamId) : null;
    const team = teamId ? this.teams.get(teamId) : null;
    return {
      teamId: teamId || null,
      hasSubmitted: Boolean(submission),
      investments: submission ? { ...submission.investments } : team ? { ...team.investments } : createEmptyInvestments(),
      canSubmit:
        Boolean(teamId) &&
        this.phase === GAME_PHASES.LIVE &&
        !submission &&
        this.now() <= (this.closeAt || 0),
    };
  }

  getTeamStatuses() {
    return this.getLeaderboard().map((team) => ({
      teamId: team.teamId,
      name: team.name,
      purse: team.purse,
      totalValue: team.totalValue,
      connected: team.connected,
      hasSubmitted: this.submissions.has(team.teamId),
      totalInvested: Object.values(team.investments).reduce((sum, val) => sum + val, 0),
    }));
  }

  // Strips sensitive return data from round for in-flight display
  getSafeRoundData() {
    if (!this.currentRoundData) return null;
    const { yearlyReturn, yearEndReveal, ...safe } = this.currentRoundData;
    return safe;
  }

  getBaseSnapshot() {
    return {
      activeTeamsCount: this.getActiveTeamsCount(),
      currentRound: this.getSafeRoundData(),
      endsAt: this.endsAt,
      leaderboard: this.getLeaderboard(),
      phase: this.phase,
      remainingMs: this.getRemainingMs(),
      round: this.round,
      roundDurationMs: this.roundDurationMs,
      totalRounds: this.totalRounds,
    };
  }

  getSnapshotForViewer(socketData = {}) {
    const base = this.getBaseSnapshot();
    if (socketData.isAdmin) {
      return {
        ...base,
        auditLog: this.auditLog.list(),
        lastRoundResults: this.lastRoundResults,
        teamSubmissions: this.getTeamStatuses(),
      };
    }
    return {
      ...base,
      viewerSubmission: this.getTeamSubmission(socketData.teamId),
    };
  }

  getPublicState() {
    return {
      ...this.getBaseSnapshot(),
      teamSubmissions: this.getTeamStatuses().map(({ allocation: _a, ...rest }) => rest),
    };
  }

  assertAcceptingSubmissions() {
    if (this.phase === GAME_PHASES.PAUSED) throw createError('ROUND_PAUSED');
    if (this.phase !== GAME_PHASES.LIVE) throw createError('ROUND_NOT_ACTIVE');
    if (this.now() > (this.closeAt || 0)) throw createError('ROUND_CLOSED');
  }

  joinTeam({ teamId, name, socketId }) {
    const normalizedTeamId = String(teamId || '').trim();
    const normalizedName = String(name || normalizedTeamId).trim();
    if (!normalizedTeamId || !normalizedName) {
      throw createError('INVALID_TEAM', { reason: 'teamId and name must be non-empty strings.' });
    }

    const previousTeamId = this.socketToTeam.get(socketId);
    if (previousTeamId && previousTeamId !== normalizedTeamId) {
      const previousTeam = this.teams.get(previousTeamId);
      if (previousTeam && previousTeam.socketId === socketId) {
        this.teams.set(previousTeamId, { ...previousTeam, connected: false, socketId: null });
      }
      this.socketToTeam.delete(socketId);
    }

    const existingTeam = this.teams.get(normalizedTeamId);
    if (!existingTeam && this.teams.size >= TEAM_LIMIT) {
      throw createError('TEAM_LIMIT_REACHED', { teamLimit: TEAM_LIMIT });
    }

    const replacedSocketId = existingTeam && existingTeam.socketId !== socketId ? existingTeam.socketId : null;
    if (replacedSocketId) this.socketToTeam.delete(replacedSocketId);

    // Initialize with empty investments for new teams
    const investments = existingTeam?.investments ? { ...existingTeam.investments } : createEmptyInvestments();
    const purse = existingTeam?.purse ?? STARTING_PURSE_VALUE;
    const totalInvested = Object.values(investments).reduce((sum, val) => sum + val, 0);

    this.teams.set(normalizedTeamId, {
      teamId: normalizedTeamId,
      name: normalizedName,
      purse,
      investments,
      totalValue: purse + totalInvested,
      connected: true,
      socketId,
    });
    this.socketToTeam.set(socketId, normalizedTeamId);

    return { replacedSocketId, team: this.teams.get(normalizedTeamId) };
  }

  disconnectSocket(socketId) {
    const teamId = this.socketToTeam.get(socketId);
    if (!teamId) return null;
    const team = this.teams.get(teamId);
    if (team && team.socketId === socketId) {
      this.teams.set(teamId, { ...team, connected: false, socketId: null });
    }
    this.socketToTeam.delete(socketId);
    return this.teams.get(teamId);
  }

  startGame() {
    if (this.phase !== GAME_PHASES.IDLE) throw createError('INVALID_PHASE', { phase: this.phase });
    this.clearRoundTimer();
    this.submissions = new Map();
    this.round = 0;
    this.currentRoundData = null;
    this.lastRoundResults = null;
    this.endsAt = null;
    this.closeAt = null;
    this.remainingMs = 0;

    for (const [teamId, team] of this.teams.entries()) {
      const investments = createEmptyInvestments();
      this.teams.set(teamId, {
        ...team,
        purse: STARTING_PURSE_VALUE,
        investments,
        totalValue: STARTING_PURSE_VALUE,
      });
    }

    return this.beginRound();
  }

  beginRound() {
    if (this.round >= this.totalRounds || this.round >= this.rounds.length) {
      this.phase = GAME_PHASES.FINISHED;
      return { phase: this.phase, leaderboard: this.getLeaderboard() };
    }

    this.round += 1;
    this.currentRoundData = this.rounds[this.round - 1];
    this.phase = GAME_PHASES.LIVE;
    this.submissions = new Map();
    this.remainingMs = this.roundDurationMs;
    this.endsAt = this.now() + this.roundDurationMs;
    this.closeAt = this.endsAt + GRACE_WINDOW_MS;
    this.armRoundTimer();

    return {
      round: this.round,
      roundData: this.getSafeRoundData(),
      endsAt: this.endsAt,
    };
  }

  nextRound() {
    if (this.phase !== GAME_PHASES.RESULTS && this.phase !== GAME_PHASES.FINISHED) {
      throw createError('INVALID_PHASE', { phase: this.phase });
    }
    if (this.round >= this.totalRounds) throw createError('NO_MORE_ROUNDS');
    return this.beginRound();
  }

  pauseRound() {
    if (this.phase !== GAME_PHASES.LIVE) throw createError('INVALID_PHASE', { phase: this.phase });
    if (this.now() > (this.closeAt || 0)) throw createError('ROUND_CLOSED');
    this.remainingMs = Math.max(0, this.endsAt - this.now());
    this.phase = GAME_PHASES.PAUSED;
    this.clearRoundTimer();
    return { remainingMs: this.remainingMs, round: this.round };
  }

  resumeRound() {
    if (this.phase !== GAME_PHASES.PAUSED) throw createError('INVALID_PHASE', { phase: this.phase });
    this.phase = GAME_PHASES.LIVE;
    this.endsAt = this.now() + this.remainingMs;
    this.closeAt = this.endsAt + GRACE_WINDOW_MS;
    this.armRoundTimer();
    return { endsAt: this.endsAt, remainingMs: this.remainingMs, round: this.round };
  }

  setRoundDuration({ roundDurationMs }) {
    if (this.phase !== GAME_PHASES.IDLE) {
      throw createError('INVALID_PHASE', { phase: this.phase, reason: 'Round duration can only be changed before the game starts.' });
    }

    const normalizedRoundDurationMs = validateRoundDurationMs(Math.round(Number(roundDurationMs)));
    this.roundDurationMs = normalizedRoundDurationMs;

    return { roundDurationMs: this.roundDurationMs };
  }

  setPurseValue({ teamId, value }) {
    if (this.isRoundInProgress()) {
      throw createError('INVALID_PHASE', { phase: this.phase, reason: 'Overrides disabled during live rounds.' });
    }
    const normalizedTeamId = String(teamId || '').trim();
    if (!normalizedTeamId || !this.teams.has(normalizedTeamId)) {
      throw createError('INVALID_TEAM', { teamId: normalizedTeamId });
    }
    if (!Number.isFinite(value) || value < 0) {
      throw createError('INVALID_CONFIG', { reason: 'Purse value must be a non-negative number.' });
    }
    const team = this.teams.get(normalizedTeamId);
    const totalInvested = Object.values(team.investments).reduce((sum, val) => sum + val, 0);
    this.teams.set(normalizedTeamId, {
      ...team,
      purse: Math.round(value),
      totalValue: Math.round(value) + totalInvested,
    });
    return { leaderboard: this.getLeaderboard(), team: this.teams.get(normalizedTeamId) };
  }

  resetGame() {
    this.clearRoundTimer();
    this.submissions = new Map();
    this.phase = GAME_PHASES.IDLE;
    this.round = 0;
    this.currentRoundData = null;
    this.lastRoundResults = null;
    this.endsAt = null;
    this.closeAt = null;
    this.remainingMs = 0;
    for (const [teamId, team] of this.teams.entries()) {
      const investments = createEmptyInvestments();
      this.teams.set(teamId, {
        ...team,
        purse: STARTING_PURSE_VALUE,
        investments,
        totalValue: STARTING_PURSE_VALUE,
      });
    }
    return this.getBaseSnapshot();
  }

  // Invest amount from purse into a company
  invest({ socketId, companyId, amount }) {
    this.assertAcceptingSubmissions();

    const teamId = this.socketToTeam.get(socketId);
    if (!teamId) throw createError('INVALID_TEAM', { reason: 'Socket not associated with an active team.' });

    const team = this.teams.get(teamId);
    if (!team || team.socketId !== socketId) throw createError('FORBIDDEN', { reason: 'Socket is not the active controller.' });

    if (!COMPANY_IDS.includes(companyId)) {
      throw createError('INVALID_COMPANY', { companyId, reason: 'Invalid company ID.' });
    }

    const investAmount = Math.max(0, Math.round(Number(amount) || 0));
    if (investAmount <= 0) {
      throw createError('INVALID_AMOUNT', { reason: 'Investment amount must be positive.' });
    }

    if (investAmount > team.purse) {
      throw createError('INSUFFICIENT_FUNDS', { purse: team.purse, requested: investAmount });
    }

    // Update investments and purse
    const newInvestments = { ...team.investments, [companyId]: (team.investments[companyId] || 0) + investAmount };
    const totalInvested = Object.values(newInvestments).reduce((sum, val) => sum + val, 0);

    this.teams.set(teamId, {
      ...team,
      purse: team.purse - investAmount,
      investments: newInvestments,
      totalValue: team.purse - investAmount + totalInvested,
    });

    return { teamId, companyId, amount: investAmount, purse: team.purse - investAmount, invested: newInvestments[companyId] };
  }

  // Withdraw amount from company back to purse
  withdraw({ socketId, companyId, amount }) {
    this.assertAcceptingSubmissions();

    const teamId = this.socketToTeam.get(socketId);
    if (!teamId) throw createError('INVALID_TEAM', { reason: 'Socket not associated with an active team.' });

    const team = this.teams.get(teamId);
    if (!team || team.socketId !== socketId) throw createError('FORBIDDEN', { reason: 'Socket is not the active controller.' });

    if (!COMPANY_IDS.includes(companyId)) {
      throw createError('INVALID_COMPANY', { companyId, reason: 'Invalid company ID.' });
    }

    const currentInvestment = team.investments[companyId] || 0;
    const withdrawAmount = Math.max(0, Math.round(Number(amount) || 0));

    if (withdrawAmount <= 0) {
      throw createError('INVALID_AMOUNT', { reason: 'Withdrawal amount must be positive.' });
    }

    if (withdrawAmount > currentInvestment) {
      throw createError('INSUFFICIENT_INVESTMENT', { companyId, invested: currentInvestment, requested: withdrawAmount });
    }

    // Update investments and purse
    const newInvestments = { ...team.investments, [companyId]: currentInvestment - withdrawAmount };
    const totalInvested = Object.values(newInvestments).reduce((sum, val) => sum + val, 0);

    this.teams.set(teamId, {
      ...team,
      purse: team.purse + withdrawAmount,
      investments: newInvestments,
      totalValue: team.purse + withdrawAmount + totalInvested,
    });

    return { teamId, companyId, amount: withdrawAmount, purse: team.purse + withdrawAmount, invested: newInvestments[companyId] };
  }

  // Submit current investments for the round (freeze them)
  submitInvestments({ socketId }) {
    this.assertAcceptingSubmissions();

    const teamId = this.socketToTeam.get(socketId);
    if (!teamId) throw createError('INVALID_TEAM', { reason: 'Socket not associated with an active team.' });

    const team = this.teams.get(teamId);
    if (!team || team.socketId !== socketId) throw createError('FORBIDDEN', { reason: 'Socket is not the active controller.' });

    if (this.submissions.has(teamId)) throw createError('ALREADY_SUBMITTED', { teamId, round: this.round });

    // Freeze current investments as the submission
    this.submissions.set(teamId, { investments: { ...team.investments }, submittedAt: this.now(), socketId });

    return { teamId, round: this.round, investments: team.investments };
  }

  // Admin can force end a round early
  forceEndRound() {
    if (this.phase !== GAME_PHASES.LIVE) {
      throw createError('INVALID_PHASE', { phase: this.phase, reason: 'Can only end round during live phase.' });
    }
    return this.evaluateRoundIfNeeded();
  }

  evaluateRoundIfNeeded() {
    if (this.phase !== GAME_PHASES.LIVE) return null;
    this.clearRoundTimer();

    const roundData = this.currentRoundData;
    const teamOutcomes = this.getLeaderboard().map((entry) => {
      const submission = this.submissions.get(entry.teamId) || null;
      const team = this.teams.get(entry.teamId);

      // Calculate returns on submitted investments (or current investments if no submission)
      const investmentsToEvaluate = submission ? submission.investments : team.investments;
      const result = evaluateInvestments(roundData, investmentsToEvaluate);

      // Returns go back to purse
      const newPurse = team.purse + result.returns;
      const totalInvested = Object.values(team.investments).reduce((sum, val) => sum + val, 0);

      this.teams.set(entry.teamId, {
        ...team,
        purse: Math.round(newPurse),
        totalValue: Math.round(newPurse) + totalInvested,
      });

      return {
        teamId: entry.teamId,
        name: entry.name,
        connected: team.connected,
        investments: investmentsToEvaluate,
        totalInvested: result.totalInvested,
        didSubmit: submission !== null,
        returns: result.returns,
        percentReturn: result.percentReturn,
        purse: Math.round(newPurse),
        totalValue: Math.round(newPurse) + totalInvested,
        breakdown: result.breakdown,
      };
    });

    const results = {
      round: this.round,
      year: roundData.year,
      yearRange: roundData.yearRange,
      title: roundData.title,
      actualReturns: roundData.yearlyReturn,
      yearEndReveal: roundData.yearEndReveal,
      teamOutcomes,
      leaderboard: this.getLeaderboard(),
    };

    this.lastRoundResults = results;
    this.phase = this.round >= this.totalRounds ? GAME_PHASES.FINISHED : GAME_PHASES.RESULTS;
    this.endsAt = null;
    this.closeAt = null;
    this.remainingMs = 0;

    return results;
  }

  armRoundTimer() {
    this.clearRoundTimer();
    const delay = Math.max(0, this.closeAt - this.now());
    this.roundTimer = this.schedule(() => {
      if (typeof this.onRoundClosed === 'function') void this.onRoundClosed();
    }, delay);
  }
}

module.exports = { GameEngine };
