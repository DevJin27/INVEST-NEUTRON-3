/**
 * Evaluates a team's portfolio allocation against a round's actual returns.
 *
 * @param {object} roundData  - The current round object from portfolio-game.json
 * @param {object|null} allocation - { reliance: 40, hdfc_bank: 30, ... } summing to 100
 *                                    null means the team did not submit
 * @param {number} currentPortfolioValue - team's current portfolio value before this round
 * @returns {{ newValue: number, delta: number, percentReturn: number, breakdown: object }}
 */
function evaluatePortfolio(roundData, allocation, currentPortfolioValue) {
  const returns = roundData.yearlyReturn;

  // Default allocation: all cash (0% return) if no submission
  const effectiveAllocation = allocation ?? {};

  let weightedReturn = 0;
  const breakdown = {};

  for (const companyId of Object.keys(returns)) {
    const percent = effectiveAllocation[companyId] ?? 0;
    const companyReturn = returns[companyId];
    const contribution = (percent / 100) * companyReturn;
    weightedReturn += contribution;
    breakdown[companyId] = {
      percent,
      yearlyReturn: companyReturn,
      contribution: Math.round(contribution * 10000) / 10000,
    };
  }

  const delta = Math.round(currentPortfolioValue * weightedReturn);
  const newValue = currentPortfolioValue + delta;
  const percentReturn = Math.round(weightedReturn * 10000) / 100; // e.g. 12.34%

  return {
    newValue: Math.max(0, newValue),
    delta,
    percentReturn,
    breakdown,
    didSubmit: allocation !== null,
  };
}

module.exports = { evaluatePortfolio };
