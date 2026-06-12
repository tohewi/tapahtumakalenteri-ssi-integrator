// ============================================================
// SSI Core — Event Status Management
// ============================================================
// Change SSI event status via web form POST at /event/{ct}/{id}/edit/.
// SSI GraphQL has no update_event mutation, so the Django edit form
// is the only mechanism for status changes.
//
// Valid statuses: dr (Draft), on (Active), ol (Active no self-edit),
//                 pr (Preliminary completed), cp (Completed), cs (Cancelled)
// ============================================================

import { SSI_BASE_URL } from './constants.js'
import { ssiLogin } from './graphql.js'
import { fetchCsrf, postForm, parseFormFields, extractFormErrors, extractPageTitle } from '../services/event-form-helpers.js'
import { log } from '../logger.js'

/** Valid SSI event status codes */
export const SSI_EVENT_STATUSES = {
  DRAFT: 'dr',
  ACTIVE: 'on',
  ACTIVE_NO_SELF_EDIT: 'ol',
  PRELIMINARY_COMPLETED: 'pr',
  COMPLETED: 'cp',
  CANCELLED: 'cs',
}

/**
 * Change the status of an SSI event via web form POST.
 *
 * @param {object} params
 * @param {string} params.contentTypeId - SSI content type (e.g. '136' for cup, '91' for match)
 * @param {string} params.eventId - SSI event ID
 * @param {string} params.targetStatus - Target status code (e.g. 'cp' for Completed)
 * @param {object} params.cookies - Authenticated SSI session cookies (from ssiLogin)
 * @returns {Promise<{ success: boolean, previousStatus?: string, newStatus?: string, error?: string }>}
 */
export async function ssiSetEventStatus({ contentTypeId, eventId, targetStatus, cookies }) {
  const editUrl = `${SSI_BASE_URL}/event/${contentTypeId}/${eventId}/edit/`
  log.info(`[event-status] GET ${editUrl} (target: ${targetStatus})`)

  // Step 1: Fetch edit page and extract form fields + CSRF token
  const { csrfToken, html, cookies: updatedCookies } = await fetchCsrf(editUrl, cookies)

  // Verify we got a real edit page (not login redirect)
  const title = extractPageTitle(html)
  if (html.includes('id="id_password"') || html.includes('name="password"')) {
    throw new Error(`SSI session expired — edit page redirected to login (title: "${title}")`)
  }

  // Step 2: Parse all form fields (preserves all existing values)
  const { fields, arrayFields } = parseFormFields(html)

  const previousStatus = fields.status
  if (!previousStatus && previousStatus !== '') {
    throw new Error(`No status field found on edit page for event ${contentTypeId}/${eventId}`)
  }

  log.info(`[event-status] Event ${contentTypeId}/${eventId}: "${previousStatus}" → "${targetStatus}"`)

  // Short-circuit if already at target status
  if (previousStatus === targetStatus) {
    log.info(`[event-status] Event ${contentTypeId}/${eventId} already at status "${targetStatus}"`)
    return { success: true, previousStatus, newStatus: targetStatus, alreadyAtTarget: true }
  }

  // Step 3: Override status and POST
  fields.status = targetStatus

  // Ensure CSRF token is in the form body
  if (csrfToken) {
    fields.csrfmiddlewaretoken = csrfToken
  }

  const { finalUrl, html: respHtml, status: httpStatus } = await postForm(
    editUrl, fields, arrayFields, csrfToken, updatedCookies
  )

  // Step 4: Check result
  // 302 redirect to event page = success
  if (httpStatus >= 300 && httpStatus < 400) {
    log.info(`[event-status] Event ${contentTypeId}/${eventId} status changed to "${targetStatus}" (redirect: ${finalUrl})`)
    return { success: true, previousStatus, newStatus: targetStatus }
  }

  // 200 = form returned with errors
  const errors = extractFormErrors(respHtml)
  if (errors.length > 0) {
    const errorMsg = errors.join('; ')
    log.error(`[event-status] Form errors for ${contentTypeId}/${eventId}: ${errorMsg}`)
    return { success: false, previousStatus, error: errorMsg }
  }

  // 200 with no errors might still be success (some SSI forms don't redirect)
  // Check if the page now shows the target status as selected
  const statusMatch = respHtml.match(/<select[^>]*name="status"[^>]*>([\s\S]*?)<\/select>/i)
  if (statusMatch) {
    const selectedMatch = statusMatch[1].match(/<option[^>]*value="([^"]*)"[^>]*selected/i)
    if (selectedMatch && selectedMatch[1] === targetStatus) {
      log.info(`[event-status] Event ${contentTypeId}/${eventId} status confirmed "${targetStatus}" (200 OK)`)
      return { success: true, previousStatus, newStatus: targetStatus }
    }
  }

  log.warn(`[event-status] Uncertain result for ${contentTypeId}/${eventId}: HTTP ${httpStatus}, no redirect, no errors`)
  return { success: false, previousStatus, error: `Unexpected response (HTTP ${httpStatus}, no redirect, no form errors)` }
}

/**
 * Complete an SSI event (set status to 'cp').
 * Convenience wrapper around ssiSetEventStatus.
 */
export async function ssiCompleteEvent({ contentTypeId, eventId, cookies }) {
  return ssiSetEventStatus({ contentTypeId, eventId, targetStatus: SSI_EVENT_STATUSES.COMPLETED, cookies })
}
