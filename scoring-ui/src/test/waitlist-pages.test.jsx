import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InductionWaitlistPage from '../components/InductionWaitlistPage'
import InductionWaitlistAdminPage from '../components/InductionWaitlistAdminPage'

vi.mock('../waitlist-api', () => ({
  getWaitlistCaptcha: vi.fn(),
  verifyWaitlistCaptcha: vi.fn(),
  submitWaitlistEntry: vi.fn(),
  cancelWaitlistEntry: vi.fn(),
  fetchWaitlistAdminData: vi.fn(),
  createWaitlistInductionGroup: vi.fn(),
  completeWaitlistGroup: vi.fn(),
  adminCancelWaitlistEntry: vi.fn(),
}))

vi.mock('../api', () => ({
  getAuthStatus: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}))

import * as waitlistApi from '../waitlist-api'
import * as api from '../api'

describe('Induction waitlist pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    waitlistApi.getWaitlistCaptcha.mockResolvedValue({ id: 'captcha-1', question: '2 + 3 = ?' })
    waitlistApi.verifyWaitlistCaptcha.mockResolvedValue({ ok: true })
    waitlistApi.submitWaitlistEntry.mockResolvedValue({ ok: true, entry: { id: 'entry-1', status: 'waiting' } })
    waitlistApi.cancelWaitlistEntry.mockResolvedValue({ ok: true, entry: { id: 'entry-1', status: 'withdrawn' } })
    waitlistApi.fetchWaitlistAdminData.mockResolvedValue({
      entries: [
        {
          id: 'entry-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          association: 'TurRes',
          equipmentChoice: 'need-club-22',
          status: 'waiting',
        },
      ],
      groups: [],
    })
    waitlistApi.createWaitlistInductionGroup.mockResolvedValue({ ok: true })
    api.getAuthStatus.mockResolvedValue({ authenticated: false })
    api.login.mockResolvedValue({ success: true })
    api.logout.mockResolvedValue({})
  })

  it('walks through public waitlist registration', async () => {
    render(<InductionWaitlistPage />)

    await screen.findByText('2 + 3 = ?')
    await userEvent.type(screen.getByPlaceholderText('Vastaus'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Jatka' }))

    await screen.findByText('Omat tiedot')
    await userEvent.type(screen.getByLabelText('Etunimi'), 'Ada')
    await userEvent.type(screen.getByLabelText('Sukunimi'), 'Lovelace')
    await userEvent.type(screen.getByLabelText('Sähköposti'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Yhdistys / seura'), 'TurRes')
    await userEvent.click(screen.getByRole('button', { name: 'Liity jonotuslistalle' }))

    await waitFor(() => {
      expect(waitlistApi.submitWaitlistEntry).toHaveBeenCalledWith(expect.objectContaining({
        firstName: 'Ada',
        email: 'ada@example.com',
        preferredLanguage: 'fi',
      }))
    })

    expect(screen.getByText('Jonotuslistalle liittyminen onnistui')).toBeInTheDocument()
  })

  it('shows admin data after SSI login', async () => {
    api.getAuthStatus.mockResolvedValue({ authenticated: false })
    render(<InductionWaitlistAdminPage />)

    await userEvent.type(screen.getByPlaceholderText('your@email.com'), 'admin@example.com')
    await userEvent.type(screen.getByPlaceholderText('SSI password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /login/i }))

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith('admin@example.com', 'secret', '', 'waitlist')
    })

    await waitFor(() => {
      expect(waitlistApi.fetchWaitlistAdminData).toHaveBeenCalled()
    })

    expect(screen.getByText('Aktiivinen jonotuslista')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })
})