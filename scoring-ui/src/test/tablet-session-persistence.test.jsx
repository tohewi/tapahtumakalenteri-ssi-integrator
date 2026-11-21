import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import t from '../i18n'
import TabletScoringView from '../components/TabletScoringView'
import * as api from '../api'

const EMPTY_SERIES = {
  X: 0,
  '10': 0,
  '9': 0,
  '8': 0,
  '7': 0,
  '6': 0,
  '5': 0,
  '4': 0,
  '3': 0,
  '2': 0,
  '1': 0,
  M: 0,
}

const SHOOTERS = [
  { id: 101, number: 1, name: 'Matti Malli', division: 'Pistooli' },
  { id: 102, number: 2, name: 'Teppo Testi', division: 'Pistooli' },
]

function createScoreCard(overridesBySeries = {}) {
  const scoreCard = {}
  for (let i = 0; i < 6; i++) {
    scoreCard[i] = {
      ...EMPTY_SERIES,
      ...(overridesBySeries[i] || {}),
    }
  }
  return scoreCard
}

function renderTabletScoringView(overrides = {}) {
  const props = {
    cup: { id: 141, name: 'TurRes Kupittaa CUP' },
    match: { id: 1850, name: 'Kupittaa Pika', date: '2026-02-21', status: 'on' },
    squad: { id: 4143, name: 'Squad 1', shooters: SHOOTERS },
    allScores: {},
    userEmail: 'test@example.com',
    userName: 'Test User',
    onScoresUpdate: vi.fn(),
    onShootersReorder: vi.fn(),
    onBack: vi.fn(),
    onBackToCup: vi.fn(),
    onBackToMatch: vi.fn(),
    onLogout: vi.fn(),
    withSessionCheck: (fn) => fn(),
    ...overrides,
  }

  const renderResult = render(<TabletScoringView {...props} />)
  return {
    ...props,
    ...renderResult,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TabletScoringView — competitor visibility', () => {
  it('uses a high-contrast selected row and moves the highlight on selection', async () => {
    renderTabletScoringView({ match: { id: 1850, name: 'Pika', status: 'cp' } })

    const first = screen.getByRole('option', { selected: true })
    expect(first).toHaveClass('bg-blue-800', 'border-blue-950')
    expect(within(first).getByText('1. Matti Malli')).toHaveClass('text-white')
    expect(within(first).getByText('Pistooli')).toHaveClass('text-white')
    expect(within(first).getByText('0')).toHaveClass('text-white')
    expect(within(first).getByText('0/30')).toHaveClass('text-white')
    expect(within(first).getByRole('button')).toHaveClass('text-white')

    fireEvent.click(screen.getByRole('option', { name: /Teppo Testi/ }))
    await waitFor(() => expect(first).not.toHaveClass('bg-blue-800'))
    expect(screen.getByRole('option', { selected: true })).toHaveClass('bg-blue-800')
  })

  it('shows the current competitor beside the title without wrapping or widening the panel', async () => {
    const longName = 'Teppo Testi Very Long Competitor Name'
    renderTabletScoringView({
      match: { id: 1850, name: 'Pika', status: 'cp' },
      squad: { id: 4143, name: 'Squad 1', shooters: [SHOOTERS[0], { ...SHOOTERS[1], name: longName }] },
    })

    const heading = screen.getByRole('heading', { name: `${t.scoreTrack} Matti Malli` })
    expect(heading).toHaveClass('flex', 'min-w-0')
    expect(within(heading).getByText(t.scoreTrack)).toHaveClass('shrink-0')
    fireEvent.click(screen.getByRole('option', { name: /Teppo Testi/ }))
    await waitFor(() => expect(heading).toHaveAccessibleName(`${t.scoreTrack} ${longName}`))
    expect(within(heading).getByText(longName)).toHaveClass('truncate', 'min-w-0')
    expect(within(heading).getByText(longName)).toHaveAttribute('title', longName)
  })

  it('keeps the title alone when the squad has no competitors', () => {
    renderTabletScoringView({ squad: { id: 4143, name: 'Squad 1', shooters: [] } })
    expect(screen.getByRole('heading', { name: t.scoreTrack })).toBeInTheDocument()
  })
})

describe('TabletScoringView — session recovery score safety', () => {
  it('keeps restored local scores instead of overwriting them with SSI data', async () => {
    const buildScoresSpy = vi.spyOn(api, 'buildScoresFromSSI')

    const localScores = {
      101: createScoreCard({ 0: { X: 1, M: 2 } }),
      102: createScoreCard(),
    }

    const props = renderTabletScoringView({
      allScores: localScores,
      onScoresUpdate: vi.fn(),
    })

    await waitFor(() => {
      expect(screen.getAllByText('3/30').length).toBeGreaterThan(0)
    })

    expect(buildScoresSpy).not.toHaveBeenCalled()
    expect(props.onScoresUpdate).not.toHaveBeenCalled()
  })

  it('loads scores from SSI when there are no local scores to restore', async () => {
    const buildScoresSpy = vi
      .spyOn(api, 'buildScoresFromSSI')
      .mockImplementation((shooter) => {
        if (shooter.id === 101) {
          return createScoreCard({ 0: { M: 1 } })
        }
        return createScoreCard()
      })

    const props = renderTabletScoringView({
      allScores: {},
      onScoresUpdate: vi.fn(),
    })

    await waitFor(() => {
      expect(props.onScoresUpdate).toHaveBeenCalledTimes(SHOOTERS.length)
    })

    expect(buildScoresSpy).toHaveBeenCalledTimes(SHOOTERS.length)
    const updatedShooterIds = props.onScoresUpdate.mock.calls.map(([shooterId]) => String(shooterId))
    expect(updatedShooterIds).toEqual(['101', '102'])
  })

  it('keeps local miss scores after a simulated three-hour re-login remount', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-02-21T09:00:00Z'))

    const buildScoresSpy = vi.spyOn(api, 'buildScoresFromSSI')
    const localScores = {
      101: createScoreCard({ 0: { M: 3 } }),
      102: createScoreCard(),
    }

    const onScoresUpdate = vi.fn()
    const initial = renderTabletScoringView({
      allScores: localScores,
      onScoresUpdate,
    })

    await waitFor(() => {
      expect(screen.getAllByText('3/30').length).toBeGreaterThan(0)
    })

    vi.advanceTimersByTime(3 * 60 * 60 * 1000)
    initial.unmount()

    renderTabletScoringView({
      allScores: localScores,
      onScoresUpdate,
    })

    await waitFor(() => {
      expect(screen.getAllByText('3/30').length).toBeGreaterThan(0)
    })

    expect(buildScoresSpy).not.toHaveBeenCalled()
    expect(onScoresUpdate).not.toHaveBeenCalled()
  })
})
