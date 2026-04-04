import { type FormEvent, useEffect, useRef, useState, useCallback } from 'react'
import './App.css'
import { createSocketClient } from './socket-client'
import type {
  AckResponse,
  Allocation,
  CompanyId,
  ConnectionState,
  GameSnapshot,
  RoundResults,
  SerializedError,
  SocketLike,
  SubmissionStatus,
  TeamCredentials,
  ViewerSubmission,
} from './types'
import { COMPANY_IDS } from './types'
import {
  allocationTotal,
  blankAllocation,
  equalAllocation,
  formatCountdown,
  formatCurrency,
  formatReturn,
  formatReturnMultiplier,
  getCountdownMs,
  isAllocationValid,
  isPlayableSnapshot,
  sentimentColor,
  sentimentLabel,
} from './utils'

// ─── Company display metadata ─────────────────────────────────────────────────
const COMPANY_META: Record<CompanyId, { emoji: string; color: string }> = {
  reliance:  { emoji: '🏭', color: '#3b82f6' },
  hdfc_bank: { emoji: '🏦', color: '#10b981' },
  infosys:   { emoji: '💻', color: '#6366f1' },
  yes_bank:  { emoji: '🏧', color: '#f59e0b' },
  byjus:     { emoji: '📚', color: '#ec4899' },
  adani:     { emoji: '⚡', color: '#8b5cf6' },
}

// ─── Types ────────────────────────────────────────────────────────────────────
type SocketFactory = () => SocketLike

const EMPTY_SUBMISSION: ViewerSubmission = {
  teamId: null,
  hasSubmitted: false,
  allocation: null,
  canSubmit: false,
}

// ─── Countdown hook ───────────────────────────────────────────────────────────
function useCountdown(snapshot: GameSnapshot | null): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'live' || snapshot.endsAt === null) return undefined
    const id = window.setInterval(() => setTick((t) => t + 1), 100)
    return () => window.clearInterval(id)
  }, [snapshot])
  return getCountdownMs(snapshot)
}

// ─── AllocationRow component ──────────────────────────────────────────────────
interface AllocationRowProps {
  companyId: CompanyId
  signal: { name: string; sector: string; headline: string; sentiment: 'positive' | 'negative' | 'neutral'; detail: string; credibility: number } | undefined
  value: number
  onChange: (id: CompanyId, val: number) => void
  disabled: boolean
  remainingPoints: number
}

function AllocationRow({ companyId, signal, value, onChange, disabled, remainingPoints }: AllocationRowProps) {
  const meta = COMPANY_META[companyId]
  const maxAllowable = Math.min(100, value + remainingPoints)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseInt(e.target.value, 10)
    const clamped = Math.max(0, Math.min(isNaN(raw) ? 0 : raw, maxAllowable))
    onChange(companyId, clamped)
  }

  if (!signal) return null

  return (
    <div className="alloc-row" style={{ borderColor: `${meta.color}22` }}>
      <div className="alloc-company-header">
        <span className="alloc-emoji">{meta.emoji}</span>
        <div className="alloc-company-info">
          <span className="alloc-name">{signal.name}</span>
          <span className="alloc-sector">{signal.sector}</span>
        </div>
        <div className="alloc-sentiment" style={{ color: sentimentColor(signal.sentiment) }}>
          {sentimentLabel(signal.sentiment)}
        </div>
      </div>

      <p className="alloc-headline">{signal.headline}</p>
      <p className="alloc-detail">{signal.detail}</p>

      <div className="alloc-credibility">
        <span className="alloc-cred-label">Signal credibility</span>
        <div className="alloc-cred-bar-bg">
          <div className="alloc-cred-bar-fill" style={{ width: `${signal.credibility}%`, background: meta.color }} />
        </div>
        <span className="alloc-cred-pct">{signal.credibility}%</span>
      </div>

      <div className="alloc-input-row">
        <input
          aria-label={`Allocation for ${signal.name}`}
          className="alloc-slider"
          disabled={disabled}
          max={maxAllowable}
          min={0}
          step={5}
          style={{ accentColor: meta.color }}
          type="range"
          value={value}
          onChange={handleChange}
        />
        <div className="alloc-pct-badge" style={{ background: `${meta.color}22`, color: meta.color }}>
          {value}%
        </div>
      </div>
    </div>
  )
}

// ─── RoundResults overlay ─────────────────────────────────────────────────────
interface RoundResultsOverlayProps {
  results: RoundResults
  myTeamId: string | null
  onDismiss: () => void
}

function RoundResultsOverlay({ results, myTeamId, onDismiss }: RoundResultsOverlayProps) {
  const myOutcome = results.teamOutcomes.find((o) => o.teamId === myTeamId)
  return (
    <div className="results-overlay">
      <div className="results-panel">
        <div className="results-year-badge">{results.yearRange}</div>
        <h2 className="results-title">{results.title} — Results</h2>

        <div className="results-companies">
          {COMPANY_IDS.map((id) => {
            const ret = results.actualReturns[id]
            const reveal = results.yearEndReveal[id]
            const meta = COMPANY_META[id]
            const myAlloc = myOutcome?.allocation?.[id] ?? 0
            const positive = ret >= 0
            return (
              <div key={id} className="results-company-row">
                <span className="results-company-emoji">{meta.emoji}</span>
                <div className="results-company-body">
                  <p className="results-reveal">{reveal}</p>
                  {myAlloc > 0 && (
                    <span className="results-my-alloc">You allocated {myAlloc}%</span>
                  )}
                </div>
                <div
                  className={`results-return-badge ${positive ? 'positive' : 'negative'}`}
                >
                  {formatReturnMultiplier(ret)}
                </div>
              </div>
            )
          })}
        </div>

        {myOutcome && (
          <div className={`results-my-summary ${myOutcome.delta >= 0 ? 'positive' : 'negative'}`}>
            <span>Your portfolio</span>
            <div>
              <strong>{formatCurrency(myOutcome.portfolioValue)}</strong>
              <span className="results-delta">
                {myOutcome.delta >= 0 ? '▲' : '▼'} {formatReturn(myOutcome.percentReturn)}
              </span>
            </div>
          </div>
        )}

        <button className="dismiss-button" onClick={onDismiss}>
          See Leaderboard →
        </button>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export function TeamDashboardApp({ socketFactory = createSocketClient }: { socketFactory?: SocketFactory }) {
  const socketRef = useRef<SocketLike | null>(null)
  const requestedCredentialsRef = useRef<TeamCredentials | null>(null)
  const joinedCredentialsRef = useRef<TeamCredentials | null>(null)

  const [formValues, setFormValues] = useState({ teamId: '', name: '' })
  const [requestedCredentials, setRequestedCredentials] = useState<TeamCredentials | null>(null)
  const [joinedCredentials, setJoinedCredentials] = useState<TeamCredentials | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [pendingSubmit, setPendingSubmit] = useState(false)

  // Portfolio allocation (local state until submitted)
  const [localAllocation, setLocalAllocation] = useState<Allocation>(blankAllocation())
  const [submittedAllocation, setSubmittedAllocation] = useState<Allocation | null>(null)

  // Round results overlay
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null)
  const [showResults, setShowResults] = useState(false)

  useEffect(() => { requestedCredentialsRef.current = requestedCredentials }, [requestedCredentials])
  useEffect(() => { joinedCredentialsRef.current = joinedCredentials }, [joinedCredentials])

  const countdownMs = useCountdown(snapshot)
  const hasRequestedCredentials = requestedCredentials !== null
  const viewerSubmission = snapshot?.viewerSubmission ?? EMPTY_SUBMISSION
  const canSubmit =
    isPlayableSnapshot(snapshot) &&
    connectionState === 'connected' &&
    viewerSubmission.canSubmit &&
    !viewerSubmission.hasSubmitted &&
    !pendingSubmit &&
    isAllocationValid(localAllocation)
  const remaining = 100 - allocationTotal(localAllocation)

  // Reset local allocation when round changes
  useEffect(() => {
    if (snapshot?.round) {
      setLocalAllocation(blankAllocation())
      setSubmittedAllocation(null)
      setSubmissionError(null)
    }
  }, [snapshot?.round])

  // Sync submitted allocation from server
  useEffect(() => {
    if (viewerSubmission.hasSubmitted && viewerSubmission.allocation) {
      setSubmittedAllocation(viewerSubmission.allocation)
    }
  }, [viewerSubmission.hasSubmitted, viewerSubmission.allocation])

  // Socket setup
  useEffect(() => {
    if (!requestedCredentialsRef.current || socketRef.current) return undefined

    const socket = socketFactory()
    socketRef.current = socket

    const emitJoin = (credentials: TeamCredentials, reconnecting: boolean) => {
      setConnectionState(reconnecting ? 'reconnecting' : 'joining')
      setJoinError(null)
      socket.emit('team:join', credentials, (response: AckResponse<{ team: { teamId: string; name: string } }>) => {
        if (response.ok) {
          joinedCredentialsRef.current = credentials
          setJoinedCredentials(credentials)
          setConnectionState('connected')
          return
        }
        if (reconnecting) { setServerMessage(response.error.message); setConnectionState('reconnecting'); return }
        setJoinError(response.error.message)
        setConnectionState(socket.connected ? 'idle' : 'connecting')
      })
    }

    const handleConnect = () => {
      const creds = joinedCredentialsRef.current ?? requestedCredentialsRef.current
      if (!creds) { setConnectionState('idle'); return }
      emitJoin(creds, Boolean(joinedCredentialsRef.current))
    }

    const handleDisconnect = () => {
      setServerMessage(null)
      if (joinedCredentialsRef.current) { setConnectionState('reconnecting'); return }
      setConnectionState(requestedCredentialsRef.current ? 'connecting' : 'idle')
    }

    const handleConnectError = () => {
      if (joinedCredentialsRef.current) { setConnectionState('reconnecting'); return }
      if (requestedCredentialsRef.current) {
        setJoinError('Unable to reach the server. Retrying...')
        setConnectionState('connecting')
      }
    }

    const handleSnapshot = (next: GameSnapshot) => {
      setSnapshot(next)
      if (next.viewerSubmission.canSubmit && !next.viewerSubmission.hasSubmitted) {
        setPendingSubmit(false)
        setSubmissionError(null)
      }
    }

    const handleSubmissionStatus = (status: SubmissionStatus) => {
      if (status.accepted && status.allocation) {
        setPendingSubmit(false)
        setSubmissionError(null)
        setSubmittedAllocation(status.allocation)
        return
      }
      if (!status.accepted && status.error) {
        setPendingSubmit(false)
        setSubmissionError(status.error.message)
      }
    }

    const handleRoundResults = (results: RoundResults) => {
      setRoundResults(results)
      setShowResults(true)
    }

    const handleGameError = (error: SerializedError) => {
      if (joinedCredentialsRef.current) { setServerMessage(error.message); return }
      setJoinError(error.message)
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on('game:snapshot', handleSnapshot)
    socket.on('round:submission-status', handleSubmissionStatus)
    socket.on('round:results', handleRoundResults)
    socket.on('game:error', handleGameError)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.off('game:snapshot', handleSnapshot)
      socket.off('round:submission-status', handleSubmissionStatus)
      socket.off('round:results', handleRoundResults)
      socket.off('game:error', handleGameError)
      socket.disconnect()
      socketRef.current = null
    }
  }, [hasRequestedCredentials, socketFactory])

  function handleJoinSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const credentials = { teamId: formValues.teamId.trim(), name: formValues.name.trim() }
    if (!credentials.teamId || !credentials.name) { setJoinError('Team ID and team name are required.'); return }
    requestedCredentialsRef.current = credentials
    setRequestedCredentials(credentials)
    setJoinError(null)
    const activeSocket = socketRef.current
    if (!activeSocket || !activeSocket.connected) { setConnectionState('connecting'); return }
    setConnectionState('joining')
    activeSocket.emit('team:join', credentials, (response: AckResponse<{ team: { teamId: string; name: string } }>) => {
      if (response.ok) {
        joinedCredentialsRef.current = credentials
        setJoinedCredentials(credentials)
        setConnectionState('connected')
        return
      }
      setJoinError(response.error.message)
      setConnectionState('idle')
    })
  }

  const handleAllocationChange = useCallback((companyId: CompanyId, value: number) => {
    setLocalAllocation((prev) => ({ ...prev, [companyId]: value }))
  }, [])

  function handleSubmit() {
    const socket = socketRef.current
    if (!socket || !canSubmit) return
    setPendingSubmit(true)
    setSubmissionError(null)
    socket.emit('team:submit', { allocations: localAllocation }, (response: AckResponse<{ allocation: Allocation }>) => {
      if (response.ok) return
      setPendingSubmit(false)
      setSubmissionError(response.error.message)
    })
  }

  const isReconnecting = connectionState === 'reconnecting'
  const myPortfolioValue = snapshot?.leaderboard.find((e) => e.teamId === joinedCredentials?.teamId)?.portfolioValue ?? null

  const statusLabel = isReconnecting
    ? 'Reconnecting...'
    : connectionState === 'connecting' || connectionState === 'joining'
      ? 'Connecting...'
      : snapshot?.phase === 'paused'
        ? 'Round paused'
        : snapshot?.phase === 'live'
          ? 'Live round'
          : snapshot?.phase === 'results'
            ? 'Awaiting next round...'
            : snapshot?.phase === 'finished'
              ? 'Game over!'
              : 'Standing by'

  // ─── Join screen ─────────────────────────────────────────────────────────────
  if (!joinedCredentials) {
    return (
      <main className="shell">
        <section className="panel">
          <div className="join-card">
            <div className="eyebrow">Portfolio Challenge</div>
            <h1>Join your team</h1>
            <p className="lead">
              You'll travel through time from 2012 to 2024, investing in Indian companies before each year's results are
              revealed. Allocate wisely — or watch your portfolio implode.
            </p>
            <form className="join-form" onSubmit={handleJoinSubmit}>
              <label className="field">
                <span>Team ID</span>
                <input autoComplete="off" name="teamId" placeholder="team-1" value={formValues.teamId}
                  onChange={(e) => setFormValues((c) => ({ ...c, teamId: e.target.value }))} />
              </label>
              <label className="field">
                <span>Team Name</span>
                <input autoComplete="off" name="name" placeholder="Bulls of Bombay" value={formValues.name}
                  onChange={(e) => setFormValues((c) => ({ ...c, name: e.target.value }))} />
              </label>
              <button className="join-button" type="submit"
                disabled={connectionState === 'connecting' || connectionState === 'joining'}>
                {connectionState === 'connecting' || connectionState === 'joining' ? 'Joining...' : 'Enter the Market'}
              </button>
            </form>
            <p className="subtle-status">{statusLabel}</p>
            {joinError && <p className="message error" role="alert">{joinError}</p>}
          </div>
        </section>
      </main>
    )
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────────
  const currentRound = isPlayableSnapshot(snapshot) ? snapshot?.currentRound ?? null : null
  const isSubmitted = viewerSubmission.hasSubmitted || submittedAllocation !== null
  const displayAlloc = submittedAllocation ?? localAllocation

  return (
    <main className="shell">
      {/* Round results overlay */}
      {showResults && roundResults && (
        <RoundResultsOverlay
          results={roundResults}
          myTeamId={joinedCredentials.teamId}
          onDismiss={() => setShowResults(false)}
        />
      )}

      <section className="panel dashboard">
        {/* Header */}
        <header className="dashboard-header">
          <div>
            <div className="eyebrow">Portfolio Challenge</div>
            <h1>{joinedCredentials.name}</h1>
            <p className="round-label">
              {snapshot ? `Round ${snapshot.round} of ${snapshot.totalRounds}` : 'Waiting for game to start'}
              {snapshot?.currentRound ? ` · ${snapshot.currentRound.yearRange}` : ''}
            </p>
          </div>
          <div className="header-right">
            {myPortfolioValue !== null && (
              <div className="portfolio-value-badge">
                <span className="portfolio-value-label">Portfolio</span>
                <span className="portfolio-value-amount">{formatCurrency(myPortfolioValue)}</span>
              </div>
            )}
            <div className={`status-pill ${isReconnecting ? 'warning' : ''}`} role="status">
              {statusLabel}
            </div>
          </div>
        </header>

        {/* Year + context */}
        {currentRound ? (
          <div className="year-context-card">
            <div className="year-badge">{currentRound.year}</div>
            <div className="year-content">
              <h2 className="year-title">{currentRound.title}</h2>
              <p className="year-context">{currentRound.context}</p>
            </div>
            <div className="timer-block">
              <div className="timer-label">Time left</div>
              <div className="timer" aria-label="Countdown timer">{formatCountdown(countdownMs)}</div>
            </div>
          </div>
        ) : (
          <div className="waiting-card">
            <p className="waiting-text">
              {snapshot?.phase === 'finished'
                ? '🏁 Game over! Check the leaderboard.'
                : snapshot?.phase === 'results'
                  ? '⏳ Admin is reviewing results...'
                  : '🕐 Waiting for the game to start...'}
            </p>
          </div>
        )}

        {/* Portfolio allocation */}
        {currentRound && (
          <div className="allocation-section">
            <div className="allocation-header">
              <h3>Allocate your portfolio</h3>
              <div className={`remaining-badge ${remaining === 0 ? 'zero' : remaining < 0 ? 'over' : ''}`}>
                {remaining > 0 ? `${remaining}% to allocate` : remaining === 0 ? '✓ Fully allocated' : `${-remaining}% over limit`}
              </div>
            </div>

            <div className="alloc-list">
              {COMPANY_IDS.map((id) => {
                const signal = currentRound.companies.find((c) => c.id === id)
                return (
                  <AllocationRow
                    key={id}
                    companyId={id}
                    signal={signal}
                    value={displayAlloc[id] ?? 0}
                    onChange={handleAllocationChange}
                    disabled={isSubmitted || !viewerSubmission.canSubmit}
                    remainingPoints={remaining}
                  />
                )
              })}
            </div>

            <div className="alloc-quick-actions">
              {!isSubmitted && viewerSubmission.canSubmit && (
                <>
                  <button className="quick-btn" onClick={() => setLocalAllocation(equalAllocation())}>
                    Equal Weight
                  </button>
                  <button className="quick-btn" onClick={() => setLocalAllocation(blankAllocation())}>
                    Reset
                  </button>
                </>
              )}
            </div>

            <div className="submit-row">
              {isSubmitted ? (
                <div className="submitted-banner" role="status">
                  ✓ Portfolio submitted for {snapshot?.currentRound?.year}
                </div>
              ) : (
                <button
                  className="submit-button"
                  disabled={!canSubmit || pendingSubmit}
                  onClick={handleSubmit}
                >
                  {pendingSubmit ? 'Submitting...' : remaining !== 0 ? `Allocate remaining ${remaining > 0 ? remaining : -remaining}%` : 'Submit Portfolio'}
                </button>
              )}
              {submissionError && <p className="message error" role="alert">{submissionError}</p>}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {snapshot && snapshot.leaderboard.length > 0 && (
          <div className="leaderboard-section">
            <h3 className="section-title">Leaderboard</h3>
            <div className="leaderboard">
              {snapshot.leaderboard.map((entry, i) => (
                <div
                  key={entry.teamId}
                  className={`leaderboard-row ${entry.teamId === joinedCredentials.teamId ? 'me' : ''} ${!entry.connected ? 'offline' : ''}`}
                >
                  <span className="lb-rank">#{i + 1}</span>
                  <span className="lb-name">{entry.name}</span>
                  <span className="lb-value">{formatCurrency(entry.portfolioValue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Server messages */}
        {serverMessage && <p className="message info" role="status">{serverMessage}</p>}
      </section>
    </main>
  )
}

export default function App() {
  return <TeamDashboardApp />
}
