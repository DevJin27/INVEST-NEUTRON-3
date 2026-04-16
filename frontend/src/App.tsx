import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import AdminApp from './AdminApp'
import {
  buildDisplayRound,
  getCompanyDisplayMeta,
  getCompanyDisplayName,
  getDisplayRoundTitle,
  getDisplayReveal,
  getDisplayYearLabel,
  getVisibleCompanyIds,
  type DisplayCompanyView,
} from './display'
import type { FakeCall } from './types'
import { createSocketClient } from './socket-client'
import type {
  AckResponse,
  CompanyId,
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
import {
  blankInvestments,
  formatCompactCurrency,
  formatCountdown,
  formatCurrency,
  formatDirectionalReturn,
  formatPhaseLabel,
  formatReturn,
  formatTimestamp,
  getCountdownMs,
  getQuickInvestAmounts,
  hasInvestments,
  totalInvested,
} from './utils'

type SocketFactory = () => SocketLike
type ShellMode = 'team' | 'host'
type TradeAction = 'buy' | 'sell'

interface SessionTradeEntry {
  action: TradeAction
  amount: number
  companyId: CompanyId
  id: string
  round: number
  timestamp: string
}

interface PendingSellState {
  amount: number
  companyId: CompanyId
}

interface ScheduledCallState {
  call: FakeCall
  round: number
  shown: boolean
  triggerElapsedMs: number
}

const EMPTY_SUBMISSION: ViewerSubmission = {
  teamId: null,
  hasSubmitted: false,
  investments: blankInvestments(),
  canSubmit: false,
}

const TEAM_SESSION_STORAGE_KEY = 'auction-team-session'

function readStoredTeamCredentials(): TeamCredentials | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(TEAM_SESSION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<TeamCredentials>
    if (typeof parsed.teamId !== 'string' || typeof parsed.name !== 'string') return null

    return {
      teamId: parsed.teamId,
      name: parsed.name,
    }
  } catch {
    return null
  }
}

function writeStoredTeamCredentials(credentials: TeamCredentials | null) {
  if (typeof window === 'undefined') return

  try {
    if (credentials) {
      window.localStorage.setItem(TEAM_SESSION_STORAGE_KEY, JSON.stringify(credentials))
      return
    }

    window.localStorage.removeItem(TEAM_SESSION_STORAGE_KEY)
  } catch {
    // Ignore storage failures so login still works in private or restricted modes.
  }
}

function getModeFromHash(hash: string): ShellMode {
  return hash === '#/host' ? 'host' : 'team'
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
  }, [snapshot?.endsAt, snapshot?.phase])

  return getCountdownMs(snapshot)
}

function buildConnectionLabel(connectionState: ConnectionState, phase?: GameSnapshot['phase']) {
  if (connectionState === 'reconnecting') return 'Reconnecting'
  if (connectionState === 'connecting' || connectionState === 'joining') return 'Linking terminal'
  if (phase === 'paused') return 'Round paused'
  if (phase === 'live') return 'Market open'
  if (phase === 'results') return 'Settlement in progress'
  if (phase === 'finished') return 'Session closed'
  return 'Standing by'
}

function PortfolioSummary({
  purse,
  settledLabel,
  settledPnl,
  totalInvestedAmount,
  totalValue,
}: {
  purse: number
  settledLabel: string
  settledPnl: number
  totalInvestedAmount: number
  totalValue: number
}) {
  return (
    <section className="portfolio-summary-grid">
      <article className="summary-card">
        <span className="summary-label">Cash</span>
        <strong>{formatCurrency(purse)}</strong>
        <p>Available for new entries only.</p>
      </article>
      <article className="summary-card">
        <span className="summary-label">Holdings</span>
        <strong>{formatCurrency(totalInvestedAmount)}</strong>
        <p>Capital currently parked in live positions.</p>
      </article>
      <article className="summary-card">
        <span className="summary-label">Settled P&amp;L</span>
        <strong className={settledPnl >= 0 ? 'positive' : 'negative'}>
          {settledPnl >= 0 ? '+' : ''}
          {formatCurrency(settledPnl)}
        </strong>
        <p>{settledLabel}</p>
      </article>
      <article className="summary-card emphasis">
        <span className="summary-label">Portfolio Value</span>
        <strong>{formatCurrency(totalValue)}</strong>
        <p>Cash plus current holdings.</p>
      </article>
    </section>
  )
}

function AllocationCard({
  company,
  disabled,
  invested,
  isSubmitted,
  onInvest,
  onRequestSell,
  purse,
}: {
  company: DisplayCompanyView
  disabled: boolean
  invested: number
  isSubmitted: boolean
  onInvest: (companyId: CompanyId, amount: number) => void
  onRequestSell: (companyId: CompanyId, amount: number) => void
  purse: number
}) {
  const [buyAmount, setBuyAmount] = useState('')
  const [sellAmount, setSellAmount] = useState('')

  const quickAmounts = getQuickInvestAmounts(purse)

  function handleCustomInvest() {
    const amount = Number.parseInt(buyAmount, 10)
    if (amount > 0 && amount <= purse) {
      onInvest(company.id, amount)
      setBuyAmount('')
    }
  }

  function handleSellRequest() {
    const amount = Number.parseInt(sellAmount, 10)
    if (amount > 0 && amount <= invested) {
      onRequestSell(company.id, amount)
      setSellAmount('')
    }
  }

  return (
    <article className="allocation-card" style={{ '--company-accent': company.accent } as CSSProperties}>
      <div className="allocation-card-head">
        <div>
          <span className="ticker-pill">{company.code}</span>
          <h3>{company.name}</h3>
          <p>{company.sector}</p>
        </div>
        <div className="position-pill">
          <span>Holding</span>
          <strong>{formatCurrency(invested)}</strong>
        </div>
      </div>

      {company.signal || company.detail ? (
        <div className="signal-panel">
          <span className="signal-label">Market read</span>
          {company.signal && <strong>{company.signal}</strong>}
          {company.detail && <p>{company.detail}</p>}
        </div>
      ) : null}

      {isSubmitted ? (
        <div className="locked-banner">Locked for settlement</div>
      ) : (
        <div className="allocation-actions">
          <div className="quick-amount-grid">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                className="secondary-chip"
                type="button"
                disabled={disabled || amount > purse}
                onClick={() => onInvest(company.id, amount)}
              >
                +{formatCompactCurrency(amount)}
              </button>
            ))}
          </div>

          <div className="input-action-row">
            <label className="field compact-field">
              <span>Buy amount</span>
              <input
                aria-label={`${company.name} buy amount`}
                type="number"
                min="1"
                max={purse}
                value={buyAmount}
                disabled={disabled}
                placeholder="Enter amount"
                onChange={(event) => setBuyAmount(event.target.value)}
              />
            </label>
            <button
              className="primary-inline-button"
              type="button"
              disabled={disabled || !buyAmount || Number(buyAmount) <= 0 || Number(buyAmount) > purse}
              onClick={handleCustomInvest}
            >
              Buy
            </button>
          </div>

          <div className="input-action-row sell-row">
            <label className="field compact-field">
              <span>Sell to cash</span>
              <input
                aria-label={`${company.name} sell amount`}
                type="number"
                min="1"
                max={invested}
                value={sellAmount}
                disabled={disabled || invested <= 0}
                placeholder={invested > 0 ? 'Enter amount' : 'No holding'}
                onChange={(event) => setSellAmount(event.target.value)}
              />
            </label>
            <button
              className="secondary-inline-button"
              type="button"
              disabled={disabled || invested <= 0 || !sellAmount || Number(sellAmount) <= 0 || Number(sellAmount) > invested}
              onClick={handleSellRequest}
            >
              Review sale
            </button>
          </div>
        </div>
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
  const visibleCompanyIds = getVisibleCompanyIds(results.round)

  return (
    <div className="overlay-frame">
      <div className="overlay-card results-sheet">
        <div className="overlay-head">
          <div>
            <span className="eyebrow">Settlement {getDisplayYearLabel(results.round)}</span>
            <h2>{getDisplayRoundTitle(results.round)}</h2>
          </div>
          <button className="secondary-inline-button" type="button" onClick={onDismiss}>
            Close
          </button>
        </div>

        <div className="result-grid">
          {visibleCompanyIds.map((companyId) => {
            const meta = getCompanyDisplayMeta(companyId)
            const currentReturn = results.actualReturns[companyId]
            const myBreakdown = myOutcome?.breakdown[companyId]

            return (
              <article key={companyId} className="result-card">
                <div className="result-card-head">
                  <div>
                    <span className="ticker-pill">{meta.code}</span>
                    <strong>{meta.name}</strong>
                  </div>
                  <span className={currentReturn >= 0 ? 'positive' : 'negative'}>
                    {formatDirectionalReturn(currentReturn)}
                  </span>
                </div>
                <p>{getDisplayReveal(results.round, companyId)}</p>
                {myBreakdown ? (
                  <div className="result-card-foot">
                    <span>Held {formatCurrency(myBreakdown.invested)}</span>
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
          <div className="settlement-band">
            <div>
              <span className="summary-label">Holdings settled</span>
              <strong>{formatCurrency(myOutcome.totalInvested)}</strong>
            </div>
            <div>
              <span className="summary-label">Round return</span>
              <strong className={myOutcome.returns >= 0 ? 'positive' : 'negative'}>
                {myOutcome.returns >= 0 ? '+' : ''}
                {formatCurrency(myOutcome.returns)}
              </strong>
            </div>
            <div>
              <span className="summary-label">Return rate</span>
              <strong>{formatReturn(myOutcome.percentReturn)}</strong>
            </div>
            <div>
              <span className="summary-label">Cash after settlement</span>
              <strong>{formatCurrency(myOutcome.purse)}</strong>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TradeLogPanel({ entries }: { entries: SessionTradeEntry[] }) {
  return (
    <section className="desk-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Trade log</span>
          <h3>Confirmed session activity</h3>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="empty-copy">No confirmed trades yet.</p>
      ) : (
        <div className="trade-log-list">
          {entries.map((entry) => (
            <article key={entry.id} className="trade-log-entry participant">
              <div className="trade-log-head">
                <strong>{entry.action === 'buy' ? 'Buy' : 'Sell to cash'}</strong>
                <span>{formatTimestamp(entry.timestamp)}</span>
              </div>
              <div className="trade-log-body">
                <span>{getCompanyDisplayName(entry.companyId)}</span>
                <strong>{formatCurrency(entry.amount)}</strong>
              </div>
              <p>{getDisplayYearLabel(entry.round)} session</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function SellConfirmModal({
  currentCash,
  onCancel,
  onConfirm,
  pending,
  sellRequest,
}: {
  currentCash: number
  onCancel: () => void
  onConfirm: () => void
  pending: boolean
  sellRequest: PendingSellState
}) {
  const company = getCompanyDisplayMeta(sellRequest.companyId)
  const projectedCash = currentCash + sellRequest.amount

  return (
    <div className="overlay-frame">
      <div className="overlay-card confirm-sheet">
        <div className="overlay-head">
          <div>
            <span className="eyebrow">Confirm sale</span>
            <h2>{company.name}</h2>
          </div>
        </div>

        <div className="confirm-grid">
          <article className="confirm-metric">
            <span className="summary-label">Sell amount</span>
            <strong>{formatCurrency(sellRequest.amount)}</strong>
          </article>
          <article className="confirm-metric">
            <span className="summary-label">Current cash</span>
            <strong>{formatCurrency(currentCash)}</strong>
          </article>
          <article className="confirm-metric emphasis">
            <span className="summary-label">Projected cash</span>
            <strong>{formatCurrency(projectedCash)}</strong>
          </article>
        </div>

        <p className="confirm-copy">
          This action only moves existing holdings back into cash. Portfolio gains remain part of the position until settlement.
        </p>

        <div className="confirm-actions">
          <button className="secondary-inline-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="button" disabled={pending} onClick={onConfirm}>
            {pending ? 'Executing...' : 'Confirm sale'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FakeCallModal({
  call,
  onDismiss,
}: {
  call: FakeCall
  onDismiss: () => void
}) {
  return (
    <div className="call-modal">
      <div className="call-header">
        <div>
          <span className="eyebrow">Incoming call</span>
          <h3>{call.title}</h3>
        </div>
        <button className="call-dismiss" type="button" aria-label="Dismiss call" onClick={onDismiss}>
          Close
        </button>
      </div>
      <p className="call-source">{call.source}</p>
      <p className="call-body">{call.body}</p>
    </div>
  )
}

export function TeamDashboardApp({ socketFactory = createSocketClient }: { socketFactory?: SocketFactory }) {
  const socketRef = useRef<SocketLike | null>(null)
  const requestedCredentialsRef = useRef<TeamCredentials | null>(null)
  const joinedCredentialsRef = useRef<TeamCredentials | null>(null)

  const [formValues, setFormValues] = useState(() => readStoredTeamCredentials() ?? { teamId: '', name: '' })
  const [requestedCredentials, setRequestedCredentials] = useState<TeamCredentials | null>(() => readStoredTeamCredentials())
  const [joinedCredentials, setJoinedCredentials] = useState<TeamCredentials | null>(() => readStoredTeamCredentials())
  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    readStoredTeamCredentials() ? 'reconnecting' : 'idle',
  )
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [investmentError, setInvestmentError] = useState<string | null>(null)
  const [pendingSubmit, setPendingSubmit] = useState(false)
  const [pendingSellExecution, setPendingSellExecution] = useState(false)
  const [localInvestments, setLocalInvestments] = useState(blankInvestments())
  const [localPurse, setLocalPurse] = useState(0)
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [tradeLog, setTradeLog] = useState<SessionTradeEntry[]>([])
  const [pendingSell, setPendingSell] = useState<PendingSellState | null>(null)
  const [scheduledCall, setScheduledCall] = useState<ScheduledCallState | null>(null)
  const [activeCall, setActiveCall] = useState<FakeCall | null>(null)

  useEffect(() => {
    requestedCredentialsRef.current = requestedCredentials
  }, [requestedCredentials])

  useEffect(() => {
    joinedCredentialsRef.current = joinedCredentials
  }, [joinedCredentials])

  useEffect(() => {
    writeStoredTeamCredentials(joinedCredentials ?? requestedCredentials)
  }, [joinedCredentials, requestedCredentials])

  useEffect(() => {
    if (snapshot?.phase === 'live' || snapshot?.phase === 'paused' || snapshot?.phase === 'idle') {
      setShowResults(false)
    }
  }, [snapshot?.phase, snapshot?.round])

  const countdownMs = useCountdown(snapshot)
  const hasRequestedCredentials = requestedCredentials !== null
  const viewerSubmission = snapshot?.viewerSubmission ?? EMPTY_SUBMISSION
  const currentRound = snapshot?.currentRound ?? null
  const displayRound = useMemo(() => buildDisplayRound(currentRound), [currentRound])
  const myTeamData = snapshot?.leaderboard.find((entry) => entry.teamId === joinedCredentials?.teamId) ?? null
  const currentPurse = myTeamData?.purse ?? localPurse
  const currentInvestments = myTeamData?.investments ?? localInvestments
  const totalInvestedAmount = totalInvested(currentInvestments)
  const totalValue = currentPurse + totalInvestedAmount
  const connectionLabel = buildConnectionLabel(connectionState, snapshot?.phase)
  const timerDisplayMs = snapshot
    ? snapshot.phase === 'live' || snapshot.phase === 'paused'
      ? countdownMs
      : snapshot.roundDurationMs
    : 0
  const timerDisplayText = formatCountdown(timerDisplayMs)
  const isLowTime = snapshot?.phase === 'live' && timerDisplayMs <= 15000
  const canAdjustInvestments =
    snapshot?.phase === 'live' &&
    connectionState === 'connected' &&
    viewerSubmission.canSubmit &&
    !viewerSubmission.hasSubmitted
  const canSubmit = canAdjustInvestments && !pendingSubmit && hasInvestments(currentInvestments)
  const isSubmitted = viewerSubmission.hasSubmitted
  const settledOutcome = roundResults?.teamOutcomes.find((outcome) => outcome.teamId === joinedCredentials?.teamId) ?? null
  const settledPnl = settledOutcome?.returns ?? 0
  const settledLabel = roundResults ? `${getDisplayYearLabel(roundResults.round)} settlement` : 'Awaiting first settlement'

  useEffect(() => {
    if (myTeamData) {
      setLocalInvestments(myTeamData.investments)
      setLocalPurse(myTeamData.purse)
    }
  }, [myTeamData?.investments, myTeamData?.purse])

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

          setJoinError(response.error.message)
          setRequestedCredentials(null)
          setJoinedCredentials(null)
          requestedCredentialsRef.current = null
          joinedCredentialsRef.current = null
          writeStoredTeamCredentials(null)

          if (reconnecting) {
            setServerMessage(response.error.message)
            setConnectionState('idle')
            return
          }

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
      setPendingSell(null)
      setActiveCall(null)
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

  useEffect(() => {
    if (snapshot?.round === undefined || snapshot.round <= 0 || snapshot.phase !== 'live' || !displayRound || !displayRound.calls || displayRound.calls.length === 0) {
      return
    }

    setActiveCall(null)
    setScheduledCall((current) => {
      if (current?.round === snapshot.round) {
        return current
      }

      const triggerRatio = 0.35 + Math.random() * 0.35
      const selectedCall = displayRound.calls![Math.floor(Math.random() * displayRound.calls!.length)]

      return {
        call: selectedCall,
        round: snapshot.round,
        shown: false,
        triggerElapsedMs: snapshot.roundDurationMs * triggerRatio,
      }
    })
  }, [displayRound, snapshot?.phase, snapshot?.round, snapshot?.roundDurationMs])

  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'live' || !scheduledCall || scheduledCall.round !== snapshot.round || scheduledCall.shown) {
      return
    }

    const elapsedMs = snapshot.roundDurationMs - countdownMs
    if (elapsedMs >= scheduledCall.triggerElapsedMs) {
      setActiveCall(scheduledCall.call)
      setScheduledCall((current) => (current ? { ...current, shown: true } : current))
    }
  }, [countdownMs, scheduledCall, snapshot])

  function appendTrade(action: TradeAction, companyId: CompanyId, amount: number) {
    setTradeLog((current) => [
      {
        action,
        amount,
        companyId,
        id: `${Date.now()}-${action}-${companyId}-${amount}`,
        round: snapshot?.round ?? 0,
        timestamp: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 24))
  }

  function handleJoinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const credentials = {
      teamId: formValues.teamId.trim(),
      name: formValues.name.trim(),
    }

    if (!credentials.teamId) {
      setJoinError('Team ID is required.')
      return
    }

    if (!credentials.name) {
      setJoinError('Team name is required.')
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
        setRequestedCredentials(null)
        setJoinedCredentials(null)
        requestedCredentialsRef.current = null
        joinedCredentialsRef.current = null
        writeStoredTeamCredentials(null)
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
        return
      }

      appendTrade('buy', companyId, amount)
    })
  }

  function handleRequestSell(companyId: CompanyId, amount: number) {
    if (amount <= 0 || amount > (currentInvestments[companyId] ?? 0)) {
      setInvestmentError('Sell amount must stay within your current holding.')
      return
    }

    setInvestmentError(null)
    setPendingSell({ amount, companyId })
  }

  function handleConfirmSell() {
    const socket = socketRef.current
    if (!socket || snapshot?.phase !== 'live' || !pendingSell) return

    setPendingSellExecution(true)
    setInvestmentError(null)
    socket.emit(
      'team:withdraw',
      { amount: pendingSell.amount, companyId: pendingSell.companyId },
      (response: AckResponse<{ purse: number; invested: number }>) => {
        setPendingSellExecution(false)

        if (!response.ok) {
          setInvestmentError(response.error.message)
          return
        }

        appendTrade('sell', pendingSell.companyId, pendingSell.amount)
        setPendingSell(null)
      },
    )
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
            <span className="eyebrow">Participant desk</span>
            <h2>Connect to the trading room</h2>
            <p>Join the live desk, receive the current market condition, and size positions before the round locks.</p>
          </div>
          <p className="status-line">Status: {connectionLabel}</p>
        </div>

        <div className="join-layout">
          <section className="desk-panel intro-panel">
            <span className="eyebrow">Operating notes</span>
            <h3>Decisions stay simple.</h3>
            <p>Review the market condition, build positions, sell only from existing holdings, and let settlement update cash when the round closes.</p>
          </section>

          <section className={`desk-panel join-panel ${joinError ? 'panel-error' : ''}`}>
            <span className="eyebrow">Terminal access</span>
            <h3>Link your team</h3>
            <form className="join-form" onSubmit={handleJoinSubmit}>
              <label className={`field ${joinError === 'Team ID is required.' ? 'field-error' : ''}`}>
                <span>Team ID</span>
                <input
                  aria-label="Team ID"
                  autoComplete="off"
                  autoFocus
                  placeholder="desk-alpha"
                  required
                  value={formValues.teamId}
                  onChange={(event) => {
                    setFormValues((current) => ({ ...current, teamId: event.target.value }))
                    if (joinError) setJoinError(null)
                  }}
                />
              </label>
              <label className={`field ${joinError === 'Team name is required.' ? 'field-error' : ''}`}>
                <span>Team name</span>
                <input
                  aria-label="Team Name"
                  autoComplete="off"
                  placeholder="Alpha Desk"
                  required
                  value={formValues.name}
                  onChange={(event) => {
                    setFormValues((current) => ({ ...current, name: event.target.value }))
                    if (joinError) setJoinError(null)
                  }}
                />
              </label>
              <button className="primary-button" type="submit" disabled={connectionState === 'connecting' || connectionState === 'joining'}>
                {connectionState === 'connecting' || connectionState === 'joining' ? 'Linking...' : 'Enter desk'}
              </button>
            </form>
            {joinError ? <p className="message-banner error">{joinError}</p> : null}
          </section>
        </div>
      </section>
    )
  }

  return (
    <section className="team-view">
      {snapshot ? (
        <div className={`timer-rail ${isLowTime ? 'low-time' : ''}`}>
          <span className="summary-label">Round Timer</span>
          <strong>{timerDisplayText}</strong>
        </div>
      ) : null}

      {showResults && roundResults ? (
        <RoundResultsOverlay myTeamId={joinedCredentials.teamId} onDismiss={() => setShowResults(false)} results={roundResults} />
      ) : null}
      {pendingSell ? (
        <SellConfirmModal
          currentCash={currentPurse}
          onCancel={() => setPendingSell(null)}
          onConfirm={handleConfirmSell}
          pending={pendingSellExecution}
          sellRequest={pendingSell}
        />
      ) : null}
      {activeCall ? <FakeCallModal call={activeCall} onDismiss={() => setActiveCall(null)} /> : null}

      <div className="view-intro">
        <div>
          <span className="eyebrow">Participant desk</span>
          <h2>{joinedCredentials.name}</h2>
          <p>
            {snapshot ? `Round ${snapshot.round} of ${snapshot.totalRounds}` : 'Waiting for the next market window'}
            {displayRound ? ` • ${displayRound.yearRange}` : ''}
            {` • ${connectionLabel}`}
          </p>
        </div>
        <span className={`phase-chip ${snapshot?.phase ?? 'idle'}`}>{formatPhaseLabel(snapshot?.phase ?? 'idle')}</span>
      </div>

      <PortfolioSummary
        purse={currentPurse}
        settledLabel={settledLabel}
        settledPnl={settledPnl}
        totalInvestedAmount={totalInvestedAmount}
        totalValue={totalValue}
      />

      <section className="market-brief-panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Market condition</span>
            <h3>{displayRound ? displayRound.title : 'Awaiting next market year'}</h3>
          </div>
          {displayRound ? (
            <div className="year-badge-wrap">
              <span className="summary-label">Visible year</span>
              <strong className="year-badge">{displayRound.year}</strong>
            </div>
          ) : null}
        </div>

        {displayRound ? (
          <p className="market-context">{displayRound.context}</p>
        ) : (
          <p className="empty-copy">
            {snapshot?.phase === 'results'
              ? 'Settlement is running.'
              : snapshot?.phase === 'finished'
                ? 'The session is closed.'
                : 'The next market window has not opened yet.'}
          </p>
        )}
      </section>

      {displayRound ? (
        <section className={`desk-panel ${investmentError ? 'panel-error' : ''}`}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Holdings board</span>
              <h3>Build and trim positions</h3>
            </div>
            <p className="status-line">
              {displayRound.visibleCompanyIds.length} live instruments •{' '}
              {isSubmitted
                ? 'Locked'
                : canAdjustInvestments
                  ? 'Editable'
                  : snapshot?.phase === 'paused'
                    ? 'Paused'
                    : 'Waiting'}
            </p>
          </div>

          <div className="allocation-grid">
            {displayRound.companies.map((company) => (
              <AllocationCard
                key={company.id}
                company={company}
                disabled={!canAdjustInvestments}
                invested={currentInvestments[company.id] ?? 0}
                isSubmitted={isSubmitted}
                onInvest={handleInvest}
                onRequestSell={handleRequestSell}
                purse={currentPurse}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="execution-grid">
        <section className="desk-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Execution</span>
              <h3>Round controls</h3>
            </div>
          </div>

          <div className="execution-summary">
            <article className="execution-tile">
              <span className="summary-label">Cash available</span>
              <strong>{formatCurrency(currentPurse)}</strong>
            </article>
            <article className="execution-tile">
              <span className="summary-label">Holdings deployed</span>
              <strong>{formatCurrency(totalInvestedAmount)}</strong>
            </article>
          </div>

          <p className="execution-copy">
            Profit is not a withdrawable balance. Only cash can be redeployed, and selling a position only returns the amount moved back into cash before settlement.
          </p>

          <button className="primary-button full-width" type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {pendingSubmit
              ? 'Locking...'
              : hasInvestments(currentInvestments)
                ? `Lock portfolio (${formatCurrency(totalInvestedAmount)})`
                : 'Add a position before locking'}
          </button>

          {investmentError ? <p className="message-banner error">{investmentError}</p> : null}
          {serverMessage ? <p className="message-banner info">{serverMessage}</p> : null}
        </section>

        <TradeLogPanel entries={tradeLog} />
      </section>
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

  return (
    <main className="app-shell">
      <section className="experience-shell">
        <header className="shell-header">
          <div className="brand-column">
            <span className="eyebrow">Strategic market terminal</span>
            <h1>Northstar Exchange</h1>
            <p>A restrained live trading interface for participant execution and admin oversight, mapped entirely from the frontend layer.</p>
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
