// ============================================================
// SSI Core — Seed Form Field Capture
//
// Web-scrapes SSI event admin pages to capture discipline-specific
// form fields (weapon_groups, categories, competence_classes) that
// are NOT available via GraphQL.
//
// Extracted from seed-import.js (MOD-6).
// ============================================================

import { SSI_BASE_URL } from './constants.js'
import { parseFormFields, fetchCsrf } from '../services/event-form-helpers.js'
import { log } from '../logger.js'

// Multi-value form fields to capture from SSI event pages.
// These are NOT available via GraphQL — only via web form HTML.
export const FORM_FIELDS_TO_CAPTURE = ['weapon_groups', 'categories', 'competence_classes']

/**
 * Capture form-level fields from an SSI event's admin page via web scraping.
 * These fields (weapon_groups, categories, competence_classes) are only available
 * in the SSI web form HTML, not via GraphQL.
 *
 * Returns an object with the checked/selected values for each field, e.g.:
 *   { weapon_groups: ['STD', 'RVL'], categories: ['Open', 'H'], competence_classes: ['1', '2'] }
 *
 * @param {string} eventUrl - SSI event URL (e.g. /event/136/160/)
 * @param {string} cookies - SSI session cookies from ssiLogin
 * @returns {object|null} Form fields object, or null if scraping failed
 */
export async function captureEventFormFields(eventUrl, cookies) {
  try {
    // Step 1: Fetch the public event page and look for an edit link
    const { html: viewHtml } = await fetchCsrf(eventUrl, cookies)
    if (!viewHtml || viewHtml.length < 500) {
      log.warn(`[seed-import] Event page too small (${viewHtml?.length || 0} chars), skipping form field capture`)
      return null
    }

    const title = viewHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || ''
    if (title.includes('Log in') || title.includes('login')) {
      log.warn(`[seed-import] Event page redirected to login, skipping form field capture`)
      return null
    }

    // Probe SSI edit page URL patterns for this event type.
    // SSI convention: create URL is /series/nordic/create-resul-cup/,
    // edit URL follows pattern /series/nordic/edit-resul-cup/{id}/ etc.
    let editUrl = null
    let m
    const urlMatch = eventUrl.match(/\/event\/(\d+)\/(\d+)/)
    if (urlMatch) {
      const [, ct, id] = urlMatch
      // Build URL patterns to try, ordered by likelihood
      const tryUrls = [
        // Nordic/RESUL patterns (ct=136 for cups, ct=91 for matches)
        `${SSI_BASE_URL}/series/nordic/edit-resul-cup/${id}/`,
        `${SSI_BASE_URL}/nordic/edit-resul-cup/${id}/`,
        `${SSI_BASE_URL}/series/nordic/edit-match/${id}/`,
        `${SSI_BASE_URL}/nordic/edit-match/${id}/`,
        // Generic patterns
        `${SSI_BASE_URL}/event/${ct}/${id}/edit/`,
        `${SSI_BASE_URL}/event/${ct}/${id}/change/`,
      ]

      for (const tryUrl of tryUrls) {
        try {
          const { html: tryHtml } = await fetchCsrf(tryUrl, cookies)
          if (!tryHtml || tryHtml.length < 1000) continue
          // Skip login redirects
          if (tryHtml.includes('id="id_password"') || tryHtml.includes('name="password"')) continue
          // Check if it has form fields we care about
          if (FORM_FIELDS_TO_CAPTURE.some(f => tryHtml.includes(`name="${f}"`) || tryHtml.includes(`name='${f}'`))) {
            editUrl = tryUrl
            log.info(`[seed-import] Found edit page with form fields at: ${tryUrl}`)
            break
          }
        } catch { /* skip failed URLs */ }
      }
    }

    // If no edit URL found, also search for edit links in the view page HTML
    // (exclude edit-image which is just the image upload form)
    if (!editUrl) {
      const editLinkRe = /<a[^>]*href=["']([^"']*(?:\/edit\/|\/change\/|edit-resul|edit-match)[^"']*)["'][^>]*>/gi
      while ((m = editLinkRe.exec(viewHtml)) !== null) {
        const href = m[1]
        if (href.includes('edit-image')) continue
        if (href.startsWith('#') || href.startsWith('javascript:')) continue
        const candidate = href.startsWith('http') ? href : `${SSI_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`
        try {
          const { html: tryHtml } = await fetchCsrf(candidate, cookies)
          if (tryHtml && FORM_FIELDS_TO_CAPTURE.some(f => tryHtml.includes(`name="${f}"`))) {
            editUrl = candidate
            log.info(`[seed-import] Found edit page via link: ${candidate}`)
            break
          }
        } catch { /* skip */ }
      }
    }

    // Fetch the edit page (or use view page if no edit link found)
    let html = viewHtml
    if (editUrl) {
      log.info(`[seed-import] Found edit page: ${editUrl}`)
      const { html: editHtml } = await fetchCsrf(editUrl, cookies)
      if (editHtml && editHtml.length > 1000) {
        html = editHtml
      }
    } else {
      // Last resort: check if the view page itself has our target form fields
      const hasTargetFields = FORM_FIELDS_TO_CAPTURE.some(f => html.includes(`name="${f}"`) || html.includes(`name='${f}'`))
      if (!hasTargetFields) {
        log.warn(`[seed-import] No form fields found on event page (title: "${title}")`)
        return null
      }
    }

    const { fields, arrayFields } = parseFormFields(html)
    const formFields = {}

    // Extract checked checkboxes (weapon_groups, categories use checkbox groups)
    const checkboxGroups = {}
    const cbRe = /<input[^>]*type=["']checkbox["'][^>]*>/gi
    while ((m = cbRe.exec(html)) !== null) {
      const tag = m[0]
      const nameMatch = tag.match(/name=["']([^"']+)["']/)
      const valueMatch = tag.match(/value=["']([^"']*?)["']/)
      if (!nameMatch || !valueMatch || !valueMatch[1]) continue
      const name = nameMatch[1]
      if (!FORM_FIELDS_TO_CAPTURE.includes(name)) continue
      if (!checkboxGroups[name]) checkboxGroups[name] = { all: [], checked: [] }
      checkboxGroups[name].all.push(valueMatch[1])
      if (/\bchecked\b/i.test(tag)) {
        checkboxGroups[name].checked.push(valueMatch[1])
      }
    }

    for (const [name, { all, checked }] of Object.entries(checkboxGroups)) {
      formFields[name] = { values: all, selected: checked }
    }

    // Extract selected options from <select multiple> elements
    const selectRe = /<select\b([\s\S]*?)<\/select>/gi
    while ((m = selectRe.exec(html)) !== null) {
      const fullMatch = m[0]
      const openTag = fullMatch.match(/<select\b([^>]*)>/i)?.[1] || ''
      if (!/\bmultiple\b/i.test(openTag)) continue
      const nameMatch = openTag.match(/name=["']([^"']+)["']/)
      if (!nameMatch || !FORM_FIELDS_TO_CAPTURE.includes(nameMatch[1])) continue
      const name = nameMatch[1]

      const allValues = []
      const selectedValues = []
      const optRe = /<option([^>]*)value=["']([^"']*?)["']([^>]*)>/gi
      let opt
      while ((opt = optRe.exec(fullMatch)) !== null) {
        if (opt[2]) {
          allValues.push(opt[2])
          if (/\bselected\b/i.test(opt[1] + opt[3])) {
            selectedValues.push(opt[2])
          }
        }
      }
      formFields[name] = { values: allValues, selected: selectedValues }
    }

    // Also capture from parseFormFields for any fields we might have missed
    for (const field of FORM_FIELDS_TO_CAPTURE) {
      if (formFields[field]) continue // already captured via checkbox/select parsing
      if (field in arrayFields && arrayFields[field].length > 0) {
        formFields[field] = { values: arrayFields[field], selected: arrayFields[field] }
      } else if (field in fields && fields[field]) {
        formFields[field] = { values: [fields[field]], selected: [fields[field]] }
      }
    }

    const captured = Object.keys(formFields)
    if (captured.length > 0) {
      log.info(`[seed-import] Captured form fields: ${captured.map(k => `${k}=${formFields[k].selected.length}/${formFields[k].values.length}`).join(', ')}`)
    } else {
      log.warn(`[seed-import] No form fields found on event page (title: "${title}")`)
    }

    return Object.keys(formFields).length > 0 ? formFields : null
  } catch (err) {
    log.warn(`[seed-import] Form field capture failed for ${eventUrl}: ${err.message}`)
    return null
  }
}
