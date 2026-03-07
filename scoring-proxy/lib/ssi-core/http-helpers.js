// ============================================================
// SSI Core — HTTP Helpers Domain
// Cookie parsing/formatting and generic authenticated page fetch.
// ============================================================

import { SSI_BASE_URL } from './constants.js'

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
