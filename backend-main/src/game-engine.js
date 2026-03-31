const {
  DECISION_IGNORE,
  DECISION_TRADE,
  GAME_PHASES,
  GRACE_WINDOW_MS,
  TEAM_LIMIT,
} = require("./constants");
const { createError } = require("./errors");
const { evaluateDecision } = require("./scoring");

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

class GameEngine {
  constructor(options) {
    this.baseDeck = options.deck;
    this.roundDurationMs = options.roundDurationMs;
    this.totalRounds = options.totalRounds;
    this.auditLog = options.auditLog;
    this.now = options.now || (() => Date.now());
    this.schedule = options.schedule || setTimeout;
    this.cancel = options.cancel || clearTimeout;
    this.onRoundClosed = options.onRoundClosed || null;

    this.teams = new Map();
    this.socketToTeam = new Map();
    this.deck = [];
    this.submissions = new Map();
    this.roundTimer = null;
    this.phase = GAME_PHASES.IDLE;
    this.round = 0;
    this.currentSignal = null;
    this.endsAt = null;
    this.closeAt = null;
    this.remainingMs = 0;
    this.isShuttingDown = false;
  }

  setRoundCloseHandler(handler) {
    this.onRoundClosed = handler;
  }

  setShuttingDown(value) {
    this.isShuttingDown = Boolean(value);
  }

  dispose() {
    this.clearRoundTimer();
  }

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
      if (team.connected) {
        count += 1;
      }
    }
    return count;
  }

  getRemainingMs() {
    if (this.phase === GAME_PHASES.PAUSED) {
      return this.remainingMs;
    }

    if (this.phase !== GAME_PHASES.LIVE || !this.endsAt) {
      return 0;
    }

    return Math.max(0, this.endsAt - this.now());
  }

  getCloseAt() {
    return this.closeAt;
  }

  getLeaderboard() {
    return [...this.teams.values()]
      .map((team) => ({
        teamId: team.teamId,
        name: team.name,
        score: team.score,
        connected: team.connected,
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.name.localeCompare(right.name);
      });
  }

  getTeamSubmission(teamId) {
    const submission = teamId ? this.submissions.get(teamId) : null;
    return {
      teamId: teamId || null,
      hasSubmitted: Boolean(submission),
      decision: submission ? submission.decision : null,
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
      score: team.score,
      connected: team.connected,
      hasSubmitted: this.submissions.has(team.teamId),
      decision: this.submissions.get(team.teamId)?.decision || null,
    }));
  }

  getBaseSnapshot() {
    return {
      activeTeamsCount: this.getActiveTeamsCount(),
      currentSignal: this.currentSignal,
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
      teamSubmissions: this.getTeamStatuses().map((entry) => ({
        teamId: entry.teamId,
        name: entry.name,
        connected: entry.connected,
        hasSubmitted: entry.hasSubmitted,
        decision: entry.decision,
        score: entry.score,
      })),
    };
  }

  assertAcceptingSubmissions() {
    if (this.phase === GAME_PHASES.PAUSED) {
      throw createError("ROUND_PAUSED");
    }

    if (this.phase !== GAME_PHASES.LIVE) {
      throw createError("ROUND_NOT_ACTIVE");
    }

    if (this.now() > (this.closeAt || 0)) {
      throw createError("ROUND_CLOSED");
    }
  }

  joinTeam({ teamId, name, socketId }) {
    const normalizedTeamId = String(teamId || "").trim();
    const normalizedName = String(name || normalizedTeamId).trim();

    if (!normalizedTeamId || !normalizedName) {
      throw createError("INVALID_TEAM", { reason: "teamId and name must be non-empty strings." });
    }

    const previousTeamId = this.socketToTeam.get(socketId);
    if (previousTeamId && previousTeamId !== normalizedTeamId) {
      const previousTeam = this.teams.get(previousTeamId);
      if (previousTeam && previousTeam.socketId === socketId) {
        this.teams.set(previousTeamId, {
          ...previousTeam,
          connected: false,
          socketId: null,
        });
      }
      this.socketToTeam.delete(socketId);
    }

    const existingTeam = this.teams.get(normalizedTeamId);
    if (!existingTeam && this.teams.size >= TEAM_LIMIT) {
      throw createError("TEAM_LIMIT_REACHED", { teamLimit: TEAM_LIMIT });
    }

    const replacedSocketId = existingTeam && existingTeam.socketId !== socketId ? existingTeam.socketId : null;
    if (replacedSocketId) {
      this.socketToTeam.delete(replacedSocketId);
    }

    this.teams.set(normalizedTeamId, {
      teamId: normalizedTeamId,
      name: normalizedName,
      score: existingTeam?.score || 0,
      connected: true,
      socketId,
    });
    this.socketToTeam.set(socketId, normalizedTeamId);

    return {
      replacedSocketId,
      team: this.teams.get(normalizedTeamId),
    };
  }

  disconnectSocket(socketId) {
    const teamId = this.socketToTeam.get(socketId);
    if (!teamId) {
      return null;
    }

    const team = this.teams.get(teamId);
    if (team && team.socketId === socketId) {
      this.teams.set(teamId, {
        ...team,
        connected: false,
        socketId: null,
      });
    }

    this.socketToTeam.delete(socketId);
    return this.teams.get(teamId);
  }

  startGame() {
    if (this.isRoundInProgress()) {
      throw createError("INVALID_PHASE", { phase: this.phase });
    }

    this.clearRoundTimer();
    this.deck = shuffle(this.baseDeck).slice(0, this.totalRounds);
    this.submissions = new Map();
    this.round = 0;
    this.currentSignal = null;
    this.endsAt = null;
    this.closeAt = null;
    this.remainingMs = 0;

    for (const [teamId, team] of this.teams.entries()) {
      this.teams.set(teamId, {
        ...team,
        score: 0,
      });
    }

    return this.beginRound();
  }

  beginRound() {
    if (this.round >= this.totalRounds || this.round >= this.deck.length) {
      this.phase = GAME_PHASES.FINISHED;
      return {
        phase: this.phase,
        leaderboard: this.getLeaderboard(),
      };
    }

    this.round += 1;
    this.currentSignal = this.deck[this.round - 1];
    this.phase = GAME_PHASES.LIVE;
    this.submissions = new Map();
    this.remainingMs = this.roundDurationMs;
    this.endsAt = this.now() + this.roundDurationMs;
    this.closeAt = this.endsAt + GRACE_WINDOW_MS;
    this.armRoundTimer();

    return {
      endsAt: this.endsAt,
      round: this.round,
      signal: this.currentSignal,
    };
  }

  nextRound() {
    if (this.phase !== GAME_PHASES.RESULTS && this.phase !== GAME_PHASES.FINISHED) {
      throw createError("INVALID_PHASE", { phase: this.phase });
    }

    if (this.round >= this.totalRounds) {
      throw createError("NO_MORE_ROUNDS");
    }

    return this.beginRound();
  }

  pauseRound() {
    if (this.phase !== GAME_PHASES.LIVE) {
      throw createError("INVALID_PHASE", { phase: this.phase });
    }

    if (this.now() > (this.closeAt || 0)) {
      throw createError("ROUND_CLOSED");
    }

    this.remainingMs = Math.max(0, this.endsAt - this.now());
    this.phase = GAME_PHASES.PAUSED;
    this.clearRoundTimer();

    return {
      remainingMs: this.remainingMs,
      round: this.round,
    };
  }

  resumeRound() {
    if (this.phase !== GAME_PHASES.PAUSED) {
      throw createError("INVALID_PHASE", { phase: this.phase });
    }

    this.phase = GAME_PHASES.LIVE;
    this.endsAt = this.now() + this.remainingMs;
    this.closeAt = this.endsAt + GRACE_WINDOW_MS;
    this.armRoundTimer();

    return {
      endsAt: this.endsAt,
      remainingMs: this.remainingMs,
      round: this.round,
    };
  }

  setScore({ teamId, score }) {
    if (this.isRoundInProgress()) {
      throw createError("INVALID_PHASE", { phase: this.phase, reason: "Score overrides are disabled during live rounds." });
    }

    const normalizedTeamId = String(teamId || "").trim();
    if (!normalizedTeamId || !this.teams.has(normalizedTeamId)) {
      throw createError("INVALID_TEAM", { teamId: normalizedTeamId });
    }

    if (!Number.isFinite(score)) {
      throw createError("INVALID_CONFIG", { reason: "Score override must be numeric." });
    }

    const team = this.teams.get(normalizedTeamId);
    this.teams.set(normalizedTeamId, {
      ...team,
      score: Math.round(score),
    });

    return {
      leaderboard: this.getLeaderboard(),
      team: this.teams.get(normalizedTeamId),
    };
  }

  resetGame() {
    this.clearRoundTimer();
    this.deck = [];
    this.submissions = new Map();
    this.phase = GAME_PHASES.IDLE;
    this.round = 0;
    this.currentSignal = null;
    this.endsAt = null;
    this.closeAt = null;
    this.remainingMs = 0;

    for (const [teamId, team] of this.teams.entries()) {
      this.teams.set(teamId, {
        ...team,
        score: 0,
      });
    }

    return this.getBaseSnapshot();
  }

  submitDecision({ socketId, decision }) {
    const normalizedDecision = String(decision || "").trim().toUpperCase();
    if (![DECISION_TRADE, DECISION_IGNORE].includes(normalizedDecision)) {
      throw createError("INVALID_DECISION", { decision });
    }

    this.assertAcceptingSubmissions();

    const teamId = this.socketToTeam.get(socketId);
    if (!teamId) {
      throw createError("INVALID_TEAM", { reason: "Socket is not associated with an active team." });
    }

    const team = this.teams.get(teamId);
    if (!team || team.socketId !== socketId) {
      throw createError("FORBIDDEN", { reason: "Socket is not the active controller for this team." });
    }

    if (this.submissions.has(teamId)) {
      throw createError("ALREADY_SUBMITTED", { teamId, round: this.round });
    }

    this.submissions.set(teamId, {
      decision: normalizedDecision,
      socketId,
      submittedAt: this.now(),
    });

    return {
      decision: normalizedDecision,
      round: this.round,
      teamId,
    };
  }

  evaluateRoundIfNeeded() {
    if (this.phase !== GAME_PHASES.LIVE) {
      return null;
    }

    this.clearRoundTimer();

    const teamOutcomes = this.getLeaderboard().map((team) => {
      const submission = this.submissions.get(team.teamId) || null;
      const evaluation = evaluateDecision(this.currentSignal, submission);
      const updatedTeam = {
        ...this.teams.get(team.teamId),
        score: this.teams.get(team.teamId).score + evaluation.delta,
      };

      this.teams.set(team.teamId, updatedTeam);

      return {
        teamId: team.teamId,
        name: team.name,
        connected: updatedTeam.connected,
        decision: submission?.decision || null,
        delta: evaluation.delta,
        score: updatedTeam.score,
        verdict: evaluation.verdict,
      };
    });

    this.phase = this.round >= this.totalRounds ? GAME_PHASES.FINISHED : GAME_PHASES.RESULTS;
    this.endsAt = null;
    this.closeAt = null;
    this.remainingMs = 0;

    return {
      leaderboard: this.getLeaderboard(),
      round: this.round,
      signal: this.currentSignal,
      teamOutcomes,
    };
  }

  armRoundTimer() {
    this.clearRoundTimer();
    const delay = Math.max(0, this.closeAt - this.now());
    this.roundTimer = this.schedule(() => {
      if (typeof this.onRoundClosed === "function") {
        void this.onRoundClosed();
      }
    }, delay);
  }
}

module.exports = {
  GameEngine,
};
