import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StaffingPage from '../components/StaffingPage'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  getAuthStatus: vi.fn(),
  handleRememberMe: vi.fn(),
  fetchStaffingSites: vi.fn(),
  fetchStaffingEvents: vi.fn(),
  staffSignup: vi.fn(),
  staffResign: vi.fn(),
}))

vi.mock('../api', () => ({
  login: mocks.login,
  logout: mocks.logout,
  getAuthStatus: mocks.getAuthStatus,
}))

vi.mock('../staffing-api', () => ({
  fetchStaffingSites: mocks.fetchStaffingSites,
  fetchStaffingEvents: mocks.fetchStaffingEvents,
  staffSignup: mocks.staffSignup,
  staffResign: mocks.staffResign,
}))

vi.mock('../hooks/useRememberMe', () => ({
  useRememberMe: () => ({
    savedCreds: null,
    handleRememberMe: mocks.handleRememberMe,
  }),
}))

vi.mock('../components/LoginScreen', () => ({
  default: function MockLoginScreen({ onLogin }) {
    return (
      <button onClick={() => onLogin('staff@test.com', 'pass123', 'apikey', false)}>
        Mock Login
      </button>
    )
  },
}))

describe('StaffingPage site-aware behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.login.mockResolvedValue({ success: true })
    mocks.logout.mockResolvedValue({ success: true })
    mocks.getAuthStatus.mockResolvedValue({ authenticated: false, siteKey: null })
    mocks.handleRememberMe.mockResolvedValue()
    mocks.fetchStaffingSites.mockResolvedValue({
      sites: [
        { key: 'sra-training', name: 'SRA Training' },
        { key: 'temppeli-sra', name: 'Temppeli SRA' },
      ],
    })
    mocks.fetchStaffingEvents.mockResolvedValue({ events: [], isAdmin: false, userEmail: null })
    mocks.staffSignup.mockResolvedValue({ success: true })
    mocks.staffResign.mockResolvedValue({ success: true })
  })

  it('sends selected site key in staffing login call', async () => {
    render(<StaffingPage />)

    const siteSelect = await screen.findByRole('combobox')
    await userEvent.selectOptions(siteSelect, 'temppeli-sra')

    await userEvent.click(screen.getByRole('button', { name: 'Mock Login' }))

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith('staff@test.com', 'pass123', 'apikey', 'staffing', 'temppeli-sra')
    })
  })

  it('loads events with site key from authenticated session status', async () => {
    mocks.getAuthStatus.mockResolvedValue({ authenticated: true, siteKey: 'temppeli-sra' })

    render(<StaffingPage />)

    await waitFor(() => {
      expect(mocks.fetchStaffingEvents).toHaveBeenCalledWith('temppeli-sra')
    })
  })

  it('falls back to first available site when auth status siteKey is unknown', async () => {
    mocks.getAuthStatus.mockResolvedValue({ authenticated: true, siteKey: 'unknown-site' })

    render(<StaffingPage />)

    await waitFor(() => {
      expect(mocks.fetchStaffingEvents).toHaveBeenCalledWith('sra-training')
    })
  })

  it('uses default site when site list cannot be loaded', async () => {
    mocks.fetchStaffingSites.mockRejectedValue(new Error('Network failed'))

    render(<StaffingPage />)

    expect(await screen.findByText('Failed to load staffing sites. Using default site.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Mock Login' }))

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith('staff@test.com', 'pass123', 'apikey', 'staffing', 'sra-training')
    })
  })
})
