const { AuditLog } = require("../src/audit-log");
const defaultRounds = require("../src/data/portfolio-game.json");
const { GAME_PHASES, GRACE_WINDOW_MS } = require("../src/constants");
const { GameEngine } = require("../src/game-engine");

function blankInvestments(overrides = {}) {
  return {
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    e: 0,
    f: 0,
    ...overrides,
  };
}

function createEngine(options = {}) {
  return new GameEngine({
    auditLog: new AuditLog(20, { info() {} }),
    roundDurationMs: options.roundDurationMs ?? 1000,
    rounds: defaultRounds,
    totalRounds: options.totalRounds ?? 2,
  });
}

describe("game engine timers and state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the round-close handler once after round duration plus grace window", async () => {
    const engine = createEngine({ roundDurationMs: 1000, totalRounds: 1 });
    const onRoundClosed = vi.fn(() => engine.evaluateRoundIfNeeded());
    engine.setRoundCloseHandler(onRoundClosed);
    engine.joinTeam({ name: "Team 1", socketId: "socket-1", teamId: "team-1" });

    engine.startGame();

    await vi.advanceTimersByTimeAsync(999 + GRACE_WINDOW_MS);
    expect(onRoundClosed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onRoundClosed).toHaveBeenCalledTimes(1);
    expect(engine.phase).toBe(GAME_PHASES.FINISHED);
  });

  it("pauses and resumes without double-firing the round close handler", async () => {
    const engine = createEngine({ roundDurationMs: 1000, totalRounds: 1 });
    const onRoundClosed = vi.fn(() => engine.evaluateRoundIfNeeded());
    engine.setRoundCloseHandler(onRoundClosed);

    engine.startGame();
    await vi.advanceTimersByTimeAsync(250);

    const paused = engine.pauseRound();
    expect(engine.phase).toBe(GAME_PHASES.PAUSED);
    expect(paused.remainingMs).toBe(750);

    await vi.advanceTimersByTimeAsync(5000);
    expect(onRoundClosed).not.toHaveBeenCalled();

    engine.resumeRound();
    expect(engine.phase).toBe(GAME_PHASES.LIVE);

    await vi.advanceTimersByTimeAsync(749 + GRACE_WINDOW_MS);
    expect(onRoundClosed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onRoundClosed).toHaveBeenCalledTimes(1);
  });

  it("tracks submission status in snapshots for reconnects", () => {
    const engine = createEngine({ roundDurationMs: 1000, totalRounds: 1 });

    engine.joinTeam({ name: "Team 1", socketId: "socket-1", teamId: "team-1" });
    engine.startGame();
    engine.invest({ amount: 5000, companyId: "a", socketId: "socket-1" });
    engine.submitInvestments({ socketId: "socket-1" });
    engine.disconnectSocket("socket-1");
    engine.joinTeam({ name: "Team 1", socketId: "socket-2", teamId: "team-1" });

    const snapshot = engine.getSnapshotForViewer({ teamId: "team-1" });

    expect(snapshot.viewerSubmission).toEqual({
      canSubmit: false,
      hasSubmitted: true,
      investments: blankInvestments({ a: 5000 }),
      teamId: "team-1",
    });
  });

  it("updates the round duration only while idle and keeps it after reset", () => {
    const engine = createEngine({ roundDurationMs: 1000, totalRounds: 1 });

    expect(engine.setRoundDuration({ roundDurationMs: 4500 })).toEqual({ roundDurationMs: 4500 });
    expect(engine.getBaseSnapshot().roundDurationMs).toBe(4500);

    engine.startGame();

    let thrownError;
    try {
      engine.setRoundDuration({ roundDurationMs: 5000 });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError.code).toBe("INVALID_PHASE");

    engine.forceEndRound();
    engine.resetGame();
    expect(engine.getBaseSnapshot().roundDurationMs).toBe(4500);
  });

  it("force ends a round once and prevents the timer from resolving again later", async () => {
    const engine = createEngine({ roundDurationMs: 1000, totalRounds: 1 });
    const onRoundClosed = vi.fn(() => engine.evaluateRoundIfNeeded());
    engine.setRoundCloseHandler(onRoundClosed);
    engine.joinTeam({ name: "Team 1", socketId: "socket-1", teamId: "team-1" });

    engine.startGame();
    const results = engine.forceEndRound();

    expect(results.round).toBe(1);
    expect(engine.phase).toBe(GAME_PHASES.FINISHED);

    let thrownError;
    try {
      engine.submitInvestments({ socketId: "socket-1" });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError.code).toBe("ROUND_NOT_ACTIVE");

    await vi.advanceTimersByTimeAsync(1000 + GRACE_WINDOW_MS + 1);
    expect(onRoundClosed).not.toHaveBeenCalled();
  });
});
