// ============================================================
// Calendar Publishing Service (CAL-4)
// ============================================================
// Orchestrates WordPress authentication and calendar event
// creation/publishing as part of the event execution workflow.
//
// Flow:
//   1. Authenticate to WordPress (wp-auth.js)
//   2. If 2FA required, fetch OTP from Gmail (gmail-otp.js)
//   3. Create draft event (wp-adapter.js createEvent)
//   4. Publish event (wp-adapter.js publishEvent)
//   5. Return calendar reference for storage in scheduled_events
//
// Error handling:
//   Calendar failures do NOT roll back SSI creation.
//   Errors are returned as { success: false, error } for the caller
//   to store in calendarReference and allow manual retry.
//
// Config shapes:
//   calendarConfig (on tenant):
//     { adapter, wpBaseUrl, wpUsername, wpPassword,
//       gmailAddress, gmailAppPassword, gmailSenderFilter, gmailSubjectFilter }
//   calendarTemplate (on match_template):
//     { titleTemplate, shortDescription, contentTemplate, location, mapLink,
//       startTime, endTime, taxonomyIds }
// ============================================================

import { wpLogin, wpSubmitOtp, isAuthenticated } from '../calendar/wp-auth.js'
import { fetchOtpFromGmail } from '../calendar/gmail-otp.js'
import { WpCalendarAdapter } from '../calendar/wp-adapter.js'
import { log } from '../logger.js'

// Max OTP fetch attempts (poll Gmail a few times with delay)
const OTP_MAX_ATTEMPTS = 3
const OTP_RETRY_DELAY_MS = 5000
const OTP_MAX_AGE_MINUTES = 5

/**
 * Validate that calendarConfig has all required fields for WordPress publishing.
 *
 * @param {object} calendarConfig - Tenant's calendar configuration
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateCalendarConfig(calendarConfig) {
  if (!calendarConfig) return { valid: false, missing: ['calendarConfig'] }

  const required = ['wpBaseUrl', 'wpUsername', 'wpPassword']
  const missing = required.filter(f => !calendarConfig[f])

  return { valid: missing.length === 0, missing }
}

/**
 * Validate that calendarTemplate has minimum required fields.
 *
 * @param {object} calendarTemplate - Template's calendar configuration
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateCalendarTemplate(calendarTemplate) {
  if (!calendarTemplate || Object.keys(calendarTemplate).length === 0) {
    return { valid: false, missing: ['calendarTemplate'] }
  }

  // titleTemplate is the only truly required field — others have defaults
  const required = ['titleTemplate']
  const missing = required.filter(f => !calendarTemplate[f])

  return { valid: missing.length === 0, missing }
}

/**
 * Authenticate to WordPress, handling 2FA via Gmail OTP if needed.
 *
 * @param {object} calendarConfig - Tenant calendar config
 * @returns {Promise<object>} Authenticated WP session
 * @throws {Error} If authentication fails
 */
export async function authenticateToWordPress(calendarConfig, { retryDelayMs = OTP_RETRY_DELAY_MS, maxAttempts = OTP_MAX_ATTEMPTS } = {}) {
  const { wpBaseUrl, wpUsername, wpPassword } = calendarConfig

  log.info(`[calendar-publish] Authenticating to WordPress: ${wpBaseUrl}`)

  const session = await wpLogin({
    baseUrl: wpBaseUrl,
    username: wpUsername,
    password: wpPassword,
  })

  if (!session.needs2fa) {
    if (!isAuthenticated(session)) {
      throw new Error('WordPress login failed — no 2FA required but session not authenticated')
    }
    log.info('[calendar-publish] WordPress login successful (no 2FA)')
    return session
  }

  // 2FA required — try to fetch OTP from Gmail
  log.info('[calendar-publish] 2FA required — fetching OTP from Gmail...')

  const { gmailAddress, gmailAppPassword, gmailSenderFilter, gmailSubjectFilter } = calendarConfig

  if (!gmailAddress || !gmailAppPassword) {
    throw new Error('WordPress 2FA required but Gmail credentials not configured in calendarConfig')
  }

  // Poll for OTP with retries (email delivery may be delayed)
  let otpCode = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      log.debug(`[calendar-publish] OTP attempt ${attempt}/${maxAttempts}, waiting ${retryDelayMs}ms...`)
      await new Promise(r => setTimeout(r, retryDelayMs))
    }

    otpCode = await fetchOtpFromGmail({
      gmailAddress,
      appPassword: gmailAppPassword,
      senderFilter: gmailSenderFilter || 'wordpress@',
      subjectFilter: gmailSubjectFilter || 'Login Confirmation',
      maxAgeMinutes: OTP_MAX_AGE_MINUTES,
    })

    if (otpCode) break
  }

  if (!otpCode) {
    throw new Error(`Could not fetch OTP from Gmail after ${maxAttempts} attempts`)
  }

  log.info(`[calendar-publish] OTP retrieved, submitting to WordPress...`)
  const otpResult = await wpSubmitOtp(session, otpCode)

  if (!isAuthenticated(otpResult)) {
    throw new Error('WordPress 2FA verification failed — OTP may be expired or invalid')
  }

  log.info('[calendar-publish] WordPress 2FA login successful')
  return otpResult
}

/**
 * Build the event title from calendarTemplate and event data.
 * Supports placeholders: {date}, {cupName}, {cupId}, {cupUrl}
 *
 * @param {object} calendarTemplate - Template calendar config
 * @param {object} context - { eventDate, ssiReferences }
 * @returns {string} Resolved event title
 */
export function buildEventTitle(calendarTemplate, context) {
  const { eventDate, ssiReferences } = context
  const date = new Date(eventDate)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  const displayDate = `${dd}.${mm}.${yyyy}`

  let title = calendarTemplate.titleTemplate || 'Event {date}'
  title = title.replace(/\{date\}/gi, displayDate)
  title = title.replace(/\{cupName\}/gi, ssiReferences?.cupName || '')
  title = title.replace(/\{cupId\}/gi, ssiReferences?.cupId || '')
  title = title.replace(/\{cupUrl\}/gi, ssiReferences?.cupUrl || '')

  return title.trim()
}

/**
 * Build the event content from calendarTemplate, replacing SSI references.
 *
 * @param {object} calendarTemplate - Template calendar config
 * @param {object} ssiReferences - SSI event references
 * @returns {string} HTML content for the calendar event
 */
export function buildEventContent(calendarTemplate, ssiReferences) {
  let content = calendarTemplate.contentTemplate || ''

  content = content.replace(/\{ssiCupUrl\}/gi, ssiReferences?.cupUrl || '')
  content = content.replace(/\{ssiCupName\}/gi, ssiReferences?.cupName || '')
  content = content.replace(/\{ssiCupId\}/gi, ssiReferences?.cupId || '')

  return content
}

/**
 * Publish a calendar event for a scheduled event that has been created in SSI.
 *
 * This is the main orchestration function called from the execute endpoint
 * or the manual retry endpoint.
 *
 * @param {object} params
 * @param {object} params.calendarConfig - Tenant's calendar configuration
 * @param {object} params.calendarTemplate - Template's calendar template config
 * @param {string} params.eventDate - Event date (YYYY-MM-DD)
 * @param {object} params.ssiReferences - SSI references from event creation
 * @param {function} [params.onProgress] - Optional progress callback
 * @returns {Promise<{success: boolean, calendarReference?: object, error?: string}>}
 */
export async function publishCalendarEvent({
  calendarConfig,
  calendarTemplate,
  eventDate,
  ssiReferences,
  onProgress,
}) {
  const progress = onProgress || (() => {})

  try {
    // Validate config
    const configCheck = validateCalendarConfig(calendarConfig)
    if (!configCheck.valid) {
      return { success: false, error: `Calendar config missing: ${configCheck.missing.join(', ')}` }
    }

    const templateCheck = validateCalendarTemplate(calendarTemplate)
    if (!templateCheck.valid) {
      return { success: false, error: `Calendar template missing: ${templateCheck.missing.join(', ')}` }
    }

    // Only WordPress adapter is currently supported
    if (calendarConfig.adapter && calendarConfig.adapter !== 'wordpress') {
      return { success: false, error: `Unsupported calendar adapter: ${calendarConfig.adapter}` }
    }

    // Step 1: Authenticate to WordPress
    progress('calendar_auth', 'Authenticating to WordPress...')
    const session = await authenticateToWordPress(calendarConfig)

    // Step 2: Create calendar event
    progress('calendar_create', 'Creating calendar event...')
    const adapter = new WpCalendarAdapter(session)
    const date = new Date(eventDate)

    const title = buildEventTitle(calendarTemplate, { eventDate, ssiReferences })
    const content = buildEventContent(calendarTemplate, ssiReferences)

    const eventResult = await adapter.createEvent({
      title,
      date,
      startTime: calendarTemplate.startTime || '09.00',
      endTime: calendarTemplate.endTime || '12.00',
      shortDescription: calendarTemplate.shortDescription || '',
      content,
      location: calendarTemplate.location || '',
      mapLink: calendarTemplate.mapLink || '',
      ssiCupUrl: ssiReferences?.cupUrl || '',
      ssiCupId: ssiReferences?.cupId,
      taxonomyIds: calendarTemplate.taxonomyIds || [],
    })

    log.info(`[calendar-publish] Draft event created: ID=${eventResult.eventId}`)

    // Step 3: Publish the event
    progress('calendar_publish', 'Publishing calendar event...')
    const publishResult = await adapter.publishEvent(eventResult.eventId)

    const calendarReference = {
      eventId: eventResult.eventId,
      eventUrl: eventResult.eventUrl,
      editUrl: eventResult.editUrl,
      title,
      status: publishResult.status,
      publishedAt: new Date().toISOString(),
    }

    if (publishResult.status === 'publish') {
      log.info(`[calendar-publish] Calendar event published: ${title} → ID=${eventResult.eventId}`)
      progress('calendar_done', 'Calendar event published')
      return { success: true, calendarReference }
    }

    // Publish returned unknown status — event was created but may not be public
    log.warn(`[calendar-publish] Calendar event created but publish status uncertain: ${publishResult.status}`)
    calendarReference.warning = 'Publish status uncertain — verify manually'
    return { success: true, calendarReference }

  } catch (err) {
    log.error(`[calendar-publish] Calendar publishing failed: ${err.message}`)
    return {
      success: false,
      error: err.message,
      calendarReference: {
        status: 'error',
        error: err.message,
        failedAt: new Date().toISOString(),
      },
    }
  }
}
