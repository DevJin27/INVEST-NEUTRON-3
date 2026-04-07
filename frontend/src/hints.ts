import type { CompanyId } from './types'

export type HintEntry = {
  companyId: CompanyId
  roundId: string
  hints: string[]
}

// Each entry has 2–4 hints from the perspective of a veteran market observer.
// Never prescriptive — always gives a frame for thinking.
export const HINT_LIBRARY: HintEntry[] = [
  // ── Round 1: 2012 ──
  {
    companyId: 'reliance',
    roundId: 'round-1',
    hints: [
      "I've watched Mukesh bet big before. When he files for spectrum, he's not experimenting — he's already decided.",
      "Oil-to-chemicals is the cash engine. The real question is what he's doing with that cash.",
      "Telecom disruption in India looked impossible in 2012. That's usually when it's worth paying attention.",
    ],
  },
  {
    companyId: 'hdfc_bank',
    roundId: 'round-1',
    hints: [
      "NPA at 0.9% when the industry average is 3–4%? Either they're magical, or they're very careful about who they lend to. Either way, that's the point.",
      "The boring bank has beaten the exciting banks for fifteen years running. Worth reflecting on that.",
      "Tier-2 and Tier-3 expansion means tomorrow's middle class is their customer today.",
    ],
  },
  {
    companyId: 'infosys',
    roundId: 'round-1',
    hints: [
      "Leadership drift at a services company is expensive. Clients notice when the top floor is distracted.",
      "The guidance cut hurts, but a massive cash pile buys patience. What matters is what they do with the next 18 months.",
      "Visa headwinds are real but temporary. The underlying demand for Indian IT isn't going anywhere.",
    ],
  },
  {
    companyId: 'yes_bank',
    roundId: 'round-1',
    hints: [
      "35% profit growth in banking almost always means someone is taking risks the headline doesn't show you.",
      "Rana Kapoor is a brilliant promoter. The question is always: what's behind the curtain?",
      "When loan quality looks too good to be true in a bad credit environment, it usually is.",
    ],
  },
  {
    companyId: 'byjus',
    roundId: 'round-1',
    hints: [
      "EdTech in 2012 was a leap of faith. CAT coaching going digital at 3% internet penetration — either too early or exactly right.",
      "Sequoia doesn't lead a ₹50M round without conviction. But conviction isn't the same as a business model.",
      "The unit economics of EdTech only work at scale. The question is whether they can survive long enough to reach it.",
    ],
  },
  {
    companyId: 'adani',
    roundId: 'round-1',
    hints: [
      "Infrastructure companies live and die by government contracts. Political tailwinds are real but they can reverse.",
      "Coal imports rising + port expansion = a leveraged bet on India's industrial growth. Accurate bet, but a leveraged one.",
      "The Mundra story is about location and scale. Both are hard to replicate.",
    ],
  },

  // ── Round 2: 2015 ──
  {
    companyId: 'reliance',
    roundId: 'round-2',
    hints: [
      "Jio beta testers reporting free data at blazing speeds is not a rumor. It's a reconnaissance operation.",
      "Every telecom player in India is exposed if Jio launches with free data. That's not FUD — that's arithmetic.",
      "The market is muted because no one believes it yet. That's often when the opportunity is largest.",
    ],
  },
  {
    companyId: 'hdfc_bank',
    roundId: 'round-2',
    hints: [
      "Seven years as 'Most Trusted Bank' isn't marketing — it's compounding institutional trust. That's a moat.",
      "200% mobile transaction growth means they're not just a branch bank anymore. Digital transition done quietly.",
      "Best-in-class management tends to stay best-in-class. There's no surprises with HDFC — which is exactly the point.",
    ],
  },
  {
    companyId: 'infosys',
    roundId: 'round-2',
    hints: [
      "When a founder comes back publicly critical, it means the board is already worried. Short-term noise, or structural signal?",
      "IT demand is accelerating globally. Even a distracted Infosys benefits from a rising tide.",
      "Uncertainty creates discount. If the management situation resolves, the underlying business is still very much intact.",
    ],
  },
  {
    companyId: 'yes_bank',
    roundId: 'round-2',
    hints: [
      "An RBI warning letter is not a routine letter. They don't send those when everything is fine.",
      "Yes Bank's profits look euphoric. Euphoric profits in banking often mean someone is borrowing to look profitable.",
      "Institutional investors quietly watching is not the same as institutional investors quietly exiting. Yet.",
    ],
  },
  {
    companyId: 'byjus',
    roundId: 'round-2',
    hints: [
      "10 million students is a real number. But revenue per student matters more — and that's not in the press release.",
      "DST Global and Sequoia don't usually disagree on conviction bets. This is as close to consensus VC as you get.",
      "Zuckerberg praising an EdTech company is a signal, not a catalyst. Ask what happens when he stops praising.",
    ],
  },
  {
    companyId: 'adani',
    roundId: 'round-2',
    hints: [
      "Six airports is an extraordinary win. But operating airports is very different from bidding for them.",
      "Leverage rising sharply alongside scale is a pattern I've seen before. The question is always: can revenue outpace interest?",
      "Government as the primary client means the cashflows are predictable until they aren't.",
    ],
  },

  // ── Round 3: 2018 ──
  {
    companyId: 'reliance',
    roundId: 'round-3',
    hints: [
      "215 million Jio subscribers is not a trial — it's a landslide. Airtel and Vodafone are in existential trouble.",
      "Jio + Retail + Petrochemicals. Name another company building three dominant businesses simultaneously.",
      "JioFiber for home broadband means the wired last mile too. This is infrastructure-scale ambition.",
    ],
  },
  {
    companyId: 'hdfc_bank',
    roundId: 'round-3',
    hints: [
      "An HDFC-HDFC Bank merger sounds complex, but the logic is clean: one balance sheet, lower funding costs.",
      "Short-term merger uncertainty is real. Long-term, combining India's best bank with its best NBFC is a formidable entity.",
      "Merger risk on a franchise this strong is a speed bump, not a wall.",
    ],
  },
  {
    companyId: 'infosys',
    roundId: 'round-3',
    hints: [
      "CEO drama is painful but temporary. The client list is not temporary.",
      "When the board and the founder are fighting publicly, value is usually being destroyed for no fundamental reason.",
      "The order book remains massive. That's not noise — that's the actual business.",
    ],
  },
  {
    companyId: 'yes_bank',
    roundId: 'round-3',
    hints: [
      "RBI rejecting a CEO extension is extraordinary. I've seen this movie before — it doesn't end well for shareholders.",
      "NPA emerging officially means the actual number is materially larger than what was reported.",
      "When institutional investors are 'quietly exiting', they're not quietly exiting. They're sprinting.",
    ],
  },
  {
    companyId: 'byjus',
    roundId: 'round-3',
    hints: [
      "A billion-dollar valuation in EdTech in 2018 requires perfect execution for years. Not impossible — but price it accordingly.",
      "Tencent and CZI investing gives credibility, not revenue. Revenue is what matters.",
      "International expansion before the domestic model is proven is usually how capital gets burned.",
    ],
  },
  {
    companyId: 'adani',
    roundId: 'round-3',
    hints: [
      "Solar + thermal + coal + ports + airports. At what point does complexity become a liability?",
      "Debt mounting at the group level isn't unusual for infrastructure plays. The question is debt serviceability when commodity prices turn.",
      "Government power tenders are sticky revenue — until elections change the calculus.",
    ],
  },

  // ── Round 4: 2020 ──
  {
    companyId: 'reliance',
    roundId: 'round-4',
    hints: [
      "Facebook and Google both putting billions into Jio in the same quarter is not coincidence. That's the world's biggest companies buying India's digital future.",
      "Net-debt free + ₹53,000 crore rights issue is a company preparing for something large. Pay attention.",
      "India's largest retailer + digital telecom backbone. This isn't a conglomerate anymore — it's an ecosystem.",
    ],
  },
  {
    companyId: 'hdfc_bank',
    roundId: 'round-4',
    hints: [
      "COVID moratorium is masking real NPA. The question is what remains when the mask comes off.",
      "300% digital transaction growth is meaningful. HDFC is not going to be disrupted by fintechs — it's becoming one.",
      "Dividend cut to conserve capital is prudent, not alarming. Prudence in 2020 is worth a premium.",
    ],
  },
  {
    companyId: 'infosys',
    roundId: 'round-4',
    hints: [
      "ABN AMRO $1.5B. That's the size of deal that changes revenue trajectory, not just headlines.",
      "WFH proving IT outsourcing durability is the most valuable result of a terrible year for most companies.",
      "12–14% guidance upgrade during a pandemic tells you something about where IT is headed.",
    ],
  },
  {
    companyId: 'yes_bank',
    roundId: 'round-4',
    hints: [
      "When the RBI has to step in directly, shareholders are the last priority. They're always the last priority.",
      "₹3/share from all-time highs in the hundreds. The question isn't how — the question is whether there's any recovery case.",
      "SBI-forced rescue means survival, not recovery. These are very different things.",
    ],
  },
  {
    companyId: 'byjus',
    roundId: 'round-4',
    hints: [
      "45 million users in 3 months during lockdown is a genuine step-change. But are these paid users?",
      "$10.5 billion valuation requires every single content and monetization bet to pay off for the next decade.",
      "The risk with COVID-driven growth is that it creates expectations that can't survive normalcy.",
    ],
  },
  {
    companyId: 'adani',
    roundId: 'round-4',
    hints: [
      "World's largest solar tender win is genuinely extraordinary. India's green energy ambition is real.",
      "95% returns in a year means the market is pricing in a lot of future execution. You're paying today for years of perfect delivery.",
      "The Adani story is compelling. Just remember that debt + equity performance at this rate rarely sustain simultaneously.",
    ],
  },

  // ── Round 5: 2022 ──
  {
    companyId: 'reliance',
    roundId: 'round-5',
    hints: [
      "Jio IPO + Retail IPO pipeline means Reliance is letting the market price its subsidiaries separately. Usually value-accretive.",
      "+22% in an environment where tech is down 50–70% tells you something about the quality of the business.",
      "The pre-IPO play is in the parent. The subsidiary IPOs are exits at higher multiples.",
    ],
  },
  {
    companyId: 'hdfc_bank',
    roundId: 'round-5',
    hints: [
      "Merger integration is genuinely painful for 12–18 months. This is known. Patience is priced in.",
      "Priority sector lending requirements eat into margins temporarily. The franchise doesn't change.",
      "+5% in a flat-to-negative market is underperformance on paper, outperformance on risk.",
    ],
  },
  {
    companyId: 'infosys',
    roundId: 'round-5',
    hints: [
      "$16B revenue. Cloud and AI deals accelerating. 27% attrition is a problem; it's also a market signal about where talent wants to go.",
      "Buybacks at this scale are saying: we have more cash than growth opportunities in the near term. That's not bad — that's honest.",
      "The steady compounder keeps compounding because management doesn't get distracted by trends.",
    ],
  },
  {
    companyId: 'yes_bank',
    roundId: 'round-5',
    hints: [
      "FPO raising real capital is a first positive signal in years. But first positives after near-death experiences take time to compound.",
      "Prashant Kumar's turnaround is real but measured. Capital adequacy before profitability is the right sequence.",
      "+15% recovery from the depths. The question is whether the loan book is truly clean or just restructured.",
    ],
  },
  {
    companyId: 'byjus',
    roundId: 'round-5',
    hints: [
      "Auditor flags and unpaid salaries at a $22B company are not minor housekeeping issues. They're canaries.",
      "Acquisitions done at speed during a bull market rarely integrate cleanly. Aakash + WhiteHat Jr + Toppr simultaneously?",
      "-30% in startup winter is not a bottom signal — it's the beginning of price discovery for an asset that was never priced rationally.",
    ],
  },
  {
    companyId: 'adani',
    roundId: 'round-5',
    hints: [
      "When a stock is up 1000% and someone is quietly loading a short report, the question isn't if — it's when.",
      "World's 3rd richest person in two years from infrastructure stocks. I've seen this before — leverage amplifies everything including the correction.",
      "The credibility premium these stocks trade at is entirely dependent on government relationship continuity.",
    ],
  },

  // ── Round 6: 2024 ──
  {
    companyId: 'reliance',
    roundId: 'round-6',
    hints: [
      "Succession planning done publicly is a signal of institutional maturity. Mukesh is building a dynasty, not a company.",
      "+18% in a year when markets are uncertain about geopolitics and rates is compounding in the truest sense.",
      "Jio IPO at $100B+ is not speculation — it's the logical conclusion of a decade of infrastructure building.",
    ],
  },
  {
    companyId: 'hdfc_bank',
    roundId: 'round-6',
    hints: [
      "Integration blues behind them, loan growth at 15%+. This is what four years of patience looks like.",
      "The boring bank is back to boring. In 2024, boring top-quartile compounding is exactly what you want.",
      "Premium valuation to historic averages is justified when the franchise is this clean.",
    ],
  },
  {
    companyId: 'infosys',
    roundId: 'round-6',
    hints: [
      "$2B AI deal from a global bank. That's not a pilot — that's transformation-scale commitment.",
      "+28% in a year when AI anxiety is running high everywhere suggests Infosys is on the right side of the anxiety.",
      "Every AI cycle benefits Indian IT. The question is magnitude and duration, not direction.",
    ],
  },
  {
    companyId: 'yes_bank',
    roundId: 'round-6',
    hints: [
      "First profit in four years is a milestone. The stock at ₹20 after being at ₹400 tells you what the market thinks of milestones after destruction.",
      "Recovery is real. Recovery to former glory is a very different claim.",
      "The question for Yes Bank is not survival — it's compounding. Those are not the same thing.",
    ],
  },
  {
    companyId: 'byjus',
    roundId: 'round-6',
    hints: [
      "$22 billion to zero. This is now a case study in what happens when incentives are misaligned for too long.",
      "NCLT proceedings mean shareholders are at the end of the queue. There is no queue, technically.",
      "The most important lesson from Byju's isn't governance — it's that revenue growth without unit economics is a time bomb with a delayed fuse.",
    ],
  },
  {
    companyId: 'adani',
    roundId: 'round-6',
    hints: [
      "GQG's $1.9B lifeline in the middle of the Hindenburg storm is a conviction bet. GQG bets on survivors.",
      "-35% from peak after -60% from peak means partial recovery. Partial recovery at high leverage is still fragile.",
      "Credibility damage is the hardest thing to repair in infrastructure stocks. It takes longer than the financial repair.",
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
