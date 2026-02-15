import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchStaffingEvents,
  fetchStaffingEvent,
  staffSignup,
  staffResign,
  fetchStaffingConfig,
  fetchStaffingSites,
} from '../staffing-api'

describe('Staffing API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches staffing events without site key', async () => {
    const payload = { events: [] }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    })

    const result = await fetchStaffingEvents()

    expect(result).toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/api/staffing/events', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('fetches staffing events with site key query parameter', async () => {
    const payload = { events: [] }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    })

    await fetchStaffingEvents('temppeli-sra')

    expect(fetch).toHaveBeenCalledWith('/api/staffing/events?siteKey=temppeli-sra', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('fetches single staffing event with site key', async () => {
    const payload = { eventId: '1001' }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    })

    const result = await fetchStaffingEvent('1001', 'temppeli-sra')

    expect(result).toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/api/staffing/events/1001?siteKey=temppeli-sra', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('sends signup request with role and site key', async () => {
    const payload = { success: true }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    })

    await staffSignup('2002', 'leadInstructor', 'temppeli-sra')

    expect(fetch).toHaveBeenCalledWith('/api/staffing/events/2002/signup?siteKey=temppeli-sra', {
      method: 'POST',
      body: JSON.stringify({ role: 'leadInstructor' }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('sends resign request with site key', async () => {
    const payload = { success: true }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    })

    await staffResign('2002', 'temppeli-sra')

    expect(fetch).toHaveBeenCalledWith('/api/staffing/events/2002/signup?siteKey=temppeli-sra', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('fetches staffing config with site key', async () => {
    const payload = { roles: {} }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    })

    await fetchStaffingConfig('temppeli-sra')

    expect(fetch).toHaveBeenCalledWith('/api/staffing/config?siteKey=temppeli-sra', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('fetches staffing sites without site query parameter', async () => {
    const payload = { sites: [] }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    })

    await fetchStaffingSites()

    expect(fetch).toHaveBeenCalledWith('/api/staffing/sites', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('throws enriched error details on API error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Session expired', sessionExpired: true }),
    })

    const err = await fetchStaffingEvents('temppeli-sra').catch(e => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('Session expired')
    expect(err.status).toBe(401)
    expect(err.sessionExpired).toBe(true)
  })
})
