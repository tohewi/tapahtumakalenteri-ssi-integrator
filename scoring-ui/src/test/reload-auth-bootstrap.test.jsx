import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import * as api from '../api'
import { App } from '../App'
import { TabletApp } from '../TabletApp'

vi.mock('../hooks/useRememberMe', () => ({
  useRememberMe: () => ({
    savedCreds: null,
    handleRememberMe: vi.fn(),
  }),
}))

describe('Auth bootstrap on page reload', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()

    vi.spyOn(api, 'getAuthStatus').mockResolvedValue({ authenticated: false })
    vi.spyOn(api, 'getUserInfo').mockResolvedValue({
      email: 'tester@example.com',
      firstName: 'Test',
      lastName: 'User',
    })
    vi.spyOn(api, 'getCup').mockResolvedValue({ id: 141, name: 'Cup', matches: [] })
    vi.spyOn(api, 'getMatch').mockResolvedValue({ id: 1850, name: 'Match', squads: [] })
  })

  it('mobile app restores into scoring flow when scoring session is still valid', async () => {
    api.getAuthStatus.mockResolvedValueOnce({ authenticated: true, scope: 'scoring' })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/cupin nimi/i)).toBeInTheDocument()
    })
    expect(screen.queryByPlaceholderText('your@email.com')).not.toBeInTheDocument()
  })

  it('tablet app restores into scoring flow when scoring session is still valid', async () => {
    api.getAuthStatus.mockResolvedValueOnce({ authenticated: true, scope: 'scoring' })

    render(<TabletApp />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/cupin nimi/i)).toBeInTheDocument()
    })
    expect(api.getUserInfo).toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('your@email.com')).not.toBeInTheDocument()
  })

  it('mobile app stays on login when there is no active session', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument()
    })
  })

  it('tablet app stays on login when there is no active session and clears stale cup/nav localStorage', async () => {
    localStorage.setItem('ssi_last_cup', JSON.stringify({ id: 141, name: 'Old Cup' }))
    localStorage.setItem('ssi_tablet_nav_state', JSON.stringify({ view: 'match', cupId: 141 }))

    render(<TabletApp />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument()
    })
    expect(localStorage.getItem('ssi_last_cup')).toBeNull()
    expect(localStorage.getItem('ssi_tablet_nav_state')).toBeNull()
  })
})
