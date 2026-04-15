const defaultRounds = require("../src/data/portfolio-game.json");
const { evaluateInvestments } = require("../src/scoring");

describe("portfolio scoring", () => {
  it("calculates returns and percentages from invested amounts", () => {
    const round = defaultRounds[0];
    const result = evaluateInvestments(round, {
      a: 1000,
      b: 2000,
      c: 0,
      d: 3000,
      e: 0,
      f: 4000,
    });

    expect(result).toEqual({
      returns: 390,
      totalInvested: 10000,
      percentReturn: 3.9,
      breakdown: {
        a: { invested: 1000, yearlyReturn: -0.05, returns: -50 },
        b: { invested: 2000, yearlyReturn: 0.12, returns: 240 },
        c: { invested: 0, yearlyReturn: -0.04, returns: 0 },
        d: { invested: 3000, yearlyReturn: 0.08, returns: 240 },
        e: { invested: 0, yearlyReturn: 0.02, returns: 0 },
        f: { invested: 4000, yearlyReturn: -0.01, returns: -40 },
      },
    });
  });
});
