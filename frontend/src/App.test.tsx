import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApp } from './AdminApp'
import { MarketGameShell, TeamDashboardApp } from './App'
import { MockSocket } from './test-utils/mockSocket'
import type {
  AckResponse,
  AdminSnapshot,
  CompanySignal,
  GameSnapshot,
  Investments,
  RoundData,
  TeamCredentials,
} from './types'
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

function createInvestments(overrides: Partial<Investments> = {}): Investments {
  return {
    ...blankInvestments(),
    ...overrides,
  }
}

function createRoundData(round = 1): RoundData {
  return {
    id: `round-${round}`,
    year: 2012,
    yearRange: '2012',
    title: 'India Rising',
    context: 'Reliance and HDFC Bank dominate the 2012 narrative while India growth accelerates.',
    companies: [
      {
        id: 'reliance',
        name: 'Reliance Industries',
        sector: 'Conglomerate',
        newsFeed: [{ id: 'n1', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 82, headline: 'Reliance builds a new telecom thesis.', sentiment: 'positive', detail: 'Jio style infrastructure momentum is building.' }],
      },
      {
        id: 'hdfc_bank',
        name: 'HDFC Bank',
        sector: 'Banking',
        newsFeed: [{ id: 'n2', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 88, headline: 'Deposits continue compounding.', sentiment: 'positive', detail: 'Branch expansion and credit quality remain strong.' }],
      },
      {
        id: 'infosys',
        name: 'Infosys',
        sector: 'IT',
        newsFeed: [{ id: 'n3', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 79, headline: 'Hiring plans soften.', sentiment: 'negative', detail: 'Global demand is wobbling.' }],
      },
      {
        id: 'yes_bank',
        name: 'Yes Bank',
        sector: 'Banking',
        newsFeed: [{ id: 'n4', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 75, headline: 'Growth is accelerating fast.', sentiment: 'positive', detail: 'Momentum is strong.' }],
      },
      {
        id: 'byjus',
        name: "Byju's",
        sector: 'EdTech',
        newsFeed: [{ id: 'n5', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 72, headline: 'Consumer demand is building.', sentiment: 'neutral', detail: 'Adoption is climbing.' }],
      },
      {
        id: 'adani',
        name: 'Adani Group',
        sector: 'Infrastructure',
        newsFeed: [{ id: 'n6', source: 'Reuters', sourceType: 'verified_press' as const, credibilityScore: 77, headline: 'Large projects are stacking up.', sentiment: 'positive', detail: 'Execution risk is real.' }],
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

async function joinDesk(
  socket: MockSocket,
  credentials: TeamCredentials = { teamId: 'team-1', name: 'Alpha' },
  user = userEvent.setup(),
) {

  socket.onEmit('team:join', (_payload, ack) => {
    ack?.(createJoinAck(credentials))
  })

  render(<TeamDashboardApp socketFactory={() => socket} />)

  await user.type(screen.getByLabelText(/team id/i), credentials.teamId)
  await user.type(screen.getByLabelText(/team name/i), credentials.name)
  await user.click(screen.getByRole('button', { name: /enter desk/i }))

  await act(async () => {
    socket.connect()
  })

  return user
}

describe('Market game shell', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  afterEach(() => {
    window.location.hash = ''
  })

  it('honors the host hash and lets users switch back to the participant desk', async () => {
    window.location.hash = '#/host'
    const user = userEvent.setup()

    render(
      <MarketGameShell
        adminSocketFactory={() => new MockSocket()}
        teamSocketFactory={() => new MockSocket()}
      />,
    )

    expect(screen.getByRole('heading', { name: /admin access/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /participant desk/i }))

    expect(screen.getByRole('button', { name: /enter desk/i })).toBeInTheDocument()
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
            round: 1,
            remainingMs: 60000,
            currentRound: createRoundData(),
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

  it('keeps leaderboard visible and infers participant trade entries with working filters', async () => {
    const socket = new MockSocket()
    const user = userEvent.setup()

    socket.onEmit('admin:authenticate', (_payload, ack) => {
      ack?.({
        ok: true,
        data: {
          authenticated: true,
          snapshot: createAdminSnapshot({
            phase: 'live',
            round: 1,
            currentRound: createRoundData(1),
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
          }),
        },
      })
    })

    render(<AdminApp socketFactory={() => socket} />)

    await user.type(screen.getByLabelText(/admin secret/i), 'top-secret')
    await user.click(screen.getByRole('button', { name: /unlock dashboard/i }))

    expect(await screen.findByText(/participant standings/i)).toBeInTheDocument()

    await act(async () => {
      socket.serverEmit(
        'game:snapshot',
        createAdminSnapshot({
          phase: 'live',
          round: 1,
          currentRound: createRoundData(1),
          leaderboard: [
            {
              teamId: 'team-1',
              name: 'Alpha',
              purse: 90000,
              investments: createInvestments({ reliance: 10000 }),
              totalValue: 100000,
              connected: true,
            },
          ],
          teamSubmissions: [
            {
              teamId: 'team-1',
              name: 'Alpha',
              purse: 90000,
              totalValue: 100000,
              connected: true,
              hasSubmitted: false,
              totalInvested: 10000,
            },
          ],
        }),
      )
    })

    expect(await screen.findByText(/Alpha • Stellarix/i)).toBeInTheDocument()

    await act(async () => {
      socket.serverEmit(
        'game:snapshot',
        createAdminSnapshot({
          phase: 'live',
          round: 2,
          currentRound: createRoundData(2),
          leaderboard: [
            {
              teamId: 'team-1',
              name: 'Alpha',
              purse: 95000,
              investments: createInvestments({ reliance: 5000 }),
              totalValue: 100000,
              connected: true,
            },
          ],
          teamSubmissions: [
            {
              teamId: 'team-1',
              name: 'Alpha',
              purse: 95000,
              totalValue: 100000,
              connected: true,
              hasSubmitted: false,
              totalInvested: 5000,
            },
          ],
        }),
      )
    })

    expect(await screen.findByText(/2030 session/i)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/round filter/i), '2')
    expect(screen.getByText(/2030 session/i)).toBeInTheDocument()
    expect(screen.queryByText(/2028 session/i)).not.toBeInTheDocument()
  })
})

describe('TeamDashboardApp', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders the renamed participant experience without leaderboard, hints, or legacy names', async () => {
    const socket = new MockSocket()
    await joinDesk(socket)

    await act(async () => {
      socket.serverEmit('game:snapshot', createTeamSnapshot())
    })

    expect(await screen.findByText(/build and trim positions/i)).toBeInTheDocument()
    expect(screen.getByText('Stellarix')).toBeInTheDocument()
    expect(screen.getByText('NovaFuel')).toBeInTheDocument()
    expect(screen.getByText('Nobank')).toBeInTheDocument()
    expect(screen.getByText('GridMart')).toBeInTheDocument()
    expect(screen.getByText('Orbis')).toBeInTheDocument()
    expect(screen.queryByText('CoreStack')).not.toBeInTheDocument()
    expect(screen.getByText('2028')).toBeInTheDocument()
    expect(screen.queryByText(/Reliance Industries/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/2012/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/leaderboard/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/portfolio confidence/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Historical company narratives/i)).not.toBeInTheDocument()
  })

  it('shows CoreStack from round 4 onward', async () => {
    const socket = new MockSocket()
    await joinDesk(socket)

    await act(async () => {
      socket.serverEmit(
        'game:snapshot',
        createTeamSnapshot({
          round: 4,
          currentRound: createRoundData(4),
        }),
      )
    })

    expect(await screen.findByText('CoreStack')).toBeInTheDocument()
    expect(screen.getByText('2034')).toBeInTheDocument()
  })

  it('validates sell-to-cash through a confirmation step before emitting team:withdraw', async () => {
    const socket = new MockSocket()
    const user = await joinDesk(socket)

    socket.onEmit('team:withdraw', (_payload, ack) => {
      ack?.({ ok: true, data: { purse: 97000, invested: 3000 } })
    })

    await act(async () => {
      socket.serverEmit(
        'game:snapshot',
        createTeamSnapshot({
          leaderboard: [
            {
              teamId: 'team-1',
              name: 'Alpha',
              purse: 95000,
              investments: createInvestments({ reliance: 5000 }),
              totalValue: 100000,
              connected: true,
            },
          ],
          viewerSubmission: {
            teamId: 'team-1',
            hasSubmitted: false,
            investments: createInvestments({ reliance: 5000 }),
            canSubmit: true,
          },
        }),
      )
    })

    const sellInput = await screen.findByLabelText(/Stellarix sell amount/i)
    const stellarixCard = sellInput.closest('article')
    expect(stellarixCard).not.toBeNull()
    await user.type(sellInput, '2000')
    await user.click(within(stellarixCard as HTMLElement).getByRole('button', { name: /review sale/i }))

    expect(await screen.findByText(/Projected cash/i)).toBeInTheDocument()
    expect(screen.getByText('₹97,000')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /confirm sale/i }))

    expect(socket.getLastPayload('team:withdraw')).toEqual({ amount: 2000, companyId: 'reliance' })
  })

  it('appends confirmed buy and sell actions to the participant trade log', async () => {
    const socket = new MockSocket()
    const user = await joinDesk(socket)

    socket.onEmit('team:invest', (_payload, ack) => {
      ack?.({ ok: true, data: { purse: 90000, invested: 10000 } })
    })

    socket.onEmit('team:withdraw', (_payload, ack) => {
      ack?.({ ok: true, data: { purse: 95000, invested: 5000 } })
    })

    await act(async () => {
      socket.serverEmit(
        'game:snapshot',
        createTeamSnapshot({
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
        }),
      )
    })

    await user.click(screen.getAllByRole('button', { name: /^\+/ })[0])

    await act(async () => {
      socket.serverEmit(
        'game:snapshot',
        createTeamSnapshot({
          leaderboard: [
            {
              teamId: 'team-1',
              name: 'Alpha',
              purse: 90000,
              investments: createInvestments({ reliance: 10000 }),
              totalValue: 100000,
              connected: true,
            },
          ],
          viewerSubmission: {
            teamId: 'team-1',
            hasSubmitted: false,
            investments: createInvestments({ reliance: 10000 }),
            canSubmit: true,
          },
        }),
      )
    })

    const sellInput = await screen.findByLabelText(/Stellarix sell amount/i)
    const stellarixCard = sellInput.closest('article')
    expect(stellarixCard).not.toBeNull()
    await user.type(sellInput, '5000')
    await user.click(within(stellarixCard as HTMLElement).getByRole('button', { name: /review sale/i }))
    await user.click(screen.getByRole('button', { name: /confirm sale/i }))

    const logRegion = screen.getByText(/confirmed session activity/i).closest('section')
    expect(logRegion).not.toBeNull()
    const tradeLog = within(logRegion as HTMLElement)
    expect(tradeLog.getAllByText(/Stellarix/i).length).toBeGreaterThan(0)
    expect(tradeLog.getByText(/Sell to cash/i)).toBeInTheDocument()
  })

  it('shows a fake call once the live timer advances into the trigger window', async () => {
    const socket = new MockSocket()
    await joinDesk(socket)

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    vi.spyOn(Math, 'random').mockReturnValue(0)

    await act(async () => {
      socket.serverEmit(
        'game:snapshot',
        createTeamSnapshot({
          endsAt: Date.now() + 1000,
          roundDurationMs: 1000,
          remainingMs: 1000,
        }),
      )
    })

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.getByText(/incoming call/i)).toBeInTheDocument()
    expect(screen.getByText(/Nobank overnight lines under review/i)).toBeInTheDocument()
  })
})
