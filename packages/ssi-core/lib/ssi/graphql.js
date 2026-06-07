// ============================================================
// SSI Core — GraphQL Client & Authentication
// ============================================================

import { SSI_BASE_URL, SSI_GRAPHQL } from './constants.js'
import { log } from '../logger.js'

// ============================================================
// GraphQL client constants
// ============================================================

const RETRYABLE_GRAPHQL_STATUS_CODES = new Set([502, 503, 504])
const UPSTREAM_UNAVAILABLE_CODE = 'UPSTREAM_UNAVAILABLE'
const UPSTREAM_UNAVAILABLE_MESSAGE = 'SSI service temporarily unavailable. Please retry.'
const DEFAULT_GRAPHQL_MAX_RETRIES = 2
const GRAPHQL_RETRY_BASE_DELAY_MS = 200
const GRAPHQL_RETRY_JITTER_MS = 150
const UPSTREAM_BODY_SNIPPET_MAX = 400

// ============================================================
// Retry helpers
// ============================================================

function getGraphqlRetryCount() {
  const value = Number.parseInt(process.env.SSI_GRAPHQL_MAX_RETRIES || `${DEFAULT_GRAPHQL_MAX_RETRIES}`, 10)
  if (!Number.isFinite(value)) return DEFAULT_GRAPHQL_MAX_RETRIES
  return Math.max(0, Math.min(DEFAULT_GRAPHQL_MAX_RETRIES, value))
}

function isRetryableGraphqlStatus(statusCode) {
  return RETRYABLE_GRAPHQL_STATUS_CODES.has(statusCode)
}

function isRetryableNetworkError(err) {
  const message = String(err?.message || '').toLowerCase()
  return (
    message.includes('fetch failed')
    || message.includes('network')
    || message.includes('econnreset')
    || message.includes('etimedout')
    || message.includes('socket hang up')
  )
}

function createRetryDelayMs(attempt) {
  const backoffMs = GRAPHQL_RETRY_BASE_DELAY_MS * attempt
  const jitterMs = Math.floor(Math.random() * GRAPHQL_RETRY_JITTER_MS)
  return backoffMs + jitterMs
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildUpstreamBodySnippet(rawBody) {
  if (!rawBody) return ''
  return String(rawBody).replace(/\s+/g, ' ').trim().slice(0, UPSTREAM_BODY_SNIPPET_MAX)
}

function extractUpstreamHeaders(headers) {
  if (!headers?.get) return {}

  const interestingHeaders = [
    'content-type',
    'server',
    'via',
    'x-request-id',
    'x-correlation-id',
    'cf-ray',
    'date',
  ]

  const extracted = {}
  for (const name of interestingHeaders) {
    const value = headers.get(name)
    if (value) extracted[name] = value
  }

  return extracted
}

function createUpstreamUnavailableError(context = {}) {
  const err = new Error(UPSTREAM_UNAVAILABLE_MESSAGE)
  err.code = UPSTREAM_UNAVAILABLE_CODE
  err.statusCode = 503
  err.isUpstreamTransient = true
  Object.assign(err, context)
  return err
}

function resolveGraphQLApiKey(apiKey) {
  const keyFromArg = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (keyFromArg) return keyFromArg

  const keyFromEnv = typeof process.env.SSI_ADMIN_API_KEY === 'string'
    ? process.env.SSI_ADMIN_API_KEY.trim()
    : ''
  if (keyFromEnv) return keyFromEnv

  throw new Error('SSI GraphQL API key missing: set SSI_ADMIN_API_KEY')
}

// ============================================================
// Cookie helpers (needed for web login)
// ============================================================

function parseCookies(setCookieHeaders) {
  const cookies = {}
  for (const header of setCookieHeaders) {
    const match = header.match(/^([^=]+)=([^;]*)/)
    if (match) {
      cookies[match[1].trim()] = match[2].trim()
    }
  }
  return cookies
}

function formatCookies(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

// ============================================================
// GraphQL client (JWT auth for reads)
// ============================================================

export async function ssiGraphQL(jwtToken, query, variables = {}, apiKey = null) {
  const resolvedApiKey = resolveGraphQLApiKey(apiKey)
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': resolvedApiKey,
  }
  if (jwtToken) {
    headers['Authorization'] = `JWT ${jwtToken}`
  }

  const body = JSON.stringify({ query, variables })

  const maxRetries = getGraphqlRetryCount()
  const maxAttempts = maxRetries + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let resp
    try {
      resp = await fetch(SSI_GRAPHQL, {
        method: 'POST',
        headers,
        body,
      })
    } catch (err) {
      const isRetryable = isRetryableNetworkError(err)
      const hasRetryLeft = attempt <= maxRetries

      if (isRetryable) {
        if (hasRetryLeft) {
          const retryDelayMs = createRetryDelayMs(attempt)
          log.warn('[ssi-graphql] Network error, retrying request', {
            attempt,
            maxAttempts,
            retryDelayMs,
            error: err.message,
          })
          await delay(retryDelayMs)
          continue
        }

        log.warn('[ssi-graphql] Network error, no retries left', {
          attempt,
          maxAttempts,
          error: err.message,
        })
        throw createUpstreamUnavailableError({
          attempts: attempt,
          upstreamError: err.message,
        })
      }

      throw err
    }

    if (!resp.ok) {
      const rawBody = await resp.text().catch(() => '')
      const upstreamBodySnippet = buildUpstreamBodySnippet(rawBody)
      const upstreamHeaders = extractUpstreamHeaders(resp.headers)
      const isRetryable = isRetryableGraphqlStatus(resp.status)
      const hasRetryLeft = attempt <= maxRetries

      if (isRetryable) {
        if (hasRetryLeft) {
          const retryDelayMs = createRetryDelayMs(attempt)
          log.warn('[ssi-graphql] Transient upstream HTTP error, retrying request', {
            attempt,
            maxAttempts,
            retryDelayMs,
            status: resp.status,
            statusText: resp.statusText,
            upstreamHeaders,
            upstreamBodySnippet,
          })
          await delay(retryDelayMs)
          continue
        }

        log.warn('[ssi-graphql] Transient upstream HTTP error, no retries left', {
          attempt,
          maxAttempts,
          status: resp.status,
          statusText: resp.statusText,
          upstreamHeaders,
          upstreamBodySnippet,
        })
        throw createUpstreamUnavailableError({
          attempts: attempt,
          upstreamStatus: resp.status,
          upstreamStatusText: resp.statusText,
          upstreamHeaders,
          upstreamBodySnippet,
        })
      }

      throw new Error(`GraphQL HTTP ${resp.status}: ${resp.statusText}`)
    }

    const json = await resp.json()

    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map(e => e.message).join('; ')
      throw new Error(`GraphQL Error: ${messages}`)
    }

    return json.data
  }

  throw createUpstreamUnavailableError()
}

// ============================================================
// JWT token refresh
// ============================================================

export async function ssiRefreshJWT(refreshToken, apiKey = null) {
  const result = await ssiGraphQL(null, `
    mutation Refresh($refreshToken: String!, $revokeRefreshToken: Boolean!) {
      refresh_token(refresh_token: $refreshToken, revoke_refresh_token: $revokeRefreshToken) {
        token { token }
        refresh_token { token }
      }
    }
  `, { refreshToken, revokeRefreshToken: true }, apiKey)

  if (!result.refresh_token?.token?.token) {
    throw new Error('Token refresh failed')
  }

  return {
    token: result.refresh_token.token.token,
    refreshToken: result.refresh_token.refresh_token.token,
  }
}

// ============================================================
// Web login (session cookies for form POSTs)
//
// NOTE: SSI does NOT use CSRF tokens. Neither the login page
// nor the scoring page include a csrfmiddlewaretoken hidden
// field or set a csrftoken cookie. All form POSTs work with
// just the session cookie. The CSRF-related code below is
// kept as a defensive fallback in case SSI re-enables CSRF
// protection in a future update.
// ============================================================

export async function ssiLogin(email, password) {
  // 1. GET the login page to get cookies (no CSRF token expected)
  // SSI login URL is /login/ (not /accounts/login/)
  const loginUrl = `${SSI_BASE_URL}/login/?next=/dashboard/`
  const loginPageResp = await fetch(loginUrl, {
    redirect: 'manual',
    headers: {
      'Cookie': 'django_language=en',
    },
  })
  const loginPageHtml = await loginPageResp.text()

  // SSI login page has no CSRF token (verified 2026-02-06).
  // Defensive: still check in case SSI re-enables it later.
  const csrfMatch = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
  const setCookies = loginPageResp.headers.getSetCookie?.() || []
  const cookies = parseCookies(setCookies)
  cookies.django_language = 'en'

  const csrfToken = csrfMatch?.[1] || cookies.csrftoken || null

  // 2. POST login form — fields are: username, password, keep
  const formData = new URLSearchParams()
  if (csrfToken) formData.append('csrfmiddlewaretoken', csrfToken)
  formData.append('username', email)
  formData.append('password', password)
  formData.append('keep', 'on')

  const loginResp = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': loginUrl,
      'Origin': SSI_BASE_URL,
    },
    body: formData.toString(),
    redirect: 'manual',
  })

  // Merge new cookies from login response
  const loginSetCookies = loginResp.headers.getSetCookie?.() || []
  const loginCookies = parseCookies(loginSetCookies)
  const allCookies = { ...cookies, ...loginCookies }
  const debug = log.isEnabled('debug')

  if (debug) {
    console.log('Login response status:', loginResp.status, 'Cookies:', Object.keys(allCookies))
  }

  // 302 redirect = success
  if (loginResp.status === 302 || loginResp.status === 301) {
    if (debug) console.log('SSI web login successful')
    return allCookies
  }

  // 200 with sessionid cookie = success (some configs)
  if (allCookies.sessionid) {
    if (debug) console.log('SSI web login successful (no redirect)')
    return allCookies
  }

  // Check for error messages
  if (loginResp.status === 200) {
    const html = await loginResp.text()
    if (html.includes('Please enter a correct') || html.includes('errorlist')) {
      throw new Error('Login failed: invalid credentials')
    }
  }

  throw new Error(`Login failed with status ${loginResp.status}`)
}

// Export cookie helpers for other modules
export { parseCookies, formatCookies }
