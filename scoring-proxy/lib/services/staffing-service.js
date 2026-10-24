// ============================================================
// Staffing Service — Pure Business Logic & SSI Orchestration
// ============================================================

import { log } from '../logger.js'
import {
  getAllEvents,
  getEventStatus,
  signup,
  resign,
  upsertEvent,
  syncStaffFromSSI,
} from '../staffing/engine.js'
import { loadConfig, isAdminEmail, isServiceAccount } from '../staffing/config-loader.js'
import {
  ssiRegisterToTrainerSquad,
  ssiDeleteMatchParticipant,
  ssiSetParticipantSquad,
  ssiFindParticipantInEvent,
} from '../ssi-core/participants.js'
import {
  ssiGetMatchGroupId,
  ssiAddToMatchManagement,
  ssiRemoveFromMatchManagement,
  ssiGetMatchOfficials,
} from '../ssi-core/management.js'
import { ssiFetchPage } from '../ssi-core/http-helpers.js'

export const SSI_ROLE_MAP = {
  staff:            { role: '1', officials: [] },
  leadInstructor:   { role: '1', officials: ['MD'] },
  equipmentManager: { role: '1', officials: ['QM'] },
}

export function matchTrainingType(eventName, trainingTypes = {}) {
  const nameLower = String(eventName || '').toLowerCase()
  for (const [key, typeCfg] of Object.entries(trainingTypes)) {
    const patterns = typeCfg.searchPatterns || [key]
    if (patterns.some(p => nameLower.includes(p.toLowerCase()))) {
      return key
    }
  }
  return null
}

export function calculateShooterCount(squads = [], staffSquadNum = 5, staffSquadName = 'Staff') {
  return (squads || [])
    .filter(s => {
      const squadLabel = s.comment || `Squad ${s.number}`
      return s.number !== staffSquadNum && squadLabel !== staffSquadName
    })
    .reduce((sum, s) => sum + (s.competitors || []).filter(c => c.status === 'a').length, 0)
}

export function extractTrainerSquadMembers(squads = [], staffSquadNum = 5) {
  const staffSquad = (squads || []).find(s =>
    s.number === staffSquadNum || (s.comment || '').includes('Trainer')
  )
  return (staffSquad?.competitors || [])
    .filter(c => c.status === 'a' && c.shooter?.email && !isServiceAccount(c.shooter.email))
    .map(c => ({
      email: c.shooter.email,
      userName: `${c.shooter.first_name || ''} ${c.shooter.last_name || ''}`.trim(),
    }))
}

export function buildResignWarning(ssiResults) {
  let ssiWarning = null
  if (ssiResults.management?.usedFallback) {
    ssiWarning = 'Partial withdrawal detected during removal. Full cleanup completed.'
  }
  if (ssiResults.management?.success === false || ssiResults.trainerSquad?.success === false) {
    const issues = []
    if (ssiResults.management?.success === false) issues.push(`management: ${ssiResults.management.message}`)
    if (ssiResults.trainerSquad?.success === false) issues.push(`trainer squad: ${ssiResults.trainerSquad.message}`)
    ssiWarning = `Warning: SSI removal had issues: ${issues.join('; ')}`
  }
  return ssiWarning
}

export async function listAndSyncStaffingEvents({ session, graphqlWithRefresh, getAdminSession }) {
  const config = loadConfig()
  const meData = await graphqlWithRefresh(session, '{ me { email } }')
  const userEmail = meData.me?.email
  const isAdmin = userEmail ? isAdminEmail(userEmail) : false

  const searchStrings = config.eventDiscovery.searchStrings
  const contentType = config.eventDiscovery.matchContentType
  const seenIds = new Set()
  const ssiSyncQueue = []

  for (const searchStr of searchStrings) {
    const data = await graphqlWithRefresh(session, `
      query SearchEvents($search: String!) {
        events(search: $search) {
          id
          name
          starts
          get_content_type_key
          squads {
            id
            number
            comment
            ... on NordicSquadNode {
              competitors { id status shooter { email first_name last_name } }
            }
            ... on IpscSquadNode {
              competitors { id status shooter { email first_name last_name } }
            }
            ... on GenericSquadNode {
              competitors { id status shooter { email first_name last_name } }
            }
          }
        }
      }
    `, { search: searchStr })

    if (data.events) {
      const now = new Date()
      for (const evt of data.events) {
        if (seenIds.has(evt.id)) continue
        seenIds.add(evt.id)

        if (new Date(evt.starts) <= now) continue

        const trainingType = matchTrainingType(evt.name, config.trainingTypes)
        if (!trainingType) continue

        const staffSquadNum = config.trainingTypes[trainingType]?.staffSquad || 5
        const staffSquadName = config.eventDiscovery.staffSquadName
        const shooterCount = calculateShooterCount(evt.squads, staffSquadNum, staffSquadName)

        upsertEvent({
          eventId: evt.id,
          eventName: evt.name,
          trainingType,
          eventDate: evt.starts,
          shooterCount,
          contentType: evt.get_content_type_key || null,
        })

        const squadMembers = extractTrainerSquadMembers(evt.squads, staffSquadNum)
        if (squadMembers.length > 0) {
          ssiSyncQueue.push({
            eventId: evt.id,
            squadMembers,
            contentType: evt.get_content_type_key || contentType,
          })
        }
      }
    }
  }

  let adminCookies = null
  try {
    const adminSession = getAdminSession ? await getAdminSession() : null
    adminCookies = adminSession?.cookies
  } catch (adminErr) {
    log.warn('[staffing] Admin session not available for SSI sync:', adminErr.message)
  }

  if (ssiSyncQueue.length > 0 && adminCookies) {
    await Promise.all(ssiSyncQueue.map(async ({ eventId, squadMembers, contentType: evtContentType }) => {
      try {
        const officials = await ssiGetMatchOfficials(evtContentType, eventId, adminCookies)
        const officialsByName = new Map()
        for (const m of officials) {
          officialsByName.set(m.name.toLowerCase(), m.officials)
        }

        const staffList = squadMembers.map(member => {
          const offs = officialsByName.get(member.userName.toLowerCase()) || []
          let role = 'staff'
          if (offs.includes('MD')) role = 'leadInstructor'
          else if (offs.includes('QM')) role = 'equipmentManager'
          return { email: member.email, userName: member.userName, role }
        })

        syncStaffFromSSI(eventId, staffList)
      } catch (err) {
        log.error(`[staffing] SSI sync failed for event ${eventId}: ${err.message}`)
      }
    }))
  }

  const allMatches = []
  for (const eid of seenIds) {
    const status = getEventStatus(eid)
    if (status) allMatches.push(status)
  }

  const now = new Date()
  for (const le of getAllEvents()) {
    if (new Date(le.eventDate) <= now) continue
    if (!seenIds.has(le.eventId)) {
      allMatches.push(getEventStatus(le.eventId))
    }
  }

  allMatches.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))
  return { events: allMatches, isAdmin, userEmail }
}

export async function performStaffSignup({ eventId, role, user, graphqlWithRefresh, getAdminSession }) {
  const result = signup(eventId, user, role)
  const config = loadConfig()
  const staffSquadName = config.eventDiscovery.staffSquadName
  const adminSess = getAdminSession ? await getAdminSession() : null
  const cookies = adminSess?.cookies
  const ssiResults = { trainerSquad: null, management: null }

  const event = getEventStatus(eventId)
  const contentType = event?.contentType || config.eventDiscovery.matchContentType
  const staffSquadNum = event?.trainingType && config.trainingTypes?.[event.trainingType]?.staffSquad
    ? config.trainingTypes[event.trainingType].staffSquad
    : 5

  if (contentType && cookies) {
    if (staffSquadName) {
      try {
        const squadResult = await ssiRegisterToTrainerSquad(contentType, eventId, user.email, staffSquadName, cookies)
        log.debug(`[staffing] SSI trainer squad: ${user.email} → ${squadResult.message}`)
        ssiResults.trainerSquad = { success: true, message: squadResult.message }

        if (squadResult.message?.includes('Already registered')) {
          try {
            const sqData = await graphqlWithRefresh(adminSess, `
              query GetSquads($ct: Int!, $id: String!) {
                event(content_type: $ct, id: $id) {
                  squads {
                    number
                    ... on NordicSquadNode    { competitors { id shooter { email } } }
                    ... on IpscSquadNode      { competitors { id shooter { email } } }
                    ... on PpcSquadNode       { competitors { id shooter { email } } }
                    ... on CmpSquadNode       { competitors { id shooter { email } } }
                    ... on PrecisionSquadNode { competitors { id shooter { email } } }
                    ... on GenericSquadNode   { competitors { id shooter { email } } }
                  }
                }
              }
            `, { ct: contentType, id: eventId })

            let competitorId = null
            let currentSquad = null
            for (const sq of sqData.event?.squads || []) {
              const comp = (sq.competitors || []).find(c => c.shooter?.email === user.email)
              if (comp) {
                competitorId = comp.id
                currentSquad = sq.number
                break
              }
            }

            if (competitorId && currentSquad !== staffSquadNum) {
              const moveResult = await ssiSetParticipantSquad(competitorId, staffSquadNum, cookies, 'a', 23)
              log.debug(`[staffing] Squad move: ${moveResult.message || 'done'}`)
              ssiResults.trainerSquad = { success: true, message: `Moved to Squad ${staffSquadNum}` }
            } else if (!competitorId) {
              const partHtml = await ssiFetchPage(`/event/${contentType}/${eventId}/participants/`, cookies)
              const partMatch = partHtml.match(/\/event\/participant\/\d+\/(\d+)\/[^"]*"[^>]*>[^<]*Tuloskone[^<]*/i)
                || partHtml.match(new RegExp(`/event/participant/\\d+/(\\d+)/[^"]*"[^>]*>[^<]*${user.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))
              const allParts = [...partHtml.matchAll(/\/event\/participant\/(\d+)\/(\d+)\/[^"]*"[^>]*>([^<]*)</gi)]
              const userPart = allParts.find(m => m[3].trim().toLowerCase() === user.userName.toLowerCase())
              const participantId = userPart?.[2] || partMatch?.[1]
              const participantCT = userPart?.[1] || '23'

              if (participantId) {
                await ssiSetParticipantSquad(participantId, staffSquadNum, cookies, 'a', parseInt(participantCT))
                ssiResults.trainerSquad = { success: true, message: `Assigned to Squad ${staffSquadNum}` }
              }
            }
          } catch (fallbackErr) {
            log.error(`[staffing] Squad fallback failed: ${fallbackErr.message}`)
          }
        }
      } catch (e) {
        log.error(`[staffing] SSI trainer squad failed for ${user.email}: ${e.message}`)
        ssiResults.trainerSquad = { success: false, message: e.message }
      }
    }

    const ssiRole = SSI_ROLE_MAP[role]
    if (ssiRole) {
      try {
        const groupId = await ssiGetMatchGroupId(contentType, eventId, cookies)
        const mgmtResult = await ssiAddToMatchManagement(groupId, contentType, eventId, user.email, ssiRole.role, ssiRole.officials, cookies)
        ssiResults.management = { success: true, message: mgmtResult.message, role: 'Admin' }
      } catch (e) {
        log.error(`[staffing] SSI management add failed for ${user.email}: ${e.message}`)
        ssiResults.management = { success: false, message: e.message }
      }
    }
  }

  return { ...result, ssi: ssiResults }
}

export async function performStaffResign({ eventId, userEmail, userName, getAdminSession }) {
  const result = resign(eventId, userEmail)
  const config = loadConfig()
  const adminSess = getAdminSession ? await getAdminSession() : null
  const cookies = adminSess?.cookies
  const ssiResults = { management: null, trainerSquad: null }

  const event = getEventStatus(eventId)
  const contentType = event?.contentType || config.eventDiscovery.matchContentType

  if (contentType && cookies) {
    try {
      const groupId = await ssiGetMatchGroupId(contentType, eventId, cookies)
      const removeResult = await ssiRemoveFromMatchManagement(groupId, contentType, eventId, userEmail, cookies)
      ssiResults.management = { success: true, message: removeResult.message, usedFallback: removeResult.usedFallback }
    } catch (e) {
      log.error(`[staffing] SSI management remove failed for ${userEmail}: ${e.message}`)
      if (!e.message.includes('not found') && !e.message.includes('may already be removed')) {
        ssiResults.management = { success: false, message: e.message }
      } else {
        ssiResults.management = { success: true, message: 'Already removed or not found' }
      }
    }

    try {
      const displayName = userName && userName.trim() ? userName : userEmail
      const found = await ssiFindParticipantInEvent(contentType, eventId, displayName, cookies)

      if (found) {
        const deleteResult = await ssiDeleteMatchParticipant(eventId, found.participantId, displayName, cookies, found.participantCT)
        ssiResults.trainerSquad = { success: true, message: deleteResult.message }
      } else {
        ssiResults.trainerSquad = { success: true, message: 'Not found on participants page (may already be removed)' }
      }
    } catch (e) {
      log.error(`[staffing] SSI trainer squad remove failed for ${userEmail}: ${e.message}`)
      ssiResults.trainerSquad = { success: false, message: e.message }
    }
  }

  const ssiWarning = buildResignWarning(ssiResults)
  return ssiWarning
    ? { ...result, warning: ssiWarning, ssi: ssiResults }
    : { ...result, ssi: ssiResults }
}
