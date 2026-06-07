import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { app, captchaChallenges, CAPTCHA_TTL } from '../server.js'

// Use trust proxy so we can vary X-Forwarded-For per test group
// to avoid rate limiter state bleeding across tests
app.set('trust proxy', true)

let server, baseUrl

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`
      resolve()
    })
  })
})

afterAll(() => {
  server?.close()
})

// Counter for unique IPs per test to isolate rate limiters
let ipCounter = 0
function uniqueIp() {
  ipCounter++
  return `10.0.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`
}

// Lightweight test HTTP client
async function request(method, path, body = null, ip = null) {
  const url = `${baseUrl}${path}`
  const opts = { method, headers: {} }
  if (ip) opts.headers['X-Forwarded-For'] = ip
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const resp = await fetch(url, opts)
  const data = await resp.json().catch(() => null)
  return { status: resp.status, data, headers: Object.fromEntries(resp.headers.entries()) }
}

// Shared helper: get a fresh captcha from the server
async function getFreshCaptcha(ip) {
  const res = await request('GET', '/api/register/captcha', null, ip)
  expect(res.status).toBe(200)
  expect(res.data.id).toBeDefined()
  expect(res.data.question).toMatch(/\d+ \+ \d+ = \?/)
  const nums = res.data.question.match(/(\d+) \+ (\d+)/)
  const correctAnswer = Number(nums[1]) + Number(nums[2])
  return { id: res.data.id, question: res.data.question, correctAnswer }
}

describe('Registration endpoints', () => {
  beforeEach(() => {
    // Clear all captchas between tests to avoid cross-test pollution
    captchaChallenges.clear()
  })

  // ============================================================
  // GET /api/register/captcha
  // ============================================================
  describe('GET /api/register/captcha', () => {
    it('returns a captcha challenge with id and question', async () => {
      const ip = uniqueIp()
      const res = await request('GET', '/api/register/captcha', null, ip)
      expect(res.status).toBe(200)
      expect(res.data.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(res.data.question).toMatch(/^\d+ \+ \d+ = \?$/)
    })

    it('stores the captcha in the challenges map', async () => {
      const ip = uniqueIp()
      const res = await request('GET', '/api/register/captcha', null, ip)
      expect(captchaChallenges.has(res.data.id)).toBe(true)
      const challenge = captchaChallenges.get(res.data.id)
      expect(challenge.answer).toBeGreaterThan(0)
      expect(challenge.created).toBeGreaterThan(0)
    })
  })

  // ============================================================
  // POST /api/register/verify-captcha
  // ============================================================
  describe('POST /api/register/verify-captcha', () => {
    it('returns ok for correct answer', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const res = await request('POST', '/api/register/verify-captcha', {
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res.status).toBe(200)
      expect(res.data.ok).toBe(true)
    })

    it('rejects wrong answer with 400', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const res = await request('POST', '/api/register/verify-captcha', {
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer + 1,
      }, ip)
      expect(res.status).toBe(400)
      expect(res.data.error).toContain('Väärä vastaus')
    })

    it('does NOT consume the captcha (can verify again)', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const res1 = await request('POST', '/api/register/verify-captcha', {
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res1.status).toBe(200)

      const res2 = await request('POST', '/api/register/verify-captcha', {
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res2.status).toBe(200)
    })

    it('rejects expired captcha', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const challenge = captchaChallenges.get(cap.id)
      challenge.created = Date.now() - CAPTCHA_TTL - 1000

      const res = await request('POST', '/api/register/verify-captcha', {
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res.status).toBe(400)
      expect(res.data.error).toContain('vanhentunut')
    })

    it('rejects non-existent captcha id', async () => {
      const ip = uniqueIp()
      const res = await request('POST', '/api/register/verify-captcha', {
        captchaId: '00000000-0000-0000-0000-000000000000',
        captchaAnswer: 5,
      }, ip)
      expect(res.status).toBe(400)
      expect(res.data.error).toContain('vanhentunut')
    })

    it('rejects invalid captchaId format', async () => {
      const ip = uniqueIp()
      const res = await request('POST', '/api/register/verify-captcha', {
        captchaId: 'not-a-uuid',
        captchaAnswer: 5,
      }, ip)
      expect(res.status).toBe(400)
      expect(res.data.error).toContain('Virheelliset tiedot')
    })

    it('rejects missing captchaAnswer', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const res = await request('POST', '/api/register/verify-captcha', {
        captchaId: cap.id,
      }, ip)
      expect(res.status).toBe(400)
    })

    it('rejects non-numeric captchaAnswer', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const res = await request('POST', '/api/register/verify-captcha', {
        captchaId: cap.id,
        captchaAnswer: 'abc',
      }, ip)
      expect(res.status).toBe(400)
    })
  })

  // ============================================================
  // POST /api/register/submit — input validation
  // Each test uses a unique IP to avoid rate limiter cross-contamination
  // ============================================================
  describe('POST /api/register/submit — validation', () => {
    it('rejects missing fields', async () => {
      const ip = uniqueIp()
      const res = await request('POST', '/api/register/submit', {}, ip)
      expect(res.status).toBe(400)
      expect(res.data.error).toContain('Virheelliset tiedot')
    })

    it('rejects invalid email format', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const res = await request('POST', '/api/register/submit', {
        cupId: '160',
        squadNumber: 1,
        email: 'not-an-email',
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res.status).toBe(400)
    })

    it('rejects invalid cupId format', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const res = await request('POST', '/api/register/submit', {
        cupId: 'abc',
        squadNumber: 1,
        email: 'test@test.com',
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res.status).toBe(400)
    })

    it('rejects squadNumber out of range', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const res = await request('POST', '/api/register/submit', {
        cupId: '160',
        squadNumber: 100,
        email: 'test@test.com',
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res.status).toBe(400)
    })

    it('rejects wrong captcha answer at submit time', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const res = await request('POST', '/api/register/submit', {
        cupId: '160',
        squadNumber: 1,
        email: 'test@test.com',
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer + 1,
      }, ip)
      expect(res.status).toBe(400)
      expect(res.data.error).toContain('Väärä vastaus')
    })

    it('consumes the captcha after submit (single-use)', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      // First submit — will fail at SSI level but captcha is consumed
      await request('POST', '/api/register/submit', {
        cupId: '160',
        squadNumber: 1,
        email: 'test@test.com',
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)

      // Second submit — captcha is gone
      const res2 = await request('POST', '/api/register/submit', {
        cupId: '160',
        squadNumber: 1,
        email: 'test@test.com',
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res2.status).toBe(400)
      expect(res2.data.error).toContain('vanhentunut')
    })

    it('rejects oversized email via validation (> 254 chars)', async () => {
      const ip = uniqueIp()
      const cap = await getFreshCaptcha(ip)
      const longEmail = 'a'.repeat(250) + '@test.com' // 259 chars > 254 limit
      const res = await request('POST', '/api/register/submit', {
        cupId: '160',
        squadNumber: 1,
        email: longEmail,
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res.status).toBe(400)
    })

    it('rejects request body larger than 10 KB (global limit)', async () => {
      const ip = uniqueIp()
      const hugePayload = { junk: 'x'.repeat(12000) }
      const res = await request('POST', '/api/register/submit', hugePayload, ip)
      // Express global body parser returns 413 for > 10KB
      expect(res.status).toBe(413)
    })
  })

  // ============================================================
  // Rate limiting — negative path (penalty)
  // Uses a single dedicated IP to test rate limit exhaustion
  // ============================================================
  describe('Rate limiting — submit endpoint', () => {
    it('returns 429 after exceeding 5 submit attempts', async () => {
      const ip = uniqueIp() // dedicated IP for this test
      const results = []
      for (let i = 0; i < 6; i++) {
        const cap = await getFreshCaptcha(ip)
        const res = await request('POST', '/api/register/submit', {
          cupId: '160',
          squadNumber: 1,
          email: 'test@test.com',
          captchaId: cap.id,
          captchaAnswer: cap.correctAnswer,
        }, ip)
        results.push(res.status)
      }

      // First 5 should pass validation (may fail at SSI level with 500, but not 429)
      for (let i = 0; i < 5; i++) {
        expect(results[i]).not.toBe(429)
      }
      // 6th should be rate limited
      expect(results[5]).toBe(429)
    })

    it('rate limit response has Finnish error message', async () => {
      const ip = uniqueIp()
      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        const cap = await getFreshCaptcha(ip)
        await request('POST', '/api/register/submit', {
          cupId: '160',
          squadNumber: 1,
          email: 'test@test.com',
          captchaId: cap.id,
          captchaAnswer: cap.correctAnswer,
        }, ip)
      }
      // 6th — rate limited
      const cap = await getFreshCaptcha(ip)
      const res = await request('POST', '/api/register/submit', {
        cupId: '160',
        squadNumber: 1,
        email: 'test@test.com',
        captchaId: cap.id,
        captchaAnswer: cap.correctAnswer,
      }, ip)
      expect(res.status).toBe(429)
      expect(res.data.error).toContain('Liian monta yritystä')
      expect(res.data.error).toContain('10 minuutin')
    })
  })
})
