import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCaptcha, verifyCaptcha, getCups, getCupDetail, submitRegistration } from '../register-api'

const originalFetch = global.fetch

describe('Registration API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    if (typeof originalFetch === 'undefined') {
      delete global.fetch
    } else {
      global.fetch = originalFetch
    }
  })

  // ============================================================
  // getCaptcha
  // ============================================================
  describe('getCaptcha', () => {
    it('returns captcha challenge on success', async () => {
      const mockCaptcha = { id: 'abc-123', question: '5 + 3 = ?' }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockCaptcha),
      })

      const result = await getCaptcha()
      expect(result).toEqual(mockCaptcha)
      expect(fetch).toHaveBeenCalledWith('/api/v1/register/captcha')
    })

    it('throws on server error', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      await expect(getCaptcha()).rejects.toThrow('Failed to get captcha')
    })
  })

  // ============================================================
  // verifyCaptcha
  // ============================================================
  describe('verifyCaptcha', () => {
    it('returns ok on correct answer', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })

      const result = await verifyCaptcha('abc-123', '8')
      expect(result).toEqual({ ok: true })
      expect(fetch).toHaveBeenCalledWith('/api/v1/register/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captchaId: 'abc-123', captchaAnswer: 8 }),
      })
    })

    it('converts string answer to number', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })

      await verifyCaptcha('abc-123', '42')
      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body.captchaAnswer).toBe(42)
      expect(typeof body.captchaAnswer).toBe('number')
    })

    it('throws with error message on wrong answer', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Väärä vastaus. Tarkista ja yritä uudelleen.' }),
      })

      const err = await verifyCaptcha('abc-123', '999').catch(e => e)
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('Väärä vastaus. Tarkista ja yritä uudelleen.')
      expect(err.data.error).toBe('Väärä vastaus. Tarkista ja yritä uudelleen.')
    })

    it('throws on expired captcha', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' }),
      })

      await expect(verifyCaptcha('expired-id', '5')).rejects.toThrow('Varmistus vanhentunut')
    })

    it('throws on invalid input', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Virheelliset tiedot.' }),
      })

      await expect(verifyCaptcha('not-a-uuid', 'abc')).rejects.toThrow('Virheelliset tiedot.')
    })
  })

  // ============================================================
  // getCups
  // ============================================================
  describe('getCups', () => {
    it('returns cups array on success', async () => {
      const cups = [{ id: 160, name: 'TurRes Kupittaa CUP', starts: '2026-02-08' }]
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cups }),
      })

      const result = await getCups()
      expect(result).toEqual(cups)
      expect(fetch).toHaveBeenCalledWith('/api/v1/register/cups')
    })

    it('returns empty array when no cups', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cups: [] }),
      })

      const result = await getCups()
      expect(result).toEqual([])
    })

    it('returns empty array when cups field missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await getCups()
      expect(result).toEqual([])
    })

    it('throws on server error', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      await expect(getCups()).rejects.toThrow('Failed to load cups')
    })
  })

  // ============================================================
  // getCupDetail
  // ============================================================
  describe('getCupDetail', () => {
    it('returns cup detail with squads', async () => {
      const detail = { id: 160, name: 'CUP', squads: [{ number: 1 }] }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(detail),
      })

      const result = await getCupDetail('160')
      expect(result).toEqual(detail)
      expect(fetch).toHaveBeenCalledWith('/api/v1/register/cup/160')
    })

    it('throws on server error', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      await expect(getCupDetail('999')).rejects.toThrow('Failed to load cup details')
    })
  })

  // ============================================================
  // submitRegistration
  // ============================================================
  describe('submitRegistration', () => {
    it('handles non-streaming JSON error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: 'Väärä vastaus. Yritä uudelleen.' }),
      })

      await expect(submitRegistration({
        cupId: '160', squadNumber: 1, email: 'a@b.com',
        captchaId: 'abc', captchaAnswer: 999,
      })).rejects.toThrow('Väärä vastaus. Yritä uudelleen.')
    })

    it('handles rate limit error (429)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: 'Liian monta yritystä. Yritä uudelleen 10 minuutin kuluttua.' }),
      })

      const err = await submitRegistration({
        cupId: '160', squadNumber: 1, email: 'a@b.com',
        captchaId: 'abc', captchaAnswer: 8,
      }).catch(e => e)

      expect(err.message).toContain('Liian monta yritystä')
    })

    it('handles streaming NDJSON success response', async () => {
      const lines = [
        JSON.stringify({ type: 'progress', step: 1, message: 'Adding to CUP...' }),
        JSON.stringify({ type: 'progress', step: 2, message: 'Approving...' }),
        JSON.stringify({ type: 'result', success: true, message: 'Registered!' }),
      ].join('\n') + '\n'

      const encoder = new TextEncoder()
      let callCount = 0
      const chunks = [encoder.encode(lines)]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/x-ndjson' },
        body: {
          getReader: () => ({
            read: () => {
              if (callCount < chunks.length) {
                return Promise.resolve({ done: false, value: chunks[callCount++] })
              }
              return Promise.resolve({ done: true })
            },
          }),
        },
      })

      const progress = []
      const result = await submitRegistration(
        { cupId: '160', squadNumber: 1, email: 'a@b.com', captchaId: 'abc', captchaAnswer: 8 },
        (evt) => progress.push(evt),
      )

      expect(result.success).toBe(true)
      expect(result.message).toBe('Registered!')
      expect(progress).toHaveLength(2)
      expect(progress[0].step).toBe(1)
    })

    it('throws when NDJSON stream has no result', async () => {
      const encoder = new TextEncoder()
      let callCount = 0
      const chunks = [encoder.encode(JSON.stringify({ type: 'progress', step: 1 }) + '\n')]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/x-ndjson' },
        body: {
          getReader: () => ({
            read: () => {
              if (callCount < chunks.length) {
                return Promise.resolve({ done: false, value: chunks[callCount++] })
              }
              return Promise.resolve({ done: true })
            },
          }),
        },
      })

      await expect(submitRegistration({
        cupId: '160', squadNumber: 1, email: 'a@b.com',
        captchaId: 'abc', captchaAnswer: 8,
      })).rejects.toThrow('No result received')
    })

    it('throws when NDJSON result is unsuccessful', async () => {
      const encoder = new TextEncoder()
      let callCount = 0
      const chunks = [encoder.encode(
        JSON.stringify({ type: 'result', success: false, message: 'Email not found' }) + '\n'
      )]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/x-ndjson' },
        body: {
          getReader: () => ({
            read: () => {
              if (callCount < chunks.length) {
                return Promise.resolve({ done: false, value: chunks[callCount++] })
              }
              return Promise.resolve({ done: true })
            },
          }),
        },
      })

      await expect(submitRegistration({
        cupId: '160', squadNumber: 1, email: 'a@b.com',
        captchaId: 'abc', captchaAnswer: 8,
      })).rejects.toThrow('Email not found')
    })
  })
})
