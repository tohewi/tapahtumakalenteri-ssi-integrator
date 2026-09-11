import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, screen, waitFor, fireEvent, act } from '@testing-library/react'
import ManagePage from '../components/ManagePage'
import { useAuthenticatedPage } from '../hooks/useAuthenticatedPage'
import * as api from '../api'

vi.mock('../components/DeviceTokens', () => ({ default: () => null }))
vi.mock('../hooks/useRememberMe', () => ({
  useRememberMe: () => ({ savedCreds: null, handleRememberMe: vi.fn() }),
}))

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function mockRequests(statusResponse = response({ authenticated: true, scope: 'manage' }), cupsResponse = response({ cups: [] })) {
  const fetchMock = vi.fn(async url => {
    if (url === '/api/v1/auth/status') return statusResponse
    if (url === '/api/manage/cups') return cupsResponse
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(api, 'login').mockResolvedValue({ success: true })
  vi.spyOn(api, 'logout').mockResolvedValue()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Manage session bootstrap', () => {
  it('waits for session verification without flashing login or loading cups', async () => {
    const fetchMock = mockRequests(new Promise(() => {}))
    render(<ManagePage />)

    expect(screen.getByRole('status')).toHaveTextContent('Tarkistetaan istuntoa')
    expect(screen.queryByPlaceholderText('your@email.com')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/status', expect.objectContaining({ credentials: 'include', cache: 'no-store' }))
  })

  it('restores a valid Manage session to the Cup list without logging in again', async () => {
    const fetchMock = mockRequests()
    render(<ManagePage />)

    expect(await screen.findByText('Ei cupeja')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('your@email.com')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/manage/cups', { credentials: 'include' })
    expect(api.login).not.toHaveBeenCalled()
    expect(api.logout).not.toHaveBeenCalled()
  })

  it('reloads the Cup list instead of rendering a saved overview without data', async () => {
    localStorage.setItem('ssi_manage_state', JSON.stringify({ view: 'overview', cupId: 999, cupName: 'Saved cup' }))
    mockRequests()
    render(<ManagePage />)

    expect(await screen.findByText('Ei cupeja')).toBeInTheDocument()
    expect(screen.getByText('Valitse cup hallintaa varten')).toBeInTheDocument()
  })

  it.each([
    { authenticated: false },
    { authenticated: true, scope: 'scoring' },
    { authenticated: true, scope: 'reporting' },
    { authenticated: true, scope: 'staffing' },
    { authenticated: true },
  ])('requires explicit login for a missing or non-Manage session: %j', async status => {
    const fetchMock = mockRequests(response(status))
    render(<ManagePage />)

    expect(await screen.findByPlaceholderText('your@email.com')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(api.login).not.toHaveBeenCalled()
    expect(api.logout).not.toHaveBeenCalled()
  })

  it('treats HTTP 401 as a missing session', async () => {
    mockRequests(response({}, 401))
    render(<ManagePage />)
    expect(await screen.findByPlaceholderText('your@email.com')).toBeInTheDocument()
  })

  it.each(['network', 'http', 'invalid-json', 'malformed-status'])('offers retry instead of login after a %s failure', async failure => {
    let attempts = 0
    const fetchMock = vi.fn(async url => {
      if (url === '/api/manage/cups') return response({ cups: [] })
      if (url !== '/api/v1/auth/status') throw new Error(`Unexpected request: ${url}`)
      if (++attempts > 1) return response({ authenticated: true, scope: 'manage' })
      if (failure === 'network') throw new Error('Network unavailable')
      if (failure === 'http') return response({ authenticated: true, scope: 'manage' }, 503)
      if (failure === 'invalid-json') return { ok: true, status: 200, json: async () => { throw new SyntaxError('Invalid JSON') } }
      return response({ error: 'Unexpected response' })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<ManagePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Istunnon tarkistus epäonnistui')
    expect(screen.queryByPlaceholderText('your@email.com')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yritä uudelleen' }))
    expect(await screen.findByText('Ei cupeja')).toBeInTheDocument()
    expect(attempts).toBe(2)
    expect(api.login).not.toHaveBeenCalled()
  })

  it('keeps explicit Manage login working after an unauthenticated bootstrap', async () => {
    mockRequests(response({ authenticated: false }))
    render(<ManagePage />)

    fireEvent.change(await screen.findByPlaceholderText('your@email.com'), { target: { value: 'manager@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('SSI password'), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(await screen.findByText('Ei cupeja')).toBeInTheDocument()
    expect(api.login).toHaveBeenCalledWith('manager@example.com', 'test-password', '', 'manage')
  })

  it('stays logged out after explicit logout and leaves scoring state alone', async () => {
    localStorage.setItem('ssi_nav_state', 'unchanged-scoring-state')
    const fetchMock = mockRequests()
    render(<ManagePage />)
    await screen.findByText('Ei cupeja')
    fireEvent.click(screen.getByRole('button', { name: 'Kirjaudu ulos' }))

    expect(await screen.findByPlaceholderText('your@email.com')).toBeInTheDocument()
    expect(api.logout).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('ssi_manage_state')).toBeNull()
    expect(localStorage.getItem('ssi_nav_state')).toBe('unchanged-scoring-state')
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/auth/status')).toHaveLength(1)
  })

  it('returns to login if the server rejects the restored session while loading cups', async () => {
    mockRequests(response({ authenticated: true, scope: 'manage' }), response({ sessionExpired: true, error: 'Session expired' }, 401))
    render(<ManagePage />)

    expect(await screen.findByPlaceholderText('your@email.com')).toBeInTheDocument()
    expect(localStorage.getItem('ssi_manage_state')).toBeNull()
    expect(api.login).not.toHaveBeenCalled()
  })

  it('ignores an in-flight status response after leaving Manage', async () => {
    let resolveStatus
    const fetchMock = mockRequests(new Promise(resolve => { resolveStatus = resolve }))
    const { unmount } = render(<ManagePage />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => resolveStatus(response({ authenticated: true, scope: 'manage' })))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('restores correctly under StrictMode effect cleanup and replay', async () => {
    mockRequests()
    render(<StrictMode><ManagePage /></StrictMode>)
    expect(await screen.findByText('Ei cupeja')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('your@email.com')).not.toBeInTheDocument()
    expect(api.login).not.toHaveBeenCalled()
  })

  it('does not enable restoration for other shared-hook consumers by default', () => {
    const fetchMock = mockRequests()
    const { result } = renderHook(() => useAuthenticatedPage({ scope: 'reporting', credsKey: 'report-creds', stateKey: 'report-state' }))
    expect(result.current.authed).toBe(false)
    expect(result.current.view).toBe('login')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
