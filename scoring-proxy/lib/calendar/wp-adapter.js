// ============================================================
// WordPress Calendar Adapter — Cycle 1 (CAL-3)
// ============================================================
// Creates and publishes events in WordPress Tapahtumakalenteri
// via admin form POST (web scraping approach matching the legacy
// PowerShell script New-TapahtumakalenteriEvent.ps1).
//
// Cycle 1: createEvent + publishEvent
// Cycle 2 (future): updateEvent, getEvent, deleteEvent
//
// Usage:
//   import { WpCalendarAdapter } from './wp-adapter.js'
//   const adapter = new WpCalendarAdapter(wpSession)
//   const event = await adapter.createEvent({ title, date, ... })
//   await adapter.publishEvent(event.eventId)
// ============================================================

import { log } from '../logger.js'

// ---- ACF Field Keys ----
// WordPress Advanced Custom Fields IDs from the Tapahtumakalenteri theme.
// These are stable — they're defined in the theme's field group configuration.

export const ACF_FIELDS = {
  shortDescription: 'field_5d3e9d9626a82',     // Lyhyt kuvaus (textarea)
  content:          'field_5d3e9dc926a83',      // Sisältö (wysiwyg)
  startDate:        'field_5d3e9ddc26a84',      // Alkamispäivä (date YYYYMMDD)
  endDate:          'field_5d3e9e5f26a85',      // Päättymispäivä (date YYYYMMDD)
  time:             'field_62949bdcbb12e',       // Aika (text)
  locationGroup:    'field_5d3e9efab663d',      // Tapahtuman sijainti (group)
  locationAddress:  'field_5d3e9f0fb663e',      // Osoite (textarea, nested under group)
  locationMapLink:  'field_5d3e9f28b663f',      // Karttalinkki (url, nested under group)
  addRegistration:  'field_5f080bdf06c9a',      // Lisää ilmoittautumislomake (checkbox)
  registrationEmail:'field_5f080c0306c9b',      // Sähköpostiosoite (email)
  shotsFired:       'field_4k2esk3rske32',      // Ammuttujen laukausten lukumäärä (number)
  attendeeCount:    'field_6j3ak3kj2kjs2',      // Osallistujien lukumäärä (number)
  eventCount:       'field_4k3ak3sj2kj6b',      // Tapahtumien lukumäärä (number)
}

// ---- Internal helpers ----

/**
 * Extract nonce tokens and post ID from WordPress new-event form HTML.
 * @param {string} html - HTML of /wp-admin/post-new.php?post_type=event
 * @returns {{ wpNonce: string|null, postId: string|null, acfNonce: string|null }}
 */
export function extractFormTokens(html) {
  if (!html) return { wpNonce: null, postId: null, acfNonce: null }

  const wpNonceMatch = html.match(/id="_wpnonce"\s+name="_wpnonce"\s+value="([^"]+)"/)
  const postIdMatch = html.match(/id=['"]post_ID['"]\s+name=['"]post_ID['"]\s+value=['"](\d+)['"]/)
  const acfNonceMatch = html.match(/id="_acf_nonce"\s+name="_acf_nonce"\s+value="([^"]+)"/)

  return {
    wpNonce: wpNonceMatch?.[1] || null,
    postId: postIdMatch?.[1] || null,
    acfNonce: acfNonceMatch?.[1] || null,
  }
}

/**
 * Format a Date as YYYYMMDD for ACF date fields.
 * @param {Date} date
 * @returns {string}
 */
export function formatAcfDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * Generate a WordPress permalink slug for a calendar event.
 * Format: kupittaan-ampumavuoro-dd-MM-yyyy[-cupNNN]
 * @param {Date} date
 * @param {number|string} [ssiCupId]
 * @returns {string}
 */
export function generateSlug(date, ssiCupId) {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  let slug = `kupittaan-ampumavuoro-${dd}-${mm}-${yyyy}`
  if (ssiCupId) slug += `-cup${ssiCupId}`
  return slug
}

/**
 * Build URL-encoded form body for WordPress post creation.
 * Handles repeated keys (taxonomy arrays) which URLSearchParams can't do natively.
 *
 * @param {object} fields - Key-value pairs (values are strings)
 * @param {number[]} [taxonomyIds] - Event format taxonomy IDs (repeated key)
 * @returns {string} URL-encoded form body
 */
export function buildFormBody(fields, taxonomyIds = []) {
  const parts = []

  for (const [key, value] of Object.entries(fields)) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value ?? '')}`)
  }

  // Taxonomy IDs need repeated keys: tax_input[eventformat][]=50&tax_input[eventformat][]=52
  for (const taxId of taxonomyIds) {
    parts.push(`${encodeURIComponent('tax_input[eventformat][]')}=${encodeURIComponent(String(taxId))}`)
  }

  return parts.join('&')
}

/**
 * Perform a fetch using the WP session's cookie jar.
 * Follows redirects manually to capture cookies at each hop.
 *
 * @param {object} session - WpSession from wp-auth.js
 * @param {string} url - Request URL
 * @param {object} [options] - Fetch options (method, headers, body)
 * @returns {Promise<{response: Response, body: string, finalUrl: string}>}
 */
async function wpFetch(session, url, options = {}) {
  const jar = session.cookieJar
  let currentUrl = url
  let response

  for (let i = 0; i < 6; i++) {
    const cookieHeader = jar.getCookieStringSync(currentUrl)
    const headers = { ...options.headers }
    if (cookieHeader) headers['Cookie'] = cookieHeader

    response = await fetch(currentUrl, {
      ...options,
      headers,
      redirect: 'manual',
    })

    // Collect cookies from response
    const setCookies = response.headers.getSetCookie?.() || []
    for (const raw of setCookies) {
      try { jar.setCookieSync(raw, currentUrl) } catch { /* ignore malformed */ }
    }

    const location = response.headers.get('location')
    if (location && [301, 302, 303].includes(response.status)) {
      currentUrl = new URL(location, currentUrl).href
      // POST redirects become GET
      if (options.method === 'POST') {
        options = { ...options, method: 'GET', body: undefined }
        if (options.headers) delete options.headers['Content-Type']
      }
      continue
    }
    break
  }

  const body = await response.text()
  return { response, body, finalUrl: currentUrl }
}

// ---- Public API ----

export class WpCalendarAdapter {
  /**
   * @param {object} session - Authenticated WpSession from wp-auth.js
   */
  constructor(session) {
    if (!session?.authenticated) {
      throw new Error('[wp-adapter] Session must be authenticated')
    }
    this.session = session
    this.baseUrl = session.baseUrl
  }

  /**
   * Create a new calendar event as a draft in WordPress.
   *
   * @param {object} params
   * @param {string} params.title - Event title (e.g., "Kupittaan ampumavuoro 31.01.2026")
   * @param {Date} params.date - Event date
   * @param {string} [params.startTime='09.00'] - Start time string
   * @param {string} [params.endTime='12.00'] - End time string
   * @param {string} [params.shortDescription] - Short description/excerpt
   * @param {string} [params.content] - Full HTML content
   * @param {string} [params.location='Kupittaan urheiluhallin ampumarata'] - Address
   * @param {string} [params.mapLink] - Google Maps URL
   * @param {string} [params.ssiCupUrl] - SSI Cup URL for cross-reference
   * @param {number|string} [params.ssiCupId] - SSI Cup ID for permalink
   * @param {number[]} [params.taxonomyIds] - Event format taxonomy IDs
   * @returns {Promise<{eventId: string, eventUrl: string, editUrl: string, status: string, title: string}>}
   */
  async createEvent({
    title,
    date,
    startTime = '09.00',
    endTime = '12.00',
    shortDescription = '',
    content = '',
    location = 'Kupittaan urheiluhallin ampumarata',
    mapLink = '',
    ssiCupUrl = '',
    ssiCupId,
    taxonomyIds = [],
  }) {
    if (!title || !date) {
      throw new Error('[wp-adapter] title and date are required')
    }

    log.info(`[wp-adapter] Creating calendar event: ${title}`)

    // Step 1: Fetch the new event form to get nonces and post ID
    const newEventUrl = `${this.baseUrl}/wp-admin/post-new.php?post_type=event`
    const { body: formHtml } = await wpFetch(this.session, newEventUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    const tokens = extractFormTokens(formHtml)
    if (!tokens.wpNonce || !tokens.postId) {
      throw new Error(`[wp-adapter] Could not extract form tokens from new event page (wpNonce: ${tokens.wpNonce}, postId: ${tokens.postId})`)
    }

    log.debug(`[wp-adapter] Got tokens: postId=${tokens.postId}`)

    // Step 2: Build form data
    const dateFormatted = formatAcfDate(date)
    const timeString = `Klo ${startTime}-${endTime}`
    const postSlug = generateSlug(date, ssiCupId)

    const fields = {
      // WordPress core fields
      '_wpnonce': tokens.wpNonce,
      '_wp_http_referer': '/wp-admin/post-new.php?post_type=event',
      'action': 'editpost',
      'originalaction': 'editpost',
      'post_type': 'event',
      'original_post_status': 'auto-draft',
      'post_ID': tokens.postId,
      'post_title': title,
      'post_name': postSlug,
      'post_status': 'draft',

      // ACF control fields
      '_acf_screen': 'post',
      '_acf_post_id': tokens.postId,
      '_acf_validation': '1',
      '_acf_nonce': tokens.acfNonce || '',
      '_acf_changed': '1',

      // ACF content fields
      [`acf[${ACF_FIELDS.shortDescription}]`]: shortDescription,
      [`acf[${ACF_FIELDS.content}]`]: content,
      [`acf[${ACF_FIELDS.startDate}]`]: dateFormatted,
      [`acf[${ACF_FIELDS.endDate}]`]: dateFormatted,
      [`acf[${ACF_FIELDS.time}]`]: timeString,
      [`acf[${ACF_FIELDS.locationGroup}][${ACF_FIELDS.locationAddress}]`]: location,
      [`acf[${ACF_FIELDS.locationGroup}][${ACF_FIELDS.locationMapLink}]`]: mapLink,
      [`acf[${ACF_FIELDS.addRegistration}]`]: '0',
    }

    const formBody = buildFormBody(fields, taxonomyIds)

    // Step 3: POST the form
    const postUrl = `${this.baseUrl}/wp-admin/post.php`
    const { body: responseHtml, finalUrl } = await wpFetch(this.session, postUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Origin': this.baseUrl,
        'Referer': newEventUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    })

    // Step 4: Determine the created post ID from redirect or response
    let createdPostId = tokens.postId

    // Check if redirected to post.php?post=NNN&action=edit
    const redirectMatch = finalUrl.match(/post=(\d+)/)
    if (redirectMatch) {
      createdPostId = redirectMatch[1]
    }

    // Check for WordPress message codes (10=draft saved, 1=post updated)
    const messageMatch = finalUrl.match(/message=(\d+)/)
    const isSuccess = messageMatch && ['1', '10'].includes(messageMatch[1])

    // Also check HTML for edit page indicators
    const hasEditPage = responseHtml.includes('post_ID') || responseHtml.includes('post-body')

    if (!isSuccess && !hasEditPage && !redirectMatch) {
      log.warn(`[wp-adapter] Event creation uncertain. Final URL: ${finalUrl}`)
    }

    const result = {
      eventId: createdPostId,
      eventUrl: `${this.baseUrl}/?post_type=event&p=${createdPostId}&preview=true`,
      editUrl: `${this.baseUrl}/wp-admin/post.php?post=${createdPostId}&action=edit`,
      status: 'draft',
      title,
    }

    log.info(`[wp-adapter] Event created as draft: ID=${createdPostId}`)
    return result
  }

  /**
   * Publish a draft event (change post_status from draft to publish).
   *
   * @param {string} eventId - WordPress post ID
   * @returns {Promise<{eventId: string, status: string}>}
   */
  async publishEvent(eventId) {
    if (!eventId) throw new Error('[wp-adapter] eventId is required')

    log.info(`[wp-adapter] Publishing event ${eventId}...`)

    // Step 1: Fetch the edit page to get current nonces
    const editUrl = `${this.baseUrl}/wp-admin/post.php?post=${eventId}&action=edit`
    const { body: editHtml } = await wpFetch(this.session, editUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    const tokens = extractFormTokens(editHtml)
    if (!tokens.wpNonce) {
      throw new Error(`[wp-adapter] Could not extract nonce from edit page for post ${eventId}`)
    }

    // Step 2: POST the status change
    const fields = {
      '_wpnonce': tokens.wpNonce,
      '_wp_http_referer': `/wp-admin/post.php?post=${eventId}&action=edit`,
      'action': 'editpost',
      'originalaction': 'editpost',
      'post_type': 'event',
      'original_post_status': 'draft',
      'post_ID': eventId,
      'post_status': 'publish',
      // ACF fields to prevent clearing them
      '_acf_screen': 'post',
      '_acf_post_id': eventId,
      '_acf_nonce': tokens.acfNonce || '',
    }

    const formBody = buildFormBody(fields)
    const postUrl = `${this.baseUrl}/wp-admin/post.php`

    const { finalUrl } = await wpFetch(this.session, postUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Origin': this.baseUrl,
        'Referer': editUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    })

    // Check for success (message=1 = post updated)
    const messageMatch = finalUrl.match(/message=(\d+)/)
    if (messageMatch && messageMatch[1] === '1') {
      log.info(`[wp-adapter] Event ${eventId} published successfully`)
      return { eventId, status: 'publish' }
    }

    log.warn(`[wp-adapter] Event ${eventId} publish may have failed. Final URL: ${finalUrl}`)
    return { eventId, status: 'unknown' }
  }
}
