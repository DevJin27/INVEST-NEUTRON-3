import { type FormEvent, useEffect, useRef, useState } from 'react'
import './AdminApp.css'
import { createSocketClient } from './socket-client'
import type { AckResponse, AdminSnapshot, AuditLogEntry, RoundResults, SerializedError, SocketLike } from './types'
import { COMPANY_IDS } from './types'
import {
  formatCompactCurrency,
  formatCountdown,
  formatCurrency,
  formatDuration,
  formatPhaseLabel,
  formatReturnMultiplier,
  getCountdownMs,
} from './utils'

type SocketFactory = () => SocketLike

const COMPANY_EMOJIS: Record<string, string> = {
  reliance: '🏭',
  hdfc_bank: '🏦',
  infosys: '💻',
  yes_bank: '🏧',
  byjus: '📚',
  adani: '⚡',
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
  }, [snapshot?.phase, snapshot?.endsAt])

  return getCountdownMs(snapshot)
}

function formatAuditTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function AuditList({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="host-empty">No admin actions recorded yet.</p>
  }

  return (
    <div className="audit-list">
      {entries.slice(-6).reverse().map((entry) => (
        <article key={`${entry.timestamp}-${entry.action}-${entry.socketId}`} className="audit-item">
          <div className="audit-row">
            <strong>{entry.action.replace('admin:', '')}</strong>
            <span className={`audit-pill ${entry.result}`}>{entry.result}</span>
          </div>
          <p>{formatAuditTimestamp(entry.timestamp)}</p>
        </article>
      ))}
    </div>
  )
}

export function AdminApp({ socketFactory = createSocketClient }: { socketFactory?: SocketFactory }) {
  const socketRef = useRef<SocketLike | null>(null)
  const durationDirtyRef = useRef(false)

  const [secret, setSecret] = useState('')
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [durationSeconds, setDurationSeconds] = useState('60')
  const [durationDirty, setDurationDirty] = useState(false)

  const countdownMs = useCountdown(snapshot)
  const currentResults = roundResults ?? snapshot?.lastRoundResults ?? null

  useEffect(() => {
    durationDirtyRef.current = durationDirty
  }, [durationDirty])

  useEffect(() => {
    const socket = socketFactory()
    socketRef.current = socket

    const handleDisconnect = () => {
      setIsAuthenticated(false)
      setPendingAction(null)
      setActionError('Host connection lost. Reconnect to continue.')
    }

    const handleConnectError = () => {
      setAuthError('Unable to reach the realtime server.')
    }

    const handleSnapshot = (nextSnapshot: AdminSnapshot) => {
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

    setAuthError(null)
    setActionError(null)

    socketRef.current.emit(
      'admin:authenticate',
      { secret },
      (response: AckResponse<{ authenticated: boolean; snapshot: AdminSnapshot }>) => {
        if (response.ok && response.data.authenticated) {
          setIsAuthenticated(true)
          setSnapshot(response.data.snapshot)
          setRoundResults(response.data.snapshot.lastRoundResults)
          setDurationSeconds(String(Math.max(1, Math.round(response.data.snapshot.roundDurationMs / 1000))))
          setDurationDirty(false)
          setActionMessage('Host console connected.')
          return
        }

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
            <span className="eyebrow">Host Console</span>
            <h2>Control the live room</h2>
            <p>Authenticate once, set the timer before launch, and run the round lifecycle from a single operating panel.</p>
          </div>
          <div className="chip-row">
            <span className="shell-chip">Timer setup before launch</span>
            <span className="shell-chip">End rounds early</span>
            <span className="shell-chip">Live team monitoring</span>
          </div>
        </div>

        <div className="host-auth-layout">
          <section className="surface-panel hero-panel">
            <span className="eyebrow">Operator notes</span>
            <h3>Keep the room calm, visible, and fair.</h3>
            <p>
              The host console is tuned for quick decisions: prep the timer, watch team submissions, pause when needed, and
              resolve a round instantly if the room needs to move on.
            </p>
          </section>

          <section className="surface-panel auth-panel">
            <span className="eyebrow">Authenticate</span>
            <h3>Host Access</h3>
            <form className="host-auth-form" onSubmit={handleLogin}>
              <label className="field">
                <span>Admin Secret</span>
                <input
                  aria-label="Admin Secret"
                  type="password"
                  placeholder="Enter the admin secret"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
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

  return (
    <section className="host-view">
      <div className="view-intro">
        <div>
          <span className="eyebrow">Host Console</span>
          <h2>Live room controls</h2>
          <p>
            Round {snapshot.round} of {snapshot.totalRounds} • {formatPhaseLabel(snapshot.phase)} phase
          </p>
        </div>
        <div className="chip-row">
          <span className="phase-chip host">{formatPhaseLabel(snapshot.phase)}</span>
          <span className="shell-chip">{snapshot.activeTeamsCount} active teams</span>
          <span className="shell-chip">Timer {formatDuration(snapshot.roundDurationMs)}</span>
        </div>
      </div>

      <section className="host-summary-grid">
        <article className="metric-card surface-panel">
          <span className="mini-label">Configured timer</span>
          <strong>{formatDuration(snapshot.roundDurationMs)}</strong>
        </article>
        <article className="metric-card surface-panel">
          <span className="mini-label">Live countdown</span>
          <strong>{isLive || isPaused ? formatCountdown(countdownMs) : '00:00.0'}</strong>
        </article>
        <article className="metric-card surface-panel">
          <span className="mini-label">Top portfolio</span>
          <strong>{leader ? formatCompactCurrency(leader.totalValue) : 'No teams yet'}</strong>
        </article>
      </section>

      <div className="host-grid">
        <section className="surface-panel stage-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Stage</span>
              <h3>Round spotlight</h3>
            </div>
            {snapshot.currentRound ? <span className="shell-chip">{snapshot.currentRound.yearRange}</span> : null}
          </div>

          {snapshot.currentRound && (isLive || isPaused) ? (
            <div className="stage-hero">
              <div className="stage-year">{snapshot.currentRound.year}</div>
              <div className="stage-copy">
                <h4>{snapshot.currentRound.title}</h4>
                <p>{snapshot.currentRound.context}</p>
              </div>
              <div className="stage-clock">
                <span className="mini-label">Countdown</span>
                <strong>{formatCountdown(countdownMs)}</strong>
              </div>
            </div>
          ) : null}

          {currentResults && (isResults || isFinished) ? (
            <div className="host-results">
              <div className="host-results-head">
                <h4>{currentResults.title} results</h4>
                <span className="shell-chip">Year {currentResults.year}</span>
              </div>
              <div className="host-results-grid">
                {COMPANY_IDS.map((companyId) => (
                  <article key={companyId} className="host-result-card">
                    <span className="company-emoji">{COMPANY_EMOJIS[companyId]}</span>
                    <strong>{companyId.replace('_', ' ')}</strong>
                    <span className={currentResults.actualReturns[companyId] >= 0 ? 'positive' : 'negative'}>
                      {formatReturnMultiplier(currentResults.actualReturns[companyId])}
                    </span>
                    <p>{currentResults.yearEndReveal[companyId]}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {isIdle ? (
            <div className="stage-empty">
              <h4>Ready to open the room</h4>
              <p>Set the timer, wait for teams to join, then start the first market year.</p>
            </div>
          ) : null}

          {isFinished && leader ? (
            <div className="stage-empty">
              <h4>{leader.name} leads the table</h4>
              <p>Final portfolio value: {formatCurrency(leader.totalValue)}</p>
            </div>
          ) : null}
        </section>

        <section className="surface-panel controls-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Controls</span>
              <h3>Timer and round flow</h3>
            </div>
            {pendingAction ? <span className="shell-chip">Running {pendingAction.replace('admin:', '')}</span> : null}
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
            <button
              className="secondary-button"
              type="submit"
              disabled={!isIdle || pendingAction !== null || !durationDirty}
            >
              Update timer
            </button>
          </form>

          <div className="control-grid">
            <button
              className="primary-button"
              type="button"
              disabled={!isIdle || pendingAction !== null}
              onClick={() => runCommand('admin:start-game', {}, 'Game started.')}
            >
              Start game
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
              className="danger-button"
              type="button"
              disabled={!isLive || pendingAction !== null}
              onClick={() => runCommand('admin:end-round', {}, 'Round ended early.')}
            >
              End round early
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
              className="danger-button ghost"
              type="button"
              disabled={pendingAction !== null}
              onClick={() => runCommand('admin:reset-game', {}, 'Game reset to idle.')}
            >
              Reset game
            </button>
          </div>

          {actionMessage ? <p className="message-banner info">{actionMessage}</p> : null}
          {actionError ? <p className="message-banner error">{actionError}</p> : null}
        </section>

        <section className="surface-panel teams-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Teams</span>
              <h3>Submissions and balances</h3>
            </div>
            <span className="shell-chip">{snapshot.teamSubmissions.length} joined teams</span>
          </div>

          {snapshot.teamSubmissions.length === 0 ? (
            <p className="host-empty">No teams have joined yet.</p>
          ) : (
            <div className="team-status-list">
              {snapshot.teamSubmissions.map((team) => (
                <article key={team.teamId} className={`team-status-card ${team.hasSubmitted ? 'submitted' : 'pending'}`}>
                  <div className="team-status-head">
                    <div>
                      <strong>{team.name}</strong>
                      <p>{team.connected ? 'Connected' : 'Disconnected'}</p>
                    </div>
                    <span className={`team-state-pill ${team.hasSubmitted ? 'submitted' : 'pending'}`}>
                      {team.hasSubmitted ? 'Submitted' : 'Waiting'}
                    </span>
                  </div>
                  <div className="team-balance-row">
                    <span>{formatCurrency(team.purse)} cash</span>
                    <span>{formatCurrency(team.totalInvested)} invested</span>
                    <strong>{formatCurrency(team.totalValue)} total</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="surface-panel audit-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Audit</span>
              <h3>Recent host actions</h3>
            </div>
          </div>
          <AuditList entries={snapshot.auditLog} />
        </section>
      </div>
    </section>
  )
}

export default AdminApp
