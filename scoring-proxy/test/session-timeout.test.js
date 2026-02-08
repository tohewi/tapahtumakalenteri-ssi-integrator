/**
 * Session timeout and security tests
 * 
 * These tests verify that sessions expire after 1 minute of inactivity
 * and that multiple users have isolated sessions.
 * 
 * Tests require the proxy server running on localhost:3001
 * and valid SSI credentials. Run with:
 *   node --test test/session-timeout.test.js
 * 
 * Environment: Node.js 24+ built-in test runner
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'

const BASE = 'http://localhost:3001/api'

// Test credentials — MUST be loaded from environment variables
if (!process.env.SSI_EMAIL || !process.env.SSI_PASSWORD || !process.env.SSI_API_KEY) {
  console.error('ERROR: Missing required environment variables for tests')
  console.error('Required: SSI_EMAIL, SSI_PASSWORD, SSI_API_KEY')
  process.exit(1)
}

const CREDS = {
  email: process.env.SSI_EMAIL,
  password: process.env.SSI_PASSWORD,
  apiKey: process.env.SSI_API_KEY,
}

// Helper to make fetch requests and extract cookies
async function fetchWithCookies(url, opts = {}) {
  const resp = await fetch(url, opts)
  const cookies = resp.headers.get('set-cookie') || ''
  const data = await resp.json()
  return { status: resp.status, ok: resp.ok, data, cookies }
}

// Helper to extract session cookie from Set-Cookie header
function extractSessionCookie(setCookieHeader) {
  const match = setCookieHeader.match(/ssi_session=([^;]+)/)
  return match ? match[1] : null
}

// Helper to make authenticated request with session cookie
async function authedFetch(url, sessionCookie, opts = {}) {
  const headers = { ...opts.headers, Cookie: `ssi_session=${sessionCookie}` }
  const resp = await fetch(url, { ...opts, headers, credentials: 'include' })
  const data = await resp.json()
  return { status: resp.status, ok: resp.ok, data }
}

// Helper to wait (for session expiry tests)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================
// Session timeout tests
// ============================================================

describe('Session timeout after 1 minute of inactivity', () => {
  it('creates session on login', async () => {
    const { status, data, cookies } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    assert.equal(status, 200)
    assert.equal(data.success, true)
    assert.ok(cookies.includes('ssi_session='))
    const sessionId = extractSessionCookie(cookies)
    assert.ok(sessionId, 'Session cookie should be set')
  })

  it('session is valid immediately after login', async () => {
    const { cookies } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    const sessionId = extractSessionCookie(cookies)
    
    const { status, data } = await authedFetch(`${BASE}/auth/status`, sessionId)
    assert.equal(status, 200)
    assert.equal(data.authenticated, true)
    assert.ok(data.remainingMs > 0, 'Should have remaining time')
    assert.ok(data.remainingMs <= 60000, 'Should be within 1 minute')
  })

  it('session remains valid with activity', async () => {
    const { cookies } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    const sessionId = extractSessionCookie(cookies)
    
    // Wait 30 seconds
    await sleep(30000)
    
    // Make a request to keep session alive
    const { status: status1, data: data1 } = await authedFetch(`${BASE}/auth/status`, sessionId)
    assert.equal(status1, 200)
    assert.equal(data1.authenticated, true)
    
    // Wait another 30 seconds (total 60s, but session was renewed at 30s)
    await sleep(30000)
    
    // Session should still be valid (renewed at 30s mark)
    const { status: status2, data: data2 } = await authedFetch(`${BASE}/auth/status`, sessionId)
    assert.equal(status2, 200)
    assert.equal(data2.authenticated, true)
  })

  it('session expires after 1 minute of inactivity', async () => {
    const { cookies } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    const sessionId = extractSessionCookie(cookies)
    
    // Wait 61 seconds (1 minute + 1 second to ensure expiry)
    console.log('  ⏱️  Waiting 61 seconds for session to expire...')
    await sleep(61000)
    
    // Try to use expired session
    const { status, data } = await authedFetch(`${BASE}/cups?search=test`, sessionId)
    assert.equal(status, 401)
    assert.ok(data.sessionExpired, 'Should indicate session expired')
    assert.match(data.error, /expired/i)
  })

  it('expired session returns 401 on all protected endpoints', async () => {
    const { cookies } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    const sessionId = extractSessionCookie(cookies)
    
    // Wait for expiry
    console.log('  ⏱️  Waiting 61 seconds for session to expire...')
    await sleep(61000)
    
    // Test various protected endpoints
    const endpoints = [
      `${BASE}/cups?search=test`,
      `${BASE}/matches?search=test`,
      `${BASE}/auth/status`,
    ]
    
    for (const endpoint of endpoints) {
      const { status, data } = await authedFetch(endpoint, sessionId)
      // auth/status doesn't require auth, so it returns 200 but authenticated: false
      if (endpoint.includes('/auth/status')) {
        assert.equal(data.authenticated, false)
      } else {
        assert.equal(status, 401, `${endpoint} should return 401`)
        assert.ok(data.sessionExpired || data.error, `${endpoint} should return error`)
      }
    }
  })
})

// ============================================================
// Multi-user session isolation
// ============================================================

describe('Multi-user session isolation', () => {
  it('different sessions are isolated', async () => {
    // Login twice to create two sessions
    const { cookies: cookies1 } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    const sessionId1 = extractSessionCookie(cookies1)
    
    const { cookies: cookies2 } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    const sessionId2 = extractSessionCookie(cookies2)
    
    // Both sessions should be valid
    assert.notEqual(sessionId1, sessionId2, 'Sessions should have different IDs')
    
    const { data: data1 } = await authedFetch(`${BASE}/auth/status`, sessionId1)
    const { data: data2 } = await authedFetch(`${BASE}/auth/status`, sessionId2)
    
    assert.equal(data1.authenticated, true)
    assert.equal(data2.authenticated, true)
  })

  it('logout only affects specific session', async () => {
    // Create two sessions
    const { cookies: cookies1 } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    const sessionId1 = extractSessionCookie(cookies1)
    
    const { cookies: cookies2 } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    const sessionId2 = extractSessionCookie(cookies2)
    
    // Logout from session 1
    await authedFetch(`${BASE}/auth/logout`, sessionId1, { method: 'POST' })
    
    // Session 1 should be invalid
    const { data: data1 } = await authedFetch(`${BASE}/auth/status`, sessionId1)
    assert.equal(data1.authenticated, false)
    
    // Session 2 should still be valid
    const { data: data2 } = await authedFetch(`${BASE}/auth/status`, sessionId2)
    assert.equal(data2.authenticated, true)
  })

  it('session IDs are unique UUIDs', async () => {
    const sessionIds = new Set()
    
    // Create 5 sessions
    for (let i = 0; i < 5; i++) {
      const { cookies } = await fetchWithCookies(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(CREDS),
      })
      const sessionId = extractSessionCookie(cookies)
      assert.ok(sessionId, `Session ${i + 1} should have ID`)
      
      // Check UUID format (rough check)
      assert.match(sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        'Session ID should be UUID format')
      
      sessionIds.add(sessionId)
    }
    
    assert.equal(sessionIds.size, 5, 'All session IDs should be unique')
  })
})

// ============================================================
// Session security checks
// ============================================================

describe('Session security', () => {
  it('cannot use session without cookie', async () => {
    // Try to access protected endpoint without session cookie
    const resp = await fetch(`${BASE}/cups?search=test`, {
      credentials: 'omit', // explicitly don't send cookies
    })
    const data = await resp.json()
    assert.equal(resp.status, 401)
    assert.ok(data.error, 'Should return error')
  })

  it('cannot use invalid session cookie', async () => {
    // Try with fake session ID
    const fakeSessionId = '00000000-0000-0000-0000-000000000000'
    const { status, data } = await authedFetch(`${BASE}/cups?search=test`, fakeSessionId)
    assert.equal(status, 401)
    assert.ok(data.sessionExpired || data.error, 'Should return error for invalid session')
  })

  it('session cookie has security attributes', async () => {
    const { cookies } = await fetchWithCookies(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CREDS),
    })
    
    // Check cookie attributes
    assert.ok(cookies.includes('HttpOnly'), 'Cookie should be HttpOnly')
    assert.ok(cookies.includes('SameSite=Lax'), 'Cookie should have SameSite=Lax')
    assert.ok(cookies.includes('Path=/api'), 'Cookie should have Path=/api')
    // Note: Secure flag is only set in production (IS_PROD)
  })
})
