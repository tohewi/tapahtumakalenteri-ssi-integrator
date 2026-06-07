// ============================================================
// SSI Core — Scoring Domain
// ============================================================

import { SSI_BASE_URL } from './constants.js'
import { parseCookies, formatCookies } from './graphql.js'

// ============================================================
// GET scoring page — extract form action
//
// NOTE: SSI scoring page does NOT use CSRF tokens (verified
// 2026-02-06). The form at /nordic/competitor/{id}/score-in-match/
// has no csrfmiddlewaretoken field and no csrftoken cookie is set.
// Session cookie alone is sufficient for authentication.
// ============================================================

export async function ssiGetScoringPage(competitorId, cookies) {
  const url = `${SSI_BASE_URL}/nordic/competitor/${competitorId}/score-in-match/`

  const resp = await fetch(url, {
    headers: {
      'Cookie': formatCookies(cookies),
    },
    redirect: 'follow',
  })

  if (!resp.ok) {
    throw new Error(`Scoring page HTTP ${resp.status} for competitor ${competitorId}`)
  }

  const html = await resp.text()

  // SSI scoring page has no CSRF token (verified 2026-02-06).
  // Defensive: still check in case SSI re-enables it later.
  const csrfMatch = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)
  const sc = resp.headers.getSetCookie?.() || []
  const respCookies = parseCookies(sc)
  const csrfToken = csrfMatch?.[1] || respCookies.csrftoken || cookies.csrftoken || null

  // Extract form action
  const actionMatch = html.match(/<form[^>]*action="([^"]*)"/)
  const formAction = actionMatch ? actionMatch[1] : url

  return {
    csrfToken,
    formAction: formAction || url,
    html,
  }
}

// ============================================================
// POST score form to SSI
// ============================================================

export async function ssiSubmitScore(competitorId, formData, cookies, csrfToken) {
  const url = `${SSI_BASE_URL}/nordic/competitor/${competitorId}/score-in-match/`

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': formatCookies(cookies),
    'Referer': url,
    'Origin': SSI_BASE_URL,
  }
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: formData.toString(),
    redirect: 'manual',
  })

  // Django typically redirects on success (302)
  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Score submitted successfully' }
  }

  // 200 might mean validation error — check the response
  if (resp.status === 200) {
    const html = await resp.text()
    if (html.includes('errorlist')) {
      const errorMatch = html.match(/<ul class="errorlist"[^>]*>([\s\S]*?)<\/ul>/)
      const errorText = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown validation error'
      return { success: false, message: errorText }
    }
    // If no errors visible, it might have succeeded without redirect
    return { success: true, message: 'Score submitted (no redirect)' }
  }

  throw new Error(`Score submission failed with HTTP ${resp.status}`)
}
