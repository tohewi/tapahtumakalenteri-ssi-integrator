// ============================================================
// WordPress Authentication Module Tests (CAL-1)
// ============================================================
// Tests for lib/calendar/wp-auth.js — WordPress login with 2FA.
// Uses HTML fixtures from test/fixtures/wp-*.html.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse2faForm, wpLogin, wpSubmitOtp, wpResendOtp, isAuthenticated } from '../lib/calendar/wp-auth.js'

// ---- Fixtures ----

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')
const loginPageHtml = readFileSync(join(FIXTURES_DIR, 'wp-login-page.html'), 'utf8')
const twoFaEmailHtml = readFileSync(join(FIXTURES_DIR, 'wp-2fa-email.html'), 'utf8')

// ---- Helpers ----

/**
 * Build a mock Response with Set-Cookie headers and text body.
 */
function mockResponse(body, { status = 200, cookies = [], location = null } = {}) {
  const headers = new Headers()
  for (const c of cookies) headers.append('set-cookie', c)
  if (location) headers.set('location', location)
  return {
    status,
    headers,
    text: async () => body,
  }
}

/**
 * Stub global.fetch with sequential responses.
 * Each call to fetch() pops the next response from the array.
 */
function stubFetch(responses) {
  let callIndex = 0
  const calls = []
  global.fetch = vi.fn(async (url, options) => {
    calls.push({ url, options })
    const resp = responses[callIndex] || mockResponse('', { status: 500 })
    callIndex++
    return resp
  })
  return calls
}

// ---- Tests ----

describe('parse2faForm', () => {
  it('detects email-based 2FA and extracts hidden fields', () => {
    const result = parse2faForm(twoFaEmailHtml)
    expect(result.needs2fa).toBe(true)
    expect(result.provider).toBe('Two_Factor_Email')
    expect(result.wpAuthId).toBe('42')
    expect(result.wpAuthNonce).toBe('abc123nonce')
  })

  it('returns needs2fa=false for regular login page', () => {
    const result = parse2faForm(loginPageHtml)
    expect(result.needs2fa).toBe(false)
    expect(result.provider).toBeNull()
  })

  it('returns needs2fa=false for null/empty input', () => {
    expect(parse2faForm(null).needs2fa).toBe(false)
    expect(parse2faForm('').needs2fa).toBe(false)
    expect(parse2faForm(undefined).needs2fa).toBe(false)
  })

  it('handles 2FA form with missing nonce gracefully', () => {
    const html = '<input name="two-factor-email-code" /><input name="wp-auth-id" value="99" />'
    const result = parse2faForm(html)
    expect(result.needs2fa).toBe(true)
    expect(result.wpAuthId).toBe('99')
    expect(result.wpAuthNonce).toBeNull()
  })
})

describe('wpLogin', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('logs in without 2FA when auth cookie is set', async () => {
    const calls = stubFetch([
      // GET /wp-login.php — login page
      mockResponse(loginPageHtml),
      // POST /wp-login.php — credentials, redirect to wp-admin
      mockResponse('', {
        status: 302,
        location: 'https://example.com/wp-admin/',
        cookies: [
          'wordpress_logged_in_abc=user%7C1234; path=/; HttpOnly',
        ],
      }),
      // GET /wp-admin/ — follow redirect
      mockResponse('<html>wp-admin dashboard</html>', {
        cookies: [],
      }),
    ])

    const session = await wpLogin({
      baseUrl: 'https://example.com',
      username: 'admin',
      password: 'secret',
    })

    expect(session.authenticated).toBe(true)
    expect(session.needs2fa).toBe(false)
    expect(session.username).toBe('admin')
    expect(session.baseUrl).toBe('https://example.com')
    // Verify credentials were POSTed
    const postCall = calls.find(c => c.options?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(postCall.options.body).toContain('log=admin')
    expect(postCall.options.body).toContain('pwd=secret')
  })

  it('detects 2FA and returns session with needs2fa=true', async () => {
    stubFetch([
      // GET /wp-login.php — login page
      mockResponse(loginPageHtml),
      // POST /wp-login.php — credentials, 2FA page (no redirect, no auth cookie)
      mockResponse(twoFaEmailHtml, { status: 200 }),
    ])

    const session = await wpLogin({
      baseUrl: 'https://example.com',
      username: 'admin',
      password: 'secret',
    })

    expect(session.authenticated).toBe(false)
    expect(session.needs2fa).toBe(true)
    expect(session._2fa.provider).toBe('Two_Factor_Email')
    expect(session._2fa.wpAuthId).toBe('42')
    expect(session._2fa.wpAuthNonce).toBe('abc123nonce')
  })

  it('throws on failed login (no auth cookie, no 2FA form)', async () => {
    stubFetch([
      // GET /wp-login.php
      mockResponse(loginPageHtml),
      // POST /wp-login.php — wrong password, login page again
      mockResponse(loginPageHtml, { status: 200 }),
    ])

    await expect(wpLogin({
      baseUrl: 'https://example.com',
      username: 'admin',
      password: 'wrong',
    })).rejects.toThrow('Login failed')
  })
})

describe('wpSubmitOtp', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('completes authentication with correct OTP', async () => {
    stubFetch([
      // POST /wp-login.php?action=validate_2fa — success, redirect
      mockResponse('', {
        status: 302,
        location: 'https://example.com/wp-admin/',
        cookies: [
          'wordpress_logged_in_abc=user%7C1234; path=/; HttpOnly',
        ],
      }),
      // GET /wp-admin/ — follow redirect
      mockResponse('<html>wp-admin</html>'),
    ])

    const session = {
      baseUrl: 'https://example.com',
      username: 'admin',
      cookieJar: (await import('tough-cookie')).CookieJar.deserializeSync({ version: 'tough-cookie@4', storeType: 'MemoryCookieStore', cookies: [] }),
      needs2fa: true,
      authenticated: false,
      _2fa: { provider: 'Two_Factor_Email', wpAuthId: '42', wpAuthNonce: 'abc123' },
    }

    const result = await wpSubmitOtp(session, '12345678')
    expect(result.authenticated).toBe(true)
    expect(result.needs2fa).toBe(false)
  })

  it('returns authenticated=false on wrong OTP', async () => {
    stubFetch([
      // POST /wp-login.php?action=validate_2fa — wrong code, show 2FA form again
      mockResponse(twoFaEmailHtml, { status: 200 }),
    ])

    const session = {
      baseUrl: 'https://example.com',
      username: 'admin',
      cookieJar: (await import('tough-cookie')).CookieJar.deserializeSync({ version: 'tough-cookie@4', storeType: 'MemoryCookieStore', cookies: [] }),
      needs2fa: true,
      authenticated: false,
      _2fa: { provider: 'Two_Factor_Email', wpAuthId: '42', wpAuthNonce: 'abc123' },
    }

    const result = await wpSubmitOtp(session, '00000000')
    expect(result.authenticated).toBe(false)
  })

  it('throws if session has no pending 2FA', async () => {
    const session = { _2fa: null }
    await expect(wpSubmitOtp(session, '12345678')).rejects.toThrow('pending 2FA')
  })
})

describe('wpResendOtp', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('sends resend request and updates nonce', async () => {
    const updatedHtml = twoFaEmailHtml.replace('abc123nonce', 'newNonce456')
    stubFetch([
      mockResponse(updatedHtml, { status: 200 }),
    ])

    const session = {
      baseUrl: 'https://example.com',
      username: 'admin',
      cookieJar: (await import('tough-cookie')).CookieJar.deserializeSync({ version: 'tough-cookie@4', storeType: 'MemoryCookieStore', cookies: [] }),
      needs2fa: true,
      authenticated: false,
      _2fa: { provider: 'Two_Factor_Email', wpAuthId: '42', wpAuthNonce: 'abc123' },
    }

    const result = await wpResendOtp(session)
    expect(result._2fa.wpAuthNonce).toBe('newNonce456')
  })

  it('throws if session has no pending 2FA', async () => {
    await expect(wpResendOtp({ _2fa: null })).rejects.toThrow('pending 2FA')
  })
})

describe('isAuthenticated', () => {
  it('returns true when session is authenticated and has cookie', async () => {
    const { CookieJar } = await import('tough-cookie')
    const jar = new CookieJar()
    jar.setCookieSync('wordpress_logged_in_abc=user; path=/', 'https://example.com')
    expect(isAuthenticated({
      authenticated: true,
      cookieJar: jar,
      baseUrl: 'https://example.com',
    })).toBe(true)
  })

  it('returns false when authenticated flag is false', async () => {
    const { CookieJar } = await import('tough-cookie')
    const jar = new CookieJar()
    jar.setCookieSync('wordpress_logged_in_abc=user; path=/', 'https://example.com')
    expect(isAuthenticated({
      authenticated: false,
      cookieJar: jar,
      baseUrl: 'https://example.com',
    })).toBe(false)
  })

  it('returns false when cookie is missing', async () => {
    const { CookieJar } = await import('tough-cookie')
    expect(isAuthenticated({
      authenticated: true,
      cookieJar: new CookieJar(),
      baseUrl: 'https://example.com',
    })).toBe(false)
  })

  it('returns false for null/undefined session', () => {
    expect(isAuthenticated(null)).toBe(false)
    expect(isAuthenticated(undefined)).toBe(false)
  })
})
