/**
 * Admin API routes for SSI Tools Management Site
 *
 * These routes allow authorized admins to manage configuration:
 * - Staff management sites (CRUD)
 * - Admin users (CRUD)
 * - Event filters
 *
 * All routes require 'admin' authentication scope.
 */

import express from 'express'
import {
  getAdminUser,
  listAdminUsers,
  addAdminUser,
  removeAdminUser,
  listStaffSites,
  getStaffSite,
  createStaffSite,
  updateStaffSite,
  deleteStaffSite,
  getEventFilters,
  addEventFilter,
  removeEventFilter,
  isDbAvailable
} from '../lib/db/client.js'

export function createAdminRouter({ requireAuth }) {
  const router = express.Router()
  const validFilterTypes = ['name_contains', 'cup_id', 'date_range', 'event_type', 'event_kind']
  const validEventKinds = new Set(['match', 'cup', 'league'])

  // ============================================================
  // Admin Users Management
  // ============================================================

  /**
   * GET /api/admin/users - List all admin users
   */
  router.get('/users', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const users = await listAdminUsers()
      res.json({ users })
    } catch (err) {
      console.error('Error listing admin users:', err)
      res.status(500).json({ error: 'Failed to list admin users' })
    }
  })

  /**
   * POST /api/admin/users - Add a new admin user
   * Body: { email: string }
   */
  router.post('/users', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const { email } = req.body
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' })
      }

      // Check if requester is root admin
      const requester = await getAdminUser(req.ssiSession.email)
      if (!requester?.isRoot) {
        return res.status(403).json({ error: 'Only root admin can add new admins' })
      }

      // Check if user already exists
      const existing = await getAdminUser(email)
      if (existing) {
        return res.status(409).json({ error: 'User is already an admin' })
      }

      const result = await addAdminUser(email, req.ssiSession.email)
      res.json({ success: true, id: result.id })
    } catch (err) {
      console.error('Error adding admin user:', err)
      res.status(500).json({ error: 'Failed to add admin user' })
    }
  })

  /**
   * DELETE /api/admin/users/:email - Remove an admin user
   */
  router.delete('/users/:email', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const { email } = req.params

      // Check if requester is root admin
      const requester = await getAdminUser(req.ssiSession.email)
      if (!requester?.isRoot) {
        return res.status(403).json({ error: 'Only root admin can remove admins' })
      }

      await removeAdminUser(email)
      res.json({ success: true })
    } catch (err) {
      console.error('Error removing admin user:', err)
      if (err.message === 'Cannot remove root admin') {
        return res.status(400).json({ error: err.message })
      }
      res.status(500).json({ error: 'Failed to remove admin user' })
    }
  })

  // ============================================================
  // Staff Sites Management
  // ============================================================

  /**
   * GET /api/admin/sites - List all staff management sites
   */
  router.get('/sites', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const sites = await listStaffSites()
      res.json({ sites })
    } catch (err) {
      console.error('Error listing sites:', err)
      res.status(500).json({ error: 'Failed to list sites' })
    }
  })

  /**
   * GET /api/admin/sites/:key - Get a specific site with full configuration
   */
  router.get('/sites/:key', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const site = await getStaffSite(req.params.key)
      if (!site) {
        return res.status(404).json({ error: 'Site not found' })
      }

      // Include event filters
      const filters = await getEventFilters(req.params.key)
      site.filters = filters

      res.json(site)
    } catch (err) {
      console.error('Error getting site:', err)
      res.status(500).json({ error: 'Failed to get site' })
    }
  })

  /**
   * POST /api/admin/sites - Create a new staff management site
   * Body: { key, name, organizationName, organizationRange?, timezone?, config? }
   */
  router.post('/sites', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const { key, name, organizationName, organizationRange, timezone, config } = req.body

      if (!key || !name || !organizationName) {
        return res.status(400).json({
          error: 'Required fields: key, name, organizationName'
        })
      }

      // Validate key format (alphanumeric + hyphens only)
      if (!/^[a-z0-9-]+$/.test(key)) {
        return res.status(400).json({
          error: 'Key must contain only lowercase letters, numbers, and hyphens'
        })
      }

      // Check if site already exists
      const existing = await getStaffSite(key)
      if (existing) {
        return res.status(409).json({ error: 'Site with this key already exists' })
      }

      const result = await createStaffSite({
        key,
        name,
        organizationName,
        organizationRange,
        timezone,
        config
      })

      res.json({ success: true, id: result.id })
    } catch (err) {
      console.error('Error creating site:', err)
      res.status(500).json({ error: 'Failed to create site' })
    }
  })

  /**
   * PUT /api/admin/sites/:key - Update a staff management site
   * Body: { name?, organizationName?, organizationRange?, timezone?, config? }
   */
  router.put('/sites/:key', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const { key } = req.params
      const updates = req.body

      await updateStaffSite(key, updates)
      res.json({ success: true })
    } catch (err) {
      console.error('Error updating site:', err)
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: 'Site not found' })
      }
      res.status(500).json({ error: 'Failed to update site' })
    }
  })

  /**
   * DELETE /api/admin/sites/:key - Delete a staff management site (soft delete)
   */
  router.delete('/sites/:key', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      await deleteStaffSite(req.params.key)
      res.json({ success: true })
    } catch (err) {
      console.error('Error deleting site:', err)
      res.status(500).json({ error: 'Failed to delete site' })
    }
  })

  // ============================================================
  // Event Filters Management
  // ============================================================

  /**
   * GET /api/admin/sites/:key/filters - Get event filters for a site
   */
  router.get('/sites/:key/filters', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const filters = await getEventFilters(req.params.key)
      res.json({ filters })
    } catch (err) {
      console.error('Error getting filters:', err)
      res.status(500).json({ error: 'Failed to get filters' })
    }
  })

  /**
   * POST /api/admin/sites/:key/filters - Add event filter for a site
   * Body: { type, value, futureOnly? }
   */
  router.post('/sites/:key/filters', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const { type, value, futureOnly } = req.body

      if (!type || !value) {
        return res.status(400).json({ error: 'Required fields: type, value' })
      }

      // Validate filter type
      if (!validFilterTypes.includes(type)) {
        return res.status(400).json({
          error: `Invalid filter type. Must be one of: ${validFilterTypes.join(', ')}`
        })
      }

      if (type === 'event_type' || type === 'event_kind') {
        const parsedKinds = String(value)
          .split(',')
          .map(v => v.trim().toLowerCase())
          .filter(Boolean)

        const hasInvalidKind = parsedKinds.some(kind => !validEventKinds.has(kind))
        if (parsedKinds.length === 0 || hasInvalidKind) {
          return res.status(400).json({
            error: 'Invalid event type value. Supported values: match, cup, league'
          })
        }
      }

      await addEventFilter(req.params.key, { type, value, futureOnly })
      res.json({ success: true })
    } catch (err) {
      console.error('Error adding filter:', err)
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: 'Site not found' })
      }
      res.status(500).json({ error: 'Failed to add filter' })
    }
  })

  /**
   * DELETE /api/admin/filters/:id - Remove an event filter
   */
  router.delete('/filters/:id', requireAuth('admin'), async (req, res) => {
    try {
      if (!isDbAvailable()) {
        return res.status(503).json({ error: 'Database not available' })
      }

      const filterId = parseInt(req.params.id, 10)
      if (isNaN(filterId)) {
        return res.status(400).json({ error: 'Invalid filter ID' })
      }

      await removeEventFilter(filterId)
      res.json({ success: true })
    } catch (err) {
      console.error('Error removing filter:', err)
      res.status(500).json({ error: 'Failed to remove filter' })
    }
  })

  return router
}
