/**
 * Evaluates a team's investments against a round's actual returns.
 *
 * @param {object} roundData - The current round object from portfolio-game.json
 * @param {object} investments - { reliance: 5000, hdfc_bank: 3000, ... } amounts invested
 * @returns {{ returns: number, totalInvested: number, percentReturn: number, breakdown: object }}
 */
function evaluateInvestments(roundData, investments) {
  const returns = roundData.yearlyReturn;

  let totalReturns = 0;
  let totalInvested = 0;
  const breakdown = {};

  for (const companyId of Object.keys(returns)) {
    const amount = investments[companyId] || 0;
    const companyReturn = returns[companyId]; // e.g., 0.15 for 15%

    const companyReturns = Math.round(amount * companyReturn);
    totalReturns += companyReturns;
    totalInvested += amount;

    breakdown[companyId] = {
      invested: amount,
      yearlyReturn: companyReturn,
      returns: companyReturns,
    };
  }

  const percentReturn = totalInvested > 0 ? Math.round((totalReturns / totalInvested) * 10000) / 100 : 0;

  return {
    returns: totalReturns,
    totalInvested,
    percentReturn,
    breakdown,
  };
}

module.exports = { evaluateInvestments };
