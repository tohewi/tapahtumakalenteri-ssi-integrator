// ============================================================
// SSI Core — HTTP, Cookie & Form Scraping Helpers
// Shared low-level helpers imported by ssi-core domain modules.
// ============================================================

import { SSI_BASE_URL, SSI_GRAPHQL } from './constants.js'
import { log } from '../logger.js'

export { SSI_BASE_URL, SSI_GRAPHQL, log }

// ============================================================
// Cookie helpers
// ============================================================

export function parseCookies(setCookieHeaders) {
  const cookies = {}
  for (const header of setCookieHeaders) {
    const match = header.match(/^([^=]+)=([^;]*)/)
    if (match) {
      cookies[match[1].trim()] = match[2].trim()
    }
  }
  return cookies
}

export function formatCookies(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

export function _participantResponseCookies(cookies, response) {
  return { ...cookies, ...parseCookies(response.headers?.getSetCookie?.() || []) }
}

export function _participantFormHeaders(cookies, referer) {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': formatCookies(cookies),
    'Referer': referer,
    'Origin': SSI_BASE_URL,
    ...(cookies.csrftoken ? { 'X-CSRFToken': cookies.csrftoken } : {}),
  }
}

export async function _participantSearchCookies(url, cookies) {
  if (cookies.csrftoken) return { ...cookies }
  const response = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'manual',
  })
  if (response.status !== 200) throw new Error(`Participant search page HTTP ${response.status}`)
  await response.text()
  return _participantResponseCookies(cookies, response)
}

// ============================================================
// Extract ALL form fields from an SSI HTML form
// (hidden, select, text, number)
// ============================================================

export function _extractFormFields(formHtml) {
  const formData = new URLSearchParams()
  const seen = new Set()

  // Hidden inputs
  for (const m of formHtml.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]*)"[^>]*value="([^"]*)"/gi)) {
    if (!seen.has(m[1])) { formData.append(m[1], m[2]); seen.add(m[1]) }
  }

  // Select elements — use selected option, fallback to first non-empty option
  for (const sel of formHtml.matchAll(/<select[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const name = sel[1]
    if (seen.has(name)) continue
    const selectedMatch = sel[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/i)
    if (selectedMatch) {
      formData.append(name, selectedMatch[1]); seen.add(name)
    } else {
      const firstOpt = sel[2].match(/<option\s+value="([^"]+)"/i)
      if (firstOpt) { formData.append(name, firstOpt[1]); seen.add(name) }
    }
  }

  // Text and number inputs
  for (const m of formHtml.matchAll(/<input[^>]*type="(?:text|number)"[^>]*name="([^"]*)"[^>]*value="([^"]*)"/gi)) {
    if (!seen.has(m[1])) { formData.append(m[1], m[2]); seen.add(m[1]) }
  }
  // Reversed attribute order: name before value
  for (const m of formHtml.matchAll(/<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*type="(?:text|number)"/gi)) {
    if (!seen.has(m[1])) { formData.append(m[1], m[2]); seen.add(m[1]) }
  }
  // Reversed: value before name
  for (const m of formHtml.matchAll(/<input[^>]*value="([^"]*)"[^>]*name="([^"]*)"[^>]*type="(?:text|number)"/gi)) {
    if (!seen.has(m[2])) { formData.append(m[2], m[1]); seen.add(m[2]) }
  }

  return formData
}

// ============================================================
// Fetch any authenticated SSI web page (HTML scraping)
// ============================================================

export async function ssiFetchPage(path, cookies) {
  const url = `${SSI_BASE_URL}${path}`
  const resp = await fetch(url, {
    headers: {
      'Cookie': formatCookies(cookies),
    },
    redirect: 'follow',
  })
  if (!resp.ok) {
    throw new Error(`SSI page HTTP ${resp.status} for ${path}`)
  }
  return await resp.text()
}
