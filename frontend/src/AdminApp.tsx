import React, { useEffect, useRef, useState } from 'react'
import './AdminApp.css'
import { createSocketClient } from './socket-client'
import type {
  AckResponse,
  AdminSnapshot,
  SocketLike,
  RoundResults
} from './types'
import { getCountdownMs, formatCountdown, formatCurrency, formatReturnMultiplier } from './utils'

const COMPANY_EMOJIS: Record<string, string> = {
  reliance: '🏭', hdfc_bank: '🏦', infosys: '💻', yes_bank: '🏧', byjus: '📚', adani: '⚡',
}

export function AdminApp() {
  const socketRef = useRef<SocketLike | null>(null)
  const [secret, setSecret] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [roundResults, setRoundResults] = useState<RoundResults | null>(null)
  const [, setTick] = useState(0)

  // Timer tick
  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'live' || snapshot.endsAt === null) return
    const id = window.setInterval(() => setTick(t => t + 1), 100)
    return () => window.clearInterval(id)
  }, [snapshot])

  useEffect(() => {
    const socket = createSocketClient()
    socketRef.current = socket

    socket.on('disconnect', () => {
      setIsAuthenticated(false)
    })

    socket.on('game:snapshot', (next: AdminSnapshot) => {
      setSnapshot(next)
      if (next.phase !== 'results') {
        setRoundResults(null)
      }
    })

    socket.on('round:results', (results: RoundResults) => {
      setRoundResults(results)
    })
    
    socket.on('round:started', (snap: AdminSnapshot) => {
      console.log('Round started', snap)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!socketRef.current) return
    setAuthError(null)

    socketRef.current.emit('admin:authenticate', { secret }, (res: AckResponse<{ authenticated: boolean, snapshot: AdminSnapshot }>) => {
      if (res.ok && res.data.authenticated) {
        setIsAuthenticated(true)
        setSnapshot(res.data.snapshot)
      } else {
        setAuthError(!res.ok ? res.error.message : 'Authentication failed')
      }
    })
  }

  const runCommand = (cmd: string) => {
    socketRef.current?.emit(cmd, {}, (res: AckResponse<unknown>) => {
      if (!res.ok) alert(`Action failed: ${res.error.message}`)
    })
  }

  if (!isAuthenticated || !snapshot) {
    return (
      <div className="admin-shell">
        <form className="admin-login" onSubmit={handleLogin}>
          <h1>Host Access</h1>
          <input 
            type="password" 
            placeholder="Admin Secret" 
            value={secret} 
            onChange={e => setSecret(e.target.value)} 
          />
          <button type="submit">Unlock Dashboard</button>
          {authError && <p style={{ color: '#fca5a5', marginTop: 12 }}>{authError}</p>}
        </form>
      </div>
    )
  }

  const countdownMs = getCountdownMs(snapshot)

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <h1>Portfolio Challenge Host</h1>
        <div className="admin-status">
          <span className="admin-pill">Connected Teams: {snapshot.activeTeamsCount}</span>
          <span className={`admin-pill ${snapshot.phase === 'live' ? 'live' : snapshot.phase === 'paused' ? 'paused' : ''}`}>
            Phase: {snapshot.phase.toUpperCase()}
          </span>
        </div>
      </header>

      <div className="admin-dashboard">
        <div className="admin-panel">
          <h2>Teams & Submissions</h2>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {snapshot.teamSubmissions.map(team => (
              <div key={team.teamId} className={`host-team-row ${team.hasSubmitted ? 'submitted' : 'pending'}`}>
                <div>
                  <strong style={{ display: 'block', fontSize: '1.1rem' }}>{team.name}</strong>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {team.connected ? '🟢 Online' : '🔴 Offline'} | 💰 {formatCurrency(team.purse)} + 📈 {formatCurrency(team.totalInvested)} = {formatCurrency(team.totalValue)}
                  </span>
                </div>
                <div>
                  {team.hasSubmitted ? <span title="Submitted">✅</span> : <span title="Waiting...">⏳</span>}
                </div>
              </div>
            ))}
            {snapshot.teamSubmissions.length === 0 && (
              <p style={{ color: '#64748b' }}>No teams have joined yet.</p>
            )}
          </div>
        </div>

        <div className="admin-panel" style={{ background: 'transparent', border: 'none', padding: 0 }}>
          
          {(snapshot.phase === 'live' || snapshot.phase === 'paused') && snapshot.currentRound && (
            <div className="host-big-round-card">
              <div className="host-big-year">{snapshot.currentRound.year}</div>
              <div className="host-big-title">{snapshot.currentRound.title}</div>
              <div className="host-big-context">{snapshot.currentRound.context}</div>
              <div className="host-timer">{formatCountdown(countdownMs)}</div>
            </div>
          )}

          {snapshot.phase === 'results' && roundResults && (
            <div className="host-big-round-card" style={{ padding: '40px' }}>
              <div className="host-big-title">{roundResults.title} Results</div>
              <div className="host-results-grid">
                {Object.entries(roundResults.actualReturns).map(([companyId, ret]) => (
                  <div key={companyId} className="host-result-card">
                    <span className="emoji">{COMPANY_EMOJIS[companyId] || '🏢'}</span>
                    <div style={{ fontSize: '1.1rem', marginBottom: 8 }}>
                      {snapshot.currentRound?.companies.find(c => c.id === companyId)?.name || companyId}
                    </div>
                    <div className={`host-result-value ${ret >= 0 ? 'positive' : 'negative'}`}>
                      {formatReturnMultiplier(ret)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {snapshot.phase === 'idle' && (
             <div className="host-big-round-card">
               <div className="host-big-year">READY</div>
               <div className="host-big-title">Waiting to clear for launch</div>
             </div>
          )}
          
          {snapshot.phase === 'finished' && (
             <div className="host-big-round-card">
               <div className="host-big-year">GAME OVER</div>
               <div className="host-big-title">Check Leaderboard on Left</div>
             </div>
          )}

          <div className="host-controls">
            {snapshot.phase === 'idle' && (
              <button className="btn-start" onClick={() => runCommand('admin:start-game')}>Start Game</button>
            )}
            {snapshot.phase === 'live' && (
              <>
                <button className="btn-pause" onClick={() => runCommand('admin:pause-round')}>Pause Timer</button>
                <button className="btn-danger" onClick={() => runCommand('admin:end-round')}>End Round Early</button>
              </>
            )}
            {snapshot.phase === 'paused' && (
              <button className="btn-resume" onClick={() => runCommand('admin:resume-round')}>Resume Timer</button>
            )}
            {(snapshot.phase === 'results' || snapshot.phase === 'finished') && (
              <button className="btn-next" onClick={() => runCommand('admin:next-round')} disabled={snapshot.phase === 'finished'}>
                {snapshot.phase === 'finished' ? 'No More Rounds' : 'Next Round'}
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn-danger" onClick={() => runCommand('admin:reset-game')}>Reset Game</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminApp
