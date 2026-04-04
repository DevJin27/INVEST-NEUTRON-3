import { type FormEvent, useEffect, useRef, useState, useCallback } from 'react'
import './App.css'
import { createSocketClient } from './socket-client'
import type {
  AckResponse,
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
  blankInvestments,
  formatCountdown,
  formatCurrency,
  formatReturn,
  getCountdownMs,
  hasInvestments,
  isPlayableSnapshot,
  sentimentColor,
  sentimentLabel,
  totalInvested,
} from './utils'

const COMPANY_META: Record<CompanyId, { emoji: string; color: string; fullName: string }> = {
  reliance:  { emoji: '🏭', color: '#3b82f6', fullName: 'Reliance Industries' },
  hdfc_bank: { emoji: '🏦', color: '#10b981', fullName: 'HDFC Bank' },
  infosys:   { emoji: '💻', color: '#6366f1', fullName: 'Infosys' },
  yes_bank:  { emoji: '🏧', color: '#f59e0b', fullName: 'Yes Bank' },
  byjus:     { emoji: '📚', color: '#ec4899', fullName: 'BYJU\'S' },
  adani:     { emoji: '⚡', color: '#8b5cf6', fullName: 'Adani Group' },
}

const STARTING_PURSE = 100000

type SocketFactory = () => SocketLike

const EMPTY_SUBMISSION: ViewerSubmission = {
  teamId: null,
  hasSubmitted: false,
  investments: blankInvestments(),
  canSubmit: false,
}

function useCountdown(snapshot: GameSnapshot | null): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'live' || snapshot.endsAt === null) return undefined
    const id = window.setInterval(() => setTick((t) => t + 1), 100)
    return () => window.clearInterval(id)
  }, [snapshot])
  return getCountdownMs(snapshot)
}

interface InvestmentCardProps {
  companyId: CompanyId
  signal: { name: string; sector: string; headline: string; sentiment: 'positive' | 'negative' | 'neutral'; detail: string; credibility: number } | undefined
  invested: number
  purse: number
  onInvest: (companyId: CompanyId, amount: number) => void
  onWithdraw: (companyId: CompanyId, amount: number) => void
  disabled: boolean
  isSubmitted: boolean
}

function InvestmentCard({ companyId, signal, invested, purse, onInvest, onWithdraw, disabled, isSubmitted }: InvestmentCardProps) {
  const meta = COMPANY_META[companyId]
  const [customAmount, setCustomAmount] = useState('')

  if (!signal) return null

  const handleCustomInvest = () => {
    const amount = parseInt(customAmount, 10)
    if (amount > 0 && amount <= purse) {
      onInvest(companyId, amount)
      setCustomAmount('')
    }
  }

  const handleWithdrawAll = () => {
    if (invested > 0) {
      onWithdraw(companyId, invested)
    }
  }

  const quickAmounts = purse > 0 ? [
    Math.max(1000, Math.floor(purse * 0.1)),
    Math.max(1000, Math.floor(purse * 0.25)),
    Math.max(1000, Math.floor(purse * 0.5)),
  ].filter((a) => a <= purse && a > 0) : []

  return (
    <div className="investment-card" style={{ borderLeftColor: meta.color }}>
      <div className="company-header">
        <div className="company-identity">
          <span className="company-emoji">{meta.emoji}</span>
          <div className="company-names">
            <span className="company-name">{signal.name}</span>
            <span className="company-sector">{signal.sector}</span>
          </div>
        </div>
        <div className="sentiment-badge" style={{ color: sentimentColor(signal.sentiment), background: `${sentimentColor(signal.sentiment)}15` }}>
          {sentimentLabel(signal.sentiment)}
        </div>
      </div>

      <div className="signal-content">
        <p className="signal-headline">{signal.headline}</p>
        <p className="signal-detail">{signal.detail}</p>
      </div>

      <div className="credibility-bar">
        <span className="credibility-label">Signal credibility</span>
        <div className="credibility-track">
          <div className="credibility-fill" style={{ width: `${signal.credibility}%`, background: meta.color }} />
        </div>
        <span className="credibility-value">{signal.credibility}%</span>
      </div>

      <div className="investment-section">
        <div className="current-investment">
          <span className="investment-label">Your Investment</span>
          <span className="investment-amount" style={{ color: invested > 0 ? meta.color : '#94a3b8' }}>
            {formatCurrency(invested)}
          </span>
        </div>

        {!isSubmitted && !disabled && (
          <div className="investment-actions">
            {invested > 0 && (
              <button className="withdraw-btn" onClick={handleWithdrawAll} disabled={disabled}>
                Withdraw All
              </button>
            )}

            {purse > 0 && (
              <div className="invest-controls">
                <div className="quick-amounts">
                  {quickAmounts.map((amount, idx) => (
                    <button
                      key={idx}
                      className="quick-invest-btn"
                      onClick={() => onInvest(companyId, amount)}
                      disabled={amount > purse || disabled}
                    >
                      +{formatCurrency(amount)}
                    </button>
                  ))}
                </div>
                <div className="custom-invest">
                  <input
                    type="number"
                    placeholder="Custom amount"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    min="1"
                    max={purse}
                    disabled={disabled}
                  />
                  <button
                    className="invest-btn"
                    onClick={handleCustomInvest}
                    disabled={!customAmount || parseInt(customAmount) > purse || parseInt(customAmount) <= 0 || disabled}
                  >
                    Invest
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isSubmitted && invested > 0 && (
          <div className="submitted-badge">✓ Locked for this round</div>
        )}
      </div>
    </div>
  )
}

interface RoundResultsOverlayProps {
  results: RoundResults
  myTeamId: string | null
  onDismiss: () => void
}

function RoundResultsOverlay({ results, myTeamId, onDismiss }: RoundResultsOverlayProps) {
  const myOutcome = results.teamOutcomes.find((o) => o.teamId === myTeamId)

  let best: CompanyId | null = null
  let worst: CompanyId | null = null
  let bestReturn = -Infinity
  let worstReturn = Infinity

  for (const id of COMPANY_IDS) {
    const r = results.actualReturns[id]
    if (r > bestReturn) { bestReturn = r; best = id }
    if (r < worstReturn) { worstReturn = r; worst = id }
  }

  return (
    <div className="results-overlay">
      <div className="results-panel">
        <div className="results-header">
          <div className="results-year">{results.yearRange}</div>
          <h2>{results.title} — Results</h2>
        </div>

        <div className="market-summary">
          <h3>Market Performance</h3>
          <div className="company-results">
            {COMPANY_IDS.map((id) => {
              const ret = results.actualReturns[id]
              const reveal = results.yearEndReveal[id]
              const meta = COMPANY_META[id]
              const isBest = id === best
              const isWorst = id === worst
              const positive = ret >= 0

              return (
                <div key={id} className={`company-result ${isBest ? 'best' : ''} ${isWorst ? 'worst' : ''}`}>
                  <div className="result-header">
                    <span className="result-emoji">{meta.emoji}</span>
                    <span className="result-name">{meta.fullName}</span>
                    <span className={`result-return ${positive ? 'positive' : 'negative'}`}>
                      {formatReturn(ret * 100)}
                    </span>
                  </div>
                  <p className="result-reveal">{reveal}</p>
                  {myOutcome && myOutcome.investments[id] > 0 && (
                    <div className="my-result">
                      <span>You invested {formatCurrency(myOutcome.investments[id])}</span>
                      <span className={`my-return ${myOutcome.breakdown[id].returns >= 0 ? 'positive' : 'negative'}`}>
                        {myOutcome.breakdown[id].returns >= 0 ? '+' : ''}{formatCurrency(myOutcome.breakdown[id].returns)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {myOutcome && (
          <div className={`my-summary ${myOutcome.returns >= 0 ? 'positive' : 'negative'}`}>
            <div className="summary-row">
              <span>Total Invested</span>
              <strong>{formatCurrency(myOutcome.totalInvested)}</strong>
            </div>
            <div className="summary-row">
              <span>Returns</span>
              <strong className={myOutcome.returns >= 0 ? 'positive' : 'negative'}>
                {myOutcome.returns >= 0 ? '+' : ''}{formatCurrency(myOutcome.returns)}
              </strong>
            </div>
            <div className="summary-row highlight">
              <span>New Purse Balance</span>
              <strong>{formatCurrency(myOutcome.purse)}</strong>
            </div>
            <div className="summary-row">
              <span>Return %</span>
              <strong>{formatReturn(myOutcome.percentReturn)}</strong>
            </div>
          </div>
        )}

        <button className="dismiss-button" onClick={onDismiss}>
          Continue →
        </button>
      </div>
    </div>
  )
}

interface PurseDisplayProps {
  purse: number
  totalInvested: number
  totalValue: number
}

function PurseDisplay({ purse, totalInvested, totalValue }: PurseDisplayProps) {
  const investedPercent = totalValue > 0 ? (totalInvested / totalValue) * 100 : 0
  const pursePercent = totalValue > 0 ? (purse / totalValue) * 100 : 100

  return (
    <div className="purse-display">
      <div className="purse-main">
        <div className="purse-section">
          <span className="purse-label">Available Cash</span>
          <span className="purse-amount">{formatCurrency(purse)}</span>
        </div>
        <div className="purse-divider" />
        <div className="purse-section">
          <span className="purse-label">Invested</span>
          <span className="invested-amount">{formatCurrency(totalInvested)}</span>
        </div>
        <div className="purse-divider" />
        <div className="purse-section total">
          <span className="purse-label">Total Value</span>
          <span className="total-amount">{formatCurrency(totalValue)}</span>
        </div>
      </div>
      <div className="purse-bar">
        <div className="purse-bar-invested" style={{ width: `${investedPercent}%` }} />
        <div className="purse-bar-cash" style={{ width: `${pursePercent}%` }} />
      </div>
    </div>
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

  const [localInvestments, setLocalInvestments] = useState<Record<CompanyId, number>>(blankInvestments())
  const [localPurse, setLocalPurse] = useState(STARTING_PURSE)

  const [roundResults, setRoundResults] = useState<RoundResults | null>(null)
  const [showResults, setShowResults] = useState(false)

  useEffect(() => { requestedCredentialsRef.current = requestedCredentials }, [requestedCredentials])
  useEffect(() => { joinedCredentialsRef.current = joinedCredentials }, [joinedCredentials])

  const countdownMs = useCountdown(snapshot)
  const hasRequestedCredentials = requestedCredentials !== null
  const viewerSubmission = snapshot?.viewerSubmission ?? EMPTY_SUBMISSION

  const myTeamData = snapshot?.leaderboard.find((e) => e.teamId === joinedCredentials?.teamId)
  const currentPurse = myTeamData?.purse ?? localPurse
  const currentInvestments = myTeamData?.investments ?? localInvestments
  const totalInvestedAmount = totalInvested(currentInvestments)
  const totalValue = currentPurse + totalInvestedAmount

  const canSubmit = isPlayableSnapshot(snapshot) &&
    connectionState === 'connected' &&
    viewerSubmission.canSubmit &&
    !viewerSubmission.hasSubmitted &&
    !pendingSubmit &&
    hasInvestments(currentInvestments)

  const isSubmitted = viewerSubmission.hasSubmitted

  // Reset when round changes
  useEffect(() => {
    if (snapshot?.round) {
      setLocalInvestments(blankInvestments())
      setPendingSubmit(false)
      setInvestmentError(null)
    }
  }, [snapshot?.round])

  // Update local state from server
  useEffect(() => {
    if (myTeamData) {
      setLocalInvestments(myTeamData.investments)
      setLocalPurse(myTeamData.purse)
    }
  }, [myTeamData?.purse, JSON.stringify(myTeamData?.investments)])

  // Socket setup
  useEffect(() => {
    if (!requestedCredentialsRef.current || socketRef.current) return undefined

    const socket = socketFactory()
    socketRef.current = socket

    const emitJoin = (credentials: TeamCredentials, reconnecting: boolean) => {
      setConnectionState(reconnecting ? 'reconnecting' : 'joining')
      setJoinError(null)
      socket.emit('team:join', credentials, (response: AckResponse<{ team: { teamId: string; name: string; purse: number } }>) => {
        if (response.ok) {
          joinedCredentialsRef.current = credentials
          setJoinedCredentials(credentials)
          setLocalPurse(response.data.team.purse)
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
    activeSocket.emit('team:join', credentials, (response: AckResponse<{ team: { teamId: string; name: string; purse: number } }>) => {
      if (response.ok) {
        joinedCredentialsRef.current = credentials
        setJoinedCredentials(credentials)
        setLocalPurse(response.data.team.purse)
        setConnectionState('connected')
        return
      }
      setJoinError(response.error.message)
      setConnectionState('idle')
    })
  }

  const handleInvest = useCallback((companyId: CompanyId, amount: number) => {
    const socket = socketRef.current
    if (!socket || !isPlayableSnapshot(snapshot)) return
    setInvestmentError(null)
    socket.emit('team:invest', { companyId, amount }, (response: AckResponse<{ purse: number; invested: number }>) => {
      if (!response.ok) {
        setInvestmentError(response.error.message)
      }
    })
  }, [snapshot])

  const handleWithdraw = useCallback((companyId: CompanyId, amount: number) => {
    const socket = socketRef.current
    if (!socket || !isPlayableSnapshot(snapshot)) return
    setInvestmentError(null)
    socket.emit('team:withdraw', { companyId, amount }, (response: AckResponse<{ purse: number; invested: number }>) => {
      if (!response.ok) {
        setInvestmentError(response.error.message)
      }
    })
  }, [snapshot])

  const handleSubmit = () => {
    const socket = socketRef.current
    if (!socket || !canSubmit) return
    setPendingSubmit(true)
    setInvestmentError(null)
    socket.emit('team:submit', {}, (response: AckResponse<{ investments: Record<CompanyId, number> }>) => {
      if (response.ok) return
      setPendingSubmit(false)
      setInvestmentError(response.error.message)
    })
  }

  const isReconnecting = connectionState === 'reconnecting'

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

  if (!joinedCredentials) {
    return (
      <main className="app-container">
        <div className="join-container">
          <div className="join-card">
            <div className="game-title">
              <h1>Market Masters</h1>
              <p className="subtitle">Invest wisely. Time the market. Build your fortune.</p>
            </div>

            <div className="game-info">
              <div className="info-item">
                <span className="info-icon">💰</span>
                <span>Start with ₹1,00,000</span>
              </div>
              <div className="info-item">
                <span className="info-icon">🏢</span>
                <span>6 Indian companies to invest in</span>
              </div>
              <div className="info-item">
                <span className="info-icon">⏱️</span>
                <span>60 seconds per round</span>
              </div>
            </div>

            <form className="join-form" onSubmit={handleJoinSubmit}>
              <div className="form-field">
                <label htmlFor="teamId">Team ID</label>
                <input id="teamId" autoComplete="off" placeholder="e.g., team-alpha" value={formValues.teamId} onChange={(e) => setFormValues((c) => ({ ...c, teamId: e.target.value }))} />
              </div>
              <div className="form-field">
                <label htmlFor="name">Team Name</label>
                <input id="name" autoComplete="off" placeholder="e.g., The Bulls" value={formValues.name} onChange={(e) => setFormValues((c) => ({ ...c, name: e.target.value }))} />
              </div>
              <button className="join-button" type="submit" disabled={connectionState === 'connecting' || connectionState === 'joining'}>
                {connectionState === 'connecting' || connectionState === 'joining' ? 'Joining...' : 'Enter the Market'}
              </button>
            </form>

            <p className="connection-status">{statusLabel}</p>
            {joinError && <p className="error-message" role="alert">{joinError}</p>}
          </div>
        </div>
      </main>
    )
  }

  const currentRound = isPlayableSnapshot(snapshot) ? snapshot?.currentRound ?? null : null

  return (
    <main className="app-container dashboard">
      {showResults && roundResults && (
        <RoundResultsOverlay results={roundResults} myTeamId={joinedCredentials.teamId} onDismiss={() => setShowResults(false)} />
      )}

      <header className="dashboard-header">
        <div className="header-left">
          <h1>{joinedCredentials.name}</h1>
          <div className="round-info">
            {snapshot ? `Round ${snapshot.round} of ${snapshot.totalRounds}` : 'Waiting for game to start'}
            {snapshot?.currentRound && ` • ${snapshot.currentRound.yearRange}`}
          </div>
        </div>
        <div className="header-right">
          <div className={`status-badge ${isReconnecting ? 'warning' : snapshot?.phase === 'live' ? 'live' : ''}`}>
            {statusLabel}
          </div>
          {currentRound && (
            <div className="timer">
              <span className="timer-icon">⏱️</span>
              <span className="timer-value">{formatCountdown(countdownMs)}</span>
            </div>
          )}
        </div>
      </header>

      <PurseDisplay purse={currentPurse} totalInvested={totalInvestedAmount} totalValue={totalValue} />

      {currentRound ? (
        <div className="round-context">
          <div className="year-badge">{currentRound.year}</div>
          <div className="context-content">
            <h2>{currentRound.title}</h2>
            <p>{currentRound.context}</p>
          </div>
        </div>
      ) : (
        <div className="waiting-card">
          <p>
            {snapshot?.phase === 'finished'
              ? '🏁 Game over! Check the leaderboard.'
              : snapshot?.phase === 'results'
                ? '⏳ Admin is reviewing results...'
                : '🕐 Waiting for the game to start...'}
          </p>
        </div>
      )}

      {currentRound && (
        <div className="investments-section">
          <div className="section-header">
            <h3>Investment Opportunities</h3>
            <span className="section-hint">{isSubmitted ? 'Investments locked' : 'Tap amounts to invest or withdraw'}</span>
          </div>

          <div className="investment-grid">
            {COMPANY_IDS.map((id) => {
              const signal = currentRound.companies.find((c) => c.id === id)
              return (
                <InvestmentCard
                  key={id}
                  companyId={id}
                  signal={signal}
                  invested={currentInvestments[id] ?? 0}
                  purse={currentPurse}
                  onInvest={handleInvest}
                  onWithdraw={handleWithdraw}
                  disabled={!viewerSubmission.canSubmit || isReconnecting}
                  isSubmitted={isSubmitted}
                />
              )
            })}
          </div>

          <div className="submit-section">
            {isSubmitted ? (
              <div className="submitted-message">
                <span className="check">✓</span>
                <span>Investments locked for {snapshot?.currentRound?.year}</span>
              </div>
            ) : (
              <button className="submit-investments-btn" disabled={!canSubmit || pendingSubmit} onClick={handleSubmit}>
                {pendingSubmit ? 'Submitting...' : totalInvestedAmount > 0 ? `Lock Investments (${formatCurrency(totalInvestedAmount)})` : 'Make at least one investment'}
              </button>
            )}
            {investmentError && <p className="error-message">{investmentError}</p>}
          </div>
        </div>
      )}

      {snapshot && snapshot.leaderboard.length > 0 && (
        <div className="leaderboard-section">
          <h3 className="section-title">Leaderboard</h3>
          <div className="leaderboard">
            {snapshot.leaderboard.map((entry, i) => (
              <div key={entry.teamId} className={`leaderboard-row ${entry.teamId === joinedCredentials.teamId ? 'me' : ''} ${!entry.connected ? 'offline' : ''}`}>
                <span className="rank">#{i + 1}</span>
                <span className="team-name">{entry.name}</span>
                <div className="team-value">
                  <span className="value-main">{formatCurrency(entry.totalValue)}</span>
                  <span className="value-detail">{formatCurrency(entry.purse)} cash + {formatCurrency(totalInvested(entry.investments))} invested</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {serverMessage && <p className="info-message">{serverMessage}</p>}
    </main>
  )
}

export default function App() {
  return <TeamDashboardApp />
}
