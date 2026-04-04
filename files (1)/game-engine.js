const {
  GAME_PHASES,
  GRACE_WINDOW_MS,
  STARTING_PORTFOLIO_VALUE,
  TEAM_LIMIT,
} = require('./constants');
const { createError } = require('./errors');
const { evaluatePortfolio } = require('./scoring');

class GameEngine {
  constructor(options) {
    this.rounds = options.rounds; // full game data array
    this.roundDurationMs = options.roundDurationMs;
    this.totalRounds = options.totalRounds;
    this.auditLog = options.auditLog;
    this.now = options.now || (() => Date.now());
    this.schedule = options.schedule || setTimeout;
    this.cancel = options.cancel || clearTimeout;
    this.onRoundClosed = options.onRoundClosed || null;

    this.teams = new Map();
    this.socketToTeam = new Map();
    this.submissions = new Map(); // teamId → { allocation: {...}, submittedAt }
    this.roundTimer = null;
    this.phase = GAME_PHASES.IDLE;
    this.round = 0; // 1-indexed when live
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
        portfolioValue: team.portfolioValue,
        connected: team.connected,
      }))
      .sort((a, b) => {
        if (b.portfolioValue !== a.portfolioValue) return b.portfolioValue - a.portfolioValue;
        return a.name.localeCompare(b.name);
      });
  }

  getTeamSubmission(teamId) {
    const submission = teamId ? this.submissions.get(teamId) : null;
    return {
      teamId: teamId || null,
      hasSubmitted: Boolean(submission),
      allocation: submission ? submission.allocation : null,
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
      portfolioValue: team.portfolioValue,
      connected: team.connected,
      hasSubmitted: this.submissions.has(team.teamId),
      allocation: this.submissions.get(team.teamId)?.allocation || null,
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
      totalRounds: this.totalRounds,
    };
  }

  getSnapshotForViewer(socketData = {}) {
    const base = this.getBaseSnapshot();
    if (socketData.isAdmin) {
      return {
        ...base,
        auditLog: this.auditLog.list(),
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

    this.teams.set(normalizedTeamId, {
      teamId: normalizedTeamId,
      name: normalizedName,
      portfolioValue: existingTeam?.portfolioValue ?? STARTING_PORTFOLIO_VALUE,
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
    if (this.isRoundInProgress()) throw createError('INVALID_PHASE', { phase: this.phase });
    this.clearRoundTimer();
    this.submissions = new Map();
    this.round = 0;
    this.currentRoundData = null;
    this.lastRoundResults = null;
    this.endsAt = null;
    this.closeAt = null;
    this.remainingMs = 0;

    for (const [teamId, team] of this.teams.entries()) {
      this.teams.set(teamId, { ...team, portfolioValue: STARTING_PORTFOLIO_VALUE });
    }

    return this.beginRound();
  }

  beginRound() {
    if (this.round >= this.totalRounds) {
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

  setPortfolioValue({ teamId, value }) {
    if (this.isRoundInProgress()) {
      throw createError('INVALID_PHASE', { phase: this.phase, reason: 'Overrides disabled during live rounds.' });
    }
    const normalizedTeamId = String(teamId || '').trim();
    if (!normalizedTeamId || !this.teams.has(normalizedTeamId)) {
      throw createError('INVALID_TEAM', { teamId: normalizedTeamId });
    }
    if (!Number.isFinite(value) || value < 0) {
      throw createError('INVALID_CONFIG', { reason: 'Portfolio value must be a non-negative number.' });
    }
    const team = this.teams.get(normalizedTeamId);
    this.teams.set(normalizedTeamId, { ...team, portfolioValue: Math.round(value) });
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
      this.teams.set(teamId, { ...team, portfolioValue: STARTING_PORTFOLIO_VALUE });
    }
    return this.getBaseSnapshot();
  }

  submitAllocation({ socketId, allocation }) {
    this.assertAcceptingSubmissions();

    const teamId = this.socketToTeam.get(socketId);
    if (!teamId) throw createError('INVALID_TEAM', { reason: 'Socket not associated with an active team.' });

    const team = this.teams.get(teamId);
    if (!team || team.socketId !== socketId) throw createError('FORBIDDEN', { reason: 'Socket is not the active controller.' });

    if (this.submissions.has(teamId)) throw createError('ALREADY_SUBMITTED', { teamId, round: this.round });

    this.submissions.set(teamId, { allocation, submittedAt: this.now(), socketId });

    return { teamId, round: this.round, allocation };
  }

  evaluateRoundIfNeeded() {
    if (this.phase !== GAME_PHASES.LIVE) return null;
    this.clearRoundTimer();

    const roundData = this.currentRoundData;
    const teamOutcomes = this.getLeaderboard().map((entry) => {
      const submission = this.submissions.get(entry.teamId) || null;
      const team = this.teams.get(entry.teamId);
      const result = evaluatePortfolio(roundData, submission?.allocation ?? null, team.portfolioValue);

      this.teams.set(entry.teamId, { ...team, portfolioValue: result.newValue });

      return {
        teamId: entry.teamId,
        name: entry.name,
        connected: team.connected,
        allocation: submission?.allocation || null,
        didSubmit: result.didSubmit,
        delta: result.delta,
        percentReturn: result.percentReturn,
        portfolioValue: result.newValue,
        breakdown: result.breakdown,
      };
    });

    // Include the actual returns and reveals now that round is over
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
