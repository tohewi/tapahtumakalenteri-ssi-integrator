// ============================================================
// Calendar Statistics Service (CAL-5)
// ============================================================
// Queries SSI for approved participant count via GraphQL and
// updates the corresponding WordPress calendar event with
// statistics (attendee count, shots fired, event count).
//
// Designed as a pure service function so PEW-3 (Post-Event
// Workflow — Tapahtumakalenteri Statistics Update) can call it
// directly without Express req/res dependency.
//
// Flow:
//   1. Query SSI via GraphQL for approved participant count
//   2. Calculate shots fired = approvedCount × shotsPerParticipant
//   3. Authenticate to WordPress (reuses calendar-publish-service auth)
//   4. Update calendar event ACF fields via wp-adapter.updateEvent()
//   5. Return statistics result
//
// Dependencies:
//   - lib/ssi-core/stats-graphql.js — SSI GraphQL stats query
//   - lib/services/calendar-publish-service.js — WP authentication
//   - lib/calendar/wp-adapter.js — WP event update
// ============================================================

import { ssiGetEventStats } from '../ssi-core/stats-graphql.js'
import { authenticateToWordPress, validateCalendarConfig } from './calendar-publish-service.js'
import { WpCalendarAdapter } from '../calendar/wp-adapter.js'
import { log } from '../logger.js'

// Default shots per participant (e.g. 3 stages × ~33 shots for Kupittaa Cup)
const DEFAULT_SHOTS_PER_PARTICIPANT = 100

/**
 * Update WordPress calendar event with statistics from SSI.
 *
 * Queries SSI for approved participant count, calculates shots fired,
 * and updates the WordPress calendar event's ACF statistics fields.
 *
 * @param {object} params
 * @param {object} params.ssiReferences - { cupId, cupTypeId, isCup }
 * @param {object} params.calendarReference - { eventId } — WordPress post ID
 * @param {object} params.calendarConfig - Tenant WP config (wpBaseUrl, creds, Gmail)
 * @param {object} params.calendarTemplate - Template config (shotsPerParticipant)
 * @param {object} params.ssiCredentials - { email, password } for SSI GraphQL
 * @param {function} [params.onProgress] - Optional progress callback (step, detail)
 * @returns {Promise<object>} Statistics result
 * @returns {boolean} return.success
 * @returns {object} return.stats - { approvedCount, shotsFired, eventCount, totalCount, matchCount }
 * @returns {string} [return.error] - Error message if failed
 */
export async function updateCalendarStats({
  ssiReferences,
  calendarReference,
  calendarConfig,
  calendarTemplate,
  ssiCredentials,
  onProgress,
}) {
  const progress = onProgress || (() => {})

  // Validate inputs
  if (!ssiReferences?.cupId || !ssiReferences?.cupTypeId) {
    return { success: false, error: 'Missing SSI references (cupId, cupTypeId)' }
  }

  if (!calendarReference?.eventId) {
    return { success: false, error: 'Missing calendar reference (eventId / WordPress post ID)' }
  }

  const configCheck = validateCalendarConfig(calendarConfig)
  if (!configCheck.valid) {
    return { success: false, error: `Invalid calendar config: missing ${configCheck.missing.join(', ')}` }
  }

  if (!ssiCredentials?.email || !ssiCredentials?.password) {
    return { success: false, error: 'Missing SSI credentials (email, password)' }
  }

  try {
    // Step 1: Query SSI for participant statistics
    progress('ssi_stats', 'Querying SSI for participant statistics...')
    log.info(`[calendar-stats] Querying SSI stats for cup CT=${ssiReferences.cupTypeId} ID=${ssiReferences.cupId}`)

    const ssiStats = await ssiGetEventStats({
      credentials: ssiCredentials,
      cupTypeId: ssiReferences.cupTypeId,
      cupId: ssiReferences.cupId,
      isCup: ssiReferences.isCup !== false, // default true
    })

    const approvedCount = ssiStats.approvedCount
    const shotsPerParticipant = calendarTemplate?.shotsPerParticipant || DEFAULT_SHOTS_PER_PARTICIPANT
    const shotsFired = approvedCount * shotsPerParticipant
    const eventCount = 1 // One calendar event = one event

    log.info(`[calendar-stats] SSI stats: ${approvedCount} approved, ${shotsFired} shots (×${shotsPerParticipant}), status=${ssiStats.status}`)

    // Step 2: Authenticate to WordPress
    progress('wp_auth', 'Authenticating to WordPress...')
    const session = await authenticateToWordPress(calendarConfig)

    // Step 3: Update WordPress calendar event
    progress('wp_update', 'Updating calendar event statistics...')
    const adapter = new WpCalendarAdapter(session)

    await adapter.updateEvent(calendarReference.eventId, {
      shotsFired,
      attendeeCount: approvedCount,
      eventCount,
    })

    const stats = {
      approvedCount,
      totalCount: ssiStats.totalCount,
      shotsFired,
      shotsPerParticipant,
      eventCount,
      matchCount: ssiStats.matchCount,
      ssiStatus: ssiStats.status,
      ssiEventName: ssiStats.eventName,
      updatedAt: new Date().toISOString(),
    }

    log.info(`[calendar-stats] Calendar event ${calendarReference.eventId} updated: ${approvedCount} participants, ${shotsFired} shots`)
    progress('stats_done', 'Calendar statistics updated')

    return { success: true, stats }

  } catch (err) {
    log.error(`[calendar-stats] Failed to update calendar stats: ${err.message}`)
    return {
      success: false,
      error: err.message,
    }
  }
}
