// ============================================================
// Calendar Data Integrity Service (CAL-6)
// ============================================================
// Cross-reference validation between SSI events and WordPress
// calendar events. Replaces Test-EventIntegrity.ps1 (449 lines).
//
// Two-tier checks:
//   1. DB consistency (fast, no external calls)
//   2. Live WordPress verification (slow, needs WP adapter)
//
// Usage:
//   import { checkIntegrity } from './calendar-integrity-service.js'
//   const result = await checkIntegrity(events, { adapter })
// ============================================================

import { log } from '../logger.js'

/**
 * Issue severity levels.
 */
export const SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
}

/**
 * Run DB-consistency checks on scheduled events.
 * No external calls — operates purely on the data in scheduled_events.
 *
 * @param {Array<object>} events - Scheduled events from DB (mapped rows)
 * @returns {Array<{type: string, severity: string, eventId: string, message: string, details?: object}>}
 */
export function checkDbConsistency(events) {
  const issues = []

  // Track SSI event IDs for duplicate detection
  const ssiEventIdMap = new Map() // ssiEventId → [eventIds]

  for (const event of events) {
    const refs = event.ssiReferences || {}
    const cal = event.calendarReference || {}
    const status = event.status

    // 1. Missing SSI reference for events that should have one
    if (['ssi_created', 'calendar_published', 'completed'].includes(status)) {
      if (!refs.cupId && !refs.ssiEventId) {
        issues.push({
          type: 'missing_ssi_reference',
          severity: SEVERITY.ERROR,
          eventId: event.id,
          message: `Event "${event.eventName}" (${status}) has no SSI reference`,
          details: { eventDate: event.eventDate, status },
        })
      }
    }

    // 2. Missing calendar reference for calendar_published events
    if (status === 'calendar_published') {
      if (!cal.eventId) {
        issues.push({
          type: 'missing_calendar_reference',
          severity: SEVERITY.ERROR,
          eventId: event.id,
          message: `Event "${event.eventName}" is calendar_published but has no WordPress post ID`,
          details: { eventDate: event.eventDate },
        })
      }
    }

    // 3. Orphaned calendar reference — has WP post ID but status not calendar_published/completed
    if (cal.eventId && !['calendar_published', 'completed'].includes(status)) {
      // calendar_error with calendarReference is normal (retry scenario) — only flag if status is unexpected
      if (!['ssi_created', 'failed', 'cancelled'].includes(status)) {
        issues.push({
          type: 'orphaned_calendar_reference',
          severity: SEVERITY.WARNING,
          eventId: event.id,
          message: `Event "${event.eventName}" (${status}) has WordPress post ID ${cal.eventId} but unexpected status`,
          details: { eventDate: event.eventDate, status, wpPostId: cal.eventId },
        })
      }
    }

    // 4. SSI references missing cupUrl
    if (refs.cupId && !refs.cupUrl) {
      issues.push({
        type: 'missing_ssi_cup_url',
        severity: SEVERITY.WARNING,
        eventId: event.id,
        message: `Event "${event.eventName}" has SSI Cup ID ${refs.cupId} but no Cup URL`,
        details: { cupId: refs.cupId },
      })
    }

    // 5. Track for duplicate SSI event detection
    const ssiId = refs.ssiEventId || refs.cupId
    if (ssiId) {
      if (!ssiEventIdMap.has(ssiId)) {
        ssiEventIdMap.set(ssiId, [])
      }
      ssiEventIdMap.get(ssiId).push(event.id)
    }
  }

  // 5b. Report duplicates
  for (const [ssiId, eventIds] of ssiEventIdMap) {
    if (eventIds.length > 1) {
      issues.push({
        type: 'duplicate_ssi_event',
        severity: SEVERITY.ERROR,
        eventId: eventIds[0],
        message: `SSI event ${ssiId} is referenced by ${eventIds.length} scheduled events: ${eventIds.join(', ')}`,
        details: { ssiEventId: ssiId, eventIds },
      })
    }
  }

  return issues
}

/**
 * Run live WordPress verification checks.
 * Requires an authenticated WP adapter instance.
 *
 * @param {Array<object>} events - Scheduled events with calendarReference
 * @param {object} adapter - Authenticated WpCalendarAdapter instance
 * @param {function} [onProgress] - Optional progress callback (checkedCount, totalCount)
 * @returns {Promise<Array<{type: string, severity: string, eventId: string, message: string, details?: object}>>}
 */
export async function checkLiveWp(events, adapter, onProgress) {
  const issues = []

  // Only check events that have a WordPress reference
  const wpEvents = events.filter(e => e.calendarReference?.eventId)

  for (let i = 0; i < wpEvents.length; i++) {
    const event = wpEvents[i]
    const cal = event.calendarReference
    const refs = event.ssiReferences || {}

    if (onProgress) onProgress(i + 1, wpEvents.length)

    try {
      const wpEvent = await adapter.getEvent(cal.eventId)

      // 6. WP post status mismatch
      if (event.status === 'calendar_published' && wpEvent.status !== 'publish') {
        issues.push({
          type: 'wp_status_mismatch',
          severity: SEVERITY.WARNING,
          eventId: event.id,
          message: `Event "${event.eventName}" is calendar_published but WP post is "${wpEvent.status}"`,
          details: { wpPostId: cal.eventId, expectedStatus: 'publish', actualStatus: wpEvent.status },
        })
      }

      // 7. WP content missing SSI link
      if (refs.cupUrl) {
        const content = wpEvent.acfFields?.content || ''
        // Check for SSI cup URL or Cup ID pattern in content
        const hasSsiLink = content.includes(refs.cupUrl) ||
          content.includes(`shootnscoreit.com/event/${refs.cupContentTypeId}/${refs.cupId}`)
        if (!hasSsiLink) {
          issues.push({
            type: 'wp_content_missing_ssi_link',
            severity: SEVERITY.WARNING,
            eventId: event.id,
            message: `WP event ${cal.eventId} content does not contain SSI Cup URL`,
            details: { wpPostId: cal.eventId, expectedUrl: refs.cupUrl },
          })
        }
      }

      // 8. WP title mismatch (informational — titles may differ by design)
      if (wpEvent.title && event.eventName && !wpEvent.title.includes(event.eventName.substring(0, 20))) {
        issues.push({
          type: 'wp_title_mismatch',
          severity: SEVERITY.INFO,
          eventId: event.id,
          message: `WP title "${wpEvent.title}" differs from event name "${event.eventName}"`,
          details: { wpPostId: cal.eventId, wpTitle: wpEvent.title, eventName: event.eventName },
        })
      }

    } catch (err) {
      // 9. WP event not found or inaccessible
      issues.push({
        type: 'wp_event_not_found',
        severity: SEVERITY.ERROR,
        eventId: event.id,
        message: `WordPress post ${cal.eventId} for "${event.eventName}" is not accessible: ${err.message}`,
        details: { wpPostId: cal.eventId, error: err.message },
      })
    }
  }

  return issues
}

/**
 * Run full integrity check — DB consistency + optional live WP verification.
 *
 * @param {Array<object>} events - Scheduled events from DB
 * @param {object} [options]
 * @param {object} [options.adapter] - Authenticated WpCalendarAdapter (enables live WP checks)
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<{summary: object, issues: Array<object>, checkedAt: string}>}
 */
export async function checkIntegrity(events, options = {}) {
  const { adapter, onProgress } = options

  log.info(`[integrity] Starting integrity check for ${events.length} events`)

  // DB consistency checks (always run)
  const dbIssues = checkDbConsistency(events)
  log.info(`[integrity] DB checks: ${dbIssues.length} issues found`)

  // Live WP checks (optional)
  let wpIssues = []
  let liveCheckPerformed = false
  if (adapter) {
    liveCheckPerformed = true
    wpIssues = await checkLiveWp(events, adapter, onProgress)
    log.info(`[integrity] Live WP checks: ${wpIssues.length} issues found`)
  }

  const allIssues = [...dbIssues, ...wpIssues]

  const summary = {
    totalEvents: events.length,
    eventsWithSsi: events.filter(e => e.ssiReferences?.cupId || e.ssiReferences?.ssiEventId).length,
    eventsWithCalendar: events.filter(e => e.calendarReference?.eventId).length,
    liveCheckPerformed,
    liveCheckCount: liveCheckPerformed ? events.filter(e => e.calendarReference?.eventId).length : 0,
    issueCount: allIssues.length,
    errorCount: allIssues.filter(i => i.severity === SEVERITY.ERROR).length,
    warningCount: allIssues.filter(i => i.severity === SEVERITY.WARNING).length,
    infoCount: allIssues.filter(i => i.severity === SEVERITY.INFO).length,
    passed: allIssues.filter(i => i.severity === SEVERITY.ERROR).length === 0,
  }

  log.info(`[integrity] Check complete: ${summary.issueCount} issues (${summary.errorCount} errors, ${summary.warningCount} warnings). ${summary.passed ? 'PASSED' : 'FAILED'}`)

  return {
    summary,
    issues: allIssues,
    checkedAt: new Date().toISOString(),
  }
}
