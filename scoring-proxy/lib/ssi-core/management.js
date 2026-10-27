// ============================================================
// SSI Core — Management & Staffing Domain
// ============================================================

import {
  SSI_BASE_URL,
  log,
  formatCookies,
  ssiFetchPage,
  _participantResponseCookies,
  _participantFormHeaders,
  _participantSearchCookies,
} from './http-helpers.js'

// ============================================================
// Staffing: extract match management group ID from staff page
// GET /event/{ct}/{eventId}/staff/ → find /groups/{groupId}/ links
// ============================================================

export async function ssiGetMatchGroupId(eventContentType, eventId, cookies) {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/${eventContentType}/${eventId}/staff/`

  if (debug) console.log(`[mgmt-group] GET ${url}`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Staff page HTTP ${resp.status}`)
  const html = await resp.text()

  const groupMatch = html.match(/\/groups\/(\d+)\//)
  if (!groupMatch) throw new Error('Could not find management group ID on staff page')

  const groupId = groupMatch[1]
  if (debug) console.log(`[mgmt-group] Found group ID: ${groupId}`)
  return groupId
}

// ============================================================
// Staffing: scrape staff page to get members + event official roles
// Returns [{ name, officials: ['MD'|'QM'|...], role: 'admin'|'staff'|'assistant' }]
// ============================================================

export async function ssiGetMatchOfficials(eventContentType, eventId, cookies) {
  const debug = log.isEnabled('debug')
  const url = `${SSI_BASE_URL}/event/${eventContentType}/${eventId}/staff/`

  if (debug) console.log(`[mgmt-read] GET ${url}`)
  const resp = await fetch(url, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Staff page HTTP ${resp.status}`)
  const html = await resp.text()

  const members = []
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
  for (const row of rows) {
    const tds = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    if (tds.length < 5) continue

    const name = tds[2][1].replace(/<[^>]+>/g, '').trim()
    if (!name || name === 'Name') continue

    const roleTd = tds[tds.length - 1][1].replace(/<[^>]+>/g, '').trim()
    const role = roleTd === 'admin' || roleTd === 'staff' || roleTd === 'assistant' ? roleTd : null
    if (!role) continue

    const officialText = tds.length >= 6 ? tds[tds.length - 2][1].replace(/<[^>]+>/g, '').trim() : ''
    const officials = []
    if (officialText.includes('Match Director') || officialText === 'MD') officials.push('MD')
    if (officialText.includes('Quarter Master') || officialText === 'QM') officials.push('QM')
    if (officialText.includes('Range Officer') || officialText === 'RO') officials.push('RO')
    if (officialText.includes('Stats Officer') || officialText === 'SO') officials.push('SO')

    members.push({ name, officials, role })
  }

  if (debug) console.log(`[mgmt-read] Found ${members.length} staff: ${members.map(m => `${m.name}(${m.officials.join(',')||'-'})`).join(', ')}`)
  return members
}

// ============================================================
// Staffing: add user to match management group with role
// ============================================================

export async function ssiAddToMatchManagement(groupId, eventContentType, eventId, email, role, officials, cookies) {
  const debug = log.isEnabled('debug')
  const nextUrl = `/event/${eventContentType}/${eventId}/staff/`
  const searchUrl = `${SSI_BASE_URL}/groups/${groupId}/role/search/?next=${nextUrl}`

  const searchData = new URLSearchParams()
  searchData.append('last_name', '')
  searchData.append('first_name', '')
  searchData.append('email', email)
  searchData.append('submit', 'Search')

  if (debug) console.log(`[mgmt-add] POST search email=${email} to ${searchUrl}`)
  const searchResp = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': searchUrl,
      'Origin': SSI_BASE_URL,
    },
    body: searchData.toString(),
    redirect: 'follow',
  })
  if (!searchResp.ok) throw new Error(`Management search failed HTTP ${searchResp.status}`)
  const searchHtml = await searchResp.text()

  if (searchHtml.includes('no results') || searchHtml.includes('gave no results')) {
    return { success: false, message: 'User not found in SSI by email' }
  }

  const addLink = searchHtml.match(/\/groups\/\d+\/add-user-with-role\/(\d+)\//)
  if (!addLink) {
    return { success: false, message: 'No add-user link found (user may already be in group)' }
  }
  const ssiUserId = addLink[1]
  if (debug) console.log(`[mgmt-add] Found SSI user ID: ${ssiUserId}`)

  const addUrl = `${SSI_BASE_URL}/groups/${groupId}/add-user-with-role/${ssiUserId}/?next=${nextUrl}`
  const formData = new URLSearchParams()
  formData.append('role', role)
  if (officials && officials.length > 0) {
    for (const off of officials) {
      formData.append('officials', off)
    }
  }

  if (debug) console.log(`[mgmt-add] POST ${addUrl} role=${role} officials=${officials || 'none'}`)
  const addResp = await fetch(addUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': formatCookies(cookies),
      'Referer': addUrl,
      'Origin': SSI_BASE_URL,
    },
    body: formData.toString(),
    redirect: 'manual',
  })

  if (debug) console.log(`[mgmt-add] Response: ${addResp.status}`)

  if (addResp.status === 302 || addResp.status === 301) {
    return { success: true, message: `Added to management (role=${role}, officials=${officials || 'none'})` }
  }
  if (addResp.status === 200) {
    const html = await addResp.text()
    if (html.includes('errorlist') || html.includes('is-invalid')) {
      const errMatch = html.match(/<(?:ul|div)[^>]*(?:errorlist|invalid-feedback)[^>]*>([\s\S]*?)<\/(?:ul|div)>/)
      return { success: false, message: errMatch ? errMatch[1].replace(/<[^>]+>/g, '').trim() : 'Form error' }
    }
    return { success: true, message: 'Added to management' }
  }
  throw new Error(`Add to management failed HTTP ${addResp.status}`)
}

// ============================================================
// Staffing: remove user from match management group
// ============================================================

export async function ssiRemoveFromMatchManagement(groupId, eventContentType, eventId, email, cookies) {
  const debug = log.isEnabled('debug')
  const nextUrl = `/event/${eventContentType}/${eventId}/staff/`
  let ssiUserId = null
  let usedFallback = false

  const searchUrl = `${SSI_BASE_URL}/event/${eventContentType}/${eventId}/participant-search-and-add/`
  cookies = await _participantSearchCookies(searchUrl, cookies)
  const searchData = new URLSearchParams()
  searchData.append('last_name', '')
  searchData.append('first_name', '')
  searchData.append('email', email)
  searchData.append('submit', 'Search')

  if (debug) console.log(`[mgmt-remove] POST search email=${email} to ${searchUrl}`)
  const searchResp = await fetch(searchUrl, {
    method: 'POST',
    headers: _participantFormHeaders(cookies, searchUrl),
    body: searchData.toString(),
    redirect: 'follow',
  })
  cookies = _participantResponseCookies(cookies, searchResp)

  if (searchResp.ok) {
    const searchHtml = await searchResp.text()
    const userIdMatch = searchHtml.match(/(?:register-participant|participant-search-and-add)\/(\d+)\//)
    if (userIdMatch) {
      ssiUserId = userIdMatch[1]
      if (debug) console.log(`[mgmt-remove] Found SSI user ID via participant search: ${ssiUserId}`)
    }
  } else {
    if (debug) console.log(`[mgmt-remove] Participant search failed HTTP ${searchResp.status}, will try staff page fallback`)
  }

  if (!ssiUserId) {
    if (debug) console.log(`[mgmt-remove] Attempting staff page fallback for ${email}`)
    usedFallback = true
    try {
      const staffUrl = `${SSI_BASE_URL}/event/${eventContentType}/${eventId}/staff/`
      const staffResp = await fetch(staffUrl, {
        headers: { 'Cookie': formatCookies(cookies) },
        redirect: 'follow',
      })

      if (!staffResp.ok) {
        throw new Error(`Staff page HTTP ${staffResp.status}`)
      }

      const staffHtml = await staffResp.text()
      const rowRegex = /<tr[^>]*>\s*<td[^>]*>\s*<input[^>]*type="checkbox"[^>]*value="(\d+)"[^>]*>\s*<\/td>([\s\S]*?)<\/tr>/gi
      let match
      let foundInStaff = false

      while ((match = rowRegex.exec(staffHtml)) !== null) {
        const userId = match[1]
        const cells = match[2]

        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
        const tdContents = []
        let td
        while ((td = tdRegex.exec(cells)) !== null) {
          const content = td[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          tdContents.push(content)
        }

        if (tdContents.length >= 3) {
          const contactField = tdContents[2].toLowerCase()
          const name = tdContents[1]
          const emailLower = email.toLowerCase()

          const emailPattern = new RegExp(`(?:^|\\s|[^a-z0-9])${emailLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|[^a-z0-9])`)
          if (emailPattern.test(contactField)) {
            ssiUserId = userId
            foundInStaff = true
            if (debug) console.log(`[mgmt-remove] Found user in staff page: ${name} (ID: ${userId}, contact: ${contactField})`)
            break
          }
        }
      }

      if (!foundInStaff) {
        if (debug) console.log(`[mgmt-remove] User ${email} not found in staff page either`)
        return { success: false, message: 'User not found in management group (may already be removed)', usedFallback }
      }
    } catch (err) {
      if (debug) console.error(`[mgmt-remove] Staff page fallback error: ${err.message}`)
      throw new Error(`Could not find user: ${err.message}`)
    }
  }

  if (!ssiUserId) {
    return { success: false, message: 'Could not determine user ID', usedFallback }
  }

  const removeUrl = `${SSI_BASE_URL}/groups/${groupId}/remove-invitation-role/${ssiUserId}/?next=${nextUrl}`
  if (debug) console.log(`[mgmt-remove] GET ${removeUrl}`)
  const removeResp = await fetch(removeUrl, {
    headers: { 'Cookie': formatCookies(cookies) },
    redirect: 'follow',
  })

  if (debug) console.log(`[mgmt-remove] Response: ${removeResp.status}`)

  if (removeResp.ok) {
    return { success: true, message: 'Removed from management group', usedFallback }
  }
  throw new Error(`Remove from management failed HTTP ${removeResp.status}`)
}

// ============================================================
// Get event staff by scraping /event/{ct}/{id}/staff/
// ============================================================

export async function ssiGetEventStaff(contentType, eventId, cookies) {
  const path = `/event/${contentType}/${eventId}/staff/`
  const html = await ssiFetchPage(path, cookies)

  const staff = []
  const rowRegex = /<tr>\s*<td[^>]*>\s*<input[^>]*value="(\d+)"[^>]*\/>\s*<\/td>([\s\S]*?)<\/tr>/g
  let match
  while ((match = rowRegex.exec(html)) !== null) {
    const cells = match[2]
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g
    const tdContents = []
    let td
    while ((td = tdRegex.exec(cells)) !== null) {
      tdContents.push(td[1].replace(/<[^>]+>/g, '').trim())
    }
    if (tdContents.length >= 4) {
      const name = tdContents[1]
      const role = tdContents[tdContents.length - 1].toLowerCase()
      if (name) {
        staff.push({ name, role })
      }
    }
  }
  return staff
}

// ============================================================
// Get SSI group members and roles by scraping /groups/{groupId}/
// Returns [{ userId, name, contact, email, role }]
// ============================================================

export async function ssiGetGroupMembers(groupId, cookies) {
  const path = `/groups/${groupId}/`
  const html = await ssiFetchPage(path, cookies)

  const members = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1]
    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
      m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    )
    if (tds.length < 3) continue

    const checkboxMatch = rowHtml.match(/<input[^>]*type="checkbox"[^>]*value="(\d+)"/i)
    const userId = checkboxMatch ? checkboxMatch[1] : null
    const roleCandidate = tds[tds.length - 1].toLowerCase()
    if (!['admin', 'staff', 'assistant', 'member'].includes(roleCandidate)) continue

    const name = tds.length >= 5 ? tds[2] : tds[1]
    const contact = tds.length >= 5 ? tds[3] : (tds[2] || '')
    const emailMatch = contact.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    const email = emailMatch ? emailMatch[0].toLowerCase() : null

    if (name && name.toLowerCase() !== 'name') {
      members.push({
        userId,
        name,
        contact,
        email,
        role: roleCandidate,
      })
    }
  }

  return members
}
