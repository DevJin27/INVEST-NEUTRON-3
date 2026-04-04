export type GamePhase = 'idle' | 'live' | 'paused' | 'results' | 'finished'

export type CompanyId = 'reliance' | 'hdfc_bank' | 'infosys' | 'yes_bank' | 'byjus' | 'adani'

export const COMPANY_IDS: CompanyId[] = ['reliance', 'hdfc_bank', 'infosys', 'yes_bank', 'byjus', 'adani']

export type Allocation = Record<CompanyId, number> // percentages summing to 100

export interface TeamCredentials {
  teamId: string
  name: string
}

export interface CompanySignal {
  id: CompanyId
  name: string
  sector: string
  headline: string
  sentiment: 'positive' | 'negative' | 'neutral'
  detail: string
  credibility: number
}

export interface RoundData {
  id: string
  year: number
  yearRange: string
  title: string
  context: string
  companies: CompanySignal[]
}

export interface LeaderboardEntry {
  teamId: string
  name: string
  portfolioValue: number
  connected: boolean
}

export interface ViewerSubmission {
  teamId: string | null
  hasSubmitted: boolean
  allocation: Allocation | null
  canSubmit: boolean
}

export interface GameSnapshot {
  activeTeamsCount: number
  currentRound: RoundData | null
  endsAt: number | null
  leaderboard: LeaderboardEntry[]
  phase: GamePhase
  remainingMs: number
  round: number
  totalRounds: number
  viewerSubmission: ViewerSubmission
}

export interface SerializedError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface SubmissionStatus {
  accepted: boolean
  allocation?: Allocation
  round?: number
  teamId?: string
  error?: SerializedError
}

export interface AckSuccess<T> {
  ok: true
  data: T
}

export interface AckFailure {
  ok: false
  error: SerializedError
}

export type AckResponse<T> = AckSuccess<T> | AckFailure

export type ConnectionState = 'idle' | 'connecting' | 'joining' | 'connected' | 'reconnecting'

export interface SocketLike {
  connected: boolean
  on<T = unknown>(event: string, listener: (payload: T) => void): this
  off<T = unknown>(event: string, listener?: (payload: T) => void): this
  emit<TAck = unknown>(event: string, payload?: unknown, ack?: (response: TAck) => void): this
  disconnect(): this
}

// Round results broadcast after round closes
export interface CompanyResult {
  yearlyReturn: number
  yearEndReveal: string
}

export interface TeamOutcome {
  teamId: string
  name: string
  connected: boolean
  allocation: Allocation | null
  didSubmit: boolean
  delta: number
  percentReturn: number
  portfolioValue: number
}

export interface RoundResults {
  round: number
  year: number
  yearRange: string
  title: string
  actualReturns: Record<CompanyId, number>
  yearEndReveal: Record<CompanyId, string>
  teamOutcomes: TeamOutcome[]
  leaderboard: LeaderboardEntry[]
}
