import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  platformRegister,
  platformLogin,
  platformLogout,
  platformStatus,
  platformMe,
  createTenant,
  listTenants,
  getTenantDetails,
  updateTenant,
} from '../platform-api'

const API_BASE = '/api/v1/platform'

const originalFetch = global.fetch

describe('Platform API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    if (typeof originalFetch === 'undefined') {
      delete global.fetch
    } else {
      global.fetch = originalFetch
    }
  })

  // ============================================================
  // platformFetch internals (tested via public API surface)
  // ============================================================
  describe('platformFetch internals', () => {
    it('sends credentials: include on every request', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ authenticated: true }),
      })

      await platformStatus()

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/status`,
        expect.objectContaining({ credentials: 'include' }),
      )
    })

    it('sends Content-Type: application/json header', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      await platformStatus()

      const [, options] = fetch.mock.calls[0]
      expect(options.headers['Content-Type']).toBe('application/json')
    })

    it('returns parsed JSON on success', async () => {
      const payload = { authenticated: true, account: { id: 1 } }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      })

      const result = await platformStatus()
      expect(result).toEqual(payload)
    })

    it('throws with status code on error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      })

      const err = await platformStatus().catch(e => e)
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('Unauthorized')
      expect(err.status).toBe(401)
    })

    it('attaches details field from error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ error: 'Validation failed', details: { field: 'email' } }),
      })

      const err = await platformStatus().catch(e => e)
      expect(err.details).toEqual({ field: 'email' })
    })

    it('attaches platformSessionExpired flag when present', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Session expired', platformSessionExpired: true }),
      })

      const err = await platformStatus().catch(e => e)
      expect(err.platformSessionExpired).toBe(true)
    })

    it('defaults platformSessionExpired to false when absent', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      })

      const err = await platformStatus().catch(e => e)
      expect(err.platformSessionExpired).toBe(false)
    })

    it('uses fallback message when error body has no error field', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      })

      const err = await platformStatus().catch(e => e)
      expect(err.message).toBe('Request failed (503)')
    })

    it('handles malformed JSON response gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      })

      const err = await platformStatus().catch(e => e)
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('Request failed (502)')
    })
  })

  // ============================================================
  // Auth — platformRegister
  // ============================================================
  describe('platformRegister', () => {
    it('POSTs to /register with correct body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })

      await platformRegister({ email: 'a@b.com', password: 'secret', name: 'Alice', organizationName: 'Org' })

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/register`,
        expect.objectContaining({ method: 'POST' }),
      )
      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body).toEqual({ email: 'a@b.com', password: 'secret', name: 'Alice', organizationName: 'Org' })
    })

    it('throws on conflict (409)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Email already registered' }),
      })

      const err = await platformRegister({ email: 'a@b.com', password: 'x', name: 'A', organizationName: 'O' }).catch(e => e)
      expect(err.status).toBe(409)
      expect(err.message).toBe('Email already registered')
    })
  })

  // ============================================================
  // Auth — platformLogin
  // ============================================================
  describe('platformLogin', () => {
    it('POSTs to /login with email and password', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })

      await platformLogin({ email: 'user@example.com', password: 'pass' })

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/login`,
        expect.objectContaining({ method: 'POST' }),
      )
      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body).toEqual({ email: 'user@example.com', password: 'pass' })
    })

    it('throws with platformSessionExpired on 401', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid credentials', platformSessionExpired: false }),
      })

      const err = await platformLogin({ email: 'x@x.com', password: 'wrong' }).catch(e => e)
      expect(err.status).toBe(401)
    })
  })

  // ============================================================
  // Auth — platformLogout
  // ============================================================
  describe('platformLogout', () => {
    it('POSTs to /logout', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })

      await platformLogout()

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/logout`,
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  // ============================================================
  // Auth — platformStatus
  // ============================================================
  describe('platformStatus', () => {
    it('GETs /status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ authenticated: false }),
      })

      const result = await platformStatus()

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/status`,
        expect.objectContaining({ credentials: 'include' }),
      )
      expect(result.authenticated).toBe(false)
    })
  })

  // ============================================================
  // Auth — platformMe
  // ============================================================
  describe('platformMe', () => {
    it('GETs /me and returns account data', async () => {
      const payload = { account: { id: 42, email: 'a@b.com' }, tenants: [] }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      })

      const result = await platformMe()

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/me`,
        expect.objectContaining({ credentials: 'include' }),
      )
      expect(result).toEqual(payload)
    })
  })

  // ============================================================
  // Tenants — createTenant
  // ============================================================
  describe('createTenant', () => {
    it('POSTs to /tenants with name', async () => {
      const tenant = { id: 1, name: 'SRA Training' }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(tenant),
      })

      const result = await createTenant({ name: 'SRA Training' })

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/tenants`,
        expect.objectContaining({ method: 'POST' }),
      )
      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body).toEqual({ name: 'SRA Training' })
      expect(result).toEqual(tenant)
    })
  })

  // ============================================================
  // Tenants — listTenants
  // ============================================================
  describe('listTenants', () => {
    it('GETs /tenants and returns array', async () => {
      const tenants = [{ id: 1, name: 'SRA Training' }]
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(tenants),
      })

      const result = await listTenants()

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/tenants`,
        expect.objectContaining({ credentials: 'include' }),
      )
      expect(result).toEqual(tenants)
    })
  })

  // ============================================================
  // Tenants — getTenantDetails
  // ============================================================
  describe('getTenantDetails', () => {
    it('GETs /tenants/:id', async () => {
      const tenant = { id: 7, name: 'Club A', ssiCredentials: null }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(tenant),
      })

      const result = await getTenantDetails(7)

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/tenants/7`,
        expect.objectContaining({ credentials: 'include' }),
      )
      expect(result).toEqual(tenant)
    })

    it('throws on 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Tenant not found' }),
      })

      const err = await getTenantDetails(999).catch(e => e)
      expect(err.status).toBe(404)
      expect(err.message).toBe('Tenant not found')
    })
  })

  // ============================================================
  // Tenants — updateTenant
  // ============================================================
  describe('updateTenant', () => {
    it('PATCHes /tenants/:id with updates', async () => {
      const updated = { id: 7, name: 'Club B' }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updated),
      })

      const result = await updateTenant(7, { name: 'Club B' })

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/tenants/7`,
        expect.objectContaining({ method: 'PATCH' }),
      )
      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body).toEqual({ name: 'Club B' })
      expect(result).toEqual(updated)
    })

    it('throws on 403 when account does not own tenant', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Forbidden' }),
      })

      const err = await updateTenant(99, { name: 'X' }).catch(e => e)
      expect(err.status).toBe(403)
    })
  })
})
