import type { CompanyId, CompanySignal, FakeCall, RoundData, RoundResults } from './types'
import { COMPANY_IDS } from './types'

export interface DisplayCompanyView extends CompanySignal {
  // Now extends CompanySignal which has all fields: name, sector, accent, code, signal, detail, reveal
}

export interface DisplayRoundView {
  calls: FakeCall[]
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
