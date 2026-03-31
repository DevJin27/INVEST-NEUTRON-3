const defaultDeck = require("../src/data/signals.json");
const { loadConfig, validateSignalDeck } = require("../src/validation");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("startup validation", () => {
  it("accepts the bundled signal deck", () => {
    expect(validateSignalDeck(defaultDeck)).toHaveLength(30);
  });

  it("rejects missing ADMIN_SECRET", () => {
    let thrownError;

    try {
      loadConfig({ PORT: "0", TOTAL_ROUNDS: "3" }, defaultDeck.length);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError.code).toBe("INVALID_CONFIG");
    expect(thrownError.details.name).toBe("ADMIN_SECRET");
  });

  it("rejects invalid TOTAL_ROUNDS above deck size", () => {
    let thrownError;

    try {
      loadConfig(
        {
          ADMIN_SECRET: "secret",
          PORT: "0",
          ROUND_DURATION_MS: "1000",
          TOTAL_ROUNDS: "31",
        },
        defaultDeck.length
      );
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError.code).toBe("INVALID_CONFIG");
    expect(thrownError.details.name).toBe("TOTAL_ROUNDS");
  });

  it("rejects signal values outside the allowed range", () => {
    const invalidDeck = clone(defaultDeck);
    invalidDeck[0].value = 50;

    let thrownError;
    try {
      validateSignalDeck(invalidDeck);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError.code).toBe("INVALID_SIGNAL_DECK");
    expect(thrownError.details.signalId).toBe("s1");
  });
});
