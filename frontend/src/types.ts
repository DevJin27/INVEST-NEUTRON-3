export type GamePhase = 'idle' | 'live' | 'paused' | 'results' | 'finished'
export type Decision = 'TRADE' | 'IGNORE'

export interface TeamCredentials {
  teamId: string
  name: string
}

export interface Signal {
  id: string
  text: string
  type: 'ALPHA' | 'NOISE'
  value: number
  credibility: number
}

export interface LeaderboardEntry {
  teamId: string
  name: string
  score: number
  connected: boolean
}

export interface ViewerSubmission {
  teamId: string | null
  hasSubmitted: boolean
  decision: Decision | null
  canSubmit: boolean
}

export interface GameSnapshot {
  activeTeamsCount: number
  currentSignal: Signal | null
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
  decision?: Decision
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
