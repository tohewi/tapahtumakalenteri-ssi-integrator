// ============================================================
// Event Deletion Service
//
// Deletes SSI cups and matches via web scraping.
// SSI has no API for deletion — uses the web form DELETE flow.
//
// For cup events, component matches must be deleted individually
// before the cup itself, as SSI does not cascade-delete them.
// ============================================================

import { SSI_BASE_URL } from '../ssi-core/constants.js'
import { formatCookies } from '../ssi-core/http-helpers.js'
import { ssiLogin } from '../ssi-core/client.js'
import { log } from '../logger.js'

/**
 * Deletes a single SSI event/match by typeId + eventId using the web scraping DELETE flow.
 * Reuses an already-authenticated cookies object so the caller can batch deletions
 * without re-logging in for each one.
 *
 * @param {string} typeId - SSI content-type ID (e.g. "136" for cups)
 * @param {string} eventId - SSI event/match numeric ID
 * @param {object} cookies - Authenticated SSI session cookies
 * @returns {Promise<void>}
 */
async function deleteSingleSsiEvent(typeId, eventId, cookies) {
  const deleteUrl = `${SSI_BASE_URL}/event/${typeId}/${eventId}/delete/`
  log.info(`[event-deletion] Fetching delete confirmation page: ${deleteUrl}`)

  const resp = await fetch(deleteUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
  })

  if (resp.status === 404) {
    log.info(`[event-deletion] Event ${eventId} not found on SSI (already deleted)`)
    return
  }

  if (!resp.ok) {
    throw new Error(`Failed to access delete page for event ${eventId}: HTTP ${resp.status}`)
  }

  const html = await resp.text()
  const nameMatch = html.match(/Are you sure you want to delete:\s*(.+?)\s*</)
  const eventName = nameMatch ? nameMatch[1].trim() : 'Unknown Event'

  log.info(`[event-deletion] Confirming deletion of: "${eventName}"`)

  const postResp = await fetch(deleteUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': deleteUrl,
      'Origin': SSI_BASE_URL,
    },
    body: 'remove=Delete',
    redirect: 'manual',
  })

  // SSI redirects on success
  if (postResp.status >= 300 && postResp.status < 400) {
    log.info(`[event-deletion] Successfully deleted event ${eventId} ("${eventName}")`)
    return
  }

  const resultHtml = await postResp.text()
  if (resultHtml.includes('Are you sure you want to delete')) {
    throw new Error(`Failed to delete event ${eventId} on SSI (no redirect received)`)
  }

  log.info(`[event-deletion] Successfully deleted event ${eventId} ("${eventName}") (Status ${postResp.status})`)
}

/**
 * Deletes an event from SSI via web scraping.
 * For cup events (isCup=true), deletes each component match first, then the cup.
 * SSI does NOT cascade-delete component matches when a cup is deleted, so matches
 * must be removed individually beforehand.
 *
 * @param {object} ssiReferences - The references to the SSI event (cupId, cupTypeId, matches)
 * @param {object} credentials - SSI login credentials
 * @returns {Promise<void>}
 */
export async function deleteSsiEvent({ ssiReferences, credentials }) {
  if (!ssiReferences || (!ssiReferences.cupId && !ssiReferences.id && !ssiReferences.ssiEventId)) {
    throw new Error('No SSI reference ID provided for deletion')
  }

  // Handle three ssiReferences shapes:
  //   1. Platform-created cup:      { cupId, cupTypeId, matches[], isCup }
  //   2. Platform-created match:    { id, typeId }  (legacy)
  //   3. Imported SSI event:        { ssiEventId, contentTypeKey }
  // Prefer cup if both cupId and ssiEventId exist.
  const eventId = ssiReferences.cupId || ssiReferences.id || ssiReferences.ssiEventId
  const typeId = ssiReferences.cupTypeId || ssiReferences.typeId || ssiReferences.contentTypeKey

  if (!eventId || !typeId) {
    throw new Error(`Missing SSI eventId or typeId in references: ${JSON.stringify(ssiReferences)}`)
  }

  log.info(`[event-deletion] Logging in to SSI to delete event ${eventId}...`)
  const cookies = await ssiLogin(credentials.email, credentials.password)

  // For cup events: delete each component match first.
  // SSI leaves component matches as orphaned standalone events if the cup is deleted
  // without removing them first.
  const componentMatches = ssiReferences.matches || []
  if (ssiReferences.isCup && componentMatches.length > 0) {
    log.info(`[event-deletion] Cup has ${componentMatches.length} component match(es) — deleting them first`)
    for (const match of componentMatches) {
      if (!match.id || !match.typeId) {
        log.warn(`[event-deletion] Skipping component match with missing id/typeId: ${JSON.stringify(match)}`)
        continue
      }
      log.info(`[event-deletion] Deleting component match: ${match.name || match.id} (type=${match.typeId}, id=${match.id})`)
      await deleteSingleSsiEvent(match.typeId, match.id, cookies)
    }
  }

  // Delete the cup / standalone match
  await deleteSingleSsiEvent(typeId, eventId, cookies)
}
