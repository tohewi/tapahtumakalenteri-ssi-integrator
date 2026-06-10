// ============================================================
// Event Form Helpers
//
// Utilities for SSI web-form interactions:
//   - CSRF token fetching (following SSI redirect chains)
//   - URL-encoded form POST
//   - Event URL parsing
//   - Django form error extraction
//   - HTML form field parsing (discipline-agnostic)
//
// Also contains date/time helpers used during event creation
// (normalizeDate, calculateSchedule, etc.).
//
// Exported for use by event-creation-service.js, seed-import.js,
// and event builder modules.
// ============================================================

import { SSI_BASE_URL } from '../ssi-core/constants.js'
import { parseCookies, formatCookies } from '../ssi-core/http-helpers.js'
import { log } from '../logger.js'

// ---- CSRF + Form Helpers ----

/**
 * GET a page, extract CSRF token from cookie or hidden form field.
 * Returns { cookies (merged), csrfToken, html }.
 */
export async function fetchCsrf(url, cookies) {
  // Follow redirects manually to capture set-cookie headers at each step.
  // Node.js fetch with redirect:'follow' doesn't expose intermediate
  // set-cookie headers, so we'd lose the csrftoken cookie that SSI
  // sets during redirect chains.
  let merged = { ...cookies }
  let currentUrl = url
  const maxRedirects = 10

  for (let i = 0; i < maxRedirects; i++) {
    const resp = await fetch(currentUrl, {
      headers: { 'Cookie': formatCookies(merged) },
      redirect: 'manual',
    })

    // Capture cookies from this response
    const setCookies = resp.headers.getSetCookie?.() || []
    const newCookies = parseCookies(setCookies)
    merged = { ...merged, ...newCookies }

    // Follow redirects
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location')
      if (location) {
        currentUrl = location.startsWith('http') ? location : `${SSI_BASE_URL}${location}`
        continue
      }
    }

    if (resp.status !== 200) {
      throw new Error(`SSI page HTTP ${resp.status} for ${currentUrl}`)
    }

    const html = await resp.text()

    // CSRF token from cookie or hidden field
    const csrfFromCookie = merged.csrftoken || null
    const csrfFromHidden = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)?.[1]
      || html.match(/csrfmiddlewaretoken['"]\s*value=['"]([\w]+)['"]/ )?.[1]
      || null
    const csrfToken = csrfFromCookie || csrfFromHidden
    log.debug(`[event-creation] CSRF extraction: cookie=${csrfFromCookie ? 'yes' : 'no'}, hidden=${csrfFromHidden ? csrfFromHidden.substring(0, 10) + '...' : 'no'}, html has csrfmiddlewaretoken: ${html.includes('csrfmiddlewaretoken')}`)

    return { cookies: merged, csrfToken, html }
  }

  throw new Error(`Too many redirects fetching ${url}`)
}

/**
 * POST a URL-encoded form to SSI. Returns the final redirect URL.
 * @param {string} url - POST target
 * @param {object} body - key-value pairs (scalars)
 * @param {object} arrayFields - key → array of values (for multi-select fields)
 * @param {string} csrfToken - CSRF token
 * @param {object} cookies - session cookies
 * @returns {{ finalUrl: string, html: string, cookies: object }}
 */
export async function postForm(url, body, arrayFields, csrfToken, cookies) {
  // Build URL-encoded body from body object (caller includes csrfmiddlewaretoken if needed)
  const pairs = []
  for (const [key, val] of Object.entries(body)) {
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(val ?? '')}`)
  }
  for (const [key, values] of Object.entries(arrayFields || {})) {
    for (const v of values) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
    }
  }
  const encodedBody = pairs.join('&')

  // Build headers — only include X-CSRFToken if we have one
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': formatCookies(cookies),
    'Referer': url,
    'Origin': SSI_BASE_URL,
  }
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken
  }

  // Do NOT follow redirects — we need the Location header to detect success
  // (SSI redirects to /event/{type}/{id}/ on success, back to form on failure)
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: encodedBody,
    redirect: 'manual',
  })

  const setCookies = resp.headers.getSetCookie?.() || []
  const newCookies = parseCookies(setCookies)
  const merged = { ...cookies, ...newCookies }

  // Check for redirect (302/303) — success means redirect to event page
  const location = resp.headers.get('location') || ''
  if (resp.status >= 300 && resp.status < 400 && location) {
    const finalUrl = location.startsWith('http') ? location : `${SSI_BASE_URL}${location}`
    log.info(`[event-creation] Form POST ${resp.status} → ${finalUrl}`)
    return { finalUrl, html: '', cookies: merged, status: resp.status }
  }

  // No redirect — form validation failed, read the HTML for errors
  const html = await resp.text()
  log.info(`[event-creation] Form POST ${resp.status}, no redirect (${html.length} chars HTML)`)
  return { finalUrl: url, html, cookies: merged, status: resp.status }
}

/**
 * Extract event type ID and event ID from an SSI event URL.
 * E.g., /event/136/160/ → { typeId: '136', eventId: '160' }
 */
export function extractEventIds(url) {
  const m = url.match(/\/event\/(\d+)\/(\d+)/)
  if (!m) return null
  return { typeId: m[1], eventId: m[2] }
}

/**
 * Extract validation errors from SSI's Django form HTML response.
 * When a form POST fails validation, SSI returns the form page with
 * <ul class="errorlist"><li>Error message</li></ul> elements.
 */
export function extractFormErrors(html) {
  if (!html) return []
  const errors = []

  // Django errorlist: <ul class="errorlist"><li>message</li></ul>
  const errorListRe = /<ul[^>]*class="[^"]*errorlist[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi
  let match
  while ((match = errorListRe.exec(html)) !== null) {
    const liRe = /<li>([\s\S]*?)<\/li>/gi
    let li
    while ((li = liRe.exec(match[1])) !== null) {
      const text = li[1].replace(/<[^>]+>/g, '').trim()
      if (text) errors.push(text)
    }
  }

  // SSI/SRA error pattern: <ul class="list-unstyled text-danger"><li>message</li></ul>
  // These appear after a <label> identifying the field
  const sraErrorRe = /<ul[^>]*class="[^"]*text-danger[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi
  while ((match = sraErrorRe.exec(html)) !== null) {
    // Try to find the preceding label for context
    const before = html.substring(Math.max(0, match.index - 300), match.index)
    const labelMatch = before.match(/<label[^>]*>([^<]+)<\/label>/gi)
    const fieldName = labelMatch ? labelMatch[labelMatch.length - 1].replace(/<[^>]+>/g, '').trim() : ''
    const liRe = /<li>([\s\S]*?)<\/li>/gi
    let li
    while ((li = liRe.exec(match[1])) !== null) {
      const text = li[1].replace(/<[^>]+>/g, '').trim()
      if (text && !errors.includes(text)) {
        errors.push(fieldName ? `${fieldName}: ${text}` : text)
      }
    }
  }

  // Django alert/message boxes
  const alertRe = /<div[^>]*class="[^"]*(?:alert|error|message)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  while ((match = alertRe.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim()
    if (text && text.length < 200 && !errors.includes(text)) errors.push(text)
  }

  // Check for login page (session expired)
  if (html.includes('id="id_password"') || html.includes('name="password"') && html.includes('Log in')) {
    errors.push('SSI session expired — redirected to login page')
  }

  return errors
}

/**
 * Extract the <title> from an HTML page for diagnostics.
 */
export function extractPageTitle(html) {
  if (!html) return 'empty response'
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim() : 'no title'
}

// ---- Date/Time Helpers ----
// All date arithmetic uses pure string manipulation on YYYY-MM-DD
// to avoid timezone pitfalls. The server runs in UTC but events
// are in Europe/Helsinki. SSI expects dates as YYYY-MM-DD and
// times as HH:mm.

/**
 * Normalize an event date to YYYY-MM-DD string.
 * PostgreSQL DATE columns return JS Date objects, not strings.
 * Also accepts YYYY-MM-DD strings, ISO timestamps, or Date objects.
 */
export function normalizeDate(dateInput) {
  if (!dateInput) throw new Error('Event date is required')
  if (typeof dateInput === 'string') {
    // Already a YYYY-MM-DD string
    const match = dateInput.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
  }
  if (dateInput instanceof Date) {
    // PostgreSQL DATE → extract YYYY-MM-DD in UTC
    const y = dateInput.getUTCFullYear()
    const m = String(dateInput.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dateInput.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  throw new Error(`Invalid event date: ${dateInput}`)
}

/**
 * Format a YYYY-MM-DD date for display in Finnish format (dd.MM.yyyy).
 * Uses pure string manipulation — no Date object needed.
 */
export function formatDisplayDate(isoDate) {
  const [y, m, d] = normalizeDate(isoDate).split('-')
  return `${d}.${m}.${y}`
}

/**
 * Convert Finnish time format (hh.mm) to SSI API format (HH:mm).
 */
export function toSsiTime(finnishTime) {
  if (!finnishTime) return ''
  return finnishTime.replace('.', ':')
}

/**
 * Subtract days from a YYYY-MM-DD date string.
 * Returns YYYY-MM-DD. Uses UTC to avoid DST issues.
 */
export function subtractDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z') // noon UTC to avoid DST edge
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().split('T')[0]
}

/**
 * Calculate registration dates and times from template overrides and event date.
 * All date arithmetic is timezone-safe (UTC-based string manipulation).
 * SSI expects: dates as YYYY-MM-DD, times as HH:mm.
 */
export function calculateSchedule(eventDate, overrides) {
  const isoDate = normalizeDate(eventDate)
  const startTime = toSsiTime(overrides.startTime || '09.00')
  const endTime = toSsiTime(overrides.endTime || '12.00')
  const regDaysBefore = overrides.registrationDaysBeforeEvent || 7
  const regStartTime = toSsiTime(overrides.registrationStartTime || '00.00')

  const regStartDate = subtractDays(isoDate, regDaysBefore)

  // Registration closes 12 hours before start
  const [startH, startM] = startTime.split(':').map(Number)
  let regCloseH = startH - 12
  let regCloseDate = isoDate
  if (regCloseH < 0) {
    // Wraps to previous day
    regCloseH += 24
    regCloseDate = subtractDays(isoDate, 1)
  }
  const regCloseTime = `${String(regCloseH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`

  return {
    isoDate,
    displayDate: formatDisplayDate(isoDate),
    startTime, endTime,
    regStartDate, regStartTime,
    regCloseDate, regCloseTime,
  }
}

// ---- Generic HTML Form Parser ----

/**
 * Parse all form fields from an SSI HTML page.
 * Extracts inputs, selects (with selected option), textareas, and checkboxes.
 * Returns { fields: { key: value }, arrayFields: { key: [values] } }.
 * This allows discipline-agnostic form submission — SSI page provides the
 * correct defaults for discipline-specific fields (weapon_groups, layouts, etc.)
 */
export function parseFormFields(html) {
  const fields = {}
  const arrayFields = {}

  // Extract hidden and text inputs: <input type="..." name="..." value="...">
  // SRA forms use multiple hidden inputs with the same name for array fields
  // (e.g., handgun_divs_0, handgun_divs_1 all with name="handgun_divs")
  const inputRe = /<input[^>]*\sname="([^"]+)"[^>]*>/gi
  let m
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0]
    const name = m[1]
    const type = tag.match(/type="([^"]+)"/i)?.[1]?.toLowerCase() || 'text'
    const value = tag.match(/value="([^"]*)"/i)?.[1] || ''

    if (type === 'checkbox' || type === 'radio') {
      // Checkbox/Radio: only include if checked
      // Radio: keep only the checked value (don't promote to array)
      if (/\bchecked\b/i.test(tag)) {
        if (type === 'radio') {
          // Radio: always overwrite — only one can be checked
          fields[name] = value
        } else if (arrayFields[name]) {
          arrayFields[name].push(value || 'on')
        } else if (name in fields) {
          // Promote scalar to array (multiple checked checkboxes)
          arrayFields[name] = [fields[name], value || 'on']
          delete fields[name]
        } else {
          fields[name] = value || 'on'
        }
      }
    } else if (type !== 'submit' && type !== 'button' && type !== 'file') {
      // Detect duplicate names → promote to array (SRA hidden input arrays)
      if (arrayFields[name]) {
        arrayFields[name].push(value)
      } else if (name in fields) {
        // Same name seen twice → promote to array
        arrayFields[name] = [fields[name], value]
        delete fields[name]
      } else {
        fields[name] = value
      }
    }
  }

  // Extract select fields: <select name="..."><option value="..." selected>...</option></select>
  const selectRe = /<select[^>]*\sname="([^"]+)"[^>]*(?:\smultiple)?[^>]*>([\s\S]*?)<\/select>/gi
  while ((m = selectRe.exec(html)) !== null) {
    const name = m[1]
    const isMultiple = /\bmultiple\b/i.test(m[0])
    const optionsHtml = m[2]

    // Find selected options
    const selectedValues = []
    const optRe = /<option[^>]*value="([^"]*)"[^>]*selected[^>]*>/gi
    let opt
    while ((opt = optRe.exec(optionsHtml)) !== null) {
      selectedValues.push(opt[1])
    }

    if (isMultiple) {
      arrayFields[name] = selectedValues
    } else {
      fields[name] = selectedValues[0] || ''
    }
  }

  // Extract textareas: <textarea name="...">content</textarea>
  const textareaRe = /<textarea[^>]*\sname="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/gi
  while ((m = textareaRe.exec(html)) !== null) {
    fields[m[1]] = m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
  }

  return { fields, arrayFields }
}
