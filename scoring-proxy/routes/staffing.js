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
} from '../lib/staffing/engine.js'
import { loadConfig, isAdminEmail } from '../lib/staffing/config-loader.js'
import {
  ssiRegisterToTrainerSquad,
  ssiGetMatchGroupId,
  ssiAddToMatchManagement,
  ssiRemoveFromMatchManagement,
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
      const allMatches = []
      const seenIds = new Set()

      for (const searchStr of searchStrings) {
        const data = await graphqlWithRefresh(session, `
          query SearchEvents($search: String!) {
            events(search: $search) {
              id
              name
              starts
              squads {
                id
                number
                comment
                ... on NordicSquadNode {
                  competitors { id status }
                }
                ... on IpscSquadNode {
                  competitors { id status }
                }
                ... on GenericSquadNode {
                  competitors { id status }
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
            })

            allMatches.push(getEventStatus(evt.id))
          }
        }
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

      // SSI integration (non-blocking — don't fail the staffing signup)
      const config = loadConfig()
      const staffSquadName = config.eventDiscovery.staffSquadName
      const contentType = config.eventDiscovery.matchContentType
      const cookies = session.ssiCookies
      const eventId = req.params.eventId

      if (contentType && cookies) {
        // 1. Add to SSI Trainer Squad
        if (staffSquadName) {
          ssiRegisterToTrainerSquad(contentType, eventId, me.email, staffSquadName, cookies)
            .then(r => console.log(`[staffing] SSI trainer squad: ${me.email} → ${r.message}`))
            .catch(e => console.error(`[staffing] SSI trainer squad failed for ${me.email}: ${e.message}`))
        }

        // 2. Add to SSI management group with role-appropriate officials
        const ssiRole = SSI_ROLE_MAP[role]
        if (ssiRole) {
          ssiGetMatchGroupId(contentType, eventId, cookies)
            .then(groupId => ssiAddToMatchManagement(groupId, contentType, eventId, me.email, ssiRole.role, ssiRole.officials, cookies))
            .then(r => console.log(`[staffing] SSI management: ${me.email} (${role}) → ${r.message}`))
            .catch(e => console.error(`[staffing] SSI management add failed for ${me.email}: ${e.message}`))
        }
      }

      res.json(result)
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
      const meData = await graphqlWithRefresh(session, '{ me { email } }')
      const userEmail = meData.me?.email
      if (!userEmail) return res.status(401).json({ error: 'Could not get user info' })

      const result = resign(req.params.eventId, userEmail)

      // SSI integration: remove from management group (non-blocking)
      const config = loadConfig()
      const contentType = config.eventDiscovery.matchContentType
      const cookies = session.ssiCookies
      const eventId = req.params.eventId

      if (contentType && cookies) {
        ssiGetMatchGroupId(contentType, eventId, cookies)
          .then(groupId => ssiRemoveFromMatchManagement(groupId, contentType, eventId, userEmail, cookies))
          .then(r => console.log(`[staffing] SSI management remove: ${userEmail} → ${r.message}`))
          .catch(e => console.error(`[staffing] SSI management remove failed for ${userEmail}: ${e.message}`))
      }

      res.json(result)
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
