/**
 * Staffing API Route — endpoints for SRA training staff management.
 *
 * See docs/design/sra-staffing-design.md Section 5
 */

import { Router } from 'express'
import {
  getAllEvents,
  getEvent,
  getEventStatus,
  signup,
  cancelSignup,
  finalizeEvent,
  upsertEvent,
  getEventsDueForFinalization,
} from '../lib/staffing/engine.js'
import { loadConfig, isAdminEmail } from '../lib/staffing/config-loader.js'

const CRON_SECRET = process.env.STAFFING_CRON_SECRET || null

/**
 * Create the staffing router.
 *
 * @param {object} deps
 * @param {Function} deps.requireAuth — auth middleware
 * @param {Function} deps.graphqlWithRefresh — GraphQL helper with auto-refresh
 * @param {Function} deps.adminGraphQL — admin GraphQL helper
 * @param {Function} deps.getAdminSession — get admin SSI session (cookies + jwt)
 * @param {boolean} deps.IS_PROD
 * @returns {Router}
 */
export function createStaffingRouter({ requireAuth, graphqlWithRefresh, adminGraphQL, getAdminSession, IS_PROD }) {
  const router = Router()

  // ============================================================
  // GET /events — list training events with staffing status
  // ============================================================
  router.get('/events', requireAuth(), async (req, res) => {
    try {
      const config = loadConfig()
      const session = req.ssiSession

      // Get user email for admin check
      const meData = await graphqlWithRefresh(session, '{ me { email } }')
      const userEmail = meData.me?.email
      const isAdmin = userEmail ? isAdminEmail(userEmail) : false

      // Search SSI for training events
      const searchStrings = config.eventDiscovery.searchStrings
      const allMatches = []

      for (const searchStr of searchStrings) {
        const data = await graphqlWithRefresh(session, `
          query SearchEvents($search: String!) {
            events(search: $search) {
              id
              name
              starts
              ends
              squads {
                id
                number
                comment
                ... on NordicSquadNode {
                  max_competitors
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
            // Only show future events
            if (new Date(evt.starts) <= now) continue

            // Determine training type from name using searchPatterns
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

            // Calculate shooter count (exclude staff squad by number or comment)
            const staffSquadNum = config.trainingTypes[trainingType]?.staffSquad || 5
            const staffSquadName = config.eventDiscovery.staffSquadName
            const shooterSquads = (evt.squads || [])
              .filter(s => {
                const squadLabel = s.comment || `Squad ${s.number}`
                return s.number !== staffSquadNum && squadLabel !== staffSquadName
              })
              .map(s => ({
                squadNumber: s.number,
                squadId: s.id,
                currentCount: (s.competitors || []).filter(c => c.status === 'a').length,
              }))
            const shooterCount = shooterSquads.reduce((sum, s) => sum + s.currentCount, 0)

            // Upsert event in staffing engine
            const event = upsertEvent({
              eventId: evt.id,
              eventName: evt.name,
              trainingType,
              eventDate: evt.starts,
              shooterCount,
              shooterSquads,
            })

            allMatches.push(getEventStatus(evt.id))
          }
        }
      }

      // Also include future events from local state that weren't in SSI results
      const now = new Date()
      const localEvents = getAllEvents()
      for (const le of localEvents) {
        if (new Date(le.eventDate) <= now) continue
        if (!allMatches.find(m => m.eventId === le.eventId)) {
          allMatches.push(getEventStatus(le.eventId))
        }
      }

      // Sort by event date
      allMatches.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))

      res.json({ events: allMatches, isAdmin })
    } catch (err) {
      console.error('[staffing] GET /events error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // GET /events/:eventId — get event staffing details
  // ============================================================
  router.get('/events/:eventId', requireAuth(), async (req, res) => {
    try {
      const session = req.ssiSession
      const meData = await graphqlWithRefresh(session, '{ me { email } }')
      const userEmail = meData.me?.email
      const isAdmin = userEmail ? isAdminEmail(userEmail) : false

      const status = getEventStatus(req.params.eventId)
      if (!status) return res.status(404).json({ error: 'Event not found' })

      res.json({ ...status, isAdmin })
    } catch (err) {
      console.error('[staffing] GET /events/:id error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /events/:eventId/signup — sign up as staff
  // ============================================================
  router.post('/events/:eventId/signup', requireAuth(), async (req, res) => {
    try {
      const session = req.ssiSession
      const { rolePreference } = req.body || {}

      // Get user info from SSI
      const meData = await graphqlWithRefresh(session, '{ me { id email first_name last_name } }')
      const me = meData.me
      if (!me) return res.status(401).json({ error: 'Could not get user info' })

      const user = {
        userId: String(me.id),
        userName: `${me.first_name} ${me.last_name}`.trim(),
        email: me.email,
      }

      const result = signup(req.params.eventId, user, rolePreference || null)
      res.json(result)
    } catch (err) {
      console.error('[staffing] POST /signup error:', err.message)
      const status = err.message.includes('Not authorized') ? 403
        : err.message.includes('not found') ? 404
        : err.message.includes('closed') ? 409
        : 500
      res.status(status).json({ error: err.message })
    }
  })

  // ============================================================
  // DELETE /events/:eventId/signup — cancel staff signup
  // ============================================================
  router.delete('/events/:eventId/signup', requireAuth(), async (req, res) => {
    try {
      const session = req.ssiSession
      const meData = await graphqlWithRefresh(session, '{ me { id } }')
      const userId = String(meData.me?.id)
      if (!userId) return res.status(401).json({ error: 'Could not get user info' })

      const result = cancelSignup(req.params.eventId, userId)
      res.json(result)
    } catch (err) {
      console.error('[staffing] DELETE /signup error:', err.message)
      const status = err.message.includes('not found') ? 404 : 500
      res.status(status).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /events/:eventId/finalize — finalize staffing (admin)
  // ============================================================
  router.post('/events/:eventId/finalize', requireAuth(), async (req, res) => {
    try {
      const session = req.ssiSession
      const meData = await graphqlWithRefresh(session, '{ me { email } }')
      const userEmail = meData.me?.email
      if (!userEmail || !isAdminEmail(userEmail)) {
        return res.status(403).json({ error: 'Admin access required' })
      }

      const result = await finalizeEvent(req.params.eventId)
      res.json(result)
    } catch (err) {
      console.error('[staffing] POST /finalize error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // GET /events/:eventId/status — get current staff list
  // ============================================================
  router.get('/events/:eventId/status', requireAuth(), async (req, res) => {
    try {
      const status = getEventStatus(req.params.eventId)
      if (!status) return res.status(404).json({ error: 'Event not found' })
      res.json(status)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // GET /config — get staffing configuration (roles, training types)
  // ============================================================
  router.get('/config', requireAuth(), (req, res) => {
    try {
      const config = loadConfig()
      res.json({
        trainingTypes: config.trainingTypes,
        roles: config.roles,
        registration: config.registration,
      })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /finalize-due — cron endpoint, finalize all due events
  // Authenticated via X-Cron-Secret header
  // ============================================================
  router.post('/finalize-due', async (req, res) => {
    const secret = req.headers['x-cron-secret']
    if (!CRON_SECRET || secret !== CRON_SECRET) {
      return res.status(403).json({ error: 'Invalid cron secret' })
    }

    try {
      const dueEvents = getEventsDueForFinalization()
      const results = []

      for (const event of dueEvents) {
        try {
          const result = await finalizeEvent(event.eventId)
          results.push({ eventId: event.eventId, eventName: event.eventName, ...result })
        } catch (err) {
          results.push({ eventId: event.eventId, error: err.message })
        }
      }

      res.json({ processed: results.length, results })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
