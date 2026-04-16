import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import './AdminApp.css'
import {
  buildDisplayRound,
  formatAdminAuditAction,
  getCompanyDisplayMeta,
  getDisplayReveal,
  getDisplayYearLabel,
  getVisibleCompanyIds,
} from './display'
import { createSocketClient } from './socket-client'
import type {
  AckResponse,
  AdminSnapshot,
  AuditLogEntry,
  CompanyId,
  RoundResults,
  SerializedError,
  SocketLike,
} from './types'
import {
  formatCompactCurrency,
  formatCountdown,
  formatCurrency,
  formatDirectionalReturn,
  formatDuration,
  formatPhaseLabel,
  formatTimestamp,
  getCountdownMs,
  totalInvested,
} from './utils'

const ADMIN_SESSION_STORAGE_KEY = 'auction-admin-session'

interface StoredAdminSession {
  secret: string
  snapshot: AdminSnapshot
}

function readStoredAdminSession(): StoredAdminSession | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredAdminSession>
    if (typeof parsed.secret !== 'string' || !parsed.snapshot || typeof parsed.snapshot !== 'object') return null

    return {
      secret: parsed.secret,
      snapshot: parsed.snapshot as AdminSnapshot,
    }
  } catch {
    return null
  }
}

function writeStoredAdminSession(session: StoredAdminSession | null) {
  if (typeof window === 'undefined') return

  try {
    if (session) {
      window.sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session))
      return
    }

    window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY)
  } catch {
    // Ignore storage failures so the dashboard still works when storage is blocked.
  }
}

type SocketFactory = () => SocketLike
type InferredTradeAction = 'buy' | 'sell'

interface InferredTradeEntry {
  action: InferredTradeAction
  amount: number
  companyId: CompanyId
  id: string
  round: number
  teamId: string
  teamName: string
  timestamp: string
}

function useCountdown(snapshot: AdminSnapshot | null) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'live' || snapshot.endsAt === null) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      setTick((current) => current + 1)
    }, 100)

    return () => {
      window.clearInterval(timerId)
    }
  }, [snapshot])

  return getCountdownMs(snapshot)
}

function AuditList({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="empty-copy">No admin actions recorded yet.</p>
  }

  return (
    <div className="audit-list">
      {entries.slice(-8).reverse().map((entry) => (
        <article key={`${entry.timestamp}-${entry.action}-${entry.socketId}`} className="audit-item">
          <div className="audit-item-head">
            <strong>{formatAdminAuditAction(entry.action)}</strong>
            <span className={`audit-status ${entry.result}`}>{entry.result}</span>
          </div>
          <p>{formatTimestamp(entry.timestamp)}</p>
        </article>
      ))}
    </div>
  )
}

function InferredTradeList({ entries }: { entries: InferredTradeEntry[] }) {
  if (entries.length === 0) {
    return <p className="empty-copy">No participant trade movements captured yet.</p>
  }

  return (
    <div className="trade-log-list admin">
      {entries.map((entry) => (
        <article key={entry.id} className="trade-log-entry admin">
          <div className="trade-log-head">
            <strong>{entry.action === 'buy' ? 'Buy' : 'Sell'}</strong>
            <span>{formatTimestamp(entry.timestamp)}</span>
          </div>
          <div className="trade-log-body">
            <span>
              {entry.teamName} • {getCompanyDisplayMeta(entry.companyId).name}
            </span>
            <strong>{formatCurrency(entry.amount)}</strong>
          </div>
          <p>{getDisplayYearLabel(entry.round)} session</p>
        </article>
      ))}
    </div>
  )
}

function inferTrades(previous: AdminSnapshot | null, nextSnapshot: AdminSnapshot): InferredTradeEntry[] {
  if (!previous || nextSnapshot.round <= 0) {
    return []
  }

  const visibleCompanies = getVisibleCompanyIds(nextSnapshot.round)
  const previousTeams = new Map(previous.leaderboard.map((entry) => [entry.teamId, entry]))
  const inferred: InferredTradeEntry[] = []
  const timestamp = new Date().toISOString()

  for (const team of nextSnapshot.leaderboard) {
    const previousTeam = previousTeams.get(team.teamId)
    if (!previousTeam) continue

    for (const companyId of visibleCompanies) {
      const previousAmount = previousTeam.investments[companyId] ?? 0
      const nextAmount = team.investments[companyId] ?? 0
      const delta = nextAmount - previousAmount

      if (delta === 0) continue

      inferred.push({
        action: delta > 0 ? 'buy' : 'sell',
        amount: Math.abs(delta),
        companyId,
        id: `${nextSnapshot.round}-${team.teamId}-${companyId}-${delta}-${timestamp}`,
        round: nextSnapshot.round,
        teamId: team.teamId,
        teamName: team.name,
        timestamp,
      })
    }
  }

  return inferred.reverse()
}

export function AdminApp({ socketFactory = createSocketClient }: { socketFactory?: SocketFactory }) {
  const socketRef = useRef<SocketLike | null>(null)
  const prevSnapshotRef = useRef<AdminSnapshot | null>(null)
  const durationDirtyRef = useRef(false)
  const storedSession = readStoredAdminSession()

  const [secret, setSecret] = useState(() => storedSession?.secret ?? '')
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(() => storedSession?.snapshot ?? null)
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(() => storedSession !== null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [durationSeconds, setDurationSeconds] = useState('60')
  const [durationDirty, setDurationDirty] = useState(false)
  const [inferredTrades, setInferredTrades] = useState<InferredTradeEntry[]>([])
  const [roundFilter, setRoundFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState<'all' | InferredTradeAction>('all')

  const countdownMs = useCountdown(snapshot)
  const currentResults = roundResults ?? snapshot?.lastRoundResults ?? null
  const displayRound = useMemo(() => buildDisplayRound(snapshot?.currentRound ?? null), [snapshot?.currentRound])

  useEffect(() => {
    durationDirtyRef.current = durationDirty
  }, [durationDirty])

  useEffect(() => {
    if (isAuthenticated && snapshot) {
      writeStoredAdminSession({ secret, snapshot })
    }
  }, [isAuthenticated, secret, snapshot])

  useEffect(() => {
    const socket = socketFactory()
    socketRef.current = socket

    const handleDisconnect = () => {
      setIsAuthenticated(false)
      setPendingAction(null)
      setActionError('Admin connection lost. Reconnect to continue.')
    }

    const handleConnectError = () => {
      setAuthError('Unable to reach the realtime server.')
    }

    const handleSnapshot = (nextSnapshot: AdminSnapshot) => {
      const newTrades = inferTrades(prevSnapshotRef.current, nextSnapshot)
      if (newTrades.length > 0) {
        setInferredTrades((current) => [...newTrades, ...current].slice(0, 64))
      }

      prevSnapshotRef.current = nextSnapshot
      setSnapshot(nextSnapshot)

      if (nextSnapshot.phase === 'results' || nextSnapshot.phase === 'finished') {
        setRoundResults(nextSnapshot.lastRoundResults)
      } else {
        setRoundResults(null)
      }

      if (!durationDirtyRef.current || nextSnapshot.phase !== 'idle') {
        setDurationSeconds(String(Math.max(1, Math.round(nextSnapshot.roundDurationMs / 1000))))
        if (nextSnapshot.phase !== 'idle') {
          setDurationDirty(false)
        }
      }
    }

    const handleRoundResults = (results: RoundResults) => {
      setRoundResults(results)
    }

    const handleGameError = (error: SerializedError) => {
      setActionError(error.message)
      setPendingAction(null)
    }

    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on('game:snapshot', handleSnapshot)
    socket.on('round:results', handleRoundResults)
    socket.on('game:error', handleGameError)

    return () => {
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.off('game:snapshot', handleSnapshot)
      socket.off('round:results', handleRoundResults)
      socket.off('game:error', handleGameError)
      socket.disconnect()
      socketRef.current = null
    }
  }, [socketFactory])

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!socketRef.current) return

    if (!secret.trim()) {
      setAuthError('Admin secret is required.')
      return
    }

    setAuthError(null)
    setActionError(null)

    socketRef.current.emit(
      'admin:authenticate',
      { secret },
      (response: AckResponse<{ authenticated: boolean; snapshot: AdminSnapshot }>) => {
        if (response.ok && response.data.authenticated) {
          prevSnapshotRef.current = response.data.snapshot
          setIsAuthenticated(true)
          setSnapshot(response.data.snapshot)
          setRoundResults(response.data.snapshot.lastRoundResults)
          setDurationSeconds(String(Math.max(1, Math.round(response.data.snapshot.roundDurationMs / 1000))))
          setDurationDirty(false)
          setActionMessage('Admin console connected.')
          writeStoredAdminSession({ secret, snapshot: response.data.snapshot })
          return
        }

        writeStoredAdminSession(null)
        setIsAuthenticated(false)
        setSnapshot(null)
        setAuthError(response.ok ? 'Authentication failed.' : response.error.message)
      },
    )
  }

  function runCommand(eventName: string, payload: Record<string, unknown> = {}, successMessage?: string) {
    if (!socketRef.current) return

    setPendingAction(eventName)
    setActionError(null)
    setActionMessage(null)

    socketRef.current.emit(eventName, payload, (response: AckResponse<unknown>) => {
      setPendingAction(null)

      if (response.ok) {
        if (successMessage) {
          setActionMessage(successMessage)
        }
        return
      }

      setActionError(response.error.message)
    })
  }

  function handleTimerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedSeconds = Number.parseInt(durationSeconds, 10)

    if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) {
      setActionError('Round timer must be a positive number of seconds.')
      return
    }

    runCommand(
      'admin:set-round-duration',
      { roundDurationMs: parsedSeconds * 1000 },
      `Timer updated to ${formatDuration(parsedSeconds * 1000)}.`,
    )
    setDurationDirty(false)
  }

  if (!isAuthenticated || !snapshot) {
    return (
      <section className="host-view">
        <div className="view-intro">
          <div>
            <span className="eyebrow">Admin console</span>
            <h2>Control the live terminal</h2>
            <p>Authenticate once, set the timer before launch, and manage the room from a single operating surface.</p>
          </div>
          <p className="status-line">Status: Sign in required</p>
        </div>

        <div className="host-auth-layout">
          <section className="host-panel intro-panel">
            <span className="eyebrow">Operator notes</span>
            <h3>Keep the room orderly.</h3>
            <p>Use the console to control pacing, watch submission status, and review participant movement without changing any backend contracts.</p>
          </section>

          <section className={`host-panel auth-panel ${authError || actionError ? 'panel-error' : ''}`}>
            <span className="eyebrow">Authenticate</span>
            <h3>Admin access</h3>
            <form className="host-auth-form" onSubmit={handleLogin}>
              <label className={`field ${authError === 'Admin secret is required.' ? 'field-error' : ''}`}>
                <span>Admin Secret</span>
                <input
                  aria-label="Admin Secret"
                  type="password"
                  placeholder="Enter the admin secret"
                  required
                  value={secret}
                  onChange={(event) => {
                    setSecret(event.target.value)
                    if (authError) setAuthError(null)
                  }}
                />
              </label>
              <button className="primary-button" type="submit">
                Unlock dashboard
              </button>
            </form>
            {authError ? <p className="message-banner error">{authError}</p> : null}
            {actionError ? <p className="message-banner error">{actionError}</p> : null}
          </section>
        </div>
      </section>
    )
  }

  const isIdle = snapshot.phase === 'idle'
  const isLive = snapshot.phase === 'live'
  const isPaused = snapshot.phase === 'paused'
  const isResults = snapshot.phase === 'results'
  const isFinished = snapshot.phase === 'finished'
  const leader = snapshot.leaderboard[0] ?? null
  const visibleResultCompanies = currentResults ? getVisibleCompanyIds(currentResults.round) : []
  const timerDisplayMs = isLive || isPaused ? countdownMs : snapshot.roundDurationMs
  const timerDisplayText = formatCountdown(timerDisplayMs)
  const isLowTime = snapshot.phase === 'live' && timerDisplayMs <= 15000

  const filteredTrades = inferredTrades.filter((entry) => {
    if (roundFilter !== 'all' && String(entry.round) !== roundFilter) return false
    if (teamFilter !== 'all' && entry.teamId !== teamFilter) return false
    if (actionFilter !== 'all' && entry.action !== actionFilter) return false
    return true
  })

  const availableRounds = [...new Set(inferredTrades.map((entry) => entry.round))]
  const availableTeams = [...new Set(inferredTrades.map((entry) => `${entry.teamId}::${entry.teamName}`))]

  return (
    <section className="host-view">
      <div className={`timer-rail ${isLowTime ? 'low-time' : ''}`}>
        <span className="summary-label">Round Timer</span>
        <strong>{timerDisplayText}</strong>
      </div>

      <div className="view-intro">
        <div>
          <span className="eyebrow">Admin console</span>
          <h2>Live market controls</h2>
          <p>
            Round {snapshot.round} of {snapshot.totalRounds} • {formatPhaseLabel(snapshot.phase)} • {snapshot.activeTeamsCount} active teams
          </p>
        </div>
        <span className={`phase-chip ${snapshot.phase}`}>{formatPhaseLabel(snapshot.phase)}</span>
      </div>

      <section className="host-summary-grid">
        <article className="summary-card">
          <span className="summary-label">Configured timer</span>
          <strong>{formatDuration(snapshot.roundDurationMs)}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Live countdown</span>
          <strong>{isLive || isPaused ? formatCountdown(countdownMs) : '00:00.0'}</strong>
        </article>
        <article className="summary-card emphasis">
          <span className="summary-label">Top portfolio</span>
          <strong>{leader ? formatCompactCurrency(leader.totalValue) : 'No teams yet'}</strong>
        </article>
      </section>

      <div className="host-main-grid">
        <section className="host-panel spotlight-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Round spotlight</span>
              <h3>{displayRound ? displayRound.title : 'Room not live yet'}</h3>
            </div>
            {displayRound ? <p className="status-line">Year {displayRound.yearRange}</p> : null}
          </div>

          {displayRound && (isLive || isPaused) ? (
            <div className="spotlight-stage">
              <div className="year-badge-wrap">
                <span className="summary-label">Visible year</span>
                <strong className="year-badge">{displayRound.year}</strong>
              </div>
              <p>{displayRound.context}</p>
              <div className="stage-clock">
                <span className="summary-label">Countdown</span>
                <strong>{formatCountdown(countdownMs)}</strong>
              </div>
            </div>
          ) : null}

          {currentResults && (isResults || isFinished) ? (
            <div className="result-grid host-results-grid">
              {visibleResultCompanies.map((companyId) => {
                const meta = getCompanyDisplayMeta(companyId)
                const value = currentResults.actualReturns[companyId]
                return (
                  <article key={companyId} className="result-card">
                    <div className="result-card-head">
                      <div>
                        <span className="ticker-pill">{meta.code}</span>
                        <strong>{meta.name}</strong>
                      </div>
                      <span className={value >= 0 ? 'positive' : 'negative'}>{formatDirectionalReturn(value)}</span>
                    </div>
                    <p>{getDisplayReveal(currentResults.round, companyId)}</p>
                  </article>
                )
              })}
            </div>
          ) : null}

          {isIdle ? <p className="empty-copy">Set the timer, wait for desks to join, then open the first market year.</p> : null}
          {isFinished && leader ? <p className="empty-copy">{leader.name} closes on top with {formatCurrency(leader.totalValue)}.</p> : null}
        </section>

        <section className={`host-panel controls-panel ${actionError ? 'panel-error' : ''}`}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Controls</span>
              <h3>Timer and round flow</h3>
            </div>
            {pendingAction ? <p className="status-line">Running {pendingAction.replace('admin:', '')}</p> : null}
          </div>

          <form className="timer-form" onSubmit={handleTimerSubmit}>
            <label className="field">
              <span>Round timer (seconds)</span>
              <input
                aria-label="Round timer"
                type="number"
                min="1"
                max="3600"
                value={durationSeconds}
                disabled={!isIdle || pendingAction !== null}
                onChange={(event) => {
                  setDurationSeconds(event.target.value)
                  setDurationDirty(true)
                }}
              />
            </label>
            <button className="secondary-button" type="submit" disabled={!isIdle || pendingAction !== null || !durationDirty}>
              Update timer
            </button>
          </form>

          <div className="control-grid">
            <button
              className="primary-button"
              type="button"
              disabled={!isIdle || pendingAction !== null}
              onClick={() => runCommand('admin:start-game', {}, 'Market opened.')}
            >
              Open market
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!isLive || pendingAction !== null}
              onClick={() => runCommand('admin:pause-round', {}, 'Round paused.')}
            >
              Pause timer
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!isPaused || pendingAction !== null}
              onClick={() => runCommand('admin:resume-round', {}, 'Round resumed.')}
            >
              Resume timer
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!isLive || pendingAction !== null}
              onClick={() => runCommand('admin:end-round', {}, 'Round closed early.')}
            >
              Close round
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={(!isResults && !isFinished) || isFinished || pendingAction !== null}
              onClick={() => runCommand('admin:next-round', {}, 'Next round opened.')}
            >
              Next round
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={pendingAction !== null}
              onClick={() => runCommand('admin:reset-game', {}, 'Session reset to standby.')}
            >
              Reset room
            </button>
          </div>

          {actionMessage ? <p className="message-banner info">{actionMessage}</p> : null}
          {actionError ? <p className="message-banner error">{actionError}</p> : null}
        </section>
      </div>

      <div className="host-lower-grid">
        <section className="host-panel leaderboard-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Leaderboard</span>
              <h3>Participant standings</h3>
            </div>
            <p className="status-line">{snapshot.leaderboard.length} desks</p>
          </div>

          {snapshot.leaderboard.length === 0 ? (
            <p className="empty-copy">No desks have joined yet.</p>
          ) : (
            <div className="leaderboard-list">
              {snapshot.leaderboard.map((entry, index) => {
                const submission = snapshot.teamSubmissions.find((team) => team.teamId === entry.teamId)
                return (
                  <article key={entry.teamId} className="leaderboard-row admin">
                    <div className="leaderboard-rank">#{index + 1}</div>
                    <div className="leaderboard-copy">
                      <strong>{entry.name}</strong>
                      <span>{entry.connected ? 'Connected' : 'Disconnected'} • {submission?.hasSubmitted ? 'Submitted' : 'Waiting'}</span>
                    </div>
                    <div className="leaderboard-values">
                      <span>{formatCurrency(entry.purse)} cash</span>
                      <span>{formatCurrency(totalInvested(entry.investments))} holdings</span>
                      <strong>{formatCurrency(entry.totalValue)}</strong>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="host-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Backend audit</span>
              <h3>Recent admin actions</h3>
            </div>
          </div>
          <AuditList entries={snapshot.auditLog} />
        </section>
      </div>

      <section className="host-panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Participant flow</span>
            <h3>Inferred trade activity</h3>
          </div>
        </div>

        <div className="filter-row">
          <label className="field compact-field">
            <span>Round</span>
            <select aria-label="Round filter" value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
              <option value="all">All rounds</option>
              {availableRounds.map((round) => (
                <option key={round} value={String(round)}>
                  {getDisplayYearLabel(round)}
                </option>
              ))}
            </select>
          </label>
          <label className="field compact-field">
            <span>Team</span>
            <select aria-label="Team filter" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
              <option value="all">All teams</option>
              {availableTeams.map((team) => {
                const [teamId, teamName] = team.split('::')
                return (
                  <option key={teamId} value={teamId}>
                    {teamName}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="field compact-field">
            <span>Action</span>
            <select aria-label="Action filter" value={actionFilter} onChange={(event) => setActionFilter(event.target.value as 'all' | InferredTradeAction)}>
              <option value="all">All actions</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
        </div>

        <InferredTradeList entries={filteredTrades} />
      </section>
    </section>
  )
}

export default AdminApp
