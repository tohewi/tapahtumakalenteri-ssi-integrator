// ============================================================
// SSI Core — Participant Lookup & Status Helpers
// Scraping functions for finding participants in events/matches
// and toggling CUP participant status (approve/delete/DNS/paid).
// Imported by participants.js (the Participants domain barrel).
// ============================================================

import {
  SSI_BASE_URL,
  log,
  formatCookies,
} from "./http-helpers.js"

// ============================================================
// Admin: find and delete a CUP participant (web scraping)
// 1. If participantId provided: use it directly (email-based match from GraphQL)
// 2. Otherwise: Scrape /event/136/{cupId}/participants/ to find participant by name
// 3. Use toggle-status to cycle Pending → Deleted (3 toggles)
//    Toggle cycle: Pending → Approved → Approved(no results) → Deleted → Pending
// ============================================================

export async function ssiFindAndDeleteCupParticipant(cupId, shooterName, cookies, email = null, participantId = null) {
  const debug = log.isEnabled('debug')

  const partUrl = `${SSI_BASE_URL}/event/136/${cupId}/participants/`

  // If participantId provided, use it directly (email-verified from GraphQL)
  if (participantId) {
    const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
    if (debug) console.log(`[cup-delete] Using GraphQL participant ID ${participantId} for ${searchDesc}`)

    // Fetch the page to check current status
    const resp = await fetch(partUrl, {
      headers: { 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
    const html = await resp.text()

    // Check current status
    const statusMatch = html.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const currentStatus = statusMatch ? statusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-delete] Current status: "${currentStatus}"`)

    if (currentStatus === 'Deleted') {
      if (debug) console.log(`[cup-delete] Already deleted`)
      return { success: true, message: 'Already deleted' }
    }
  } else {
    // Legacy path: scrape HTML to find participant by name
    const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
    if (debug) console.log(`[cup-delete] GET ${partUrl} (looking for ${searchDesc})`)
    const resp = await fetch(partUrl, {
      headers: { 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
    const html = await resp.text()

    // Find participant link: <a href="/event/participant/137/{id}/" ...>Name</a>
    const pattern = /<a[^>]*href="\/event\/participant\/137\/(\d+)\/"[^>]*>([^<]*)<\/a>/gi
    const searchWords = shooterName.toLowerCase().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w))
    if (debug) console.log(`[cup-delete] Search words: ${JSON.stringify(searchWords)}`)

    const matches = []
    for (const m of html.matchAll(pattern)) {
      const name = m[2].trim().toLowerCase()
      if (searchWords.length > 0 && searchWords.every(w => name.includes(w))) {
        matches.push({ id: m[1], name: m[2].trim() })
      }
    }

    if (matches.length === 0) {
      if (debug) console.log(`[cup-delete] "${shooterName}" not found in CUP ${cupId} participants`)
      return { success: false, message: 'Participant not found in CUP' }
    }

    if (matches.length > 1) {
      console.warn(`[cup-delete] WARNING: Multiple name matches found for "${shooterName}" in CUP ${cupId}:`, matches.map(m => m.name))
      if (email) {
        console.warn(`[cup-delete] Email provided for disambiguation: ${email} (but cannot verify from HTML)`)
      } else {
        console.warn(`[cup-delete] No email provided for disambiguation - using first match`)
      }
    }

    participantId = matches[0].id
    if (debug) console.log(`[cup-delete] Found: ${matches[0].name} → participant ${participantId}`)

    if (!participantId) {
      if (debug) console.log(`[cup-delete] "${shooterName}" not found in CUP ${cupId} participants`)
      return { success: false, message: 'Participant not found in CUP' }
    }

    // Check current status
    const statusMatch = html.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const currentStatus = statusMatch ? statusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-delete] Current status: "${currentStatus}"`)

    if (currentStatus === 'Deleted') {
      if (debug) console.log(`[cup-delete] Already deleted`)
      return { success: true, message: 'Already deleted' }
    }
  }

  // 3. Toggle status 3 times: Pending → Approved → Approved(no results) → Deleted
  //    We need to toggle 3 times from Pending to reach Deleted.
  const toggleUrl = `${SSI_BASE_URL}/event/participant/137/${participantId}/toggle-status/?next=${partUrl}`

  for (let i = 0; i < 3; i++) {
    if (debug) console.log(`[cup-delete] Toggle ${i + 1}/3: ${toggleUrl}`)
    const toggleResp = await fetch(toggleUrl, {
      headers: { 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    })
    if (!toggleResp.ok) throw new Error(`Toggle-status HTTP ${toggleResp.status}`)

    // Check status after each toggle
    const verifyHtml = await toggleResp.text()
    const newStatusMatch = verifyHtml.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const newStatus = newStatusMatch ? newStatusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-delete] Status after toggle ${i + 1}: "${newStatus}"`)

    // If we reached Deleted early, we're done
    if (newStatus === 'Deleted') {
      return { success: true, message: 'Deleted' }
    }
  }

  // 4. Verify final status
  const finalResp = await fetch(partUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  const finalHtml = await finalResp.text()
  const finalStatusMatch = finalHtml.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
  const finalStatus = finalStatusMatch ? finalStatusMatch[1] : 'unknown'
  if (debug) console.log(`[cup-delete] Final status: "${finalStatus}"`)

  if (finalStatus === 'Deleted') {
    return { success: true, message: 'Deleted' }
  }

  // If not deleted after 3 toggles, something unexpected happened
  if (debug) console.log(`[cup-delete] Unexpected status after 3 toggles: "${finalStatus}"`)
  return { success: false, message: `Toggle resulted in "${finalStatus}", expected "Deleted"` }
}

// ============================================================
// Admin: find and approve a CUP participant (web scraping)
// 1. If participantId provided: use it directly (email-based match from GraphQL)
// 2. Otherwise: Scrape /event/136/{cupId}/participants/ to find participant by name
// 3. Use toggle-status to cycle Pending → Approved
//    NOTE: CUP participant edit form (ct=137) does NOT support status changes.
//          Only the toggle-status URL works for CUP participants.
//          Toggle cycle: Pending → Approved → Approved(no results) → Deleted → Pending
// ============================================================

export async function ssiFindAndApproveCupParticipant(cupId, shooterName, cookies, email = null, participantId = null) {
  const debug = log.isEnabled('debug')

  const partUrl = `${SSI_BASE_URL}/event/136/${cupId}/participants/`

  // If participantId provided, use it directly (email-verified from GraphQL)
  if (participantId) {
    const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
    if (debug) console.log(`[cup-approve] Using GraphQL participant ID ${participantId} for ${searchDesc}`)

    // Fetch the page to check current status
    const resp = await fetch(partUrl, {
      headers: { 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
    const html = await resp.text()

    // Check current status
    const statusMatch = html.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const currentStatus = statusMatch ? statusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-approve] Current status: "${currentStatus}"`)

    if (currentStatus === 'Approved') {
      if (debug) console.log(`[cup-approve] Already approved`)
      return { success: true, message: 'Already approved' }
    }
  } else {
    // Legacy path: scrape HTML to find participant by name
    const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
    if (debug) console.log(`[cup-approve] GET ${partUrl} (looking for ${searchDesc})`)
    const resp = await fetch(partUrl, {
      headers: { 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
    const html = await resp.text()

    // Find participant link: <a href="/event/participant/137/{id}/" ...>Name</a>
    const pattern = /<a[^>]*href="\/event\/participant\/137\/(\d+)\/"[^>]*>([^<]*)<\/a>/gi
    const searchWords = shooterName.toLowerCase().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w))
    if (debug) console.log(`[cup-approve] Search words: ${JSON.stringify(searchWords)}`)

    const matches = []
    for (const m of html.matchAll(pattern)) {
      const name = m[2].trim().toLowerCase()
      if (searchWords.length > 0 && searchWords.every(w => name.includes(w))) {
        matches.push({ id: m[1], name: m[2].trim() })
      }
    }

    if (matches.length === 0) {
      if (debug) console.log(`[cup-approve] "${shooterName}" not found in CUP ${cupId} participants`)
      return { success: false, message: 'Participant not found in CUP' }
    }

    if (matches.length > 1) {
      console.warn(`[cup-approve] WARNING: Multiple name matches found for "${shooterName}" in CUP ${cupId}:`, matches.map(m => m.name))
      if (email) {
        console.warn(`[cup-approve] Email provided for disambiguation: ${email} (but cannot verify from HTML)`)
      } else {
        console.warn(`[cup-approve] No email provided for disambiguation - using first match`)
      }
    }

    participantId = matches[0].id
    if (debug) console.log(`[cup-approve] Found: ${matches[0].name} → participant ${participantId}`)

    if (!participantId) {
      if (debug) console.log(`[cup-approve] "${shooterName}" not found in CUP ${cupId} participants`)
      return { success: false, message: 'Participant not found in CUP' }
    }

    // Check current status
    const statusMatch = html.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
    const currentStatus = statusMatch ? statusMatch[1] : 'unknown'
    if (debug) console.log(`[cup-approve] Current status: "${currentStatus}"`)

    if (currentStatus === 'Approved') {
      if (debug) console.log(`[cup-approve] Already approved`)
      return { success: true, message: 'Already approved' }
    }
  }

  // Toggle status: Pending → Approved (one toggle from Pending)
  //    Toggle cycle: Pending → Approved → Approved(no results) → Deleted → Pending
  //    We only need to toggle once from Pending to reach Approved.
  const toggleUrl = `${SSI_BASE_URL}/event/participant/137/${participantId}/toggle-status/?next=${partUrl}`
  if (debug) console.log(`[cup-approve] GET toggle-status: ${toggleUrl}`)

  const toggleResp = await fetch(toggleUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!toggleResp.ok) throw new Error(`Toggle-status HTTP ${toggleResp.status}`)

  // 4. Verify the new status
  const verifyHtml = await toggleResp.text()
  const newStatusMatch = verifyHtml.match(new RegExp(`/event/participant/137/${participantId}/toggle-status/[^<]*<abbr[^>]*title="([^"]*)"`, 'i'))
  const newStatus = newStatusMatch ? newStatusMatch[1] : 'unknown'
  if (debug) console.log(`[cup-approve] New status: "${newStatus}"`)

  if (newStatus === 'Approved') {
    return { success: true, message: 'Approved' }
  }

  // If not approved after one toggle, something unexpected happened
  if (debug) console.log(`[cup-approve] Unexpected status after toggle: "${newStatus}"`)
  return { success: false, message: `Toggle resulted in "${newStatus}", expected "Approved"` }
}

// ============================================================
// Admin: find competitor ID in a match by scraping participants page
// GET /event/91/{matchId}/participants/
// Returns the participant ID if found, or null
// Optional email parameter is used for disambiguation if multiple
// participants match the same shooter name.
// ============================================================

export async function ssiFindCompetitorInMatch(matchId, shooterName, cookies, email = null) {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/91/${matchId}/participants/`

  const searchDesc = email ? `"${shooterName}" (${email})` : `"${shooterName}"`
  if (debug) console.log(`[find-competitor] GET ${url} (looking for ${searchDesc})`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Participants page HTTP ${resp.status} for match ${matchId}`)
  const html = await resp.text()

  // Normalize search: split into words for flexible matching (handles double spaces etc.)
  // Keep single-char digits (e.g. "2") to distinguish "Tuloskone 1" from "Tuloskone 2"
  const searchWords = shooterName.toLowerCase().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w))
  if (debug) console.log(`[find-competitor] Search words: ${JSON.stringify(searchWords)}`)

  // Parse by table row so we can use row text (e.g. email) for disambiguation
  const rows = html.split(/<tr[\s>]/i).slice(1)
  const matches = []

  for (const row of rows) {
    // Participant link pattern: <a href="/event/participant/93/{id}/">Name</a>
    // (can include additional attributes)
    const participantMatch = row.match(/<a[^>]*href="\/event\/participant\/93\/(\d+)\/"[^>]*>([^<]*)<\/a>/i)
    if (!participantMatch) continue

    const compId = participantMatch[1]
    const name = participantMatch[2].trim()
    const nameLower = name.toLowerCase()

    // Match if all search words appear in the participant name
    if (searchWords.length > 0 && searchWords.every(w => nameLower.includes(w))) {
      matches.push({ id: compId, name, row })
    }
  }

  if (matches.length === 0) {
    if (debug) console.log(`[find-competitor] ${searchDesc} not found in match ${matchId}`)
    return null
  }

  if (matches.length === 1) {
    if (debug) console.log(`[find-competitor] Found: ${matches[0].name} → participant ${matches[0].id}`)
    return matches[0].id
  }

  // Multiple name matches found — try to disambiguate by email from row text.
  console.warn(`[find-competitor] WARNING: Multiple name matches found for "${shooterName}" in match ${matchId}:`, matches.map(m => m.name))
  if (email) {
    const emailLower = email.toLowerCase()
    const emailMatches = matches.filter(m => m.row.toLowerCase().includes(emailLower))

    if (emailMatches.length === 1) {
      if (debug) console.log(`[find-competitor] Email-disambiguated: ${emailMatches[0].name} (${email}) → participant ${emailMatches[0].id}`)
      return emailMatches[0].id
    }

    if (emailMatches.length > 1) {
      console.warn(`[find-competitor] WARNING: Multiple email matches for ${email} in match ${matchId}; using first match`)
      return emailMatches[0].id
    }

    console.warn(`[find-competitor] WARNING: Email ${email} not found in matched rows for match ${matchId}; using first name match`)
  }

  return matches[0].id
}

// ============================================================
// Admin: find participant in any event by scraping participants page.
// General-purpose version of ssiFindCompetitorInMatch (which is Nordic-only).
//
// Scrapes /event/{eventContentType}/{eventId}/participants/ with admin cookies.
// Parses participant links: <a href="/event/participant/{participantCT}/{id}/">Name</a>
// Matches by shooterName (word-based flexible matching).
// Returns { participantId, participantCT } or null.
//
// Why scraping instead of GraphQL?
//   SSI GraphQL returns competitor data but the admin JWT does NOT include
//   shooter.email for other users (privacy restriction). Web scraping with
//   admin cookies has no such limitation — all participant data is visible.
// ============================================================

export async function ssiFindParticipantInEvent(eventContentType, eventId, shooterName, cookies) {
  const url = `${SSI_BASE_URL}/event/${eventContentType}/${eventId}/participants/`

  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Participants page HTTP ${resp.status} for event ${eventId}`)
  const html = await resp.text()

  // Participant links: <a href="/event/participant/{ct}/{id}/">Name</a>
  // Captures: [1]=participantCT, [2]=participantId, [3]=name
  const pattern = /<a[^>]*href="\/event\/participant\/(\d+)\/(\d+)\/"[^>]*>([^<]*)<\/a>/gi

  // Normalize search: split into words for flexible matching (handles double spaces etc.)
  // Keep single-char digits (e.g. "2") to distinguish "Tuloskone 1" from "Tuloskone 2"
  const searchWords = shooterName.toLowerCase().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w))

  for (const m of html.matchAll(pattern)) {
    const participantCT = m[1]
    const participantId = m[2]
    const name = m[3].trim()
    const nameLower = name.toLowerCase()
    if (searchWords.length > 0 && searchWords.every(w => nameLower.includes(w))) {
      return { participantId, participantCT: parseInt(participantCT) }
    }
  }

  return null
}

// ============================================================
// CUP Management: Set "Did Not Show" (DNS) on a participant
// GET /event/participant/{ct}/{participantId}/set-did-not-show/?next=...
// SSI redirects (302) on success.
// ct: 137 for CUP participants, 93 for Nordic match participants
// ============================================================

export async function ssiSetDidNotShow(participantContentType, participantId, cookies, nextUrl = '') {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/participant/${participantContentType}/${participantId}/set-did-not-show/`
  const fullUrl = nextUrl ? `${url}?next=${nextUrl}` : url

  if (debug) console.log(`[dns-set] GET ${fullUrl}`)
  const resp = await fetch(fullUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'manual',
  })

  if (debug) console.log(`[dns-set] Response: ${resp.status}`)

  // SSI redirects (302/301) on success. A 200 likely means redirect to login/error page.
  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Did Not Show set' }
  }
  throw new Error(`Set Did Not Show failed HTTP ${resp.status}`)
}

// ============================================================
// CUP Management: Undo "Did Not Show" (DNS) on a participant
// GET /event/participant/{ct}/{participantId}/undo-did-not-show/?next=...
// SSI redirects (302) on success.
// ct: 137 for CUP participants, 93 for Nordic match participants
// ============================================================

export async function ssiUndoDidNotShow(participantContentType, participantId, cookies, nextUrl = '') {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/participant/${participantContentType}/${participantId}/undo-did-not-show/`
  const fullUrl = nextUrl ? `${url}?next=${nextUrl}` : url

  if (debug) console.log(`[dns-undo] GET ${fullUrl}`)
  const resp = await fetch(fullUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'manual',
  })

  if (debug) console.log(`[dns-undo] Response: ${resp.status}`)

  // SSI redirects (302/301) on success. A 200 likely means redirect to login/error page.
  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Did Not Show undone' }
  }
  throw new Error(`Undo Did Not Show failed HTTP ${resp.status}`)
}

// ============================================================
// CUP Management: Toggle paid status on a participant
// GET /event/participant/{ct}/{participantId}/toggle-paid/?next=...
// SSI redirects (302) on success.
// ct: 137 for CUP participants
// ============================================================

export async function ssiTogglePaid(participantContentType, participantId, cookies, nextUrl = '') {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/participant/${participantContentType}/${participantId}/toggle-paid/`
  const fullUrl = nextUrl ? `${url}?next=${nextUrl}` : url

  if (debug) console.log(`[toggle-paid] GET ${fullUrl}`)
  const resp = await fetch(fullUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'manual',
  })

  if (debug) console.log(`[toggle-paid] Response: ${resp.status}`)

  // SSI redirects (302/301) on success
  if (resp.status === 302 || resp.status === 301) {
    return { success: true, message: 'Paid status toggled' }
  }
  throw new Error(`Toggle paid failed HTTP ${resp.status}`)
}

// ============================================================
// CUP Management: Scrape CUP participants page for paid + DNS status
// GET /event/136/{cupId}/participants/
// Returns Map<participantId, { paid: bool, didNotShow: bool }>
//
// SSI participants page shows:
//   - Paid icon: <i class="fa fa-money text-success"> (paid) or text-danger (unpaid)
//   - DNS: participant row may contain "Did not show" text or a specific CSS class
//   - Participant links: <a href="/event/participant/137/{id}/">Name</a>
//   - Toggle links: /event/participant/137/{id}/toggle-paid/
//                    /event/participant/137/{id}/set-did-not-show/
//                    /event/participant/137/{id}/undo-did-not-show/
// ============================================================

export async function ssiGetCupParticipantStatuses(cupId, cookies) {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/136/${cupId}/participants/`

  if (debug) console.log(`[cup-status] GET ${url}`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`CUP participants page HTTP ${resp.status}`)
  const html = await resp.text()

  const statuses = new Map()

  // Parse each table row to extract participant ID, paid status, and DNS status
  // Each row contains: participant link, toggle-paid link, set-did-not-show or undo-did-not-show link
  const rows = html.split(/<tr[\s>]/i).slice(1) // split by <tr> tags

  let firstRowLogged = false
  for (const row of rows) {
    // Extract participant ID from link: /event/participant/137/{id}/
    const partMatch = row.match(/\/event\/participant\/137\/(\d+)\//)
    if (!partMatch) continue
    const partId = partMatch[1]

    // Log first row's toggle-paid context to understand SSI HTML structure
    if (!firstRowLogged) {
      const toggleContext = row.match(/toggle-paid[\s\S]{0,200}/i)
      if (debug) console.log(`[cup-status] Sample row toggle-paid context: ${toggleContext ? toggleContext[0].substring(0, 200) : 'NOT FOUND'}`)
      const dnsContext = row.match(/(set-did-not-show|undo-did-not-show)[\s\S]{0,100}/i)
      if (debug) console.log(`[cup-status] Sample row DNS context: ${dnsContext ? dnsContext[0].substring(0, 100) : 'NOT FOUND'}`)
      firstRowLogged = true
    }

    // Paid status: SSI shows text content inside the toggle-paid link
    // Pattern: <a href="...toggle-paid/">all</a> (paid) or <a href="...toggle-paid/">no</a> (unpaid)
    const paidMatch = row.match(/toggle-paid\/?"?>(\w+)<\/a>/i)
    const paid = paidMatch ? paidMatch[1].toLowerCase() === 'all' : false

    // DNS status: CUP participants page does not contain set-did-not-show/undo-did-not-show links.
    // DNS detection requires a different approach (e.g. checking participant status field).
    // For now, check if row contains "Did not show" or similar text indicator
    const didNotShow = /did.not.show/i.test(row) || row.includes(`/${partId}/undo-did-not-show/`)

    statuses.set(partId, { paid, didNotShow })
  }

  if (debug) console.log(`[cup-status] Found ${statuses.size} participants with status data`)
  return statuses
}
