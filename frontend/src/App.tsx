import { type FormEvent, useEffect, useRef, useState } from 'react'
import './App.css'
import { createSocketClient } from './socket-client'
import type {
  AckResponse,
  ConnectionState,
  Decision,
  GameSnapshot,
  SerializedError,
  SocketLike,
  SubmissionStatus,
  TeamCredentials,
  ViewerSubmission,
} from './types'
import { formatCountdown, formatDecisionLabel, getCountdownMs, isPlayableSnapshot } from './utils'

const INITIAL_FORM = {
  teamId: '',
  name: '',
}

const EMPTY_SUBMISSION: ViewerSubmission = {
  teamId: null,
  hasSubmitted: false,
  decision: null,
  canSubmit: false,
}

type SocketFactory = () => SocketLike

function useCountdown(snapshot: GameSnapshot | null) {
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

function trimCredentials(values: TeamCredentials) {
  return {
    teamId: values.teamId.trim(),
    name: values.name.trim(),
  }
}

function buildSubmittedMessage(decision: Decision) {
  return `${formatDecisionLabel(decision)} submitted`
}

export function TeamDashboardApp({ socketFactory = createSocketClient }: { socketFactory?: SocketFactory }) {
  const socketRef = useRef<SocketLike | null>(null)
  const requestedCredentialsRef = useRef<TeamCredentials | null>(null)
  const joinedCredentialsRef = useRef<TeamCredentials | null>(null)

  const [formValues, setFormValues] = useState(INITIAL_FORM)
  const [requestedCredentials, setRequestedCredentials] = useState<TeamCredentials | null>(null)
  const [joinedCredentials, setJoinedCredentials] = useState<TeamCredentials | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null)
  const [serverMessage, setServerMessage] = useState<string | null>(null)

  useEffect(() => {
    requestedCredentialsRef.current = requestedCredentials
  }, [requestedCredentials])

  useEffect(() => {
    joinedCredentialsRef.current = joinedCredentials
  }, [joinedCredentials])

  const countdownMs = useCountdown(snapshot)
  const hasRequestedCredentials = requestedCredentials !== null
  const viewerSubmission = snapshot?.viewerSubmission ?? EMPTY_SUBMISSION
  const activeSignal = isPlayableSnapshot(snapshot) ? snapshot?.currentSignal ?? null : null
  const isReconnecting = connectionState === 'reconnecting'
  const showJoinScreen = joinedCredentials === null
  const canSubmitDecision =
    activeSignal !== null &&
    connectionState === 'connected' &&
    viewerSubmission.canSubmit &&
    !viewerSubmission.hasSubmitted &&
    pendingDecision === null

  useEffect(() => {
    if (!requestedCredentialsRef.current || socketRef.current) {
      return undefined
    }

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
          setJoinError(null)
          return
        }

        if (reconnecting) {
          setServerMessage(response.error.message)
          setConnectionState('reconnecting')
          return
        }

        setJoinError(response.error.message)
        setConnectionState(socket.connected ? 'idle' : 'connecting')
      })
    }

    const applySnapshot = (nextSnapshot: GameSnapshot) => {
      setSnapshot(nextSnapshot)

      if (nextSnapshot.viewerSubmission.canSubmit) {
        setPendingDecision(null)
        setSubmissionError(null)
        if (!nextSnapshot.viewerSubmission.hasSubmitted) {
          setSubmissionMessage(null)
        }
      }

      if (nextSnapshot.viewerSubmission.hasSubmitted && nextSnapshot.viewerSubmission.decision) {
        setPendingDecision(null)
        setSubmissionError(null)
        setSubmissionMessage(buildSubmittedMessage(nextSnapshot.viewerSubmission.decision))
      }

      if (!isPlayableSnapshot(nextSnapshot)) {
        setPendingDecision(null)
      }
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

      if (requestedCredentialsRef.current) {
        setConnectionState('connecting')
      } else {
        setConnectionState('idle')
      }
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

    const handleSubmissionStatus = (status: SubmissionStatus) => {
      if (status.accepted && status.decision) {
        setPendingDecision(null)
        setSubmissionError(null)
        setSubmissionMessage(buildSubmittedMessage(status.decision))
        return
      }

      if (!status.accepted && status.error) {
        setPendingDecision(null)
        setSubmissionError(status.error.message)
      }
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
    socket.on('game:snapshot', applySnapshot)
    socket.on('round:submission-status', handleSubmissionStatus)
    socket.on('game:error', handleGameError)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.off('game:snapshot', applySnapshot)
      socket.off('round:submission-status', handleSubmissionStatus)
      socket.off('game:error', handleGameError)
      socket.disconnect()
      socketRef.current = null
    }
  }, [hasRequestedCredentials, socketFactory])

  function handleJoinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const credentials = trimCredentials(formValues)
    if (!credentials.teamId || !credentials.name) {
      setJoinError('Team ID and team name are required.')
      return
    }

    requestedCredentialsRef.current = credentials
    setRequestedCredentials(credentials)
    setJoinError(null)
    setServerMessage(null)
    setSubmissionMessage(null)
    setSubmissionError(null)
    setPendingDecision(null)

    const activeSocket = socketRef.current
    if (!activeSocket) {
      setConnectionState('connecting')
      return
    }

    if (!activeSocket.connected) {
      setConnectionState('connecting')
      return
    }

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

  function handleDecision(decision: Decision) {
    const activeSocket = socketRef.current
    if (!activeSocket || !activeSocket.connected || !canSubmitDecision) {
      return
    }

    setPendingDecision(decision)
    setSubmissionError(null)
    setServerMessage(null)

    activeSocket.emit('team:submit', { decision }, (response: AckResponse<{ decision: Decision }>) => {
      if (response.ok) {
        return
      }

      setPendingDecision(null)
      setSubmissionError(response.error.message)
    })
  }

  const signalHeading = activeSignal ? activeSignal.text : 'Waiting for signal...'
  const statusLabel = (() => {
    if (isReconnecting) {
      return 'Reconnecting...'
    }

    if (connectionState === 'connecting' || connectionState === 'joining') {
      return 'Connecting to server...'
    }

    if (snapshot?.phase === 'paused') {
      return 'Round paused'
    }

    if (snapshot?.phase === 'live') {
      return 'Live round'
    }

    return 'Standing by'
  })()

  return (
    <main className="shell">
      <section className="panel">
        {showJoinScreen ? (
          <div className="join-card">
            <div className="eyebrow">Team Dashboard</div>
            <h1>Join your team</h1>
            <p className="lead">Enter your team details to receive the live signal feed and submit one decision per round.</p>

            <form className="join-form" onSubmit={handleJoinSubmit}>
              <label className="field">
                <span>Team ID</span>
                <input
                  autoComplete="off"
                  name="teamId"
                  placeholder="team-1"
                  value={formValues.teamId}
                  onChange={(event) => {
                    setFormValues((current) => ({ ...current, teamId: event.target.value }))
                  }}
                />
              </label>

              <label className="field">
                <span>Team Name</span>
                <input
                  autoComplete="off"
                  name="name"
                  placeholder="Alpha"
                  value={formValues.name}
                  onChange={(event) => {
                    setFormValues((current) => ({ ...current, name: event.target.value }))
                  }}
                />
              </label>

              <button className="join-button" type="submit" disabled={connectionState === 'connecting' || connectionState === 'joining'}>
                {connectionState === 'connecting' || connectionState === 'joining' ? 'Joining...' : 'Join Team'}
              </button>
            </form>

            <p className="subtle-status">{statusLabel}</p>
            {joinError ? (
              <p className="message error" role="alert">
                {joinError}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="dashboard">
            <header className="dashboard-header">
              <div>
                <div className="eyebrow">Team Dashboard</div>
                <h1>{joinedCredentials.name}</h1>
                <p className="round-label">
                  {snapshot ? `Round ${snapshot.round} of ${snapshot.totalRounds}` : 'Waiting for the first round'}
                </p>
              </div>

              <div className={`status-pill ${isReconnecting ? 'warning' : ''}`} role="status">
                {statusLabel}
              </div>
            </header>

            <section className={`signal-card ${activeSignal ? '' : 'waiting'}`}>
              <div className="signal-meta">
                <span>Current Signal</span>
                <span className="timer" aria-label="Countdown timer">
                  {formatCountdown(countdownMs)}
                </span>
              </div>

              <div className="signal-text">{signalHeading}</div>

              <div className="credibility-block">
                <div className="credibility-labels">
                  <span>Credibility</span>
                  <span>{activeSignal ? `${activeSignal.credibility}%` : '0%'}</span>
                </div>
                <div
                  aria-label="Credibility"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={activeSignal?.credibility ?? 0}
                  className="progress-bar"
                  role="progressbar"
                >
                  <div className="progress-fill" style={{ width: `${activeSignal?.credibility ?? 0}%` }} />
                </div>
              </div>
            </section>

            <section className="actions" aria-label="Submission actions">
              <button className="decision-button trade" type="button" disabled={!canSubmitDecision} onClick={() => handleDecision('TRADE')}>
                Trade
              </button>
              <button className="decision-button ignore" type="button" disabled={!canSubmitDecision} onClick={() => handleDecision('IGNORE')}>
                Ignore
              </button>
            </section>

            <div className="feedback">
              {submissionMessage ? (
                <p className="message success" role="status">
                  {submissionMessage}
                </p>
              ) : null}
              {submissionError ? (
                <p className="message error" role="alert">
                  {submissionError}
                </p>
              ) : null}
              {serverMessage ? (
                <p className="message info" role="status">
                  {serverMessage}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default function App() {
  return <TeamDashboardApp />
}
