// ============================================================
// WordPress Calendar Adapter (CAL-3)
// ============================================================
// Full CRUD for WordPress Tapahtumakalenteri events via admin
// form POST (web scraping approach matching the legacy PowerShell
// scripts New-TapahtumakalenteriEvent.ps1 and
// Update-TapahtumakalenteriEvent.ps1).
//
// Public API:
//   createEvent(params)     — create draft event with ACF fields
//   publishEvent(eventId)   — change status from draft to publish
//   updateEvent(eventId, changes) — update ACF fields on existing event
//   getEvent(eventId)       — read event details from edit page
//   deleteEvent(eventId)    — trash a post via WP admin
//   findEventBySlug(slug)   — search events by permalink slug
//
// Usage:
//   import { WpCalendarAdapter } from './wp-adapter.js'
//   const adapter = new WpCalendarAdapter(wpSession)
//   const event = await adapter.createEvent({ title, date, ... })
//   await adapter.publishEvent(event.eventId)
//   await adapter.updateEvent(event.eventId, { shotsFired: 500, attendeeCount: 5 })
//   const details = await adapter.getEvent(event.eventId)
//   await adapter.deleteEvent(event.eventId)
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
 * Extract ACF field values from a WordPress edit page HTML.
 * Looks for input/textarea elements with name="acf[field_xxx]" or similar patterns.
 *
 * @param {string} html - HTML of the WordPress edit page
 * @returns {object} Map of ACF field key → value
 */
export function extractAcfFieldValues(html) {
  if (!html) return {}

  const values = {}

  // Match input fields: <input ... name="acf[field_xxx]" ... value="yyy" />
  // Anchored to <input to prevent matching across elements
  const inputPattern = /<input\s[^>]*?name="acf\[([^\]]+)\](?:\[([^\]]+)\])?"[^>]*?value="([^"]*)"/g
  let match
  while ((match = inputPattern.exec(html)) !== null) {
    const fieldKey = match[1]
    const nestedKey = match[2]
    const value = match[3]
    if (nestedKey) {
      if (!values[fieldKey]) values[fieldKey] = {}
      values[fieldKey][nestedKey] = value
    } else {
      values[fieldKey] = value
    }
  }

  // Match textarea fields: <textarea ... name="acf[field_xxx]">content</textarea>
  // Anchored to <textarea to prevent matching input elements
  const textareaPattern = /<textarea\s[^>]*?name="acf\[([^\]]+)\](?:\[([^\]]+)\])?"[^>]*?>([\s\S]*?)<\/textarea>/g
  while ((match = textareaPattern.exec(html)) !== null) {
    const fieldKey = match[1]
    const nestedKey = match[2]
    const value = match[3].trim()
    if (nestedKey) {
      if (!values[fieldKey]) values[fieldKey] = {}
      values[fieldKey][nestedKey] = value
    } else {
      values[fieldKey] = value
    }
  }

  return values
}

/**
 * Extract the post title from a WordPress edit page.
 * @param {string} html
 * @returns {string|null}
 */
export function extractPostTitle(html) {
  if (!html) return null
  const match = html.match(/name="post_title"[^>]*value="([^"]*)"/)
  return match?.[1] || null
}

/**
 * Extract the post status from a WordPress edit page.
 * @param {string} html
 * @returns {string|null}
 */
export function extractPostStatus(html) {
  if (!html) return null
  // Hidden input: <input type="hidden" id="original_post_status" name="original_post_status" value="publish" />
  const match = html.match(/name="original_post_status"[^>]*value="([^"]*)"/)
    || html.match(/id="post_status"[^>]*value="([^"]*)"/)
  return match?.[1] || null
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

    // Step 2: Read current ACF field values so they are preserved during publish.
    // WordPress/ACF clears any ACF fields not included in the POST body.
    const currentAcf = extractAcfFieldValues(editHtml)
    const currentTitle = extractPostTitle(editHtml)

    // Step 3: POST the status change with all current ACF values re-submitted
    const fields = {
      '_wpnonce': tokens.wpNonce,
      '_wp_http_referer': `/wp-admin/post.php?post=${eventId}&action=edit`,
      'action': 'editpost',
      'originalaction': 'editpost',
      'post_type': 'event',
      'original_post_status': 'draft',
      'post_ID': eventId,
      'post_title': currentTitle || '',
      'post_status': 'publish',
      // ACF control fields
      '_acf_screen': 'post',
      '_acf_post_id': eventId,
      '_acf_nonce': tokens.acfNonce || '',
      '_acf_changed': '0',
    }

    // Re-submit all current ACF field values to prevent WordPress from clearing them
    for (const [fieldKey, value] of Object.entries(currentAcf)) {
      if (typeof value === 'object' && value !== null) {
        // Nested fields (e.g., location group)
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          fields[`acf[${fieldKey}][${nestedKey}]`] = nestedValue || ''
        }
      } else {
        fields[`acf[${fieldKey}]`] = value || ''
      }
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

  /**
   * Update an existing event's ACF fields (e.g., statistics after event completion).
   *
   * @param {string} eventId - WordPress post ID
   * @param {object} changes - Fields to update
   * @param {number} [changes.shotsFired] - Ammuttujen laukausten lukumäärä
   * @param {number} [changes.attendeeCount] - Osallistujien lukumäärä
   * @param {number} [changes.eventCount] - Tapahtumien lukumäärä
   * @param {string} [changes.shortDescription] - Updated short description
   * @param {string} [changes.content] - Updated HTML content
   * @param {string} [changes.postStatus] - Post status to set (default: keep current)
   * @returns {Promise<{eventId: string, status: string}>}
   */
  async updateEvent(eventId, changes = {}) {
    if (!eventId) throw new Error('[wp-adapter] eventId is required')

    log.info(`[wp-adapter] Updating event ${eventId}...`)

    // Step 1: Fetch the edit page to get nonces and current status
    const editUrl = `${this.baseUrl}/wp-admin/post.php?post=${eventId}&action=edit`
    const { body: editHtml } = await wpFetch(this.session, editUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    const tokens = extractFormTokens(editHtml)
    if (!tokens.wpNonce) {
      throw new Error(`[wp-adapter] Could not extract nonce from edit page for post ${eventId}`)
    }

    const currentStatus = extractPostStatus(editHtml) || 'publish'

    // Step 2: Build form data with only the changed ACF fields
    const fields = {
      '_wpnonce': tokens.wpNonce,
      '_wp_http_referer': `/wp-admin/post.php?post=${eventId}&action=edit`,
      'action': 'editpost',
      'originalaction': 'editpost',
      'post_type': 'event',
      'post_ID': eventId,
      'post_status': changes.postStatus || currentStatus,
      '_acf_screen': 'post',
      '_acf_post_id': eventId,
      '_acf_nonce': tokens.acfNonce || '',
      '_acf_changed': '1',
    }

    // Map changes to ACF field keys
    if (changes.shotsFired !== undefined) {
      fields[`acf[${ACF_FIELDS.shotsFired}]`] = String(changes.shotsFired)
    }
    if (changes.attendeeCount !== undefined) {
      fields[`acf[${ACF_FIELDS.attendeeCount}]`] = String(changes.attendeeCount)
    }
    if (changes.eventCount !== undefined) {
      fields[`acf[${ACF_FIELDS.eventCount}]`] = String(changes.eventCount)
    }
    if (changes.shortDescription !== undefined) {
      fields[`acf[${ACF_FIELDS.shortDescription}]`] = changes.shortDescription
    }
    if (changes.content !== undefined) {
      fields[`acf[${ACF_FIELDS.content}]`] = changes.content
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
      log.info(`[wp-adapter] Event ${eventId} updated successfully`)
      return { eventId, status: 'updated' }
    }

    log.warn(`[wp-adapter] Event ${eventId} update uncertain. Final URL: ${finalUrl}`)
    return { eventId, status: 'unknown' }
  }

  /**
   * Get event details by reading the WordPress edit page.
   *
   * @param {string} eventId - WordPress post ID
   * @returns {Promise<{eventId: string, title: string|null, status: string|null, acfFields: object, editUrl: string}>}
   */
  async getEvent(eventId) {
    if (!eventId) throw new Error('[wp-adapter] eventId is required')

    log.info(`[wp-adapter] Fetching event ${eventId}...`)

    const editUrl = `${this.baseUrl}/wp-admin/post.php?post=${eventId}&action=edit`
    const { body: editHtml } = await wpFetch(this.session, editUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    // Check if the page loaded (has post form)
    if (!editHtml.includes('post_ID')) {
      throw new Error(`[wp-adapter] Could not load edit page for post ${eventId}`)
    }

    const title = extractPostTitle(editHtml)
    const status = extractPostStatus(editHtml)
    const acfFields = extractAcfFieldValues(editHtml)

    return {
      eventId,
      title,
      status,
      acfFields,
      editUrl,
    }
  }

  /**
   * Delete (trash) a WordPress event post.
   * Uses the admin trash action URL with nonce.
   *
   * @param {string} eventId - WordPress post ID
   * @returns {Promise<{eventId: string, status: string}>}
   */
  async deleteEvent(eventId) {
    if (!eventId) throw new Error('[wp-adapter] eventId is required')

    log.info(`[wp-adapter] Trashing event ${eventId}...`)

    // WordPress trash URL format: /wp-admin/post.php?post=NNN&action=trash&_wpnonce=xxx
    // We need a nonce first — fetch the edit page
    const editUrl = `${this.baseUrl}/wp-admin/post.php?post=${eventId}&action=edit`
    const { body: editHtml } = await wpFetch(this.session, editUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    // Extract the trash nonce from the "Move to Trash" link
    // Pattern: href="...action=trash&amp;_wpnonce=xxx" or href="...action=trash&_wpnonce=xxx"
    const trashNonceMatch = editHtml.match(/action=trash&(?:amp;)?_wpnonce=([a-zA-Z0-9_]+)/)
    if (!trashNonceMatch) {
      throw new Error(`[wp-adapter] Could not extract trash nonce for post ${eventId}`)
    }
    const trashNonce = trashNonceMatch[1]

    // Navigate to the trash URL
    const trashUrl = `${this.baseUrl}/wp-admin/post.php?post=${eventId}&action=trash&_wpnonce=${trashNonce}`
    const { finalUrl } = await wpFetch(this.session, trashUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    // Success: redirects to edit.php?post_type=event&trashed=1
    if (finalUrl.includes('trashed=1') || finalUrl.includes('trashed%3D1')) {
      log.info(`[wp-adapter] Event ${eventId} trashed successfully`)
      return { eventId, status: 'trashed' }
    }

    log.warn(`[wp-adapter] Event ${eventId} trash uncertain. Final URL: ${finalUrl}`)
    return { eventId, status: 'unknown' }
  }

  /**
   * Find a calendar event by searching for a permalink slug.
   * Uses WordPress admin post search (edit.php?post_type=event&s=slug).
   *
   * @param {string} slug - Slug or partial slug to search for (e.g., 'cup141')
   * @returns {Promise<{eventId: string|null, editUrl: string|null}>}
   */
  async findEventBySlug(slug) {
    if (!slug) throw new Error('[wp-adapter] slug is required')

    log.info(`[wp-adapter] Searching for event with slug containing: ${slug}`)

    const searchUrl = `${this.baseUrl}/wp-admin/edit.php?post_type=event&s=${encodeURIComponent(slug)}`
    const { body: searchHtml } = await wpFetch(this.session, searchUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    // Look for post.php?post=NNN&action=edit in search results
    const postMatch = searchHtml.match(/post\.php\?post=(\d+)&(?:amp;)?action=edit/)
    if (postMatch) {
      const eventId = postMatch[1]
      log.info(`[wp-adapter] Found event: Post ID ${eventId}`)
      return {
        eventId,
        editUrl: `${this.baseUrl}/wp-admin/post.php?post=${eventId}&action=edit`,
      }
    }

    log.info(`[wp-adapter] No event found for slug: ${slug}`)
    return { eventId: null, editUrl: null }
  }
}
