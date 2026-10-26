// ============================================================
// SSI Core — GraphQL & Authentication Domain
// ============================================================

import {
  SSI_BASE_URL,
  SSI_GRAPHQL,
  log,
  parseCookies,
  formatCookies,
} from './http-helpers.js'

// ============================================================
// GraphQL client (JWT auth for reads)
// ============================================================

const RETRYABLE_GRAPHQL_STATUS_CODES = new Set([502, 503, 504])
const UPSTREAM_UNAVAILABLE_CODE = 'UPSTREAM_UNAVAILABLE'
const UPSTREAM_UNAVAILABLE_MESSAGE = 'SSI service temporarily unavailable. Please retry.'
const DEFAULT_GRAPHQL_MAX_RETRIES = 2
const GRAPHQL_RETRY_BASE_DELAY_MS = 200
const GRAPHQL_RETRY_JITTER_MS = 150
const UPSTREAM_BODY_SNIPPET_MAX = 400

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
    const attemptStartMs = Date.now()
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

    const durationMs = Date.now() - attemptStartMs
    if (durationMs > 2000) {
      log.warn('[ssi-graphql] Slow GraphQL query (>2000ms) — review query efficiency per SSI API guidelines', {
        durationMs,
        attempt,
      })
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
// ============================================================

export async function ssiLogin(email, password) {
  const loginUrl = `${SSI_BASE_URL}/login/?next=/dashboard/`
  const loginPageResp = await fetch(loginUrl, {
    redirect: 'manual',
    headers: {
      'Cookie': 'django_language=en',
    },
  })
  const loginPageHtml = await loginPageResp.text()

  const csrfMatch = loginPageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
  const setCookies = loginPageResp.headers.getSetCookie?.() || []
  const cookies = parseCookies(setCookies)
  cookies.django_language = 'en'

  const csrfToken = csrfMatch?.[1] || cookies.csrftoken || null

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

  const loginSetCookies = loginResp.headers.getSetCookie?.() || []
  const loginCookies = parseCookies(loginSetCookies)
  const allCookies = { ...cookies, ...loginCookies }
  const debug = log.isEnabled('debug')

  if (debug) {
    console.log('Login response status:', loginResp.status, 'Cookies:', Object.keys(allCookies))
  }

  if (loginResp.status === 302 || loginResp.status === 301) {
    if (debug) console.log('SSI web login successful')
    return allCookies
  }

  if (allCookies.sessionid) {
    if (debug) console.log('SSI web login successful (no redirect)')
    return allCookies
  }

  if (loginResp.status === 200) {
    const html = await loginResp.text()
    if (html.includes('Please enter a correct') || html.includes('errorlist')) {
      throw new Error('Login failed: invalid credentials')
    }
  }

  throw new Error(`Login failed with status ${loginResp.status}`)
}
