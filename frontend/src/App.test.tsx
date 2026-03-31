import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamDashboardApp } from './App'
import { MockSocket } from './test-utils/mockSocket'
import type { AckResponse, Decision, GameSnapshot, TeamCredentials } from './types'

function createJoinAck(credentials: TeamCredentials): AckResponse<{ team: { teamId: string; name: string } }> {
  return {
    ok: true,
    data: {
      team: {
        teamId: credentials.teamId,
        name: credentials.name,
      },
    },
  }
}

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    activeTeamsCount: 1,
    currentSignal: null,
    endsAt: null,
    leaderboard: [],
    phase: 'idle',
    remainingMs: 0,
    round: 0,
    totalRounds: 30,
    viewerSubmission: {
      teamId: 'team-1',
      hasSubmitted: false,
      decision: null,
      canSubmit: false,
    },
    ...overrides,
  }
}

function createLiveSnapshot(decision: Decision | null = null) {
  return createSnapshot({
    phase: 'live',
    round: 3,
    totalRounds: 30,
    endsAt: Date.now() + 4000,
    currentSignal: {
      id: 's1',
      text: 'Supplier invoices point to accelerated AI server orders.',
      type: 'ALPHA',
      value: 760,
      credibility: 72,
    },
    viewerSubmission: {
      teamId: 'team-1',
      hasSubmitted: decision !== null,
      decision,
      canSubmit: decision === null,
    },
  })
}

describe('TeamDashboardApp', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a join validation error when required fields are empty', async () => {
    const socket = new MockSocket()
    const user = userEvent.setup()

    render(<TeamDashboardApp socketFactory={() => socket} />)

    await user.click(screen.getByRole('button', { name: /join team/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Team ID and team name are required.')
  })

  it('joins successfully and shows the waiting state before a signal is playable', async () => {
    const socket = new MockSocket()
    const user = userEvent.setup()
    const credentials = { teamId: 'team-1', name: 'Alpha' }

    socket.onEmit('team:join', (_payload, ack) => {
      ack?.(createJoinAck(credentials))
      socket.serverEmit(
        'game:snapshot',
        createSnapshot({
          viewerSubmission: {
            teamId: credentials.teamId,
            hasSubmitted: false,
            decision: null,
            canSubmit: false,
          },
        }),
      )
    })

    render(<TeamDashboardApp socketFactory={() => socket} />)

    await user.type(screen.getByLabelText(/team id/i), credentials.teamId)
    await user.type(screen.getByLabelText(/team name/i), credentials.name)
    await user.click(screen.getByRole('button', { name: /join team/i }))

    await act(async () => {
      socket.connect()
    })

    expect(await screen.findByRole('heading', { name: credentials.name })).toBeInTheDocument()
    expect(screen.getByText('Waiting for signal...')).toBeInTheDocument()
  })

  it('renders the live signal, credibility bar, and countdown from server state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'))

    const socket = new MockSocket()
    const credentials = { teamId: 'team-1', name: 'Alpha' }

    socket.onEmit('team:join', (_payload, ack) => {
      ack?.(createJoinAck(credentials))
      socket.serverEmit('game:snapshot', createLiveSnapshot())
    })

    render(<TeamDashboardApp socketFactory={() => socket} />)

    fireEvent.change(screen.getByLabelText(/team id/i), { target: { value: credentials.teamId } })
    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: credentials.name } })
    fireEvent.click(screen.getByRole('button', { name: /join team/i }))

    await act(async () => {
      socket.connect()
    })

    expect(screen.getByText(/Supplier invoices point to accelerated AI server orders/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /credibility/i })).toHaveAttribute('aria-valuenow', '72')
    expect(screen.getByLabelText(/countdown timer/i)).toHaveTextContent('00:04.0')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })

    expect(screen.getByLabelText(/countdown timer/i)).toHaveTextContent('00:01.5')
  })

  it('disables both buttons after one click and shows confirmation after submission', async () => {
    const socket = new MockSocket()
    const user = userEvent.setup()
    const credentials = { teamId: 'team-1', name: 'Alpha' }

    socket.onEmit('team:join', (_payload, ack) => {
      ack?.(createJoinAck(credentials))
      socket.serverEmit('game:snapshot', createLiveSnapshot())
    })

    socket.onEmit('team:submit', (_payload, ack) => {
      ack?.({
        ok: true,
        data: {
          decision: 'TRADE',
          round: 3,
          teamId: credentials.teamId,
        },
      })
      socket.serverEmit('round:submission-status', {
        accepted: true,
        decision: 'TRADE',
        round: 3,
        teamId: credentials.teamId,
      })
      socket.serverEmit('game:snapshot', createLiveSnapshot('TRADE'))
    })

    render(<TeamDashboardApp socketFactory={() => socket} />)

    await user.type(screen.getByLabelText(/team id/i), credentials.teamId)
    await user.type(screen.getByLabelText(/team name/i), credentials.name)
    await user.click(screen.getByRole('button', { name: /join team/i }))

    await act(async () => {
      socket.connect()
    })

    const tradeButton = await screen.findByRole('button', { name: 'Trade' })
    const ignoreButton = screen.getByRole('button', { name: 'Ignore' })

    await user.click(tradeButton)

    expect(tradeButton).toBeDisabled()
    expect(ignoreButton).toBeDisabled()
    expect(await screen.findByText('Trade submitted')).toBeInTheDocument()
  })

  it('shows reconnecting state and auto-rejoins with the saved credentials', async () => {
    const socket = new MockSocket()
    const user = userEvent.setup()
    const credentials = { teamId: 'team-1', name: 'Alpha' }

    socket.onEmit('team:join', (_payload, ack) => {
      ack?.(createJoinAck(credentials))
      socket.serverEmit('game:snapshot', createLiveSnapshot())
    })

    render(<TeamDashboardApp socketFactory={() => socket} />)

    await user.type(screen.getByLabelText(/team id/i), credentials.teamId)
    await user.type(screen.getByLabelText(/team name/i), credentials.name)
    await user.click(screen.getByRole('button', { name: /join team/i }))

    await act(async () => {
      socket.connect()
    })

    expect(await screen.findByRole('heading', { name: credentials.name })).toBeInTheDocument()
    expect(socket.getEmitCount('team:join')).toBe(1)

    await act(async () => {
      socket.triggerDisconnect()
    })

    expect(screen.getByText('Reconnecting...')).toBeInTheDocument()

    await act(async () => {
      socket.connect()
    })

    expect(socket.getEmitCount('team:join')).toBe(2)
    expect(socket.getLastPayload<TeamCredentials>('team:join')).toEqual(credentials)
  })

  it('keeps the waiting state during results even if a previous signal is still present', async () => {
    const socket = new MockSocket()
    const user = userEvent.setup()
    const credentials = { teamId: 'team-1', name: 'Alpha' }

    socket.onEmit('team:join', (_payload, ack) => {
      ack?.(createJoinAck(credentials))
      socket.serverEmit(
        'game:snapshot',
        createSnapshot({
          phase: 'results',
          round: 3,
          currentSignal: {
            id: 's1',
            text: 'Old signal should not remain visible.',
            type: 'ALPHA',
            value: 760,
            credibility: 72,
          },
          viewerSubmission: {
            teamId: credentials.teamId,
            hasSubmitted: true,
            decision: 'TRADE',
            canSubmit: false,
          },
        }),
      )
    })

    render(<TeamDashboardApp socketFactory={() => socket} />)

    await user.type(screen.getByLabelText(/team id/i), credentials.teamId)
    await user.type(screen.getByLabelText(/team name/i), credentials.name)
    await user.click(screen.getByRole('button', { name: /join team/i }))

    await act(async () => {
      socket.connect()
    })

    expect(await screen.findByText('Waiting for signal...')).toBeInTheDocument()
    expect(screen.queryByText('Old signal should not remain visible.')).not.toBeInTheDocument()
  })
})
