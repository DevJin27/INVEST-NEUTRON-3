import type { Allocation, CompanyId, GameSnapshot, RoundResults } from './types'
import { COMPANY_IDS } from './types'

export function isPlayableSnapshot(snapshot: GameSnapshot | null): boolean {
  return Boolean(
    snapshot &&
      snapshot.currentRound &&
      (snapshot.phase === 'live' || snapshot.phase === 'paused'),
  )
}

export function getCountdownMs(snapshot: GameSnapshot | null, now = Date.now()): number {
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
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)}L`
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(2)}K`
  return `₹${value.toFixed(0)}`
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

export function sentimentColor(sentiment: 'positive' | 'negative' | 'neutral'): string {
  if (sentiment === 'positive') return '#22c55e'
  if (sentiment === 'negative') return '#ef4444'
  return '#94a3b8'
}

export function sentimentLabel(sentiment: 'positive' | 'negative' | 'neutral'): string {
  if (sentiment === 'positive') return '▲ Bullish'
  if (sentiment === 'negative') return '▼ Bearish'
  return '◆ Mixed'
}

/** Build a blank allocation with all zeros */
export function blankAllocation(): Allocation {
  return Object.fromEntries(COMPANY_IDS.map((id) => [id, 0])) as Allocation
}

/** Build an equal-weight allocation (100 / n per company) */
export function equalAllocation(): Allocation {
  const perCompany = Math.floor(100 / COMPANY_IDS.length)
  const alloc = Object.fromEntries(COMPANY_IDS.map((id) => [id, perCompany])) as Allocation
  const remainder = 100 - perCompany * COMPANY_IDS.length
  if (remainder > 0) alloc[COMPANY_IDS[0]] += remainder
  return alloc
}

/** Total of all allocation values */
export function allocationTotal(alloc: Allocation): number {
  return COMPANY_IDS.reduce((sum, id) => sum + (alloc[id] ?? 0), 0)
}

/** Returns true when allocation sums to 100 */
export function isAllocationValid(alloc: Allocation): boolean {
  return Math.abs(allocationTotal(alloc) - 100) <= 1
}

/** Get best and worst performers from round results */
export function getRoundSummary(results: RoundResults): { best: CompanyId | null; worst: CompanyId | null } {
  let best: CompanyId | null = null
  let worst: CompanyId | null = null
  let bestReturn = -Infinity
  let worstReturn = Infinity

  for (const id of COMPANY_IDS) {
    const r = results.actualReturns[id]
    if (r > bestReturn) { bestReturn = r; best = id }
    if (r < worstReturn) { worstReturn = r; worst = id }
  }

  return { best, worst }
}
