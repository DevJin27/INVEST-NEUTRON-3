const {
  DECISION_IGNORE,
  DECISION_TRADE,
  SIGNAL_TYPE_ALPHA,
  SIGNAL_TYPE_NOISE,
} = require("./constants");

function evaluateDecision(signal, submission) {
  const decision = submission ? submission.decision : null;

  if (signal.type === SIGNAL_TYPE_ALPHA) {
    if (decision === DECISION_TRADE) {
      return { delta: signal.value, verdict: "correct-alpha" };
    }

    return { delta: -100, verdict: decision === DECISION_IGNORE ? "missed-alpha" : "no-response-alpha" };
  }

  if (signal.type === SIGNAL_TYPE_NOISE) {
    if (decision === DECISION_IGNORE) {
      return { delta: 100, verdict: "correct-ignore" };
    }

    if (decision === DECISION_TRADE) {
      return { delta: -Math.round(signal.value * 0.65), verdict: "false-trade" };
    }

    return { delta: 0, verdict: "no-response-noise" };
  }

  return { delta: 0, verdict: "unknown" };
}

module.exports = {
  evaluateDecision,
};
