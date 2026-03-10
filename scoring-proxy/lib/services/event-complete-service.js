// ============================================================
// Event Complete Service (CAL-7)
// ============================================================
// Orchestrates completing SSI events:
// - For a cup: complete all component matches first, then
//   complete the cup itself if no more matches remain.
// - For a standalone match: complete the match directly.
//
// Uses SSI web form POST (no GraphQL update_event mutation).
// ============================================================

import { ssiLogin } from '../ssi-core/graphql.js'
import { ssiCompleteEvent, SSI_EVENT_STATUSES } from '../ssi-core/event-status.js'
import { ssiGetEventStats } from '../ssi-core/stats-graphql.js'
import { log } from '../logger.js'

/**
 * Complete an SSI event and its component matches.
 *
 * @param {object} params
 * @param {object} params.ssiReferences - { cupId, cupTypeId, isCup, matches[] }
 * @param {object} params.ssiCredentials - { email, password }
 * @param {function} [params.onProgress] - Progress callback (step, message)
 * @returns {Promise<{ success: boolean, results: object[], cupResult?: object, error?: string }>}
 */
export async function completeEvent({ ssiReferences, ssiCredentials, onProgress }) {
  const progress = onProgress || (() => {})

  // ---- Validation ----
  if (!ssiReferences?.cupId) {
    return { success: false, error: 'Missing SSI references (cupId required)' }
  }
  if (!ssiCredentials?.email || !ssiCredentials?.password) {
    return { success: false, error: 'Missing SSI credentials (email and password required)' }
  }

  try {
    const cupId = ssiReferences.cupId
    const cupTypeId = ssiReferences.cupTypeId || '136'
    const isCup = ssiReferences.isCup !== false

    // Step 1: Login to SSI web
    progress('ssi_login', 'Logging in to SSI...')
    log.info(`[event-complete] Logging in to SSI for event ${cupTypeId}/${cupId}`)
    const cookies = await ssiLogin(ssiCredentials.email, ssiCredentials.password)

    // Step 2: Query current event status via GraphQL to get match info
    progress('ssi_query', 'Querying event status...')
    let stats
    try {
      stats = await ssiGetEventStats({
        credentials: ssiCredentials,
        cupTypeId, cupId,
        isCup,
      })
    } catch (err) {
      log.warn(`[event-complete] Could not query event stats: ${err.message}`)
      // Continue without stats — we can still try to complete
    }

    const results = []

    if (isCup && stats?.matches?.length > 0) {
      // Step 3a: Cup with matches — complete each match first
      progress('completing_matches', `Completing ${stats.matches.length} matches...`)
      log.info(`[event-complete] Cup ${cupId} has ${stats.matches.length} component matches`)

      for (const match of stats.matches) {
        if (match.status === SSI_EVENT_STATUSES.COMPLETED) {
          log.info(`[event-complete] Match ${match.id} already completed, skipping`)
          results.push({ id: match.id, name: match.name, success: true, alreadyCompleted: true })
          continue
        }

        // Match content type: SSI uses '91' for Nordic matches
        // The match contentTypeKey from GraphQL gives us the correct type
        const matchCt = match.contentTypeKey || '91'
        progress('completing_match', `Completing match #${match.number}: ${match.name}...`)

        const matchResult = await ssiCompleteEvent({
          contentTypeId: matchCt,
          eventId: String(match.id),
          cookies,
        })

        results.push({
          id: match.id,
          name: match.name,
          number: match.number,
          ...matchResult,
        })

        if (!matchResult.success) {
          log.error(`[event-complete] Failed to complete match ${match.id}: ${matchResult.error}`)
          // Continue with other matches — don't abort
        }
      }

      // Step 3b: Check if all matches are now completed
      const allMatchesCompleted = results.every(r => r.success)
      if (!allMatchesCompleted) {
        const failed = results.filter(r => !r.success)
        log.warn(`[event-complete] ${failed.length}/${results.length} matches failed to complete`)
      }

      // Step 4: Complete the cup itself
      progress('completing_cup', 'Completing cup...')
      log.info(`[event-complete] Completing cup ${cupTypeId}/${cupId}`)

      const cupResult = await ssiCompleteEvent({
        contentTypeId: cupTypeId,
        eventId: cupId,
        cookies,
      })

      progress('complete_done', 'Event completed')
      return {
        success: cupResult.success,
        results,
        cupResult,
        error: cupResult.success ? undefined : cupResult.error,
      }

    } else {
      // Step 3b: Standalone match or cup without matches — complete directly
      progress('completing_event', `Completing event ${cupTypeId}/${cupId}...`)
      log.info(`[event-complete] Completing event ${cupTypeId}/${cupId} (isCup=${isCup})`)

      const eventResult = await ssiCompleteEvent({
        contentTypeId: cupTypeId,
        eventId: cupId,
        cookies,
      })

      results.push({ id: cupId, ...eventResult })

      progress('complete_done', 'Event completed')
      return {
        success: eventResult.success,
        results,
        cupResult: isCup ? eventResult : undefined,
        error: eventResult.success ? undefined : eventResult.error,
      }
    }

  } catch (err) {
    log.error(`[event-complete] Failed to complete event: ${err.message}`)
    return { success: false, error: err.message, results: [] }
  }
}
