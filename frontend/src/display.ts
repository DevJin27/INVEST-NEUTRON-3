import type { CompanyId, RoundData, RoundResults } from './types'
import { COMPANY_IDS } from './types'

export type FakeCallType = 'misleading' | 'partially_true' | 'high-impact'

export interface FakeCallScript {
  body: string
  id: string
  source: string
  title: string
  type: FakeCallType
}

export interface DisplayCompanyMeta {
  accent: string
  code: string
  id: CompanyId
  name: string
  sector: string
}

export interface DisplayCompanyView extends DisplayCompanyMeta {
  detail: string
  reveal: string
  signal: string
}

export interface DisplayRoundView {
  calls: FakeCallScript[]
  companies: DisplayCompanyView[]
  context: string
  title: string
  visibleCompanyIds: CompanyId[]
  year: number
  yearRange: string
}

const EARLY_VISIBLE_COMPANIES: CompanyId[] = ['reliance', 'adani', 'hdfc_bank', 'byjus', 'yes_bank']

const COMPANY_META: Record<CompanyId, DisplayCompanyMeta> = {
  reliance: {
    accent: '#7ba2ff',
    code: 'STX',
    id: 'reliance',
    name: 'Stellarix',
    sector: 'Orbital Infrastructure',
  },
  hdfc_bank: {
    accent: '#8f86ff',
    code: 'NBK',
    id: 'hdfc_bank',
    name: 'Nobank',
    sector: 'Autonomous Finance',
  },
  infosys: {
    accent: '#5fd1ff',
    code: 'CRS',
    id: 'infosys',
    name: 'CoreStack',
    sector: 'Compute Fabric',
  },
  yes_bank: {
    accent: '#9ec3ff',
    code: 'ORB',
    id: 'yes_bank',
    name: 'Orbis',
    sector: 'Mobility Systems',
  },
  byjus: {
    accent: '#67e7c3',
    code: 'GRD',
    id: 'byjus',
    name: 'GridMart',
    sector: 'Distributed Commerce',
  },
  adani: {
    accent: '#59d987',
    code: 'NVF',
    id: 'adani',
    name: 'NovaFuel',
    sector: 'Grid Energy',
  },
}

type RoundSignalConfig = Record<CompanyId, { detail: string; reveal: string; signal: string }>

interface RoundDisplayConfig {
  calls: FakeCallScript[]
  context: string
  signals: RoundSignalConfig
  title: string
  year: number
}

const ROUND_CONFIGS: RoundDisplayConfig[] = [
  {
    year: 2028,
    title: 'Quiet Expansion Window',
    context:
      'Capital is patient but selective. Teams are being rewarded for choosing operators that can lock distribution, liquidity, and delivery capacity before the market turns crowded.',
    calls: [
      {
        id: 'round-1-call-1',
        source: 'Priority Desk',
        title: 'Nobank overnight lines under review',
        body:
          'Two large allocators are said to be rechecking Nobank exposure before the close. If the review is real, pricing discipline will matter more than momentum.',
        type: 'misleading',
      },
    ],
    signals: {
      reliance: {
        signal: 'Launch capacity is being accumulated before demand fully clears.',
        detail:
          'Stellarix is attracting long-cycle capital because the market prefers operators that secure infrastructure before the crowd sees the demand curve.',
        reveal:
          'Stellarix closed the year with disciplined execution. The market rewarded build quality over noise.',
      },
      adani: {
        signal: 'Storage commitments are improving, but delivery timing is tight.',
        detail:
          'NovaFuel is winning attention from desks that want dependable energy throughput, though late execution would quickly compress confidence.',
        reveal:
          'NovaFuel converted planning momentum into a stronger tape. Capacity that reached market on time mattered most.',
      },
      hdfc_bank: {
        signal: 'Deposit flows are steady while credit desks stay selective.',
        detail:
          'Nobank is benefiting from a market that values trust and measured growth over aggressive balance-sheet expansion.',
        reveal:
          'Nobank put up a clean year. Stability and restraint outperformed louder balance-sheet stories.',
      },
      infosys: {
        signal: 'Compute budgets are forming, but broad demand has not been released yet.',
        detail:
          'CoreStack remains in the pipeline stage for most allocators. The setup is attractive, but visibility is not public yet.',
        reveal:
          'CoreStack stayed off the public board this year. Its full repricing arrived later in the cycle.',
      },
      yes_bank: {
        signal: 'Fleet utilization is improving even as corridor growth stays uneven.',
        detail:
          'Orbis is attracting attention from teams that want resilience and route density instead of pure expansion headlines.',
        reveal:
          'Orbis delivered a solid year. Utilization held up well enough for the market to rerate consistency.',
      },
      byjus: {
        signal: 'Order density is building across second-wave zones.',
        detail:
          'GridMart is gaining traction where fulfillment reliability matters more than headline growth. The market is watching repeat behavior closely.',
        reveal:
          'GridMart finished stronger than expected. Reliable order flow beat early skepticism.',
      },
    },
  },
  {
    year: 2030,
    title: 'Credit Compression Cycle',
    context:
      'Borrowing conditions are tighter and weak operators are losing sponsorship fast. The market is rewarding teams that can hold margins without relying on easy liquidity.',
    calls: [
      {
        id: 'round-2-call-1',
        source: 'Crossflow Terminal',
        title: 'GridMart demand burst may be flow-driven',
        body:
          'Desk chatter says GridMart order strength is real, but some of the move may be temporary routing flow rather than stable demand. The tape is not fully settled.',
        type: 'partially_true',
      },
    ],
    signals: {
      reliance: {
        signal: 'Network operators with pricing power are getting cleaner sponsorship.',
        detail:
          'Stellarix looks better in a tighter market because scale is letting it absorb pressure without surrendering expansion posture.',
        reveal:
          'Stellarix absorbed the squeeze better than most. Scale and discipline protected the year.',
      },
      adani: {
        signal: 'Power offtake remains firm, but leverage sensitivity is rising.',
        detail:
          'NovaFuel still has upside if execution holds, though desks are becoming less forgiving toward delayed throughput or overstretched capital plans.',
        reveal:
          'NovaFuel stayed bid when weaker operators lost sponsorship. The market kept paying for operational follow-through.',
      },
      hdfc_bank: {
        signal: 'The best balance sheets are widening their advantage.',
        detail:
          'Nobank is being treated as a control name in a market that no longer rewards reckless expansion.',
        reveal:
          'Nobank extended its premium. Trust remained scarce and valuable.',
      },
      infosys: {
        signal: 'Quiet compute contracts are forming behind closed procurement cycles.',
        detail:
          'CoreStack is still early for the public crowd, but enterprise budgets are beginning to cluster around dependable providers.',
        reveal:
          'CoreStack remained mostly pre-discovery this year. Its breakout was still waiting for a broader cycle shift.',
      },
      yes_bank: {
        signal: 'Route demand is intact, but cost control is now the deciding factor.',
        detail:
          'Orbis can win if it keeps operations tight. The market is no longer paying for velocity without durability.',
        reveal:
          'Orbis came through with a controlled year. Operational discipline mattered more than story quality.',
      },
      byjus: {
        signal: 'Commerce volume is visible, but conversion quality is mixed.',
        detail:
          'GridMart is drawing both believers and skeptics because demand is there, yet the durability of that demand is still being tested.',
        reveal:
          'GridMart produced a choppy but constructive year. Teams that sized conviction carefully were rewarded.',
      },
    },
  },
  {
    year: 2032,
    title: 'Capacity Race',
    context:
      'The market has moved from funding ideas to funding throughput. Operators that can convert contracts into delivered capacity are separating from everyone still pitching optionality.',
    calls: [
      {
        id: 'round-3-call-1',
        source: 'Afterhours Relay',
        title: 'NovaFuel may secure a strategic grid allocation',
        body:
          'A high-capacity allocation is being discussed around NovaFuel. If it lands, the market could move before the official print and force a rapid repricing.',
        type: 'high-impact',
      },
    ],
    signals: {
      reliance: {
        signal: 'Long-horizon operators are now judged on delivered capacity, not narratives.',
        detail:
          'Stellarix remains attractive because the market can already measure the quality of its network decisions in real operating terms.',
        reveal:
          'Stellarix delivered on throughput and kept the market onside. Tangible execution carried the year.',
      },
      adani: {
        signal: 'Energy routing is one of the few areas still attracting aggressive capital.',
        detail:
          'NovaFuel can move fast in this environment, but only if additional capacity arrives without introducing operational strain.',
        reveal:
          'NovaFuel turned capacity expectations into a material move. The market paid up for actual flow, not promises.',
      },
      hdfc_bank: {
        signal: 'Funding desks are rotating toward names that can underwrite risk with precision.',
        detail:
          'Nobank is holding appeal because underwriting quality is being valued more than headline loan growth.',
        reveal:
          'Nobank held its line in a faster market. Precision kept it inside the winner group.',
      },
      infosys: {
        signal: 'Compute demand is strengthening, but public visibility remains delayed.',
        detail:
          'CoreStack is still not front-page flow, yet infrastructure buyers are clearly preparing for a larger deployment wave.',
        reveal:
          'CoreStack was still waiting for full public discovery. The conditions for its debut were almost in place.',
      },
      yes_bank: {
        signal: 'Mobility platforms that protect utilization are getting rerated.',
        detail:
          'Orbis is being judged on corridor economics and reliability instead of pure route count expansion.',
        reveal:
          'Orbis turned dependable utilization into a constructive close. Reliability beat expansion theater.',
      },
      byjus: {
        signal: 'Fulfillment density is becoming a real competitive moat.',
        detail:
          'GridMart is benefitting from an environment where distributed delivery networks can prove their value quarter after quarter.',
        reveal:
          'GridMart translated density into a better year-end tape. Repeat performance forced the market to upgrade it.',
      },
    },
  },
  {
    year: 2034,
    title: 'System Repricing',
    context:
      'The market is repricing the full stack. Defensive balance sheets still matter, but compute, logistics, and energy leaders are now moving together as a connected system rather than isolated trades.',
    calls: [
      {
        id: 'round-4-call-1',
        source: 'Night Desk',
        title: 'CoreStack procurement wave looks larger than expected',
        body:
          'Several desks believe CoreStack has moved from pilot budgets into full deployment mandates. If confirmed, the rerating could be sharper than current positioning implies.',
        type: 'high-impact',
      },
    ],
    signals: {
      reliance: {
        signal: 'Infrastructure operators with execution depth remain central to the tape.',
        detail:
          'Stellarix still benefits from market preference for operators that can anchor the broader system without overextending.',
        reveal:
          'Stellarix stayed relevant even as the market widened. Its infrastructure role remained hard to replace.',
      },
      adani: {
        signal: 'Energy reliability is being repriced as a system input, not a side trade.',
        detail:
          'NovaFuel is now being valued for how it supports broader throughput across the market, which raises both upside and scrutiny.',
        reveal:
          'NovaFuel ended the year with a stronger systemic role. Energy reliability became a more valuable asset class.',
      },
      hdfc_bank: {
        signal: 'Funding discipline still decides who can keep scaling safely.',
        detail:
          'Nobank remains attractive because the market wants financial rails that can support growth without introducing fragility.',
        reveal:
          'Nobank remained a trusted anchor in a broader repricing cycle. Balance-sheet control mattered again.',
      },
      infosys: {
        signal: 'Compute demand has crossed from anticipation into visible deployment.',
        detail:
          'CoreStack is finally on the public board, and the market is treating it as a strategic system name rather than a hidden pipeline story.',
        reveal:
          'CoreStack arrived publicly with force. Deployment visibility pulled it into the core leadership group.',
      },
      yes_bank: {
        signal: 'Mobility networks tied to real throughput are getting cleaner sponsorship.',
        detail:
          'Orbis is gaining favor because it can translate systemic demand into measurable operating leverage.',
        reveal:
          'Orbis stayed in the conversation as the system widened. Utilization quality kept it investable.',
      },
      byjus: {
        signal: 'Commerce infrastructure is being judged on retention and route efficiency.',
        detail:
          'GridMart has momentum, but the market is now measuring endurance more tightly than raw order growth.',
        reveal:
          'GridMart finished with a firmer profile. Efficient repeat flow mattered more than headline noise.',
      },
    },
  },
  {
    year: 2036,
    title: 'Defensive Rotation',
    context:
      'Teams are operating in a slower tape with sharper punishment for weak execution. The strongest names still attract capital, but every allocation now has to justify its resilience as well as its upside.',
    calls: [
      {
        id: 'round-5-call-1',
        source: 'Control Room',
        title: 'Stellarix order book may be flatter than desks expect',
        body:
          'Channel traffic suggests Stellarix is still stable, but some desks think growth expectations have run ahead of the actual order book. The next leg may depend on proof, not belief.',
        type: 'misleading',
      },
    ],
    signals: {
      reliance: {
        signal: 'Scale remains valuable, but the market is demanding proof every quarter.',
        detail:
          'Stellarix is no longer priced as an automatic winner. Teams now need conviction around execution quality and pace.',
        reveal:
          'Stellarix held together in a tougher tape. The market paid for resilience rather than expansion fantasy.',
      },
      adani: {
        signal: 'Energy throughput is still strategic, though expectations are less forgiving.',
        detail:
          'NovaFuel has room to outperform if delivery remains clean, but any operational wobble will be priced immediately.',
        reveal:
          'NovaFuel stayed relevant by protecting execution. In a defensive tape, that mattered more than ambition.',
      },
      hdfc_bank: {
        signal: 'Capital is rotating back toward names that can defend trust under pressure.',
        detail:
          'Nobank is benefiting from a market that wants dependable finance rails before it wants aggressive upside.',
        reveal:
          'Nobank looked stronger as the market rotated defensive. Trust and control drove performance.',
      },
      infosys: {
        signal: 'Compute deployment is real, but buyers are getting more selective.',
        detail:
          'CoreStack still has demand, though the market is beginning to distinguish between scale that converts and scale that stalls.',
        reveal:
          'CoreStack stayed onside because deployment quality remained visible. It earned its place in a stricter market.',
      },
      yes_bank: {
        signal: 'Mobility operators are being judged on retention and unit economics.',
        detail:
          'Orbis can still work, but the market now punishes weak route economics quickly and without much forgiveness.',
        reveal:
          'Orbis finished with a balanced outcome. Durability mattered more than pace.',
      },
      byjus: {
        signal: 'Commerce networks with real repeat traffic are separating from promotional flow.',
        detail:
          'GridMart is holding interest, but the market wants evidence that demand is habitual rather than opportunistic.',
        reveal:
          'GridMart closed the year with a measured outcome. Repeat quality determined the final move.',
      },
    },
  },
  {
    year: 2038,
    title: 'Late-Cycle Selection',
    context:
      'The market has become unforgiving and selective. Teams are being rewarded for sizing conviction carefully, separating structural leaders from names that only looked strong in easier conditions.',
    calls: [
      {
        id: 'round-6-call-1',
        source: 'Signal Relay',
        title: 'Orbis route auction could reshape close-of-year pricing',
        body:
          'A major corridor auction is rumored to favor Orbis, but the structure is not final. If the terms hold, positioning may move before confirmation reaches the tape.',
        type: 'partially_true',
      },
    ],
    signals: {
      reliance: {
        signal: 'Only operators with structural advantages are keeping premium sponsorship.',
        detail:
          'Stellarix still commands attention because its network role survives even in a highly selective environment.',
        reveal:
          'Stellarix finished as a structural name, not just a cycle name. The market kept rewarding its staying power.',
      },
      adani: {
        signal: 'Energy leaders still matter, but the market is paying only for clean execution.',
        detail:
          'NovaFuel can still move materially, yet every operational assumption is now being stress-tested in real time.',
        reveal:
          'NovaFuel closed with a decisive signal. Only the cleanest throughput stories held premium pricing.',
      },
      hdfc_bank: {
        signal: 'Finance rails that remain trusted late in the cycle are commanding a premium.',
        detail:
          'Nobank is attracting defensive capital because its discipline still reads as durable under stress.',
        reveal:
          'Nobank ended the cycle as a trusted allocator favorite. Trust outlasted volatility.',
      },
      infosys: {
        signal: 'Compute leaders are being separated from the rest of the field.',
        detail:
          'CoreStack is now fully visible, and the market is deciding whether its deployment base deserves long-cycle leadership status.',
        reveal:
          'CoreStack finished the cycle with leadership credentials. Public visibility turned into durable sponsorship.',
      },
      yes_bank: {
        signal: 'Mobility flow is still tradable, but only efficient operators can keep the market.',
        detail:
          'Orbis remains in play because it can still translate route quality into performance when weaker operators are being screened out.',
        reveal:
          'Orbis closed with a credible late-cycle profile. Efficient route economics kept it investable.',
      },
      byjus: {
        signal: 'Commerce networks are now being judged almost entirely on retention quality.',
        detail:
          'GridMart has to prove that its throughput is habitual and sticky. The market no longer pays for loose demand.',
        reveal:
          'GridMart ended with a selective-market verdict. Sticky demand mattered far more than broad excitement.',
      },
    },
  },
]

function getRoundConfig(roundNumber: number): RoundDisplayConfig {
  return ROUND_CONFIGS[Math.max(0, Math.min(ROUND_CONFIGS.length - 1, roundNumber - 1))]
}

export function getVisibleCompanyIds(roundNumber: number): CompanyId[] {
  return roundNumber >= 4 ? COMPANY_IDS : EARLY_VISIBLE_COMPANIES
}

export function getCompanyDisplayMeta(companyId: CompanyId): DisplayCompanyMeta {
  return COMPANY_META[companyId]
}

export function getCompanyDisplayName(companyId: CompanyId): string {
  return COMPANY_META[companyId].name
}

export function getDisplayYear(roundNumber: number): number {
  return getRoundConfig(roundNumber).year
}

export function getDisplayYearLabel(roundNumber: number): string {
  return String(getDisplayYear(roundNumber))
}

export function getDisplayRoundTitle(roundNumber: number): string {
  return getRoundConfig(roundNumber).title
}

export function buildDisplayRound(roundData: RoundData | null, roundNumber: number): DisplayRoundView | null {
  if (!roundData || roundNumber <= 0) {
    return null
  }

  const config = getRoundConfig(roundNumber)
  const visibleCompanyIds = getVisibleCompanyIds(roundNumber)

  return {
    calls: config.calls,
    companies: visibleCompanyIds.map((companyId) => ({
      ...COMPANY_META[companyId],
      detail: config.signals[companyId].detail,
      reveal: config.signals[companyId].reveal,
      signal: config.signals[companyId].signal,
    })),
    context: config.context,
    title: config.title,
    visibleCompanyIds,
    year: config.year,
    yearRange: String(config.year),
  }
}

export function buildDisplayResults(results: RoundResults | null): DisplayRoundView | null {
  if (!results) {
    return null
  }

  return buildDisplayRound(
    {
      companies: results.teamOutcomes.length > 0 ? [] : [],
      context: '',
      id: `round-${results.round}`,
      title: results.title,
      year: results.year,
      yearRange: results.yearRange,
    } as RoundData,
    results.round,
  )
}

export function getDisplayReveal(roundNumber: number, companyId: CompanyId): string {
  return getRoundConfig(roundNumber).signals[companyId].reveal
}

export function getVisibleDisplayResults(results: RoundResults): Array<DisplayCompanyMeta & { reveal: string }> {
  return getVisibleCompanyIds(results.round).map((companyId) => ({
    ...COMPANY_META[companyId],
    reveal: getDisplayReveal(results.round, companyId),
  }))
}

export function formatAdminAuditAction(action: string): string {
  switch (action) {
    case 'admin:authenticate':
      return 'Admin access'
    case 'admin:start-game':
      return 'Opened market'
    case 'admin:set-round-duration':
      return 'Updated timer'
    case 'admin:pause-round':
      return 'Paused round'
    case 'admin:resume-round':
      return 'Resumed round'
    case 'admin:end-round':
      return 'Closed round early'
    case 'admin:next-round':
      return 'Advanced round'
    case 'admin:reset-game':
      return 'Reset room'
    case 'admin:set-purse-value':
      return 'Adjusted cash'
    case 'admin:get-audit-log':
      return 'Viewed audit log'
    default:
      return action.replace('admin:', '').replaceAll('-', ' ')
    }
}
