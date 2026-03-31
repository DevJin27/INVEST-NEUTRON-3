const { DECISION_IGNORE, DECISION_TRADE, SIGNAL_TYPE_ALPHA, SIGNAL_TYPE_NOISE } = require("../src/constants");
const { evaluateDecision } = require("../src/scoring");

describe("score evaluation", () => {
  it("applies the full scoring matrix", () => {
    const alphaSignal = { type: SIGNAL_TYPE_ALPHA, value: 700 };
    const noiseSignal = { type: SIGNAL_TYPE_NOISE, value: 700 };

    expect(evaluateDecision(alphaSignal, { decision: DECISION_TRADE })).toEqual({
      delta: 700,
      verdict: "correct-alpha",
    });
    expect(evaluateDecision(alphaSignal, { decision: DECISION_IGNORE })).toEqual({
      delta: -100,
      verdict: "missed-alpha",
    });
    expect(evaluateDecision(alphaSignal, null)).toEqual({
      delta: -100,
      verdict: "no-response-alpha",
    });

    expect(evaluateDecision(noiseSignal, { decision: DECISION_IGNORE })).toEqual({
      delta: 100,
      verdict: "correct-ignore",
    });
    expect(evaluateDecision(noiseSignal, { decision: DECISION_TRADE })).toEqual({
      delta: -455,
      verdict: "false-trade",
    });
    expect(evaluateDecision(noiseSignal, null)).toEqual({
      delta: 0,
      verdict: "no-response-noise",
    });
  });
});
