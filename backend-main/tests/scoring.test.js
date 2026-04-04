const defaultRounds = require("../src/data/portfolio-game.json");
const { evaluateInvestments } = require("../src/scoring");

describe("portfolio scoring", () => {
  it("calculates returns and percentages from invested amounts", () => {
    const round = defaultRounds[0];
    const result = evaluateInvestments(round, {
      reliance: 1000,
      hdfc_bank: 2000,
      infosys: 0,
      yes_bank: 3000,
      byjus: 0,
      adani: 4000,
    });

    expect(result).toEqual({
      returns: 2580,
      totalInvested: 10000,
      percentReturn: 25.8,
      breakdown: {
        reliance: { invested: 1000, yearlyReturn: 0.12, returns: 120 },
        hdfc_bank: { invested: 2000, yearlyReturn: 0.28, returns: 560 },
        infosys: { invested: 0, yearlyReturn: 0.1, returns: 0 },
        yes_bank: { invested: 3000, yearlyReturn: 0.42, returns: 1260 },
        byjus: { invested: 0, yearlyReturn: 0.75, returns: 0 },
        adani: { invested: 4000, yearlyReturn: 0.16, returns: 640 },
      },
    });
  });
});
