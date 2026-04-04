import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react'
import './App.css'
import AdminApp from './AdminApp'
import { createSocketClient } from './socket-client'
import type {
  AckResponse,
  CompanyId,
  CompanySignal,
  ConnectionState,
  CountdownState,
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
  blankInvestments,
  formatCompactCurrency,
  formatCountdown,
  formatCurrency,
  formatPhaseLabel,
  formatReturn,
  formatReturnMultiplier,
  getCountdownMs,
  getInvestmentPercentage,
  getQuickInvestAmounts,
  getRoundSummary,
  hasInvestments,
  sentimentColor,
  sentimentLabel,
  totalInvested,
} from './utils'

type SocketFactory = () => SocketLike
type ShellMode = 'team' | 'host'

const STARTING_PURSE = 100000

const COMPANY_META: Record<CompanyId, { emoji: string; accent: string }> = {
  reliance: { emoji: '🏭', accent: '#7eb7ff' },
  hdfc_bank: { emoji: '🏦', accent: '#7ad4b3' },
  infosys: { emoji: '💻', accent: '#a8b7ff' },
  yes_bank: { emoji: '🏧', accent: '#ffd47e' },
  byjus: { emoji: '📚', accent: '#f4a3b8' },
  adani: { emoji: '⚡', accent: '#ffb07e' },
}

const EMPTY_SUBMISSION: ViewerSubmission = {
  teamId: null,
  hasSubmitted: false,
  investments: blankInvestments(),
  canSubmit: false,
}

function getModeFromHash(hash: string): ShellMode {
  return hash === '#/host' ? 'host' : 'team'
}

function syncModeHash(mode: ShellMode) {
  const nextHash = mode === 'host' ? '/host' : '/team'
  if (window.location.hash !== `#${nextHash}`) {
    window.location.hash = nextHash
  }
}

function useCountdown(snapshot: CountdownState | null): number {
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

function buildConnectionLabel(connectionState: ConnectionState, phase?: GameSnapshot['phase']) {
  if (connectionState === 'reconnecting') return 'Reconnecting'
  if (connectionState === 'connecting' || connectionState === 'joining') return 'Connecting'
  if (phase === 'paused') return 'Round paused'
  if (phase === 'live') return 'Live round'
  if (phase === 'results') return 'Results ready'
  if (phase === 'finished') return 'Game complete'
  return 'Standing by'
}

function InvestmentCard({
  companyId,
  signal,
  invested,
  purse,
  disabled,
  isSubmitted,
  onInvest,
  onWithdraw,
}: {
  companyId: CompanyId
  signal: CompanySignal | undefined
  invested: number
  purse: number
  disabled: boolean
  isSubmitted: boolean
  onInvest: (companyId: CompanyId, amount: number) => void
  onWithdraw: (companyId: CompanyId, amount: number) => void
}) {
  const meta = COMPANY_META[companyId]
  const [customAmount, setCustomAmount] = useState('')

  if (!signal) return null

  const quickAmounts = getQuickInvestAmounts(purse)
  const investmentPercent = getInvestmentPercentage(
    {
      ...blankInvestments(),
      [companyId]: invested,
    },
    companyId,
    invested,
  )

  function handleCustomInvest() {
    const amount = Number.parseInt(customAmount, 10)
    if (amount > 0 && amount <= purse) {
      onInvest(companyId, amount)
      setCustomAmount('')
    }
  }

  return (
    <article className="opportunity-card surface-panel" style={{ '--accent-inline': meta.accent } as CSSProperties}>
      <div className="opportunity-head">
        <div className="company-badge">
          <span className="company-emoji">{meta.emoji}</span>
          <div>
            <h3>{signal.name}</h3>
            <p>{signal.sector}</p>
          </div>
        </div>
        <span className="sentiment-pill" style={{ color: sentimentColor(signal.sentiment) }}>
          {sentimentLabel(signal.sentiment)}
        </span>
      </div>

      <div className="opportunity-story">
        <p className="headline">{signal.headline}</p>
        <p className="detail">{signal.detail}</p>
      </div>

      <div className="signal-meta-row">
        <div className="signal-metric">
          <span>Credibility</span>
          <strong>{signal.credibility}%</strong>
        </div>
        <div className="signal-metric">
          <span>Locked</span>
          <strong>{investmentPercent}%</strong>
        </div>
      </div>

      <div className="credibility-track" role="progressbar" aria-valuenow={signal.credibility} aria-valuemin={0} aria-valuemax={100}>
        <div className="credibility-fill" style={{ width: `${signal.credibility}%`, background: meta.accent }} />
      </div>

      <div className="investment-footer">
        <div>
          <span className="mini-label">Current allocation</span>
          <strong className="money-value">{formatCurrency(invested)}</strong>
        </div>
        {invested > 0 ? (
          <button className="ghost-button" type="button" disabled={disabled} onClick={() => onWithdraw(companyId, invested)}>
            Withdraw all
          </button>
        ) : null}
      </div>

      {!isSubmitted ? (
        <div className="action-stack">
          <div className="quick-grid">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                className="quiet-button"
                type="button"
                disabled={disabled || amount > purse}
                onClick={() => onInvest(companyId, amount)}
              >
                +{formatCompactCurrency(amount)}
              </button>
            ))}
          </div>

          <div className="custom-row">
            <input
              aria-label={`${signal.name} investment amount`}
              type="number"
              min="1"
              max={purse}
              placeholder="Custom amount"
              value={customAmount}
              disabled={disabled}
              onChange={(event) => setCustomAmount(event.target.value)}
            />
            <button
              className="primary-inline-button"
              type="button"
              disabled={disabled || !customAmount || Number(customAmount) <= 0 || Number(customAmount) > purse}
              onClick={handleCustomInvest}
            >
              Invest
            </button>
          </div>
        </div>
      ) : (
        <div className="locked-banner">Locked for scoring</div>
      )}
    </article>
  )
}

function RoundResultsOverlay({
  myTeamId,
  onDismiss,
  results,
}: {
  myTeamId: string | null
  onDismiss: () => void
  results: RoundResults
}) {
  const myOutcome = results.teamOutcomes.find((outcome) => outcome.teamId === myTeamId) ?? null
  const { best, worst } = getRoundSummary(results)

  return (
    <div className="results-overlay">
      <div className="results-sheet surface-panel">
        <div className="results-title-row">
          <div>
            <span className="eyebrow">Round {results.round}</span>
            <h2>{results.title} Results</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onDismiss}>
            Close
          </button>
        </div>

        <div className="result-grid">
          {COMPANY_IDS.map((companyId) => {
            const meta = COMPANY_META[companyId]
            const currentReturn = results.actualReturns[companyId]
            const reveal = results.yearEndReveal[companyId]
            const myBreakdown = myOutcome?.breakdown[companyId]

            return (
              <article
                key={companyId}
                className={`result-card ${companyId === best ? 'best' : ''} ${companyId === worst ? 'worst' : ''}`}
              >
                <div className="result-card-head">
                  <span className="company-emoji">{meta.emoji}</span>
                  <div>
                    <strong>{companyId.replace('_', ' ')}</strong>
                    <span>{formatReturnMultiplier(currentReturn)}</span>
                  </div>
                </div>
                <p>{reveal}</p>
                {myBreakdown ? (
                  <div className="result-card-foot">
                    <span>You invested {formatCurrency(myBreakdown.invested)}</span>
                    <strong className={myBreakdown.returns >= 0 ? 'positive' : 'negative'}>
                      {myBreakdown.returns >= 0 ? '+' : ''}
                      {formatCurrency(myBreakdown.returns)}
                    </strong>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>

        {myOutcome ? (
          <div className="summary-band">
            <div>
              <span className="mini-label">Total invested</span>
              <strong>{formatCurrency(myOutcome.totalInvested)}</strong>
            </div>
            <div>
              <span className="mini-label">Returns</span>
              <strong className={myOutcome.returns >= 0 ? 'positive' : 'negative'}>
                {myOutcome.returns >= 0 ? '+' : ''}
                {formatCurrency(myOutcome.returns)}
              </strong>
            </div>
            <div>
              <span className="mini-label">Return rate</span>
              <strong>{formatReturn(myOutcome.percentReturn)}</strong>
            </div>
            <div>
              <span className="mini-label">New purse</span>
              <strong>{formatCurrency(myOutcome.purse)}</strong>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PortfolioStrip({
  purse,
  totalInvestedAmount,
  totalValue,
}: {
  purse: number
  totalInvestedAmount: number
  totalValue: number
}) {
  return (
    <section className="portfolio-strip">
      <article className="metric-card surface-panel">
        <span className="mini-label">Available cash</span>
        <strong>{formatCurrency(purse)}</strong>
      </article>
      <article className="metric-card surface-panel">
        <span className="mini-label">Invested capital</span>
        <strong>{formatCurrency(totalInvestedAmount)}</strong>
      </article>
      <article className="metric-card surface-panel">
        <span className="mini-label">Total value</span>
        <strong>{formatCurrency(totalValue)}</strong>
      </article>
    </section>
  )
}

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
  const [investmentError, setInvestmentError] = useState<string | null>(null)
  const [pendingSubmit, setPendingSubmit] = useState(false)
  const [localInvestments, setLocalInvestments] = useState(blankInvestments())
  const [localPurse, setLocalPurse] = useState(STARTING_PURSE)
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null)
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    requestedCredentialsRef.current = requestedCredentials
  }, [requestedCredentials])

  useEffect(() => {
    joinedCredentialsRef.current = joinedCredentials
  }, [joinedCredentials])

  useEffect(() => {
    if (snapshot?.phase === 'live' || snapshot?.phase === 'paused' || snapshot?.phase === 'idle') {
      setShowResults(false)
    }
  }, [snapshot?.phase, snapshot?.round])

  const countdownMs = useCountdown(snapshot)
  const hasRequestedCredentials = requestedCredentials !== null
  const viewerSubmission = snapshot?.viewerSubmission ?? EMPTY_SUBMISSION
  const currentRound = snapshot?.currentRound ?? null
  const myTeamData = snapshot?.leaderboard.find((entry) => entry.teamId === joinedCredentials?.teamId) ?? null
  const currentPurse = myTeamData?.purse ?? localPurse
  const currentInvestments = myTeamData?.investments ?? localInvestments
  const totalInvestedAmount = totalInvested(currentInvestments)
  const totalValue = currentPurse + totalInvestedAmount
  const connectionLabel = buildConnectionLabel(connectionState, snapshot?.phase)
  const canAdjustInvestments =
    snapshot?.phase === 'live' &&
    connectionState === 'connected' &&
    viewerSubmission.canSubmit &&
    !viewerSubmission.hasSubmitted
  const canSubmit = canAdjustInvestments && !pendingSubmit && hasInvestments(currentInvestments)
  const isSubmitted = viewerSubmission.hasSubmitted
  const teamInvestmentSignature = JSON.stringify(myTeamData?.investments ?? null)

  useEffect(() => {
    if (snapshot?.round) {
      setPendingSubmit(false)
      setInvestmentError(null)
    }
  }, [snapshot?.round])

  useEffect(() => {
    if (myTeamData) {
      setLocalInvestments(myTeamData.investments)
      setLocalPurse(myTeamData.purse)
    }
  }, [myTeamData?.purse, teamInvestmentSignature])

  useEffect(() => {
    if (!requestedCredentialsRef.current || socketRef.current) {
      return undefined
    }

    const socket = socketFactory()
    socketRef.current = socket

    const emitJoin = (credentials: TeamCredentials, reconnecting: boolean) => {
      setConnectionState(reconnecting ? 'reconnecting' : 'joining')
      setJoinError(null)

      socket.emit(
        'team:join',
        credentials,
        (response: AckResponse<{ team: { teamId: string; name: string; purse: number } }>) => {
          if (response.ok) {
            joinedCredentialsRef.current = credentials
            setJoinedCredentials(credentials)
            setLocalPurse(response.data.team.purse)
            setConnectionState('connected')
            return
          }

          if (reconnecting) {
            setServerMessage(response.error.message)
            setConnectionState('reconnecting')
            return
          }

          setJoinError(response.error.message)
          setConnectionState(socket.connected ? 'idle' : 'connecting')
        },
      )
    }

    const handleConnect = () => {
      const credentials = joinedCredentialsRef.current ?? requestedCredentialsRef.current
      if (!credentials) {
        setConnectionState('idle')
        return
      }

      emitJoin(credentials, Boolean(joinedCredentialsRef.current))
    }

    const handleDisconnect = () => {
      setServerMessage(null)
      if (joinedCredentialsRef.current) {
        setConnectionState('reconnecting')
        return
      }

      setConnectionState(requestedCredentialsRef.current ? 'connecting' : 'idle')
    }

    const handleConnectError = () => {
      if (joinedCredentialsRef.current) {
        setConnectionState('reconnecting')
        return
      }

      if (requestedCredentialsRef.current) {
        setJoinError('Unable to reach the server. Retrying...')
        setConnectionState('connecting')
      }
    }

    const handleSnapshot = (nextSnapshot: GameSnapshot) => {
      setSnapshot(nextSnapshot)
      if (nextSnapshot.viewerSubmission.canSubmit && !nextSnapshot.viewerSubmission.hasSubmitted) {
        setPendingSubmit(false)
        setInvestmentError(null)
      }
    }

    const handleSubmissionStatus = (status: SubmissionStatus) => {
      if (status.accepted && status.investments) {
        setPendingSubmit(false)
        setInvestmentError(null)
        setLocalInvestments(status.investments)
        return
      }

      if (!status.accepted && status.error) {
        setPendingSubmit(false)
        setInvestmentError(status.error.message)
      }
    }

    const handleRoundResults = (results: RoundResults) => {
      setRoundResults(results)
      setShowResults(true)
    }

    const handleGameError = (error: SerializedError) => {
      if (joinedCredentialsRef.current) {
        setServerMessage(error.message)
        return
      }

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

  function handleJoinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const credentials = {
      teamId: formValues.teamId.trim(),
      name: formValues.name.trim(),
    }

    if (!credentials.teamId || !credentials.name) {
      setJoinError('Team ID and team name are required.')
      return
    }

    requestedCredentialsRef.current = credentials
    setRequestedCredentials(credentials)
    setJoinError(null)
    setServerMessage(null)

    const activeSocket = socketRef.current
    if (!activeSocket || !activeSocket.connected) {
      setConnectionState('connecting')
      return
    }

    setConnectionState('joining')
    activeSocket.emit(
      'team:join',
      credentials,
      (response: AckResponse<{ team: { teamId: string; name: string; purse: number } }>) => {
        if (response.ok) {
          joinedCredentialsRef.current = credentials
          setJoinedCredentials(credentials)
          setLocalPurse(response.data.team.purse)
          setConnectionState('connected')
          return
        }

        setJoinError(response.error.message)
        setConnectionState('idle')
      },
    )
  }

  function handleInvest(companyId: CompanyId, amount: number) {
    const socket = socketRef.current
    if (!socket || snapshot?.phase !== 'live') return
    setInvestmentError(null)

    socket.emit('team:invest', { amount, companyId }, (response: AckResponse<{ purse: number; invested: number }>) => {
      if (!response.ok) {
        setInvestmentError(response.error.message)
      }
    })
  }

  function handleWithdraw(companyId: CompanyId, amount: number) {
    const socket = socketRef.current
    if (!socket || snapshot?.phase !== 'live') return
    setInvestmentError(null)

    socket.emit('team:withdraw', { amount, companyId }, (response: AckResponse<{ purse: number; invested: number }>) => {
      if (!response.ok) {
        setInvestmentError(response.error.message)
      }
    })
  }

  function handleSubmit() {
    const socket = socketRef.current
    if (!socket || !canSubmit) return

    setPendingSubmit(true)
    setInvestmentError(null)

    socket.emit('team:submit', {}, (response: AckResponse<{ investments: Record<CompanyId, number> }>) => {
      if (!response.ok) {
        setPendingSubmit(false)
        setInvestmentError(response.error.message)
      }
    })
  }

  if (!joinedCredentials) {
    return (
      <section className="team-view">
        <div className="view-intro">
          <div>
            <span className="eyebrow">Team Console</span>
            <h2>Join the live investment desk</h2>
            <p>
              Connect your team, receive the current market narrative, and lock your capital before the host closes the round.
            </p>
          </div>
          <div className="chip-row">
            <span className="shell-chip">₹1,00,000 opening cash</span>
            <span className="shell-chip">6 companies per round</span>
            <span className="shell-chip">Up to 12 teams</span>
          </div>
        </div>

        <div className="join-layout">
          <section className="surface-panel hero-panel">
            <span className="eyebrow">How it works</span>
            <h3>Read the context, size your positions, then lock the round.</h3>
            <p>
              Cash stays liquid until you allocate it. Once you submit, your portfolio is frozen for scoring when the timer expires or the host ends the round early.
            </p>
            <div className="hero-stat-grid">
              <div className="hero-stat">
                <span className="mini-label">Timer control</span>
                <strong>Host-configured</strong>
              </div>
              <div className="hero-stat">
                <span className="mini-label">Signals</span>
                <strong>Historical company narratives</strong>
              </div>
              <div className="hero-stat">
                <span className="mini-label">Scoring</span>
                <strong>Returns settle into purse balance</strong>
              </div>
            </div>
          </section>

          <section className="surface-panel join-panel">
            <span className="eyebrow">Enter the room</span>
            <h3>Connect your team</h3>
            <form className="join-form" onSubmit={handleJoinSubmit}>
              <label className="field">
                <span>Team ID</span>
                <input
                  aria-label="Team ID"
                  autoComplete="off"
                  placeholder="team-alpha"
                  value={formValues.teamId}
                  onChange={(event) => setFormValues((current) => ({ ...current, teamId: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Team name</span>
                <input
                  aria-label="Team Name"
                  autoComplete="off"
                  placeholder="The Bulls"
                  value={formValues.name}
                  onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <button className="primary-button" type="submit" disabled={connectionState === 'connecting' || connectionState === 'joining'}>
                {connectionState === 'connecting' || connectionState === 'joining' ? 'Joining…' : 'Enter the market'}
              </button>
            </form>
            <p className="subtle-line">Status: {connectionLabel}</p>
            {joinError ? <p className="message-banner error">{joinError}</p> : null}
          </section>
        </div>
      </section>
    )
  }

  return (
    <section className="team-view">
      {showResults && roundResults ? (
        <RoundResultsOverlay myTeamId={joinedCredentials.teamId} onDismiss={() => setShowResults(false)} results={roundResults} />
      ) : null}

      <div className="view-intro">
        <div>
          <span className="eyebrow">Team Console</span>
          <h2>{joinedCredentials.name}</h2>
          <p>
            {snapshot ? `Round ${snapshot.round} of ${snapshot.totalRounds}` : 'Waiting for the host to start the game'}
            {currentRound ? ` • ${currentRound.yearRange}` : ''}
          </p>
        </div>
        <div className="chip-row">
          <span className={`phase-chip ${snapshot?.phase ?? 'idle'}`}>{formatPhaseLabel(snapshot?.phase ?? 'idle')}</span>
          {snapshot ? <span className="shell-chip">Timer {formatCountdown(countdownMs || snapshot.roundDurationMs)}</span> : null}
          <span className="shell-chip">{connectionLabel}</span>
        </div>
      </div>

      <PortfolioStrip purse={currentPurse} totalInvestedAmount={totalInvestedAmount} totalValue={totalValue} />

      <section className="surface-panel story-panel">
        <div className="story-head">
          <div>
            <span className="eyebrow">Round context</span>
            <h3>{currentRound ? currentRound.title : 'Waiting for the next scenario'}</h3>
          </div>
          {currentRound ? (
            <div className="story-timer">
              <span className="mini-label">Countdown</span>
              <strong>{formatCountdown(countdownMs)}</strong>
            </div>
          ) : null}
        </div>

        {currentRound ? (
          <div className="story-body">
            <div className="year-medallion">{currentRound.year}</div>
            <p>{currentRound.context}</p>
          </div>
        ) : (
          <p className="waiting-copy">
            {snapshot?.phase === 'results'
              ? 'The round is in scoring. Results are about to settle.'
              : snapshot?.phase === 'finished'
                ? 'The game is finished. Review the leaderboard and final results.'
                : 'The host has not started the next round yet.'}
          </p>
        )}
      </section>

      {currentRound ? (
        <section className="surface-panel opportunities-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Allocation board</span>
              <h3>Build your portfolio</h3>
            </div>
            <div className="section-notes">
              <span className="shell-chip">Configured timer {snapshot ? formatCountdown(snapshot.roundDurationMs) : '01:00.0'}</span>
              <span className="shell-chip">
                {isSubmitted
                  ? 'Submitted'
                  : canAdjustInvestments
                    ? 'Open for changes'
                    : snapshot?.phase === 'paused'
                      ? 'Locked while paused'
                      : 'Waiting'}
              </span>
            </div>
          </div>

          <div className="opportunity-grid">
            {COMPANY_IDS.map((companyId) => (
              <InvestmentCard
                key={companyId}
                companyId={companyId}
                signal={currentRound.companies.find((company) => company.id === companyId)}
                invested={currentInvestments[companyId] ?? 0}
                purse={currentPurse}
                disabled={!canAdjustInvestments}
                isSubmitted={isSubmitted}
                onInvest={handleInvest}
                onWithdraw={handleWithdraw}
              />
            ))}
          </div>

          <div className="submit-rail">
            <div>
              <span className="mini-label">Round status</span>
              <strong>
                {isSubmitted
                  ? 'Your portfolio is locked for scoring.'
                  : snapshot?.phase === 'paused'
                    ? 'The host paused the timer. You can review but not change positions.'
                    : snapshot?.phase === 'live'
                      ? 'Adjust positions until you lock the round.'
                      : 'Waiting for the next market window.'}
              </strong>
            </div>
            <button className="primary-button" type="button" disabled={!canSubmit} onClick={handleSubmit}>
              {pendingSubmit
                ? 'Locking…'
                : hasInvestments(currentInvestments)
                  ? `Lock portfolio (${formatCurrency(totalInvestedAmount)})`
                  : 'Make at least one investment'}
            </button>
          </div>

          {investmentError ? <p className="message-banner error">{investmentError}</p> : null}
        </section>
      ) : null}

      {snapshot && snapshot.leaderboard.length > 0 ? (
        <section className="surface-panel leaderboard-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Rankings</span>
              <h3>Live leaderboard</h3>
            </div>
            <span className="shell-chip">{snapshot.activeTeamsCount} active teams</span>
          </div>
          <div className="leaderboard-list">
            {snapshot.leaderboard.map((entry, index) => (
              <div
                key={entry.teamId}
                className={`leaderboard-row ${entry.teamId === joinedCredentials.teamId ? 'me' : ''} ${!entry.connected ? 'offline' : ''}`}
              >
                <span className="rank-pill">#{index + 1}</span>
                <div className="leaderboard-name">
                  <strong>{entry.name}</strong>
                  <span>{entry.connected ? 'Connected' : 'Disconnected'}</span>
                </div>
                <div className="leaderboard-value">
                  <strong>{formatCurrency(entry.totalValue)}</strong>
                  <span>
                    {formatCurrency(entry.purse)} cash • {formatCurrency(totalInvested(entry.investments))} invested
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {serverMessage ? <p className="message-banner info">{serverMessage}</p> : null}
    </section>
  )
}

export function MarketGameShell({
  adminSocketFactory = createSocketClient,
  teamSocketFactory = createSocketClient,
}: {
  adminSocketFactory?: SocketFactory
  teamSocketFactory?: SocketFactory
}) {
  const [mode, setMode] = useState<ShellMode>(() => getModeFromHash(window.location.hash))

  useEffect(() => {
    const handleHashChange = () => {
      setMode(getModeFromHash(window.location.hash))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  function handleModeChange(nextMode: ShellMode) {
    setMode(nextMode)
    syncModeHash(nextMode)
  }

  return (
    <main className="app-shell">
      <section className="experience-shell">
        <header className="shell-header">
          <div className="brand-column">
            <span className="eyebrow">Invest Neutron 3</span>
            <h1>Market Masters Arena</h1>
            <p>
              One room for live team allocations and host control, with synced round timing, early-close controls, and
              resilient in-memory gameplay.
            </p>
          </div>

          <div className="shell-action-column">
            <div className="mode-switch" role="tablist" aria-label="Workspace mode">
              <button
                className={mode === 'team' ? 'active' : ''}
                type="button"
                aria-pressed={mode === 'team'}
                onClick={() => handleModeChange('team')}
              >
                Team Console
              </button>
              <button
                className={mode === 'host' ? 'active' : ''}
                type="button"
                aria-pressed={mode === 'host'}
                onClick={() => handleModeChange('host')}
              >
                Host Console
              </button>
            </div>

            <div className="chip-row">
              <span className="shell-chip">6 scenario rounds</span>
              <span className="shell-chip">12 team capacity</span>
              <span className="shell-chip">Live timer sync</span>
            </div>
          </div>
        </header>

        <section className="workspace-frame">
          {mode === 'team' ? (
            <TeamDashboardApp socketFactory={teamSocketFactory} />
          ) : (
            <AdminApp socketFactory={adminSocketFactory} />
          )}
        </section>
      </section>
    </main>
  )
}

export default function App({
  adminSocketFactory = createSocketClient,
  teamSocketFactory = createSocketClient,
}: {
  adminSocketFactory?: SocketFactory
  teamSocketFactory?: SocketFactory
}) {
  return <MarketGameShell adminSocketFactory={adminSocketFactory} teamSocketFactory={teamSocketFactory} />
}
