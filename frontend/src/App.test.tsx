import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AdminApp } from './AdminApp'
import { MarketGameShell, TeamDashboardApp } from './App'
import { MockSocket } from './test-utils/mockSocket'
import type { AckResponse, AdminSnapshot, CompanySignal, GameSnapshot, RoundData, TeamCredentials } from './types'
import { blankInvestments } from './utils'

function createJoinAck(credentials: TeamCredentials): AckResponse<{ team: { teamId: string; name: string; purse: number } }> {
  return {
    ok: true,
    data: {
      team: {
        teamId: credentials.teamId,
        name: credentials.name,
        purse: 100000,
      },
    },
  }
}

function createRoundData(): RoundData {
  return {
    id: 'round-1',
    year: 2012,
    yearRange: '2012',
    title: 'India Rising',
    context: 'Capital is rotating quickly and the market narrative is changing.',
    companies: [
      {
        id: 'reliance',
        name: 'Reliance Industries',
        sector: 'Conglomerate',
        newsFeed: [{ id: 'n1', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 82, headline: 'Reliance builds a new telecom thesis.', sentiment: 'positive', detail: 'Infrastructure and telecom are both moving into focus.' }]
      },
      {
        id: 'hdfc_bank',
        name: 'HDFC Bank',
        sector: 'Banking',
        newsFeed: [{ id: 'n2', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 88, headline: 'Deposits continue compounding.', sentiment: 'positive', detail: 'Branch expansion and credit quality remain strong.' }]
      },
      {
        id: 'infosys',
        name: 'Infosys',
        sector: 'IT',
        newsFeed: [{ id: 'n3', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 79, headline: 'Hiring plans soften.', sentiment: 'negative', detail: 'Global demand is wobbling, but the balance sheet is strong.' }]
      },
      {
        id: 'yes_bank',
        name: 'Yes Bank',
        sector: 'Banking',
        newsFeed: [{ id: 'n4', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 75, headline: 'Growth is accelerating fast.', sentiment: 'positive', detail: 'Momentum is strong, but durability is still debated.' }]
      },
      {
        id: 'byjus',
        name: "Byju's",
        sector: 'EdTech',
        newsFeed: [{ id: 'n5', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 72, headline: 'Consumer demand is building.', sentiment: 'neutral', detail: 'Adoption is climbing, though monetization remains young.' }]
      },
      {
        id: 'adani',
        name: 'Adani Group',
        sector: 'Infrastructure',
        newsFeed: [{ id: 'n6', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 77, headline: 'Large projects are stacking up.', sentiment: 'positive', detail: 'Execution risk is real, but the opportunity set is large.' }]
      },
    ] satisfies CompanySignal[],
  }
}

function createTeamSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    activeTeamsCount: 1,
    currentRound: createRoundData(),
    endsAt: Date.now() + 45000,
    leaderboard: [
      {
        teamId: 'team-1',
        name: 'Alpha',
        purse: 100000,
        investments: blankInvestments(),
        totalValue: 100000,
        connected: true,
      },
    ],
    phase: 'live',
    marketMood: 'stable',
    remainingMs: 45000,
    round: 1,
    roundDurationMs: 45000,
    totalRounds: 6,
    viewerSubmission: {
      teamId: 'team-1',
      hasSubmitted: false,
      investments: blankInvestments(),
      canSubmit: true,
    },
    ...overrides,
  }
}

function createAdminSnapshot(overrides: Partial<AdminSnapshot> = {}): AdminSnapshot {
  return {
    activeTeamsCount: 2,
    auditLog: [],
    currentRound: createRoundData(),
    endsAt: Date.now() + 60000,
    lastRoundResults: null,
    leaderboard: [
      {
        teamId: 'team-1',
        name: 'Alpha',
        purse: 100000,
        investments: blankInvestments(),
        totalValue: 100000,
        connected: true,
      },
    ],
    phase: 'idle',
    marketMood: 'stable',
    remainingMs: 0,
    round: 0,
    roundDurationMs: 60000,
    teamSubmissions: [
      {
        teamId: 'team-1',
        name: 'Alpha',
        purse: 100000,
        totalValue: 100000,
        connected: true,
        hasSubmitted: false,
        totalInvested: 0,
      },
    ],
    totalRounds: 6,
    ...overrides,
  }
}

describe('Market game shell', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  afterEach(() => {
    window.location.hash = ''
  })

  it('honors the host hash and lets users switch back to the team console', async () => {
    window.location.hash = '#/host'
    const user = userEvent.setup()

    render(
      <MarketGameShell
        adminSocketFactory={() => new MockSocket()}
        teamSocketFactory={() => new MockSocket()}
      />,
    )

    expect(screen.getByRole('heading', { name: /host access/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /team console/i }))

    expect(screen.getByRole('button', { name: /enter the market/i })).toBeInTheDocument()
  })
})

describe('AdminApp', () => {
  it('authenticates and sends the configured round duration in milliseconds', async () => {
    const socket = new MockSocket()
    const user = userEvent.setup()

    socket.onEmit('admin:authenticate', (_payload, ack) => {
      ack?.({
        ok: true,
        data: {
          authenticated: true,
          snapshot: createAdminSnapshot(),
        },
      })
    })

    socket.onEmit('admin:set-round-duration', (_payload, ack) => {
      ack?.({
        ok: true,
        data: {
          roundDurationMs: 45000,
        },
      })
      socket.serverEmit('game:snapshot', createAdminSnapshot({ roundDurationMs: 45000 }))
    })

    render(<AdminApp socketFactory={() => socket} />)

    await user.type(screen.getByLabelText(/admin secret/i), 'top-secret')
    await user.click(screen.getByRole('button', { name: /unlock dashboard/i }))

    expect(await screen.findByDisplayValue('60')).toBeInTheDocument()

    const input = screen.getByLabelText(/round timer/i)
    await user.clear(input)
    await user.type(input, '45')
    await user.click(screen.getByRole('button', { name: /update timer/i }))

    expect(socket.getLastPayload('admin:set-round-duration')).toEqual({ roundDurationMs: 45000 })
    expect(await screen.findByText(/timer updated to 45s/i)).toBeInTheDocument()
  })

  it('locks the timer form once a round is live', async () => {
    const socket = new MockSocket()
    const user = userEvent.setup()

    socket.onEmit('admin:authenticate', (_payload, ack) => {
      ack?.({
        ok: true,
        data: {
          authenticated: true,
          snapshot: createAdminSnapshot({
            phase: 'live',
            remainingMs: 60000,
          }),
        },
      })
    })

    render(<AdminApp socketFactory={() => socket} />)

    await user.type(screen.getByLabelText(/admin secret/i), 'top-secret')
    await user.click(screen.getByRole('button', { name: /unlock dashboard/i }))

    expect(await screen.findByLabelText(/round timer/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /update timer/i })).toBeDisabled()
  })
})

describe('TeamDashboardApp', () => {
  it('joins successfully and hides investment controls while paused', async () => {
    const socket = new MockSocket()
    const user = userEvent.setup()
    const credentials = { teamId: 'team-1', name: 'Alpha' }

    socket.onEmit('team:join', (_payload, ack) => {
      ack?.(createJoinAck(credentials))
      socket.serverEmit('game:snapshot', createTeamSnapshot())
    })

    render(<TeamDashboardApp socketFactory={() => socket} />)

    await user.type(screen.getByLabelText(/team id/i), credentials.teamId)
    await user.type(screen.getByLabelText(/team name/i), credentials.name)
    await user.click(screen.getByRole('button', { name: /enter the market/i }))

    await act(async () => {
      socket.connect()
    })

    expect(await screen.findByText(/build your portfolio/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Invest' }).length).toBeGreaterThan(0)

    await act(async () => {
      socket.serverEmit(
        'game:snapshot',
        createTeamSnapshot({
          phase: 'paused',
          remainingMs: 20000,
          viewerSubmission: {
            teamId: 'team-1',
            hasSubmitted: false,
            investments: blankInvestments(),
            canSubmit: false,
          },
        }),
      )
    })

    expect(screen.getByText(/round paused/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Invest' }).every((button) => button.hasAttribute('disabled'))).toBe(true)
    expect(screen.getByRole('button', { name: /make at least one investment/i })).toBeDisabled()
  })
})
