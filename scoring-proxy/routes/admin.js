// ============================================================
// Admin API Routes (BL-1)
//
// Super-admin endpoints for operational oversight.
// Secured by ADMIN_API_KEY environment variable.
// All endpoints require Authorization: Bearer <ADMIN_API_KEY>.
// ============================================================

import { Router } from 'express'
import { log } from '../lib/logger.js'
import { listAllTenants, listAllAccounts, deleteTenant, deleteAccount } from '../lib/db/platform-store.js'
import { getActiveSessionCount, getUserSessions } from '../lib/session/index.js'

/**
 * Middleware: require ADMIN_API_KEY in Authorization header.
 */
function requireAdminKey() {
  return (req, res, next) => {
    const adminKey = process.env.ADMIN_API_KEY
    if (!adminKey) {
      log.warn('[admin] ADMIN_API_KEY not configured — admin endpoints disabled')
      return res.status(503).json({ error: 'Admin API not configured' })
    }

    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' })
    }

    const token = authHeader.slice(7)
    if (token !== adminKey) {
      log.warn(`[admin] Invalid admin API key attempt from ${req.ip}`)
      return res.status(403).json({ error: 'Invalid admin key' })
    }

    next()
  }
}

/**
 * Create the admin router.
 * @returns {Router}
 */
export function createAdminRouter() {
  const router = Router()

  // All admin routes require the admin API key
  router.use(requireAdminKey())

  // GET /api/v1/admin/tenants — list all tenants with owner info
  router.get('/tenants', async (req, res) => {
    try {
      const tenants = await listAllTenants()
      res.json({
        count: tenants.length,
        tenants,
      })
    } catch (err) {
      log.error('[admin] Failed to list tenants:', err.message)
      res.status(500).json({ error: 'Failed to list tenants' })
    }
  })

  // GET /api/v1/admin/accounts — list all accounts
  router.get('/accounts', async (req, res) => {
    try {
      const accounts = await listAllAccounts()
      res.json({
        count: accounts.length,
        accounts,
      })
    } catch (err) {
      log.error('[admin] Failed to list accounts:', err.message)
      res.status(500).json({ error: 'Failed to list accounts' })
    }
  })

  // GET /api/v1/admin/sessions — session statistics
  router.get('/sessions', async (req, res) => {
    try {
      const ssiSessionCount = await getActiveSessionCount()
      res.json({
        ssiSessions: ssiSessionCount,
      })
    } catch (err) {
      log.error('[admin] Failed to get session count:', err.message)
      res.status(500).json({ error: 'Failed to get session stats' })
    }
  })

  // DELETE /api/v1/admin/tenants/:id — delete a tenant and all associated data
  router.delete('/tenants/:id', async (req, res) => {
    try {
      const result = await deleteTenant(req.params.id)
      if (!result) return res.status(404).json({ error: 'Tenant not found' })
      log.info(`[admin] Deleted tenant ${result.name} (${result.tenantId}) by admin from ${req.ip}`)
      res.json(result)
    } catch (err) {
      log.error('[admin] Failed to delete tenant:', err.message)
      res.status(500).json({ error: 'Failed to delete tenant' })
    }
  })

  // DELETE /api/v1/admin/accounts/:id — delete an account and all owned tenants
  router.delete('/accounts/:id', async (req, res) => {
    try {
      const result = await deleteAccount(req.params.id)
      if (!result) return res.status(404).json({ error: 'Account not found' })
      log.info(`[admin] Deleted account ${result.email} (${result.accountId}) by admin from ${req.ip}`)
      res.json(result)
    } catch (err) {
      log.error('[admin] Failed to delete account:', err.message)
      res.status(500).json({ error: 'Failed to delete account' })
    }
  })

  // GET /api/v1/admin/overview — combined dashboard data
  router.get('/overview', async (req, res) => {
    try {
      const [tenants, accounts, ssiSessionCount] = await Promise.all([
        listAllTenants(),
        listAllAccounts(),
        getActiveSessionCount(),
      ])
      res.json({
        tenants: { count: tenants.length, items: tenants },
        accounts: { count: accounts.length, items: accounts },
        sessions: { ssiSessions: ssiSessionCount },
        generatedAt: new Date().toISOString(),
      })
    } catch (err) {
      log.error('[admin] Failed to generate overview:', err.message)
      res.status(500).json({ error: 'Failed to generate overview' })
    }
  })

  return router
}
