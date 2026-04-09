function evaluateInvestments(roundData, investments) {
  const returns = roundData.yearlyReturn;

  let totalReturns = 0;
  let totalInvested = 0;
  const breakdown = {};

  for (const companyId of Object.keys(returns)) {
    const amount = investments[companyId] || 0;
    const companyReturn = returns[companyId];
    const companyReturns = Math.round(amount * companyReturn);

    totalReturns += companyReturns;
    totalInvested += amount;
    breakdown[companyId] = {
      invested: amount,
      returns: companyReturns,
      yearlyReturn: companyReturn,
    };
  }

  const percentReturn = totalInvested > 0
    ? Math.round((totalReturns / totalInvested) * 10000) / 100
    : 0;

  return {
    breakdown,
    percentReturn,
    returns: totalReturns,
    totalInvested,
  };
}

module.exports = { evaluateInvestments };
