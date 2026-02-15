/**
 * Staffing API Route — endpoints for SRA training staff management.
 *
 * Direct role registration model:
 * POST /events/:id/signup  { role: "leadInstructor"|"equipmentManager"|"staff" }
 * DELETE /events/:id/signup  (resign from own role)
 */

import { Router } from 'express'
import { log } from '../lib/logger.js'
import {
  getAllEvents,
  getEventStatus,
  signup,
  resign,
  upsertEvent,
  syncStaffFromSSI,
} from '../lib/staffing/engine.js'
import { loadConfig, isAdminEmail, isServiceAccount, DEFAULT_SITE_KEY } from '../lib/staffing/config-loader.js'
import { getEventFilters, listStaffSites, isDbAvailable } from '../lib/db/client.js'
import {
  normalizeSiteKey,
  resolveSearchStrings,
  resolveEventTypes,
  isFutureOnlyEnabled,
  matchesEventType,
  matchesEventFilters,
} from '../lib/staffing/site-filters.js'
import {
  ssiRegisterToTrainerSquad,
  ssiGetMatchGroupId,
  ssiAddToMatchManagement,
  ssiRemoveFromMatchManagement,
  ssiGetMatchOfficials,
  ssiDeleteMatchParticipant,
  ssiSetParticipantSquad,
  ssiFetchPage,
  ssiFindParticipantInEvent,
} from '../lib/ssi-client.js'

// Map staffing roles to SSI management group role + event official codes
// role: 1=admin, 2=staff, 7=assistant
// officials: MD=Match Director, QM=Quarter Master
const SSI_ROLE_MAP = {
  staff:            { role: '1', officials: [] },
  leadInstructor:   { role: '1', officials: ['MD'] },
  equipmentManager: { role: '1', officials: ['QM'] },
}

function resolveTrainingTypeFromEventName(eventName, config) {
  const types = config?.trainingTypes || {}
  const nameLower = String(eventName || '').toLowerCase()

  for (const [key, typeCfg] of Object.entries(types)) {
    const patterns = typeCfg.searchPatterns || [key]
    if (patterns.some(p => nameLower.includes(String(p || '').toLowerCase()))) {
      return key
    }
  }

  const defaultTrainingTypeRaw = typeof config?.eventDiscovery?.defaultTrainingType === 'string'
    ? config.eventDiscovery.defaultTrainingType.trim()
    : ''
  if (defaultTrainingTypeRaw) {
    const defaultTrainingType = Object.keys(types).find(
      key => key.toLowerCase() === defaultTrainingTypeRaw.toLowerCase()
    )
    if (defaultTrainingType) return defaultTrainingType
  }

  const typeKeys = Object.keys(types)
  if (typeKeys.length === 1) {
    return typeKeys[0]
  }

  return null
}

function resolveRequestSiteKey(req) {
  const rawQuerySiteKey = typeof req.query?.siteKey === 'string' ? req.query.siteKey : null
  const rawBodySiteKey = typeof req.body?.siteKey === 'string' ? req.body.siteKey : null
  const rawExplicitSiteKey = rawQuerySiteKey || rawBodySiteKey
  const explicitSiteKey = rawExplicitSiteKey
    ? normalizeSiteKey(rawExplicitSiteKey, DEFAULT_SITE_KEY)
    : null

  const sessionSiteKey = req.staffingSiteKey
    ? normalizeSiteKey(req.staffingSiteKey, DEFAULT_SITE_KEY)
    : null

  if (sessionSiteKey && explicitSiteKey && explicitSiteKey !== sessionSiteKey) {
    const err = new Error('Site key mismatch for active staffing session')
    err.code = 'SITE_KEY_MISMATCH'
    throw err
  }

  return sessionSiteKey || explicitSiteKey || DEFAULT_SITE_KEY
}

/**
 * Create the staffing router.
 *
 * @param {object} deps
 * @param {Function} deps.requireAuth — auth middleware
 * @param {Function} deps.graphqlWithRefresh — GraphQL helper with auto-refresh
 * @returns {Router}
 */
export function createStaffingRouter({ requireAuth, graphqlWithRefresh, getAdminSession }) {
  const router = Router()

  // ============================================================
  // GET /sites — list staffing sites for login selection
  // ============================================================
  router.get('/sites', async (req, res) => {
    try {
      if (isDbAvailable()) {
        const sites = await listStaffSites()
        if (sites.length > 0) {
          return res.json({
            sites: sites.map(site => ({
              key: site.key,
              name: site.name,
            })),
          })
        }
      }

      const config = await loadConfig(DEFAULT_SITE_KEY)
      return res.json({
        sites: [{
          key: DEFAULT_SITE_KEY,
          name: config?.organization?.name || 'SRA training',
        }],
      })
    } catch (err) {
      console.error('[staffing] GET /sites error:', err.message)
      return res.status(500).json({ error: 'Failed to load staffing sites' })
    }
  })

  // ============================================================
  // GET /events — list training events with staffing status
  // ============================================================
  router.get('/events', requireAuth('staffing'), async (req, res) => {
    try {
      const siteKey = resolveRequestSiteKey(req)
      const config = await loadConfig(siteKey)
      const eventFilters = isDbAvailable() ? await getEventFilters(siteKey) : []
      const session = req.ssiSession

      // Get current user info (email is primary identifier in SSI)
      const meData = await graphqlWithRefresh(session, '{ me { email } }')
      const userEmail = meData.me?.email
      const isAdmin = userEmail ? await isAdminEmail(userEmail, siteKey) : false

      // Search SSI for training events
      const searchStrings = resolveSearchStrings(eventFilters, config.eventDiscovery.searchStrings)
      const allowedEventTypes = resolveEventTypes(eventFilters, config.eventDiscovery?.eventTypes || [])
      const contentTypeMap = {
        match: config.eventDiscovery?.matchContentType,
        cup: config.eventDiscovery?.cupContentType,
        league: config.eventDiscovery?.leagueContentType,
      }
      const futureOnly = isFutureOnlyEnabled(eventFilters)
      const contentType = config.eventDiscovery.matchContentType
      const seenIds = new Set()
      const ssiSyncQueue = [] // events needing staff page scrape
      const now = new Date()
      const searchStats = {
        queried: 0,
        deduped: 0,
        skippedPast: 0,
        skippedByFilter: 0,
        skippedByType: 0,
        skippedByTrainingType: 0,
        accepted: 0,
      }
      const acceptedEventsForLog = []

      log.info(`[staffing] Event discovery start (site=${siteKey}, user=${userEmail || 'unknown'})`, {
        filters: eventFilters.map(f => ({
          type: f.type,
          value: f.value,
          futureOnly: f.futureOnly !== false,
        })),
        searchStrings,
        allowedEventTypes: allowedEventTypes.length > 0 ? allowedEventTypes : ['any'],
        futureOnly,
        contentTypeMap,
      })

      for (const searchStr of searchStrings) {
        const data = await graphqlWithRefresh(session, `
          query SearchEvents($search: String!) {
            events(search: $search) {
              id
              name
              starts
              get_content_type_key
            }
          }
        `, { search: searchStr })

        const searchResults = Array.isArray(data.events) ? data.events.length : 0
        log.info(`[staffing] SSI search completed (site=${siteKey}, search="${searchStr}", results=${searchResults})`)

        if (data.events) {
          for (const evt of data.events) {
            searchStats.queried += 1

            if (seenIds.has(evt.id)) {
              searchStats.deduped += 1
              continue
            }

            // Only show future events
            if (futureOnly && new Date(evt.starts) <= now) {
              searchStats.skippedPast += 1
              continue
            }

            if (!matchesEventFilters(evt, eventFilters)) {
              searchStats.skippedByFilter += 1
              continue
            }

            if (!matchesEventType(evt, allowedEventTypes, { contentTypeMap })) {
              searchStats.skippedByType += 1
              continue
            }

            // Determine training type from name
            const trainingType = resolveTrainingTypeFromEventName(evt.name, config)
            if (!trainingType) {
              searchStats.skippedByTrainingType += 1
              continue
            }

            seenIds.add(evt.id)
            searchStats.accepted += 1

            const eventContentType = Number.parseInt(evt.get_content_type_key, 10)
            const resolvedContentType = Number.isFinite(eventContentType)
              ? eventContentType
              : config.eventDiscovery.matchContentType
            if (acceptedEventsForLog.length < 25) {
              acceptedEventsForLog.push({
                id: evt.id,
                contentType: resolvedContentType,
                name: evt.name,
                starts: evt.starts,
              })
            }
            let eventSquads = []

            if (Number.isFinite(eventContentType)) {
              try {
                const eventData = await graphqlWithRefresh(session, `
                  query GetEventSquads($ct: Int!, $id: String!) {
                    event(content_type: $ct, id: $id) {
                      squads {
                        id
                        number
                        comment
                        ... on NordicSquadNode    { competitors { id status shooter { email first_name last_name } } }
                        ... on IpscSquadNode      { competitors { id status shooter { email first_name last_name } } }
                        ... on PpcSquadNode       { competitors { id status shooter { email first_name last_name } } }
                        ... on CmpSquadNode       { competitors { id status shooter { email first_name last_name } } }
                        ... on PrecisionSquadNode { competitors { id status shooter { email first_name last_name } } }
                        ... on GenericSquadNode   { competitors { id status shooter { email first_name last_name } } }
                      }
                    }
                  }
                `, { ct: eventContentType, id: evt.id })

                eventSquads = eventData.event?.squads || []
              } catch (eventErr) {
                console.warn(`[staffing] Failed to load squads for event ${evt.id}: ${eventErr.message}`)
              }
            }

            // Calculate shooter count (exclude staff squad)
            const staffSquadNum = config.trainingTypes[trainingType]?.staffSquad || 5
            const staffSquadName = config.eventDiscovery.staffSquadName
            const shooterCount = eventSquads
              .filter(s => {
                const squadLabel = s.comment || `Squad ${s.number}`
                return s.number !== staffSquadNum && squadLabel !== staffSquadName
              })
              .reduce((sum, s) => sum + (s.competitors || []).filter(c => c.status === 'a').length, 0)

            // Upsert event in staffing engine
            await upsertEvent({
              eventId: evt.id,
              eventName: evt.name,
              trainingType,
              eventDate: evt.starts,
              shooterCount,
              contentType: resolvedContentType || null,
              siteKey,
            })

            // Extract trainer squad members (with emails from GraphQL)
            const staffSquad = eventSquads.find(s =>
              s.number === staffSquadNum || (s.comment || '').includes('Trainer')
            )
            
            // Get all competitors with email
            const competitors = (staffSquad?.competitors || [])
              .filter(c => c.status === 'a' && c.shooter?.email)
            
            // Filter out service accounts (async check)
            const filteredCompetitors = []
            for (const c of competitors) {
              const isService = await isServiceAccount(c.shooter.email, siteKey)
              if (!isService) {
                filteredCompetitors.push(c)
              }
            }
            
            const squadMembers = filteredCompetitors.map(c => ({
              email: c.shooter.email,
              userName: `${c.shooter.first_name || ''} ${c.shooter.last_name || ''}`.trim(),
            }))

            // Queue SSI staff page scrape for this event
            if (squadMembers.length > 0) {
              ssiSyncQueue.push({
                eventId: evt.id,
                squadMembers,
                contentType: resolvedContentType || contentType,
                siteKey,
              })
            }
          }
        }
      }

      // Sync staff from SSI: scrape staff pages for official roles, cross-reference
      // with trainer squad members (who have emails from GraphQL), and populate engine.
      // Uses admin cookies — regular users don't have match admin access.
      // Wrapped in try/catch: admin session is optional for event listing.
      let adminCookies = null
      try {
        const adminSession = getAdminSession ? await getAdminSession() : null
        adminCookies = adminSession?.cookies
      } catch (adminErr) {
        console.warn('[staffing] Admin session not available for SSI sync:', adminErr.message)
      }
      if (ssiSyncQueue.length > 0 && adminCookies) {
        await Promise.all(ssiSyncQueue.map(async ({ eventId, squadMembers, contentType: evtContentType, siteKey: syncSiteKey }) => {
          try {
            const officials = await ssiGetMatchOfficials(evtContentType, eventId, adminCookies)

            // Build name → officials lookup from staff page
            const officialsByName = new Map()
            for (const m of officials) {
              officialsByName.set(m.name.toLowerCase(), m.officials)
            }

            // Map squad members to roles by cross-referencing name → officials
            const staffList = squadMembers.map(member => {
              const offs = officialsByName.get(member.userName.toLowerCase()) || []
              let role = 'staff'
              if (offs.includes('MD')) role = 'leadInstructor'
              else if (offs.includes('QM')) role = 'equipmentManager'
              return { email: member.email, userName: member.userName, role }
            })

            syncStaffFromSSI(eventId, staffList, syncSiteKey)
          } catch (err) {
            console.error(`[staffing] SSI sync failed for event ${eventId}: ${err.message}`)
          }
        }))
      }

      // Build response with synced state
      const allMatches = []
      for (const eid of seenIds) {
        const status = await getEventStatus(eid, siteKey)
        if (status) allMatches.push(status)
      }

      // Also include future events from local state not in SSI results
      for (const le of getAllEvents(siteKey)) {
        if (new Date(le.eventDate) <= now) continue
        if (!matchesEventFilters({ id: le.eventId, name: le.eventName, starts: le.eventDate }, eventFilters)) continue
        if (!seenIds.has(le.eventId)) {
          const status = await getEventStatus(le.eventId, siteKey)
          if (status) allMatches.push(status)
        }
      }

      // Sort by event date ascending
      allMatches.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))

      log.info(`[staffing] Event discovery completed (site=${siteKey})`, {
        searchStats,
        discoveredEventIds: [...seenIds],
        acceptedEventsSample: acceptedEventsForLog,
        responseCount: allMatches.length,
        queuedForSsiSync: ssiSyncQueue.length,
      })

      if (seenIds.size === 0) {
        log.warn(`[staffing] Event discovery returned no SSI matches (site=${siteKey})`, {
          searchStrings,
          allowedEventTypes: allowedEventTypes.length > 0 ? allowedEventTypes : ['any'],
          futureOnly,
          filters: eventFilters,
        })
      }

      res.json({ events: allMatches, isAdmin, userEmail, siteKey })
    } catch (err) {
      if (err.code === 'SITE_KEY_MISMATCH') {
        return res.status(403).json({ error: err.message })
      }
      console.error('[staffing] GET /events error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /events/:eventId/signup — register for a role
  // Body: { role: "leadInstructor" | "equipmentManager" | "staff" }
  // ============================================================
  router.post('/events/:eventId/signup', requireAuth('staffing'), async (req, res) => {
    try {
      const siteKey = resolveRequestSiteKey(req)
      const session = req.ssiSession
      const { role } = req.body || {}

      if (!role) return res.status(400).json({ error: 'role is required' })

      // Get user info from SSI (email is primary identifier)
      const meData = await graphqlWithRefresh(session, '{ me { email first_name last_name } }')
      const me = meData.me
      if (!me?.email) return res.status(401).json({ error: 'Could not get user info' })

      const user = {
        email: me.email,
        userName: `${me.first_name} ${me.last_name}`.trim(),
      }

      const result = signup(req.params.eventId, user, role, siteKey)

      // SSI integration (blocking to provide feedback)
      // Uses admin cookies — user doesn't have match admin access yet
      const config = await loadConfig(siteKey)
      const staffSquadName = config.eventDiscovery.staffSquadName
      const adminSess = getAdminSession ? await getAdminSession() : null
      const cookies = adminSess?.cookies
      const eventId = req.params.eventId
      const ssiResults = { trainerSquad: null, management: null }

      // Get event-specific content type from stored event data
      const event = await getEventStatus(eventId, siteKey)
      const contentType = event?.contentType || config.eventDiscovery.matchContentType

      // Determine staff squad number from config
      const staffSquadNum = event?.trainingType && config.trainingTypes?.[event.trainingType]?.staffSquad
        ? config.trainingTypes[event.trainingType].staffSquad
        : 5

      if (contentType && cookies) {
        // 1. Add to SSI Trainer Squad
        if (staffSquadName) {
          try {
            const squadResult = await ssiRegisterToTrainerSquad(contentType, eventId, me.email, staffSquadName, cookies)
            console.log(`[staffing] SSI trainer squad: ${me.email} → ${squadResult.message}`)
            ssiResults.trainerSquad = { success: true, message: squadResult.message }

            // Fallback: if "Already registered" but not in the trainer squad,
            // find competitor ID via GraphQL and move them to the correct squad
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

                // Find user's competitor entry across all squads
                let competitorId = null
                let currentSquad = null
                for (const sq of sqData.event?.squads || []) {
                  const comp = (sq.competitors || []).find(c => c.shooter?.email === me.email)
                  if (comp) {
                    competitorId = comp.id
                    currentSquad = sq.number
                    break
                  }
                }

                if (competitorId && currentSquad !== staffSquadNum) {
                  console.log(`[staffing] ${me.email} in Squad ${currentSquad}, moving to Squad ${staffSquadNum} (competitor ${competitorId})`)
                  const moveResult = await ssiSetParticipantSquad(competitorId, staffSquadNum, cookies, 'a', 23)
                  console.log(`[staffing] Squad move: ${moveResult.message || 'done'}`)
                  ssiResults.trainerSquad = { success: true, message: `Moved to Squad ${staffSquadNum}` }
                } else if (competitorId && currentSquad === staffSquadNum) {
                  console.log(`[staffing] ${me.email} already in Squad ${staffSquadNum}`)
                } else if (!competitorId) {
                  // User is registered but not in any squad (unassigned).
                  // Scrape participants page to find participant ID, then set squad.
                  console.log(`[staffing] ${me.email} not in any squad, scraping participants page...`)
                  const partHtml = await ssiFetchPage(`/event/${contentType}/${eventId}/participants/`, cookies)
                  // Pattern: <a href="/event/participant/23/{participantId}/">Name</a>
                  const partMatch = partHtml.match(/\/event\/participant\/\d+\/(\d+)\/[^"]*"[^>]*>[^<]*Tuloskone[^<]*/i)
                    || partHtml.match(new RegExp(`/event/participant/\\d+/(\\d+)/[^"]*"[^>]*>[^<]*${me.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))

                  // More robust: find all participant links, match by user name
                  const userName = user.userName
                  const allParts = [...partHtml.matchAll(/\/event\/participant\/(\d+)\/(\d+)\/[^"]*"[^>]*>([^<]*)</gi)]
                  const userPart = allParts.find(m => m[3].trim().toLowerCase() === userName.toLowerCase())

                  const participantId = userPart?.[2] || partMatch?.[1]
                  const participantCT = userPart?.[1] || '23'

                  if (participantId) {
                    console.log(`[staffing] Found participant ${participantId} (ct=${participantCT}), setting squad to ${staffSquadNum}`)
                    const moveResult = await ssiSetParticipantSquad(participantId, staffSquadNum, cookies, 'a', parseInt(participantCT))
                    console.log(`[staffing] Squad set: ${moveResult.message || 'done'}`)
                    ssiResults.trainerSquad = { success: true, message: `Assigned to Squad ${staffSquadNum}` }
                  } else {
                    console.warn(`[staffing] Could not find participant ID for ${me.email} on participants page`)
                  }
                }
              } catch (fallbackErr) {
                console.error(`[staffing] Squad fallback failed: ${fallbackErr.message}`)
              }
            }
          } catch (e) {
            console.error(`[staffing] SSI trainer squad failed for ${me.email}: ${e.message}`)
            ssiResults.trainerSquad = { success: false, message: e.message }
          }
        }

        // 2. Add to SSI management group with role-appropriate officials
        const ssiRole = SSI_ROLE_MAP[role]
        if (ssiRole) {
          try {
            const groupId = await ssiGetMatchGroupId(contentType, eventId, cookies)
            const mgmtResult = await ssiAddToMatchManagement(groupId, contentType, eventId, me.email, ssiRole.role, ssiRole.officials, cookies)
            console.log(`[staffing] SSI management: ${me.email} (${role}) → ${mgmtResult.message}`)
            ssiResults.management = { success: true, message: mgmtResult.message, role: 'Admin' }
          } catch (e) {
            console.error(`[staffing] SSI management add failed for ${me.email}: ${e.message}`)
            ssiResults.management = { success: false, message: e.message }
          }
        }
      }

      res.json({ ...result, ssi: ssiResults, siteKey })
    } catch (err) {
      console.error('[staffing] POST /signup error:', err.message)
      const status = err.code === 'SITE_KEY_MISMATCH' ? 403
        : err.message.includes('Not authorized') ? 403
        : err.message.includes('not found') ? 404
        : err.message.includes('full') || err.message.includes('taken') || err.message.includes('Already') ? 409
        : 500
      res.status(status).json({ error: err.message })
    }
  })

  // ============================================================
  // DELETE /events/:eventId/signup — resign from own role
  // ============================================================
  router.delete('/events/:eventId/signup', requireAuth('staffing'), async (req, res) => {
    try {
      const siteKey = resolveRequestSiteKey(req)
      const session = req.ssiSession
      const meData = await graphqlWithRefresh(session, '{ me { email first_name last_name } }')
      const userEmail = meData.me?.email
      if (!userEmail) return res.status(401).json({ error: 'Could not get user info' })

      const userName = `${meData.me.first_name} ${meData.me.last_name}`.trim()
      const result = resign(req.params.eventId, userEmail, siteKey)

      // SSI integration: remove from management group AND trainer squad (Squad 5)
      // Uses admin cookies — user may have already lost match access
      const config = await loadConfig(siteKey)
      const adminSess = getAdminSession ? await getAdminSession() : null
      const cookies = adminSess?.cookies
      const eventId = req.params.eventId
      const ssiResults = { management: null, trainerSquad: null }

      // Get event-specific content type from stored event data
      const event = await getEventStatus(eventId, siteKey)
      const contentType = event?.contentType || config.eventDiscovery.matchContentType

      if (contentType && cookies) {
        // Step 1: Remove from management group (admin cookies)
        try {
          const groupId = await ssiGetMatchGroupId(contentType, eventId, cookies)
          const removeResult = await ssiRemoveFromMatchManagement(groupId, contentType, eventId, userEmail, cookies)
          console.log(`[staffing] SSI management remove: ${userEmail} → ${removeResult.message}`)
          ssiResults.management = { success: true, message: removeResult.message, usedFallback: removeResult.usedFallback }
        } catch (e) {
          console.error(`[staffing] SSI management remove failed for ${userEmail}: ${e.message}`)
          if (!e.message.includes('not found') && !e.message.includes('may already be removed')) {
            ssiResults.management = { success: false, message: e.message }
          } else {
            ssiResults.management = { success: true, message: 'Already removed or not found' }
          }
        }

        // Step 2: Remove from trainer squad via web scraping (admin cookies).
        // Uses ssiFindParticipantInEvent to scrape /event/{ct}/{id}/participants/
        // instead of GraphQL, because the admin JWT does NOT return shooter.email
        // for other users (SSI privacy restriction). Admin cookies have no such limit.
        try {
          const displayName = userName && userName.trim() ? userName : userEmail
          const found = await ssiFindParticipantInEvent(contentType, eventId, displayName, cookies)

          if (found) {
            log.debug(`[staffing] Found participant ${found.participantId} (ct=${found.participantCT}) for "${displayName}" via scraping`)
            const deleteResult = await ssiDeleteMatchParticipant(eventId, found.participantId, displayName, cookies, found.participantCT)
            console.log(`[staffing] SSI trainer squad remove: ${userEmail} → ${deleteResult.message}`)
            ssiResults.trainerSquad = { success: true, message: deleteResult.message }
          } else {
            console.log(`[staffing] ${userEmail} ("${displayName}") not found on participants page (may already be removed)`)
            ssiResults.trainerSquad = { success: true, message: 'Not found on participants page (may already be removed)' }
          }
        } catch (e) {
          console.error(`[staffing] SSI trainer squad remove failed for ${userEmail}: ${e.message}`)
          ssiResults.trainerSquad = { success: false, message: e.message }
        }
      }

      // Build warning message if there were any SSI issues
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

      // Return result with optional warning
      if (ssiWarning) {
        res.json({ ...result, warning: ssiWarning, ssi: ssiResults, siteKey })
      } else {
        res.json({ ...result, ssi: ssiResults, siteKey })
      }
    } catch (err) {
      console.error('[staffing] DELETE /signup error:', err.message)
      const status = err.code === 'SITE_KEY_MISMATCH' ? 403
        : err.message.includes('not found') || err.message.includes('Not registered') ? 404
        : 500
      res.status(status).json({ error: err.message })
    }
  })

  // ============================================================
  // GET /config — get staffing configuration
  // ============================================================
  router.get('/config', requireAuth('staffing'), async (req, res) => {
    try {
      const siteKey = resolveRequestSiteKey(req)
      const config = await loadConfig(siteKey)
      res.json({
        siteKey,
        trainingTypes: config.trainingTypes,
        roles: config.roles,
      })
    } catch (err) {
      if (err.code === 'SITE_KEY_MISMATCH') {
        return res.status(403).json({ error: err.message })
      }
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
