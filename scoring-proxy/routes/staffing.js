/**
 * Staffing API Route — endpoints for SRA training staff management.
 */

import { Router } from 'express'
import { log } from '../lib/logger.js'
import { loadConfig } from '../lib/staffing/config-loader.js'
import { AppError } from '../lib/errors/AppError.js'
import {
  listAndSyncStaffingEvents,
  performStaffSignup,
  performStaffResign,
} from '../lib/services/staffing-service.js'

function internalError(message) {
  return new AppError(message, 500, 'INTERNAL_ERROR')
}

export function createStaffingRouter({ requireAuth, graphqlWithRefresh, getAdminSession }) {
  const router = Router()

  router.get('/events', requireAuth('staffing'), async (req, res, next) => {
    try {
      const payload = await listAndSyncStaffingEvents({
        session: req.ssiSession,
        graphqlWithRefresh,
        getAdminSession,
      })
      res.json(payload)
    } catch (err) {
      log.error('[staffing] GET /events error:', err.message)
      return next(internalError('Failed to load staffing events'))
    }
  })

  router.post('/events/:eventId/signup', requireAuth('staffing'), async (req, res, next) => {
    try {
      const session = req.ssiSession
      const { role } = req.body || {}

      if (!role) return res.status(400).json({ error: 'role is required' })

      const meData = await graphqlWithRefresh(session, '{ me { email first_name last_name } }')
      const me = meData.me
      if (!me?.email) return res.status(401).json({ error: 'Could not get user info' })

      const user = {
        email: me.email,
        userName: `${me.first_name} ${me.last_name}`.trim(),
      }

      const payload = await performStaffSignup({
        eventId: req.params.eventId,
        role,
        user,
        graphqlWithRefresh,
        getAdminSession,
      })

      res.json(payload)
    } catch (err) {
      log.error('[staffing] POST /signup error:', err.message)
      const status = err.message.includes('Not authorized') ? 403
        : err.message.includes('not found') ? 404
        : err.message.includes('full') || err.message.includes('taken') || err.message.includes('Already') ? 409
        : 500
      if (status === 500) return next(internalError('Failed to sign up for staffing role'))
      return res.status(status).json({ error: err.message })
    }
  })

  router.delete('/events/:eventId/signup', requireAuth('staffing'), async (req, res, next) => {
    try {
      const session = req.ssiSession
      const meData = await graphqlWithRefresh(session, '{ me { email first_name last_name } }')
      const userEmail = meData.me?.email
      if (!userEmail) return res.status(401).json({ error: 'Could not get user info' })

      const userName = `${meData.me.first_name} ${meData.me.last_name}`.trim()
      const payload = await performStaffResign({
        eventId: req.params.eventId,
        userEmail,
        userName,
        getAdminSession,
      })

      res.json(payload)
    } catch (err) {
      log.error('[staffing] DELETE /signup error:', err.message)
      const status = err.message.includes('not found') || err.message.includes('Not registered') ? 404 : 500
      if (status === 500) return next(internalError('Failed to resign from staffing role'))
      return res.status(status).json({ error: err.message })
    }
  })

  router.get('/config', requireAuth('staffing'), (_req, res, next) => {
    try {
      const config = loadConfig()
      res.json({
        trainingTypes: config.trainingTypes,
        roles: config.roles,
      })
    } catch (err) {
      return next(internalError('Failed to load staffing config'))
    }
  })

  return router
}
