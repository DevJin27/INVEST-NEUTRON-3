import type { Decision, GameSnapshot } from './types'

const PLAYABLE_PHASES = new Set(['live', 'paused'])

export function isPlayableSnapshot(snapshot: GameSnapshot | null) {
  return Boolean(snapshot && snapshot.currentSignal && PLAYABLE_PHASES.has(snapshot.phase))
}

export function getCountdownMs(snapshot: GameSnapshot | null, now = Date.now()) {
  if (!snapshot) {
    return 0
  }

  if (snapshot.phase === 'paused') {
    return Math.max(0, snapshot.remainingMs)
  }

  if (snapshot.phase === 'live' && snapshot.endsAt !== null) {
    return Math.max(0, snapshot.endsAt - now)
  }

  return 0
}

export function formatCountdown(milliseconds: number) {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100))
  const minutes = Math.floor(totalTenths / 600)
  const seconds = Math.floor((totalTenths % 600) / 10)
  const tenths = totalTenths % 10

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
}

export function formatDecisionLabel(decision: Decision) {
  return decision === 'TRADE' ? 'Trade' : 'Ignore'
}
