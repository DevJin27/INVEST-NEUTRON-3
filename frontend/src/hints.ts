import type { CompanyId } from './types'

export type HintEntry = {
  companyId: CompanyId
  roundId: string
  hints: string[]
}

// Each entry has 2–4 hints from the perspective of a veteran market observer.
// Never prescriptive — always gives a frame for thinking.
export const HINT_LIBRARY: HintEntry[] = [
  // ── Round 1: 2028 ──
  {
    companyId: 'a',
    roundId: 'round-1',
    hints: [
      "Infrastructure leaders always move first. When they're expanding, it's not experimentation — it's reconnaissance.",
      "Orbital capacity is the cash engine. The real question is what they're doing with that cash.",
      "Space infrastructure disruption looked impossible five years ago. That's usually when it's worth paying attention.",
    ],
  },
  {
    companyId: 'b',
    roundId: 'round-1',
    hints: [
      "Low default rates when credit is tight almost always means someone is taking risks the headline doesn't show you.",
      "Trust is their moat — built over years and can disappear overnight. That's always the point.",
      "Tier-2 expansion means tomorrow's market is their customer today.",
    ],
  },
  {
    companyId: 'c',
    roundId: 'round-1',
    hints: [
      "Leadership drift at a tech company is expensive. Clients notice when the top floor is distracted.",
      "The compute cuts hurt, but a massive cash pile buys patience. What matters is what they do with the next 18 months.",
      "Demand signals are real but need verified. The underlying momentum in distributed computing isn't going anywhere.",
    ],
  },
  {
    companyId: 'd',
    roundId: 'round-1',
    hints: [
      "35% growth in mobility almost always means someone is taking risks the headline doesn't show you.",
      "The founder is brilliant. The question is always: what's behind the curtain?",
      "When capacity looks too good to be true in a tight supply environment, it usually is.",
    ],
  },
  {
    companyId: 'e',
    roundId: 'round-1',
    hints: [
      "Distributed commerce in 2028 was a leap of faith. Grid-based commerce at this scale — either too ambitious or exactly right.",
      "Top-tier venture firms don't lead a funding round without conviction. But conviction isn't the same as a business model.",
      "The unit economics of commerce only work at scale. The question is whether they can survive long enough to reach it.",
    ],
  },
  {
    companyId: 'f',
    roundId: 'round-1',
    hints: [
      "Energy companies live and die by supply contracts. Infrastructure tailwinds are real but they can reverse.",
      "Grid expansion + storage = a leveraged bet on global energy transition. Accurate bet, but a leveraged one.",
      "The efficiency story is about innovation and scale. Both are hard to replicate.",
    ],
  },

  // ── Round 2: 2030 ──
  {
    companyId: 'a',
    roundId: 'round-2',
    hints: [
      "Launch manifests are not rumors. They're reconnaissance operations.",
      "Every telecom player globally is exposed if orbital becomes cheaper. That's not FUD — that's physics.",
      "The market is muted because no one believes it yet. That's often when the opportunity is largest.",
    ],
  },
  {
    companyId: 'b',
    roundId: 'round-2',
    hints: [
      "Years of trust isn't marketing — it's compounding institutional credibility. That's a moat.",
      "Digital penetration growth means they're not just legacy anymore. Digital transition done quietly.",
      "Best-in-class management tends to stay best-in-class. There are no surprises here — which is exactly the point.",
    ],
  },
  {
    companyId: 'c',
    roundId: 'round-2',
    hints: [
      "When demand accelerates globally, even distracted players benefit from a rising tide.",
      "Uncertainty creates discount. If the uncertainty resolves, the underlying business is still very much intact.",
      "Compute demand is structural. That's not noise — that's the actual business.",
    ],
  },
  {
    companyId: 'd',
    roundId: 'round-2',
    hints: [
      "Regulatory scrutiny is not a routine letter. They don't send those when everything is fine.",
      "Mobility growth looks euphoric. Euphoric growth in logistics often means someone is cutting corners.",
      "Institutional investors watching closely is different from institutional investors quietly exiting. Yet.",
    ],
  },
  {
    companyId: 'e',
    roundId: 'round-2',
    hints: [
      "Million-user scale is real. But revenue per user matters more — and that's not in the press release.",
      "Top-tier funds don't usually disagree on conviction bets. This is as close to consensus VC as you get.",
      "Celebrity backing is a signal, not a catalyst. Ask what happens when they stop backing.",
    ],
  },
  {
    companyId: 'f',
    roundId: 'round-2',
    hints: [
      "Grid expansion is an extraordinary win. But operating grids is very different from building them.",
      "Leverage rising sharply alongside capacity is a pattern I've seen before. The question is always: can revenue outpace interest?",
      "Government as the primary client means the cashflows are predictable until they aren't.",
    ],
  },

  // ── Round 3: 2032 ──
  {
    companyId: 'a',
    roundId: 'round-3',
    hints: [
      "Capacity is not a trial — it's infrastructure-scale deployment. This is dominance territory.",
      "Orbital + computing + distribution. Name another company building three dominant businesses simultaneously.",
      "Fiber for last-mile means the entire chain. This is truly infrastructure-scale ambition.",
    ],
  },
  {
    companyId: 'b',
    roundId: 'round-3',
    hints: [
      "A merger sounds complex, but the logic is clean: one balance sheet, lower funding costs.",
      "Short-term uncertainty is real. Long-term, combining complementary franchises is formidable.",
      "Merger risk on a franchise this strong is a speed bump, not a wall.",
    ],
  },
  {
    companyId: 'c',
    roundId: 'round-3',
    hints: [
      "Leadership changes are painful but temporary. The client list is not temporary.",
      "When the board is fighting publicly, value is usually being destroyed for no fundamental reason.",
      "The order book remains massive. That's not noise — that's the actual business.",
    ],
  },
  {
    companyId: 'd',
    roundId: 'round-3',
    hints: [
      "Regulator concern is extraordinary. I've seen this movie before — it doesn't end well for shareholders.",
      "NPA emerging officially means the actual number is materially larger than what was reported.",
      "When institutional investors are 'quietly exiting', they're not quietly exiting. They're sprinting.",
    ],
  },
  {
    companyId: 'e',
    roundId: 'round-3',
    hints: [
      "A billion-dollar valuation in commerce requires perfect execution for years. Not impossible — but price it accordingly.",
      "Top-tier funding gives credibility, not revenue. Revenue is what matters.",
      "International expansion before the model is proven is usually how capital gets burned.",
    ],
  },
  {
    companyId: 'f',
    roundId: 'round-3',
    hints: [
      "Solar + thermal + storage + distribution. At what point does complexity become a liability?",
      "Debt mounting at the asset level isn't unusual for energy. The question is debt serviceability when commodity prices turn.",
      "Government contracts are sticky until elections change the calculus.",
    ],
  },

  // ── Round 4: 2034 ──
  {
    companyId: 'a',
    roundId: 'round-4',
    hints: [
      "Rival tech giants both putting billions in the same quarter is not coincidence. That's the world buying a future.",
      "Net-debt free + massive capital raises. A company preparing for something large. Pay attention.",
      "Orbital + cloud backbone + retail ecosystem. This isn't just a company anymore — it's infrastructure.",
    ],
  },
  {
    companyId: 'b',
    roundId: 'round-4',
    hints: [
      "Moratorium is masking real issues. The question is what remains when the mask comes off.",
      "Digital penetration surge is meaningful. This isn't going to be disrupted — it's becoming the disruptor.",
      "Prudence in tough times is worth a premium.",
    ],
  },
  {
    companyId: 'c',
    roundId: 'round-4',
    hints: [
      "Multi-billion compute deals. That's transformation-scale commitment, not just headlines.",
      "WFH proving tech outsourcing durability is the most valuable result of crisis.",
      "Double-digit guidance upgrade during uncertainty tells you where compute is headed.",
    ],
  },
  {
    companyId: 'd',
    roundId: 'round-4',
    hints: [
      "When regulators have to step in directly, shareholders are the last priority. They're always the last priority.",
      "Recovery is a process. It's always a very long process.",
      "The question isn't how — the question is whether there's any recovery case at all.",
    ],
  },
  {
    companyId: 'e',
    roundId: 'round-4',
    hints: [
      "Massive user growth is genuine. But are these paying users? That's the only question that matters.",
      "Billion-dollar valuation requires every single bet to pay off for the next decade.",
      "The risk with boom-driven growth is that it creates expectations that can't survive normalcy.",
    ],
  },
  {
    companyId: 'f',
    roundId: 'round-4',
    hints: [
      "Major renewable capacity wins are genuinely extraordinary. Energy transition is real.",
      "Up 100% in a year means the market is pricing in perfect execution. You're paying today for many years of delivery.",
      "The story is compelling. Just remember that debt + equity performance at this rate rarely sustains simultaneously.",
    ],
  },

  // ── Round 5: 2036 ──
  {
    companyId: 'a',
    roundId: 'round-5',
    hints: [
      "Subsidiary IPO pipeline means the parent is letting the market price pieces separately. Usually value-accretive.",
      "+22% when tech peers are down tells you something about the quality of the business.",
      "Parent + subsidiary arbitrage is a disciplined capital strategy.",
    ],
  },
  {
    companyId: 'b',
    roundId: 'round-5',
    hints: [
      "Integration is genuinely painful for 12–18 months. This is known. Patience is required.",
      "Margin pressure is temporary. The franchise doesn't change.",
      "+5% in a flat market is underperformance on paper, outperformance on risk adjustment.",
    ],
  },
  {
    companyId: 'c',
    roundId: 'round-5',
    hints: [
      "Global deals accelerating. Attrition is a problem; it's also a market signal about where talent wants to go.",
      "Buybacks at this scale are saying: we have more cash than near-term opportunities. That's honest.",
      "The steady compounder keeps compounding because management doesn't get distracted by trends.",
    ],
  },
  {
    companyId: 'd',
    roundId: 'round-5',
    hints: [
      "Fresh capital raise is a first positive signal in years. But recovery from distress takes time to compound.",
      "Management's turnaround is real but measured. Solvency before profitability is the right sequence.",
      "Recovery from the depths. The question is whether the fundamentals are truly clean.",
    ],
  },
  {
    companyId: 'e',
    roundId: 'round-5',
    hints: [
      "Auditor concerns and operational issues at a high-valued company are not minor. They're signals of deeper problems.",
      "Multiple acquisitions done at speed rarely integrate cleanly under duress.",
      "Down in a downturn is not a bottom — it's the beginning of price discovery.",
    ],
  },
  {
    companyId: 'f',
    roundId: 'round-5',
    hints: [
      "When a stock is up 1000% and scrutiny arrives, the question isn't if — it's when.",
      "Rapid wealth accumulation from leverage. I've seen this before — leverage amplifies everything.",
      "The credibility premium is entirely dependent on policy continuity.",
    ],
  },

  // ── Round 6: 2038 ──
  {
    companyId: 'a',
    roundId: 'round-6',
    hints: [
      "Succession planning done publicly is institutional maturity. Building a dynasty, not a trading position.",
      "+18% in uncertain geopolitics is compounding in the truest sense.",
      "Infrastructure IPO at scale is not speculation — it's the logical conclusion of a decade of building.",
    ],
  },
  {
    companyId: 'b',
    roundId: 'round-6',
    hints: [
      "Integration behind them, growth at double digits. This is what patience looks like.",
      "The boring bank is back to boring. In 2038, boring top-quartile compounding is exactly right.",
      "Premium valuation is justified when the franchise is this clean.",
    ],
  },
  {
    companyId: 'c',
    roundId: 'round-6',
    hints: [
      "Transformation-scale compute deals from global players. That's not a pilot.",
      "Up 28% when AI anxiety is running high suggests they're on the right side.",
      "Every compute cycle benefits the global leaders. The question is magnitude and duration.",
    ],
  },
  {
    companyId: 'd',
    roundId: 'round-6',
    hints: [
      "First milestone is a milestone. The stock price tells you what the market thinks of milestones.",
      "Recovery is real. Recovery to former glory is a different claim entirely.",
      "The question for survivors is not survival — it's compounding. Those are not the same.",
    ],
  },
  {
    companyId: 'e',
    roundId: 'round-6',
    hints: [
      "Massive value destruction. This is now a case study in misaligned incentives.",
      "NCLT means shareholders are at the end of the line. There is no line in restructuring.",
      "The lesson isn't governance — it's that growth without unit economics is a time bomb.",
    ],
  },
  {
    companyId: 'f',
    roundId: 'round-6',
    hints: [
      "Major institutional conviction during scrutiny is a bet on survival and recovery.",
      "Down 60% and then recovering partially means fragility at these valuations remains.",
      "Credibility damage is the hardest to repair in infrastructure. It takes longer than financial repair.",
    ],
  },
]

/**
 * Returns a random hint for the given company and round, or null if none available.
 */
export function pickHint(companyId: CompanyId, roundId: string): string | null {
  const entry = HINT_LIBRARY.find((e) => e.companyId === companyId && e.roundId === roundId)
  if (!entry || entry.hints.length === 0) return null
  return entry.hints[Math.floor(Math.random() * entry.hints.length)]
}
