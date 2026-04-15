export type GamePhase = 'idle' | 'live' | 'paused' | 'results' | 'finished'

export type CompanyId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f'

export const COMPANY_IDS: CompanyId[] = ['a', 'b', 'c', 'd', 'e', 'f']

export type Investments = Record<CompanyId, number>

export interface TeamCredentials {
  teamId: string
  name: string
}

export interface CompanySignal {
  id: CompanyId
  name: string
  sector: string
  accent: string
  code: string
  signal: string
  detail: string
  reveal: string
}

export interface FakeCall {
  id: string
  source: string
  title: string
  body: string
  type: 'misleading' | 'partially_true' | 'high-impact'
}

export interface RoundData {
  id: string
  year: number
  yearRange: string
  title: string
  context: string
  companies: CompanySignal[]
  calls?: FakeCall[]
}

export interface LeaderboardEntry {
  teamId: string
  name: string
  purse: number
  investments: Investments
  totalValue: number
  connected: boolean
}

export interface ViewerSubmission {
  teamId: string | null
  hasSubmitted: boolean
  investments: Investments
  canSubmit: boolean
}

export interface CountdownState {
  phase: GamePhase
  remainingMs: number
  endsAt: number | null
}

export type MarketMood = 'frenzy' | 'caution' | 'stable'

export interface BaseSnapshot extends CountdownState {
  activeTeamsCount: number
  currentRound: RoundData | null
  leaderboard: LeaderboardEntry[]
  marketMood: MarketMood
  round: number
  roundDurationMs: number
  totalRounds: number
}

export interface GameSnapshot extends BaseSnapshot {
  viewerSubmission: ViewerSubmission
}

export interface TeamStatus {
  teamId: string
  name: string
  purse: number
  totalValue: number
  connected: boolean
  hasSubmitted: boolean
  totalInvested: number
}

export interface AuditLogEntry {
  action: string
  result: string
  socketId: string
  timestamp: string
  details?: Record<string, unknown>
}

export interface AdminSnapshot extends BaseSnapshot {
  auditLog: AuditLogEntry[]
  lastRoundResults: RoundResults | null
  teamSubmissions: TeamStatus[]
}

export interface SerializedError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface SubmissionStatus {
  accepted: boolean
  investments?: Investments
  round?: number
  teamId?: string
  error?: SerializedError
}

export interface InvestmentUpdate {
  type: 'invest' | 'withdraw'
  teamId: string
  companyId: CompanyId
  amount: number
  purse: number
  invested: number
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

export interface TeamOutcome {
  teamId: string
  name: string
  connected: boolean
  investments: Investments
  totalInvested: number
  didSubmit: boolean
  returns: number
  percentReturn: number
  purse: number
  totalValue: number
  breakdown: Record<CompanyId, { invested: number; yearlyReturn: number; returns: number }>
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
