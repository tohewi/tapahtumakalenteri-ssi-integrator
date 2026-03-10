// ============================================================
// WordPress Authentication Module (CAL-1)
// ============================================================
// Authenticates to WordPress admin with email-based 2FA support.
// Replaces archive/scripts-legacy/Connect-WordPress.ps1 (287 lines).
//
// Usage:
//   const { wpLogin, wpResendOtp, wpSubmitOtp, isAuthenticated } = require('./wp-auth.js')
//   const session = await wpLogin({ baseUrl, username, password })
//   if (session.needs2fa) {
//     // OTP was sent to email automatically — get code from user or IMAP (CAL-2)
//     const result = await wpSubmitOtp(session, otpCode)
//     // If code was wrong: await wpResendOtp(session) then retry wpSubmitOtp
//   }
//   // session.cookieJar is ready for subsequent requests
// ============================================================

import { CookieJar, Cookie } from 'tough-cookie'
import { log } from '../logger.js'

// ---- Constants ----

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const LOGIN_PATH = '/wp-login.php'
const VALIDATE_2FA_PATH = '/wp-login.php?action=validate_2fa'

// ---- Internal helpers ----

/**
 * Build headers for WordPress requests.
 * @param {string} baseUrl - WordPress site base URL
 * @param {string} referer - Referer URL
 * @returns {object} Headers object
 */
function buildHeaders(baseUrl, referer) {
  return {
    'User-Agent': USER_AGENT,
    'Origin': baseUrl,
    'Referer': referer,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

/**
 * Extract cookies from Set-Cookie headers and add to jar.
 * @param {CookieJar} jar - Cookie jar
 * @param {Response} response - Fetch response
 * @param {string} url - Request URL
 */
function collectCookies(jar, response, url) {
  const setCookies = response.headers.getSetCookie?.() || []
  for (const raw of setCookies) {
    try {
      jar.setCookieSync(raw, url)
    } catch {
      // Ignore malformed cookies
    }
  }
}

/**
 * Get Cookie header string from jar for a URL.
 * @param {CookieJar} jar - Cookie jar
 * @param {string} url - Target URL
 * @returns {string} Cookie header value
 */
function getCookieHeader(jar, url) {
  return jar.getCookieStringSync(url)
}

/**
 * Check if the jar contains a wordpress_logged_in_* cookie.
 * @param {CookieJar} jar - Cookie jar
 * @param {string} url - WordPress base URL
 * @returns {boolean}
 */
function hasAuthCookie(jar, url) {
  const cookies = jar.getCookiesSync(url)
  return cookies.some(c => c.key.startsWith('wordpress_logged_in_'))
}

/**
 * Perform a fetch with cookie jar support and redirect handling.
 * WordPress login redirects on success — we follow manually to capture cookies at each hop.
 * @param {string} url - Request URL
 * @param {object} options - Fetch options
 * @param {CookieJar} jar - Cookie jar
 * @param {number} [maxRedirects=5] - Maximum redirects to follow
 * @returns {Promise<{response: Response, body: string}>}
 */
async function fetchWithCookies(url, options, jar, maxRedirects = 5) {
  let currentUrl = url
  let response

  for (let i = 0; i <= maxRedirects; i++) {
    const cookieHeader = getCookieHeader(jar, currentUrl)
    const headers = { ...options.headers }
    if (cookieHeader) headers['Cookie'] = cookieHeader

    response = await fetch(currentUrl, {
      ...options,
      headers,
      redirect: 'manual', // Handle redirects manually to capture cookies
    })

    collectCookies(jar, response, currentUrl)

    // Follow redirects
    const location = response.headers.get('location')
    if (location && (response.status === 301 || response.status === 302 || response.status === 303)) {
      currentUrl = new URL(location, currentUrl).href
      // Redirects after POST should be GET
      if (options.method === 'POST') {
        options = { ...options, method: 'GET', body: undefined }
        delete options.headers['Content-Type']
      }
      continue
    }
    break
  }

  const body = await response.text()
  return { response, body }
}

/**
 * Parse 2FA form fields from WordPress login page HTML.
 * @param {string} html - Page HTML
 * @returns {{ needs2fa: boolean, provider: string|null, wpAuthId: string|null, wpAuthNonce: string|null }}
 */
export function parse2faForm(html) {
  if (!html) return { needs2fa: false, provider: null, wpAuthId: null, wpAuthNonce: null }

  // Check for email-based 2FA (Two-Factor plugin)
  const hasEmailCode = html.includes('two-factor-email-code')
  if (!hasEmailCode) return { needs2fa: false, provider: null, wpAuthId: null, wpAuthNonce: null }

  // Extract hidden fields
  const authIdMatch = html.match(/name="wp-auth-id"[^>]*value="([^"]+)"/)
  const nonceMatch = html.match(/name="wp-auth-nonce"[^>]*value="([^"]+)"/)

  return {
    needs2fa: true,
    provider: 'Two_Factor_Email',
    wpAuthId: authIdMatch?.[1] || null,
    wpAuthNonce: nonceMatch?.[1] || null,
  }
}

// ---- Public API ----

/**
 * Authenticate to WordPress. Returns a session object.
 * If 2FA is required, session.needs2fa will be true and an OTP code
 * was automatically sent to the account's email.
 *
 * @param {object} params
 * @param {string} params.baseUrl - WordPress site base URL (e.g. 'https://example.com')
 * @param {string} params.username - WordPress username
 * @param {string} params.password - WordPress password
 * @returns {Promise<WpSession>} Session object
 */
export async function wpLogin({ baseUrl, username, password }) {
  // Normalize baseUrl: strip /wp-admin*, trailing slashes — users often paste the admin URL
  const normalizedBase = baseUrl.replace(/\/wp-admin\/?.*$/i, '').replace(/\/+$/, '')
  const jar = new CookieJar()
  const loginUrl = `${normalizedBase}${LOGIN_PATH}`

  log.info(`[wp-auth] Authenticating to ${normalizedBase} as ${username}...`)

  // Step 1: Fetch login page to get initial cookies
  const { body: loginPageHtml } = await fetchWithCookies(loginUrl, {
    method: 'GET',
    headers: buildHeaders(normalizedBase, loginUrl),
  }, jar)

  if (!loginPageHtml) {
    throw new Error(`[wp-auth] Failed to fetch login page at ${loginUrl}`)
  }

  // Step 2: Add test cookie (WordPress requires this)
  const testCookie = new Cookie({
    key: 'wordpress_test_cookie',
    value: 'WP%20Cookie%20check',
    path: '/',
    domain: new URL(normalizedBase).hostname,
  })
  jar.setCookieSync(testCookie.toString(), normalizedBase)

  // Step 3: POST credentials
  const loginBody = new URLSearchParams({
    log: username,
    pwd: password,
    'wp-submit': 'Kirjaudu sisään',
    redirect_to: `${normalizedBase}/wp-admin/`,
    testcookie: '1',
  })

  const { body: postLoginHtml } = await fetchWithCookies(loginUrl, {
    method: 'POST',
    headers: buildHeaders(normalizedBase, loginUrl),
    body: loginBody.toString(),
  }, jar)

  // Step 4: Check if already logged in (no 2FA)
  if (hasAuthCookie(jar, normalizedBase)) {
    log.info(`[wp-auth] Logged in as ${username} (no 2FA required)`)
    return {
      baseUrl: normalizedBase,
      username,
      cookieJar: jar,
      needs2fa: false,
      authenticated: true,
      _2fa: null,
    }
  }

  // Step 5: Check for 2FA challenge
  const twoFa = parse2faForm(postLoginHtml)

  if (twoFa.needs2fa) {
    log.info(`[wp-auth] 2FA required (${twoFa.provider}). OTP sent to email automatically.`)
    return {
      baseUrl: normalizedBase,
      username,
      cookieJar: jar,
      needs2fa: true,
      authenticated: false,
      _2fa: twoFa,
    }
  }

  // No auth cookie and no 2FA form — login failed
  throw new Error(`[wp-auth] Login failed for ${username}. Check credentials.`)
}

/**
 * Submit a 2FA OTP code to complete authentication.
 *
 * @param {WpSession} session - Session from wpLogin() where needs2fa=true
 * @param {string} otpCode - The 8-digit OTP code from email
 * @returns {Promise<WpSession>} Updated session (check session.authenticated)
 */
export async function wpSubmitOtp(session, otpCode) {
  if (!session._2fa) {
    throw new Error('[wp-auth] Session does not have a pending 2FA challenge')
  }

  const { baseUrl, cookieJar: jar, _2fa } = session
  const validateUrl = `${baseUrl}${VALIDATE_2FA_PATH}`

  const otpBody = new URLSearchParams({
    provider: _2fa.provider,
    'wp-auth-id': _2fa.wpAuthId || '',
    'wp-auth-nonce': _2fa.wpAuthNonce || '',
    redirect_to: `${baseUrl}/wp-admin/`,
    rememberme: '0',
    'two-factor-email-code': otpCode,
    submit: 'Varmista',
  })

  log.info(`[wp-auth] Submitting 2FA code...`)

  const { body: otpHtml } = await fetchWithCookies(validateUrl, {
    method: 'POST',
    headers: buildHeaders(baseUrl, `${baseUrl}${LOGIN_PATH}`),
    body: otpBody.toString(),
  }, jar)

  if (hasAuthCookie(jar, baseUrl)) {
    log.info(`[wp-auth] 2FA verified. Logged in as ${session.username}`)
    return { ...session, needs2fa: false, authenticated: true }
  }

  // Code was wrong — update nonce from response for retry
  const refreshed = parse2faForm(otpHtml)
  if (refreshed.wpAuthNonce) {
    session._2fa.wpAuthNonce = refreshed.wpAuthNonce
  }

  log.warn(`[wp-auth] 2FA code rejected. Try again or resend.`)
  return { ...session, authenticated: false }
}

/**
 * Resend the 2FA OTP code to the account's email.
 *
 * @param {WpSession} session - Session with pending 2FA
 * @returns {Promise<WpSession>} Updated session with refreshed nonce
 */
export async function wpResendOtp(session) {
  if (!session._2fa) {
    throw new Error('[wp-auth] Session does not have a pending 2FA challenge')
  }

  const { baseUrl, cookieJar: jar, _2fa } = session
  const validateUrl = `${baseUrl}${VALIDATE_2FA_PATH}`

  const resendBody = new URLSearchParams({
    provider: _2fa.provider,
    'wp-auth-id': _2fa.wpAuthId || '',
    'wp-auth-nonce': _2fa.wpAuthNonce || '',
    redirect_to: `${baseUrl}/wp-admin/`,
    rememberme: '0',
    'two-factor-email-code-resend': 'true',
  })

  log.info(`[wp-auth] Resending OTP code...`)

  const { body: resendHtml } = await fetchWithCookies(validateUrl, {
    method: 'POST',
    headers: buildHeaders(baseUrl, `${baseUrl}${LOGIN_PATH}`),
    body: resendBody.toString(),
  }, jar)

  // Update nonce from response
  const refreshed = parse2faForm(resendHtml)
  if (refreshed.wpAuthNonce) {
    session._2fa.wpAuthNonce = refreshed.wpAuthNonce
  }

  log.info(`[wp-auth] OTP resent. Check email.`)
  return session
}

/**
 * Check if a session is authenticated.
 * @param {WpSession} session
 * @returns {boolean}
 */
export function isAuthenticated(session) {
  return session?.authenticated === true && hasAuthCookie(session.cookieJar, session.baseUrl)
}

/**
 * @typedef {object} WpSession
 * @property {string} baseUrl - WordPress site URL
 * @property {string} username - WordPress username
 * @property {CookieJar} cookieJar - Cookie jar for subsequent requests
 * @property {boolean} needs2fa - Whether 2FA verification is pending
 * @property {boolean} authenticated - Whether login is complete
 * @property {object|null} _2fa - Internal 2FA state (provider, wpAuthId, wpAuthNonce)
 */
