const crypto = require("node:crypto");

const { GameService } = require("../app/services/game-service");
const { createInitialState } = require("../app/models/game-state");
const defaultRounds = require("../src/data/portfolio-game.json");

function createLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

function createFakeStore(initialState) {
  return {
    state: initialState,
    async connect() {},
    async disconnect() {},
    async getState() {
      return this.state;
    },
    async initialize(initialValue) {
      if (!this.state) {
        this.state = initialValue;
      }
    },
    async setState(nextState) {
      this.state = JSON.parse(JSON.stringify(nextState));
      return this.state;
    },
    async withLock(handler) {
      return handler();
    },
  };
}

describe("GameService.initialize", () => {
  it("reseed stale persisted state when the deck version or round count changes", async () => {
    const gameDataVersion = crypto.createHash("sha256").update(JSON.stringify(defaultRounds)).digest("hex");
    const config = {
      gameDataVersion,
      roundDurationMs: 120,
      totalRounds: 6,
    };

    const staleState = createInitialState({
      ...config,
      gameDataVersion: "stale-version",
      totalRounds: 3,
    });

    const store = createFakeStore(staleState);
    const logger = createLogger();
    const service = new GameService({
      config,
      logger,
      rounds: defaultRounds,
      store,
    });

    await service.initialize();

    expect(store.state.gameDataVersion).toBe(gameDataVersion);
    expect(store.state.totalRounds).toBe(6);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][1]).toContain("resetting persisted game state");
  });
});
