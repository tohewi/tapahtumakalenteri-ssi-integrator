/**
 * Staffing API Route — endpoints for SRA training staff management.
 *
 * Direct role registration model:
 * POST /events/:id/signup  { role: "leadInstructor"|"equipmentManager"|"staff" }
 * DELETE /events/:id/signup  (resign from own role)
 */

import { Router } from 'express'
import {
  getAllEvents,
  getEventStatus,
  signup,
  resign,
  upsertEvent,
  syncStaffFromSSI,
} from '../lib/staffing/engine.js'
import { loadConfig, isAdminEmail } from '../lib/staffing/config-loader.js'
import {
  ssiRegisterToTrainerSquad,
  ssiGetMatchGroupId,
  ssiAddToMatchManagement,
  ssiRemoveFromMatchManagement,
  ssiGetMatchOfficials,
  ssiDeleteMatchParticipant,
} from '../lib/ssi-client.js'

// Map staffing roles to SSI management group role + event official codes
// role: 1=admin, 2=staff, 7=assistant
// officials: MD=Match Director, QM=Quarter Master
const SSI_ROLE_MAP = {
  staff:            { role: '1', officials: [] },
  leadInstructor:   { role: '1', officials: ['MD'] },
  equipmentManager: { role: '1', officials: ['QM'] },
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
  // GET /events — list training events with staffing status
  // ============================================================
  router.get('/events', requireAuth('staffing'), async (req, res) => {
    try {
      const config = loadConfig()
      const session = req.ssiSession

      // Get current user info (email is primary identifier in SSI)
      const meData = await graphqlWithRefresh(session, '{ me { email } }')
      const userEmail = meData.me?.email
      const isAdmin = userEmail ? isAdminEmail(userEmail) : false

      // Search SSI for training events
      const searchStrings = config.eventDiscovery.searchStrings
      const contentType = config.eventDiscovery.matchContentType
      const seenIds = new Set()
      const ssiSyncQueue = [] // events needing staff page scrape

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

            // Only show future events
            if (new Date(evt.starts) <= now) continue

            // Determine training type from name
            const nameLower = evt.name.toLowerCase()
            let trainingType = null
            for (const [key, typeCfg] of Object.entries(config.trainingTypes)) {
              const patterns = typeCfg.searchPatterns || [key]
              if (patterns.some(p => nameLower.includes(p.toLowerCase()))) {
                trainingType = key
                break
              }
            }
            if (!trainingType) continue

            // Calculate shooter count (exclude staff squad)
            const staffSquadNum = config.trainingTypes[trainingType]?.staffSquad || 5
            const staffSquadName = config.eventDiscovery.staffSquadName
            const shooterCount = (evt.squads || [])
              .filter(s => {
                const squadLabel = s.comment || `Squad ${s.number}`
                return s.number !== staffSquadNum && squadLabel !== staffSquadName
              })
              .reduce((sum, s) => sum + (s.competitors || []).filter(c => c.status === 'a').length, 0)

            // Upsert event in staffing engine
            upsertEvent({
              eventId: evt.id,
              eventName: evt.name,
              trainingType,
              eventDate: evt.starts,
              shooterCount,
              contentType: evt.get_content_type_key || null,
            })

            // Extract trainer squad members (with emails from GraphQL)
            const staffSquad = (evt.squads || []).find(s =>
              s.number === staffSquadNum || (s.comment || '').includes('Trainer')
            )
            const squadMembers = (staffSquad?.competitors || [])
              .filter(c => c.status === 'a' && c.shooter?.email)
              .map(c => ({
                email: c.shooter.email,
                userName: `${c.shooter.first_name || ''} ${c.shooter.last_name || ''}`.trim(),
              }))

            // Queue SSI staff page scrape for this event
            if (squadMembers.length > 0) {
              ssiSyncQueue.push({
                eventId: evt.id,
                squadMembers,
                contentType: evt.get_content_type_key || contentType
              })
            }
          }
        }
      }

      // Sync staff from SSI: scrape staff pages for official roles, cross-reference
      // with trainer squad members (who have emails from GraphQL), and populate engine.
      // Uses admin cookies — regular users don't have match admin access.
      const adminSession = getAdminSession ? await getAdminSession() : null
      const adminCookies = adminSession?.cookies
      if (ssiSyncQueue.length > 0 && adminCookies) {
        await Promise.all(ssiSyncQueue.map(async ({ eventId, squadMembers, contentType: evtContentType }) => {
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

            syncStaffFromSSI(eventId, staffList)
          } catch (err) {
            console.error(`[staffing] SSI sync failed for event ${eventId}: ${err.message}`)
          }
        }))
      }

      // Build response with synced state
      const allMatches = []
      for (const eid of seenIds) {
        const status = getEventStatus(eid)
        if (status) allMatches.push(status)
      }

      // Also include future events from local state not in SSI results
      const now = new Date()
      for (const le of getAllEvents()) {
        if (new Date(le.eventDate) <= now) continue
        if (!seenIds.has(le.eventId)) {
          allMatches.push(getEventStatus(le.eventId))
        }
      }

      // Sort by event date ascending
      allMatches.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))

      res.json({ events: allMatches, isAdmin, userEmail })
    } catch (err) {
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

      const result = signup(req.params.eventId, user, role)

      // SSI integration (blocking to provide feedback)
      // Uses admin cookies — user doesn't have match admin access yet
      const config = loadConfig()
      const staffSquadName = config.eventDiscovery.staffSquadName
      const adminSess = getAdminSession ? await getAdminSession() : null
      const cookies = adminSess?.cookies
      const eventId = req.params.eventId
      const ssiResults = { trainerSquad: null, management: null }

      // Get event-specific content type from stored event data
      const event = getEventStatus(eventId)
      const contentType = event?.contentType || config.eventDiscovery.matchContentType

      if (contentType && cookies) {
        // 1. Add to SSI Trainer Squad
        if (staffSquadName) {
          try {
            const squadResult = await ssiRegisterToTrainerSquad(contentType, eventId, me.email, staffSquadName, cookies)
            console.log(`[staffing] SSI trainer squad: ${me.email} → ${squadResult.message}`)
            ssiResults.trainerSquad = { success: true, message: squadResult.message }
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

      res.json({ ...result, ssi: ssiResults })
    } catch (err) {
      console.error('[staffing] POST /signup error:', err.message)
      const status = err.message.includes('Not authorized') ? 403
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
      const session = req.ssiSession
      const meData = await graphqlWithRefresh(session, '{ me { email first_name last_name } }')
      const userEmail = meData.me?.email
      if (!userEmail) return res.status(401).json({ error: 'Could not get user info' })

      const userName = `${meData.me.first_name} ${meData.me.last_name}`.trim()
      const result = resign(req.params.eventId, userEmail)

      // SSI integration: remove from management group AND trainer squad (Squad 5)
      // Uses admin cookies — user may have already lost match access
      const config = loadConfig()
      const adminSess = getAdminSession ? await getAdminSession() : null
      const cookies = adminSess?.cookies
      const eventId = req.params.eventId
      const ssiResults = { management: null, trainerSquad: null }

      // Get event-specific content type from stored event data
      const event = getEventStatus(eventId)
      const contentType = event?.contentType || config.eventDiscovery.matchContentType

      if (contentType && cookies) {
        // 1. Remove from management group
        try {
          const groupId = await ssiGetMatchGroupId(contentType, eventId, cookies)
          const removeResult = await ssiRemoveFromMatchManagement(groupId, contentType, eventId, userEmail, cookies)
          console.log(`[staffing] SSI management remove: ${userEmail} → ${removeResult.message}`)
          ssiResults.management = { success: true, message: removeResult.message, usedFallback: removeResult.usedFallback }
        } catch (e) {
          console.error(`[staffing] SSI management remove failed for ${userEmail}: ${e.message}`)
          // Only set error for critical failures (user already removed is OK)
          if (!e.message.includes('not found') && !e.message.includes('may already be removed')) {
            ssiResults.management = { success: false, message: e.message }
          } else {
            ssiResults.management = { success: true, message: 'Already removed or not found' }
          }
        }

        // 2. Remove from trainer squad (Squad 5)
        try {
          // Fetch event squads to find user's participant ID in trainer squad
          // Uses admin session — user may have lost match access after resignation
          const staffSquadNum = event?.trainingType && config.trainingTypes?.[event.trainingType]?.staffSquad 
            ? config.trainingTypes[event.trainingType].staffSquad 
            : 5
          const squadData = await graphqlWithRefresh(adminSess, `
            query GetEventSquads($contentType: Int!, $eventId: Int!) {
              event(content_type: $contentType, id: $eventId) {
                squads {
                  id
                  number
                  ... on NordicSquadNode {
                    competitors { id status shooter { email first_name last_name } }
                  }
                  ... on IpscSquadNode {
                    competitors { id status shooter { email first_name last_name } }
                  }
                  ... on PpcSquadNode {
                    competitors { id status shooter { email first_name last_name } }
                  }
                  ... on CmpSquadNode {
                    competitors { id status shooter { email first_name last_name } }
                  }
                  ... on PrecisionSquadNode {
                    competitors { id status shooter { email first_name last_name } }
                  }
                  ... on GenericSquadNode {
                    competitors { id status shooter { email first_name last_name } }
                  }
                }
              }
            }
          `, { contentType: parseInt(contentType), eventId: parseInt(eventId) })

          // Find user in trainer squad
          const staffSquad = (squadData.event?.squads || []).find(s => s.number === staffSquadNum)
          const userCompetitor = (staffSquad?.competitors || []).find(c => 
            c.shooter?.email?.toLowerCase() === userEmail.toLowerCase()
          )

          if (userCompetitor) {
            const participantId = userCompetitor.id
            console.log(`[staffing] Found ${userEmail} in Squad ${staffSquadNum}: participant ID ${participantId}`)
            
            // Validate userName is meaningful, fallback to email if needed
            const displayName = userName && userName.trim() ? userName : userEmail
            const deleteResult = await ssiDeleteMatchParticipant(eventId, participantId, displayName, cookies)
            console.log(`[staffing] SSI trainer squad remove: ${userEmail} → ${deleteResult.message}`)
            ssiResults.trainerSquad = { success: true, message: deleteResult.message }
          } else {
            console.log(`[staffing] ${userEmail} not found in Squad ${staffSquadNum} (may already be removed)`)
            ssiResults.trainerSquad = { success: true, message: 'Not found in trainer squad (may already be removed)' }
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
        res.json({ ...result, warning: ssiWarning, ssi: ssiResults })
      } else {
        res.json({ ...result, ssi: ssiResults })
      }
    } catch (err) {
      console.error('[staffing] DELETE /signup error:', err.message)
      const status = err.message.includes('not found') || err.message.includes('Not registered') ? 404 : 500
      res.status(status).json({ error: err.message })
    }
  })

  // ============================================================
  // GET /config — get staffing configuration
  // ============================================================
  router.get('/config', requireAuth('staffing'), (req, res) => {
    try {
      const config = loadConfig()
      res.json({
        trainingTypes: config.trainingTypes,
        roles: config.roles,
      })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
