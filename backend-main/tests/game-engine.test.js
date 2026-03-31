const { AuditLog } = require("../src/audit-log");
const { GAME_PHASES, GRACE_WINDOW_MS } = require("../src/constants");
const defaultDeck = require("../src/data/signals.json");
const { GameEngine } = require("../src/game-engine");

function createEngine(options = {}) {
  return new GameEngine({
    auditLog: new AuditLog(20, { info() {} }),
    deck: defaultDeck,
    roundDurationMs: options.roundDurationMs || 1000,
    totalRounds: options.totalRounds || 2,
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
    engine.submitDecision({ decision: "TRADE", socketId: "socket-1" });
    engine.disconnectSocket("socket-1");
    engine.joinTeam({ name: "Team 1", socketId: "socket-2", teamId: "team-1" });

    const snapshot = engine.getSnapshotForViewer({ teamId: "team-1" });

    expect(snapshot.viewerSubmission).toEqual({
      canSubmit: false,
      decision: "TRADE",
      hasSubmitted: true,
      teamId: "team-1",
    });
  });
});
