import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginScreen from '../components/LoginScreen'
import MatchPicker from '../components/MatchPicker'
import SquadPicker from '../components/SquadPicker'
import ShooterPicker from '../components/ShooterPicker'
import CupSearch from '../components/CupSearch'
import { CupList } from '../components/shared'
import SquadPickerSheet from '../components/manage/SquadPickerSheet'
import LoanerGunPickerSheet from '../components/manage/LoanerGunPickerSheet'
import HomePage from '../components/HomePage'
import LegalDocumentPage from '../components/LegalDocumentPage'
import { TabletShooterSidebar } from '../components/TabletScoringPanels'

// ============================================================
// LoginScreen
// ============================================================

describe('LoginScreen', () => {
  it('renders email, password, and API key fields', () => {
    render(<LoginScreen onLogin={vi.fn()} />)
    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('SSI password')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/optional/i)).toBeInTheDocument()
  })

  it('API key field is a password input', () => {
    render(<LoginScreen onLogin={vi.fn()} />)
    const apiKeyInput = screen.getByPlaceholderText(/optional/i)
    expect(apiKeyInput).toHaveAttribute('type', 'password')
  })

  it('login button is disabled when email or password is empty', () => {
    render(<LoginScreen onLogin={vi.fn()} />)
    const button = screen.getByRole('button', { name: /login/i })
    expect(button).toBeDisabled()
  })

  it('calls onLogin with credentials on submit', async () => {
    const onLogin = vi.fn().mockResolvedValue()
    render(<LoginScreen onLogin={onLogin} />)

    await userEvent.type(screen.getByPlaceholderText('your@email.com'), 'test@test.com')
    await userEvent.type(screen.getByPlaceholderText('SSI password'), 'pass123')
    await userEvent.type(screen.getByPlaceholderText(/optional/i), 'mykey')
    await userEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(onLogin).toHaveBeenCalledWith('test@test.com', 'pass123', 'mykey', true)
  })

  it('pre-fills fields when initial values are provided', () => {
    render(<LoginScreen onLogin={vi.fn()} initialEmail="saved@test.com" initialPassword="savedpass" initialApiKey="savedkey" />)
    expect(screen.getByPlaceholderText('your@email.com')).toHaveValue('saved@test.com')
    expect(screen.getByPlaceholderText('SSI password')).toHaveValue('savedpass')
    expect(screen.getByPlaceholderText(/optional/i)).toHaveValue('savedkey')
    // Login button should be enabled since email and password are pre-filled
    expect(screen.getByRole('button', { name: /login/i })).not.toBeDisabled()
  })

  it('shows error message on login failure', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('Invalid email or password'))
    render(<LoginScreen onLogin={onLogin} />)

    await userEvent.type(screen.getByPlaceholderText('your@email.com'), 'bad@test.com')
    await userEvent.type(screen.getByPlaceholderText('SSI password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /login/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    })
  })
})

// ============================================================
// CupSearch
// ============================================================

describe('CupSearch', () => {
  it('renders search input and search button', () => {
    render(<CupSearch onSelectCup={vi.fn()} loading={false} />)
    expect(screen.getByPlaceholderText(/cupin nimi/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hae/i })).toBeInTheDocument()
  })

  it('search button is disabled when input is less than 2 chars', () => {
    render(<CupSearch onSelectCup={vi.fn()} loading={false} />)
    expect(screen.getByRole('button', { name: /hae/i })).toBeDisabled()
  })

  it('renders logout button when onLogout is provided', () => {
    render(<CupSearch onSelectCup={vi.fn()} loading={false} onLogout={vi.fn()} />)
    expect(screen.getByText('Kirjaudu ulos')).toBeInTheDocument()
  })

  it('does not render logout button when onLogout is not provided', () => {
    render(<CupSearch onSelectCup={vi.fn()} loading={false} />)
    expect(screen.queryByText('Kirjaudu ulos')).not.toBeInTheDocument()
  })

  it('calls onLogout when logout button is clicked', async () => {
    const onLogout = vi.fn()
    render(<CupSearch onSelectCup={vi.fn()} loading={false} onLogout={onLogout} />)
    await userEvent.click(screen.getByText('Kirjaudu ulos'))
    expect(onLogout).toHaveBeenCalled()
  })
})

// ============================================================
// CupList
// ============================================================

describe('CupList', () => {
  it('renders competitor count using fallback field names', () => {
    const cups = [{
      id: 'cup-1',
      name: 'Fallback Count Cup',
      starts: '2026-02-21T10:00:00Z',
      registrationOpen: true,
      competitorCount: '7',
      max_competitors: '30',
    }]

    render(<CupList cups={cups} onSelect={vi.fn()} loading={false} />)

    expect(screen.getByText('7/30')).toBeInTheDocument()
  })
})

// ============================================================
// MatchPicker
// ============================================================

describe('MatchPicker', () => {
  const matches = [
    { id: 1, name: 'Match A', date: '2026-02-14', type: 'RESUL Nordic', status: 'on', squads: [] },
    { id: 2, name: 'Match B', date: '2026-02-15', type: 'RESUL Nordic', status: 'on', squads: [] },
  ]

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-02-20T00:00:00Z'))
  })

  afterAll(() => {
    vi.useRealTimers()
  })
  it('renders all matches', () => {
    render(<MatchPicker matches={matches} onSelect={vi.fn()} />)
    expect(screen.getByText('Match A')).toBeInTheDocument()
    expect(screen.getByText('Match B')).toBeInTheDocument()
  })

  it('shows cup name in header when provided', () => {
    render(<MatchPicker matches={matches} onSelect={vi.fn()} cupName="TurRes Kupittaa CUP" />)
    expect(screen.getByText('TurRes Kupittaa CUP')).toBeInTheDocument()
  })

  it('shows back button when onBack is provided', () => {
    render(<MatchPicker matches={matches} onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Cupit')).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn()
    render(<MatchPicker matches={matches} onSelect={vi.fn()} onBack={onBack} />)
    await userEvent.click(screen.getByText('Cupit'))
    expect(onBack).toHaveBeenCalled()
  })

  it('calls onSelect when a match is clicked', async () => {
    const onSelect = vi.fn()
    render(<MatchPicker matches={matches} onSelect={onSelect} />)
    await userEvent.click(screen.getByText('Match A'))
    expect(onSelect).toHaveBeenCalledWith(matches[0])
  })

  it('shows "No matches today" when no matches are on today', () => {
    render(<MatchPicker matches={matches} onSelect={vi.fn()} />)
    expect(screen.getByText('Ei otteluita tänään')).toBeInTheDocument()
  })

  it('localizes cancelled status codes', () => {
    const cancelledMatches = [
      { id: 3, name: 'Cancelled Match', date: '2026-02-15', type: 'RESUL Nordic', status: 'cs', squads: [] },
    ]

    render(<MatchPicker matches={cancelledMatches} onSelect={vi.fn()} />)
    expect(screen.getByText('Peruutettu · RESUL Nordic')).toBeInTheDocument()
  })
})

// ============================================================
// SquadPicker
// ============================================================

describe('SquadPicker', () => {
  const match = {
    name: 'Kupittaa 14.02.2026 Pika',
    date: '2026-02-14',
    type: 'RESUL Nordic',
    squads: [
      { id: 1, name: 'Squad 1', comment: 'Morning', shooters: [{ id: 10, name: 'Shooter A' }] },
      { id: 2, name: 'Squad 2', comment: '', shooters: [] },
    ],
  }

  it('renders match name in header', () => {
    render(<SquadPicker match={match} onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Kupittaa 14.02.2026 Pika')).toBeInTheDocument()
  })

  it('renders all squads', () => {
    render(<SquadPicker match={match} onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Squad 1')).toBeInTheDocument()
    expect(screen.getByText('Squad 2')).toBeInTheDocument()
  })

  it('shows squad comment when present', () => {
    render(<SquadPicker match={match} onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Morning')).toBeInTheDocument()
  })

  it('shows shooter count', () => {
    render(<SquadPicker match={match} onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('1 ampujaa')).toBeInTheDocument()
    expect(screen.getByText('0 ampujaa')).toBeInTheDocument()
  })

  it('calls onSelect when a squad is clicked', async () => {
    const onSelect = vi.fn()
    render(<SquadPicker match={match} onSelect={onSelect} onBack={vi.fn()} />)
    await userEvent.click(screen.getByText('Squad 1'))
    expect(onSelect).toHaveBeenCalledWith(match.squads[0])
  })

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn()
    render(<SquadPicker match={match} onSelect={vi.fn()} onBack={onBack} />)
    await userEvent.click(screen.getByText('Ottelut'))
    expect(onBack).toHaveBeenCalled()
  })
})

// ============================================================
// ShooterPicker
// ============================================================

describe('ShooterPicker', () => {
  const shooters = [
    { id: 1, number: 1, name: 'Matti M', division: 'Pistooli', totPoints: 47, totHits: 5 },
    { id: 2, number: 2, name: 'Teppo T', division: 'Kivääri', totPoints: 0, totHits: 0 },
  ]

  it('renders all shooters', () => {
    render(<ShooterPicker shooters={shooters} onSelect={vi.fn()} currentShooterId={null} />)
    expect(screen.getByText('Matti M')).toBeInTheDocument()
    expect(screen.getByText('Teppo T')).toBeInTheDocument()
  })

  it('shows division info', () => {
    render(<ShooterPicker shooters={shooters} onSelect={vi.fn()} currentShooterId={null} />)
    expect(screen.getByText('Pistooli')).toBeInTheDocument()
    expect(screen.getByText('Kivääri')).toBeInTheDocument()
  })

  it('calls onSelect when a shooter is clicked', async () => {
    const onSelect = vi.fn()
    render(<ShooterPicker shooters={shooters} onSelect={onSelect} currentShooterId={null} />)
    await userEvent.click(screen.getByText('Matti M'))
    expect(onSelect).toHaveBeenCalledWith(shooters[0])
  })
})

// ============================================================
// SquadPickerSheet (CUP1 / R76-CUP1)
// ============================================================

describe('SquadPickerSheet', () => {
  const squads = [
    { number: 1, name: 'Squad 1 (Laina-ase)', count: 4, max: 9 },
    { number: 2, name: 'Squad 2 (Oma ase 1)', count: 9, max: 9 },
    { number: 3, name: 'Squad 3 (Oma ase 2)', count: 5, max: 7 },
  ]

  it('disables full squads and current squad while allowing available squads', async () => {
    const onSelect = vi.fn()
    render(
      <SquadPickerSheet
        shooter={{ name: 'Matti Meikäläinen', email: 'matti@ex.com', squad: 1 }}
        squads={squads}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    )

    const sq1Btn = screen.getByText('Squad 1 (Laina-ase)').closest('button')
    const sq2Btn = screen.getByText('Squad 2 (Oma ase 1)').closest('button')
    const sq3Btn = screen.getByText('Squad 3 (Oma ase 2)').closest('button')

    expect(sq1Btn).toBeDisabled() // shooter's current squad
    expect(sq2Btn).toBeDisabled() // full squad (9/9)
    expect(sq3Btn).not.toBeDisabled()

    await userEvent.click(sq2Btn)
    expect(onSelect).not.toHaveBeenCalled()

    await userEvent.click(sq3Btn)
    expect(onSelect).toHaveBeenCalledWith(3)
  })
})

// ============================================================
// Legal Documents & Links (R76-COM1)
// ============================================================

describe('LegalDocumentPage & LegalFooterLinks', () => {
  it('renders Privacy Policy and Terms of Service links on HomePage', () => {
    render(<HomePage />)
    expect(screen.getByRole('link', { name: /tietosuojaseloste/i })).toHaveAttribute('href', '#/privacy')
    expect(screen.getByRole('link', { name: /käyttöehdot/i })).toHaveAttribute('href', '#/terms')
  })

  it('renders Privacy Policy and Terms of Service content', () => {
    const { rerender } = render(<LegalDocumentPage type="privacy" />)
    expect(screen.getByText(/Rekisterinpitäjä ja tarkoitus/i)).toBeInTheDocument()
    expect(screen.getByText(/Resend/i)).toBeInTheDocument()

    rerender(<LegalDocumentPage type="terms" />)
    expect(screen.getByText(/Palvelun käyttö/i)).toBeInTheDocument()
    expect(screen.getByText(/Käyttäjän vastuu/i)).toBeInTheDocument()

    rerender(<LegalDocumentPage type="privacy-guns" />)
    expect(screen.getByText(/Laina-aseiden käytönseuranta/i)).toBeInTheDocument()
    expect(screen.getByText(/Club Loaner Firearm Inventory/i)).toBeInTheDocument()
  })
})

// ============================================================
// TabletShooterSidebar — Drag-and-Drop Reordering (TS13 / US-017)
// ============================================================

describe('TabletShooterSidebar drag-and-drop reordering (TS13)', () => {
  const sampleSquad = {
    name: 'Squad 1',
    shooters: [
      { id: 's1', number: 1, name: 'Matti Meikäläinen', division: 'RESUL' },
      { id: 's2', number: 2, name: 'Teppo Testaaja', division: 'RESUL' },
      { id: 's3', number: 3, name: 'Liisa Laukaus', division: 'RESUL' },
    ],
  }

  it('removes tiny ▲/▼ arrows and selects shooter on row tap without reordering', async () => {
    const onSelect = vi.fn()
    const onReorder = vi.fn()
    render(
      <TabletShooterSidebar
        squad={sampleSquad}
        selectedShooter={sampleSquad.shooters[0]}
        allScores={{}}
        totalShotsInMatch={30}
        handleShooterSelect={onSelect}
        handleReorderShooter={onReorder}
      />
    )

    expect(screen.queryByText('▲')).toBeNull()
    expect(screen.queryByText('▼')).toBeNull()

    await userEvent.click(screen.getByText('2. Teppo Testaaja'))
    expect(onSelect).toHaveBeenCalledWith(sampleSquad.shooters[1])
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('reorders shooters via drag-and-drop handle and keyboard arrows without selecting shooter', async () => {
    const onSelect = vi.fn()
    const onReorder = vi.fn()
    render(
      <TabletShooterSidebar
        squad={sampleSquad}
        selectedShooter={sampleSquad.shooters[0]}
        allScores={{}}
        totalShotsInMatch={30}
        handleShooterSelect={onSelect}
        handleReorderShooter={onReorder}
      />
    )

    const handle1 = screen.getByTestId('drag-handle-s1')
    await userEvent.click(handle1)
    expect(onSelect).not.toHaveBeenCalled()

    handle1.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onReorder).toHaveBeenCalledWith(0, 1)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

// ============================================================
// LoanerGunPickerSheet — Laina-ase & Cartridge Picker (R90)
// ============================================================

describe('LoanerGunPickerSheet (R90-GUN7)', () => {
  it('selects an available gun from in_gun_safe and submits cartridge count (100 or 0)', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const guns = [
      { id: 'g1', make: 'CZ', model: 'Shadow 2', serialNumber: 'CZ-101', acquisitionYear: 2024, state: 'in_gun_safe', timesUsedSinceMaintenance: 2, cartridgesSinceMaintenance: 200 },
      { id: 'g2', make: 'Glock', model: '17', serialNumber: 'GL-202', acquisitionYear: 2023, state: 'in_range_use', timesUsedSinceMaintenance: 1, cartridgesSinceMaintenance: 100 },
    ]

    render(
      <LoanerGunPickerSheet
        shooter={{ name: 'Matti Meikäläinen', email: 'matti@example.com' }}
        guns={guns}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    )

    // Only in_gun_safe gun should be listed
    expect(screen.getByText(/CZ Shadow 2/i)).toBeInTheDocument()
    expect(screen.queryByText(/Glock 17/i)).toBeNull()

    // Select 0 cartridges (own permit) and submit
    await userEvent.click(screen.getByRole('button', { name: /^0 patr\./i }))
    await userEvent.click(screen.getByRole('button', { name: /Merkitse käyttöön/i }))
    expect(onConfirm).toHaveBeenCalledWith({ gunId: 'g1', cartridgesGiven: 0, ammoId: null })
  })
})
