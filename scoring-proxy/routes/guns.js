// ============================================================
// Gun Inventory Routes — /api/v1/guns (Release 9.0 — R90)
// ============================================================

import express from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { log } from '../lib/logger.js'
import { auditMutation } from '../lib/session/index.js'
import {
  loadGunInventoryConfig,
  verifyGunInventoryAdminAccess,
  listGuns,
  createGun,
  updateGun,
  retireGun,
  checkoutGun,
  returnGun,
  returnAllGuns,
  recordGunMaintenance,
} from '../lib/services/gun-inventory-service.js'

export function createGunsRouter({ requireAuth, getAdminSession }) {
  const router = express.Router()

  async function requireGunGroupAdmin(req, res, next) {
    try {
      const session = req.ssiSession
      const userEmail = req._v7Session?.userId || session?.userId || session?._userId || ''
      let cookies = session?.ssiCookies
      if ((!cookies || Object.keys(cookies).length === 0) && getAdminSession) {
        const adminSess = await getAdminSession().catch(() => null)
        cookies = adminSess?.cookies
      }

      const access = await verifyGunInventoryAdminAccess({
        userEmail,
        cookies,
      })

      if (!access.allowed) {
        log.warn(`[guns] Access denied for user=${userEmail} group=${access.groupId} reason=${access.reason}`)
        return res.status(403).json({
          error: `Gun inventory access requires role "${access.requiredRole}" in SSI group ${access.groupId}`,
          groupId: access.groupId,
          requiredRole: access.requiredRole,
          reason: access.reason,
        })
      }

      req.gunActor = userEmail || 'unknown'
      return next()
    } catch (err) {
      log.error('[guns] Group admin verification failed:', err.message)
      return res.status(503).json({ error: 'Could not verify SSI group admin permissions' })
    }
  }

  router.use(requireAuth(['manage', 'guns']), requireGunGroupAdmin)

  router.get('/', asyncHandler(async (req, res) => {
    const includeRetired = String(req.query.includeRetired || '').toLowerCase() === 'true'
    const cfg = loadGunInventoryConfig()
    res.json({
      guns: listGuns({ includeRetired }),
      config: cfg,
    })
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const { make, model, serialNumber, acquisitionYear } = req.body || {}
    const gun = createGun({ make, model, serialNumber, acquisitionYear })
    auditMutation({
      endpoint: '/api/v1/guns',
      operation: 'create_gun',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { gunId: gun.id, serialNumber: gun.serialNumber },
      result: 'success',
    })
    res.status(201).json({ gun })
  }))

  router.put('/:id', asyncHandler(async (req, res) => {
    const { make, model, serialNumber, acquisitionYear } = req.body || {}
    const gun = updateGun(req.params.id, { make, model, serialNumber, acquisitionYear })
    auditMutation({
      endpoint: `/api/v1/guns/${req.params.id}`,
      operation: 'update_gun',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { gunId: gun.id, serialNumber: gun.serialNumber },
      result: 'success',
    })
    res.json({ gun })
  }))

  router.delete('/:id', asyncHandler(async (req, res) => {
    const gun = retireGun(req.params.id)
    auditMutation({
      endpoint: `/api/v1/guns/${req.params.id}`,
      operation: 'retire_gun',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { gunId: gun.id, serialNumber: gun.serialNumber },
      result: 'success',
    })
    res.json({ gun })
  }))

  router.post('/:id/checkout', asyncHandler(async (req, res) => {
    const { shooterName, shooterEmail, cupId, cupName, cartridgesGiven } = req.body || {}
    const gun = checkoutGun({
      gunId: req.params.id,
      shooterName,
      shooterEmail,
      cupId,
      cupName,
      cartridgesGiven,
      checkedOutBy: req.gunActor,
    })
    auditMutation({
      endpoint: `/api/v1/guns/${req.params.id}/checkout`,
      operation: 'checkout_gun',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: {
        gunId: gun.id,
        shooterName: gun.currentCheckout?.shooterName,
        cupId: gun.currentCheckout?.cupId,
        cartridgesGiven: gun.currentCheckout?.cartridgesGiven,
      },
      result: 'success',
    })
    res.json({ gun })
  }))

  router.post('/return-all', asyncHandler(async (req, res) => {
    const { cupId } = req.body || {}
    const result = returnAllGuns({
      cupId: cupId ?? null,
      returnedBy: req.gunActor,
    })
    auditMutation({
      endpoint: '/api/v1/guns/return-all',
      operation: 'return_all_guns',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { cupId: cupId ?? null, returnedCount: result.returnedCount },
      result: 'success',
    })
    res.json(result)
  }))

  router.post('/:id/return', asyncHandler(async (req, res) => {
    const gun = returnGun({
      gunId: req.params.id,
      returnedBy: req.gunActor,
    })
    auditMutation({
      endpoint: `/api/v1/guns/${req.params.id}/return`,
      operation: 'return_gun',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { gunId: gun.id },
      result: 'success',
    })
    res.json({ gun })
  }))

  router.post('/:id/maintenance', asyncHandler(async (req, res) => {
    const { notes } = req.body || {}
    const gun = recordGunMaintenance({
      gunId: req.params.id,
      notes,
      performedBy: req.gunActor,
    })
    auditMutation({
      endpoint: `/api/v1/guns/${req.params.id}/maintenance`,
      operation: 'record_gun_maintenance',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { gunId: gun.id },
      result: 'success',
    })
    res.json({ gun })
  }))

  return router
}
