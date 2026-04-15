import type { CompanyId, CompanySignal, FakeCall, RoundData, RoundResults } from './types'
import { COMPANY_IDS } from './types'

export interface DisplayCompanyView extends CompanySignal {
  // Now extends CompanySignal which has all fields: name, sector, accent, code, signal, detail, reveal
}

export interface DisplayRoundView {
  calls?: FakeCall[]
  companies: DisplayCompanyView[]
  context: string
  title: string
  visibleCompanyIds: CompanyId[]
  year: number
  yearRange: string
}

const EARLY_VISIBLE_COMPANIES: CompanyId[] = ['a', 'b', 'c', 'd']

export function getVisibleCompanyIds(roundNumber: number): CompanyId[] {
  return roundNumber >= 4 ? COMPANY_IDS : EARLY_VISIBLE_COMPANIES
}

export function buildDisplayRound(roundData: RoundData | null): DisplayRoundView | null {
  if (!roundData) {
    return null
  }

  const visibleCompanyIds = COMPANY_IDS

  return {
    calls: roundData.calls || [],
    companies: roundData.companies.filter((company) => visibleCompanyIds.includes(company.id)) as DisplayCompanyView[],
    context: roundData.context,
    title: roundData.title,
    visibleCompanyIds,
    year: roundData.year,
    yearRange: roundData.yearRange,
  }
}

export function buildDisplayResults(results: RoundResults | null, roundData: RoundData | null): DisplayRoundView | null {
  if (!results || !roundData) {
    return null
  }

  return buildDisplayRound(roundData)
}

export function getVisibleDisplayResults(companies: CompanySignal[]): DisplayCompanyView[] {
  return companies as DisplayCompanyView[]
}

export function getCompanyDisplayMeta(companyId: CompanyId) {
  const companies: Record<CompanyId, { name: string; code: string; sector: string; accent: string }> = {
    a: { name: 'Stellarix', code: 'STX', sector: 'Orbital Infrastructure', accent: '#7ba2ff' },
    b: { name: 'Nobank', code: 'NBK', sector: 'Autonomous Finance', accent: '#8f86ff' },
    c: { name: 'CoreStack', code: 'CRS', sector: 'Compute Fabric', accent: '#5fd1ff' },
    d: { name: 'Orbis', code: 'ORB', sector: 'Mobility Systems', accent: '#9ec3ff' },
    e: { name: 'GridMart', code: 'GRD', sector: 'Distributed Commerce', accent: '#67e7c3' },
    f: { name: 'NovaFuel', code: 'NVF', sector: 'Grid Energy', accent: '#59d987' },
  }
  return companies[companyId]
}

export function getCompanyDisplayName(companyId: CompanyId): string {
  return getCompanyDisplayMeta(companyId)?.name || companyId
}

export function getDisplayYearLabel(roundNumber: number): string {
  const roundLabels: Record<number, string> = {
    1: '2028',
    2: '2030',
    3: '2032',
    4: '2034',
    5: '2036',
    6: '2038',
  }
  return roundLabels[roundNumber] || `Round ${roundNumber}`
}

export function getDisplayRoundTitle(roundNumber: number): string {
  const roundTitles: Record<number, string> = {
    1: 'Quiet Expansion Window',
    2: 'Credit Compression Cycle',
    3: 'Capacity Race',
    4: 'System Repricing',
    5: 'Defensive Rotation',
    6: 'Late-Cycle Selection',
  }
  return roundTitles[roundNumber] || `Round ${roundNumber}`
}

export function getDisplayReveal(_roundNumber: number, _companyId: CompanyId): string {
  return ''
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
