const defaultRounds = require("../src/data/portfolio-game.json");
const { loadConfig, validateGameData } = require("../src/validation");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("startup validation", () => {
  it("accepts the bundled portfolio game data", () => {
    expect(validateGameData(defaultRounds)).toHaveLength(6);
  });

  it("rejects missing ADMIN_SECRET", () => {
    let thrownError;

    try {
      loadConfig({ PORT: "0" });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError.code).toBe("INVALID_CONFIG");
    expect(thrownError.details.name).toBe("ADMIN_SECRET");
  });

  it("rejects invalid ROUND_DURATION_MS above the allowed maximum", () => {
    let thrownError;

    try {
      loadConfig(
        {
          ADMIN_SECRET: "secret",
          PORT: "0",
          ROUND_DURATION_MS: "3600001",
        }
      );
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError.code).toBe("INVALID_CONFIG");
    expect(thrownError.details.name).toBe("ROUND_DURATION_MS");
  });

  it("normalizes configured CORS origins when loading config", () => {
    const config = loadConfig({
      ADMIN_SECRET: "secret",
      PORT: "0",
      CORS_ORIGINS: " https://invest-neutron-3.vercel.app/ , https://preview.example.com/path ",
    });

    expect(config.corsOrigins).toEqual([
      "https://invest-neutron-3.vercel.app",
      "https://preview.example.com",
    ]);
  });

  it("rejects rounds with unknown companies", () => {
    const invalidRounds = clone(defaultRounds);
    invalidRounds[0].companies[0].id = "unknown-co";

    let thrownError;
    try {
      validateGameData(invalidRounds);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError.code).toBe("INVALID_SIGNAL_DECK");
    expect(thrownError.details.reason).toContain("Unknown company id");
  });
});
