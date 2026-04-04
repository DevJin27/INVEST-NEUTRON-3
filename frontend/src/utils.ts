import type { CompanyId, CountdownState, GamePhase, Investments, RoundResults } from './types'
import { COMPANY_IDS } from './types'

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
})

const compactNumberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 1,
  notation: 'compact',
})

export function isPlayableSnapshot(
  snapshot: { currentRound: unknown; phase: GamePhase } | null,
): boolean {
  return Boolean(
    snapshot &&
      snapshot.currentRound &&
      (snapshot.phase === 'live' || snapshot.phase === 'paused'),
  )
}

export function getCountdownMs(snapshot: CountdownState | null, now = Date.now()): number {
  if (!snapshot) return 0
  if (snapshot.phase === 'paused') return Math.max(0, snapshot.remainingMs)
  if (snapshot.phase === 'live' && snapshot.endsAt !== null) return Math.max(0, snapshot.endsAt - now)
  return 0
}

export function formatCountdown(milliseconds: number): string {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100))
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor((totalTenths % 600) / 10)
  const tenths = totalTenths % 10
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
}

export function formatCurrency(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}₹${currencyFormatter.format(Math.abs(Math.round(value)))}`
}

export function formatCompactCurrency(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}₹${compactNumberFormatter.format(Math.abs(value))}`
}

export function formatReturn(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

export function formatReturnMultiplier(yearlyReturn: number): string {
  const pct = Math.round(yearlyReturn * 10000) / 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  if (seconds === 0) {
    return `${minutes}m`
  }

  return `${minutes}m ${seconds}s`
}

export function formatPhaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'idle':
      return 'Ready'
    case 'live':
      return 'Live'
    case 'paused':
      return 'Paused'
    case 'results':
      return 'Results'
    case 'finished':
      return 'Finished'
    default:
      return phase
  }
}

export function sentimentColor(sentiment: 'positive' | 'negative' | 'neutral'): string {
  if (sentiment === 'positive') return 'var(--positive-strong)'
  if (sentiment === 'negative') return 'var(--negative-strong)'
  return 'var(--text-muted)'
}

export function sentimentLabel(sentiment: 'positive' | 'negative' | 'neutral'): string {
  if (sentiment === 'positive') return 'Bullish'
  if (sentiment === 'negative') return 'Bearish'
  return 'Mixed'
}

export function blankInvestments(): Investments {
  return Object.fromEntries(COMPANY_IDS.map((id) => [id, 0])) as Investments
}

export function totalInvested(investments: Investments): number {
  return COMPANY_IDS.reduce((sum, id) => sum + (investments[id] ?? 0), 0)
}

export function hasInvestments(investments: Investments): boolean {
  return totalInvested(investments) > 0
}

export function getQuickInvestAmounts(purse: number): number[] {
  if (purse <= 0) return []
  const candidates = [
    Math.max(1_000, Math.floor(purse * 0.1)),
    Math.max(1_000, Math.floor(purse * 0.25)),
    Math.max(1_000, Math.floor(purse * 0.5)),
  ]

  return [...new Set(candidates)].filter((amount) => amount > 0 && amount <= purse)
}

export function getInvestmentPercentage(investments: Investments, companyId: CompanyId, total: number): number {
  if (total <= 0) return 0
  return Math.round(((investments[companyId] ?? 0) / total) * 100)
}

export function getRoundSummary(results: RoundResults): { best: CompanyId | null; worst: CompanyId | null } {
  let best: CompanyId | null = null
  let worst: CompanyId | null = null
  let bestReturn = -Infinity
  let worstReturn = Infinity

  for (const id of COMPANY_IDS) {
    const current = results.actualReturns[id]
    if (current > bestReturn) {
      best = id
      bestReturn = current
    }

    if (current < worstReturn) {
      worst = id
      worstReturn = current
    }
  }

  return { best, worst }
}
