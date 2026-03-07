// ============================================================
// SSI Core — GraphQL & Authentication Domain
// GraphQL client, JWT auth, JWT refresh, and web login.
// ============================================================

import { SSI_BASE_URL, SSI_GRAPHQL } from './constants.js'
import { log } from '../logger.js'
import { parseCookies, formatCookies } from './http-helpers.js'

// ============================================================
// GraphQL client (JWT auth for reads)
// ============================================================

export async function ssiGraphQL(jwtToken, query, variables = {}, apiKey = null) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (jwtToken) {
    headers['Authorization'] = `JWT ${jwtToken}`
  }
  if (apiKey) {
    headers['X-Api-Key'] = apiKey
  }

  const body = JSON.stringify({ query, variables })

  const resp = await fetch(SSI_GRAPHQL, {
    method: 'POST',
    headers,
    body,
  })

  if (!resp.ok) {
    throw new Error(`GraphQL HTTP ${resp.status}: ${resp.statusText}`)
  }

  const json = await resp.json()

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map(e => e.message).join('; ')
    // Log full error details for debugging (field-level validation, extensions, etc.)
    log.error(`[ssi-graphql] Full error response: ${JSON.stringify(json.errors)}`)
    if (json.data) {
      log.error(`[ssi-graphql] Partial data alongside errors: ${JSON.stringify(json.data)}`)
    }
    throw new Error(`GraphQL Error: ${messages}`)
  }

  return json.data
}

// ============================================================
// JWT token refresh
// ============================================================

export async function ssiRefreshJWT(refreshToken) {
  const result = await ssiGraphQL(null, `
    mutation Refresh($refreshToken: String!, $revokeRefreshToken: Boolean!) {
      refresh_token(refresh_token: $refreshToken, revoke_refresh_token: $revokeRefreshToken) {
        token { token }
        refresh_token { token }
      }
    }
  `, { refreshToken, revokeRefreshToken: true })

  if (!result.refresh_token?.token?.token) {
    throw new Error('Token refresh failed')
  }

  return {
    token: result.refresh_token.token.token,
    refreshToken: result.refresh_token.refresh_token.token,
  }
}

// ============================================================
// GraphQL Authentication
// ============================================================

const AUTH_MUTATION = `
mutation TokenAuth($email: String!, $password: String!) {
  token_auth(email: $email, password: $password) {
    token { token }
    refresh_token { token }
    success
    errors
  }
}
`

export async function ssiGraphQLAuth({ email, password, apiKey }) {
  const result = await ssiGraphQL(null, AUTH_MUTATION, { email, password }, apiKey || null)

  if (!result.token_auth?.token?.token) {
    throw new Error('SSI GraphQL Authentication failed')
  }

  return {
    token: result.token_auth.token.token,
    refreshToken: result.token_auth.refresh_token?.token || null,
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
