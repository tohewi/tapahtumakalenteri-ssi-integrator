// ============================================================
// Gun & Ammo Inventory Routes — /api/v1/guns (Release 9.0 — R90)
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
  restoreGun,
  checkoutGun,
  undoCheckoutGun,
  returnGun,
  returnAllGuns,
  recordGunMaintenance,
  listAmmo,
  addAmmoPurchase,
  recordAmmoStocktake,
  recordWholeAmmoStocktake,
  buildGunsCsv,
  buildGunEventsCsv,
  buildAmmoCsv,
  buildAmmoEventsCsv,
} from '../lib/services/gun-inventory-service.js'

export function createGunsRouter({ requireAuth, getAdminSession, graphqlWithRefresh }) {
  const router = express.Router()

  async function requireGunGroupAdmin(req, res, next) {
    try {
      const session = req.ssiSession
      const userEmail = req._v7Session?.userId || session?.userId || session?._userId || ''
      let userName = req._v7Session?.userName || ''
      if (!userName && graphqlWithRefresh && session) {
        try {
          const meData = await graphqlWithRefresh(session, '{ me { first_name last_name } }')
          if (meData?.me) {
            userName = `${meData.me.first_name || ''} ${meData.me.last_name || ''}`.trim()
            if (req._v7Session) req._v7Session.userName = userName
          }
        } catch (err) {
          log.debug('[guns] Could not fetch user full name from GraphQL me:', err.message)
        }
      }

      let cookies = session?.ssiCookies
      if ((!cookies || Object.keys(cookies).length === 0) && getAdminSession) {
        const adminSess = await getAdminSession().catch(() => null)
        cookies = adminSess?.cookies
      }

      const access = await verifyGunInventoryAdminAccess({
        userEmail,
        userName,
        cookies,
      })

      if (!access.allowed) {
        log.warn(`[guns] Access denied for user=${userEmail} name="${userName}" group=${access.groupId} reason=${access.reason}`)
        return res.status(403).json({
          error: `Gun inventory access requires role "${access.requiredRole}" in SSI group ${access.groupId}`,
          groupId: access.groupId,
          requiredRole: access.requiredRole,
          reason: access.reason,
        })
      }

      req.gunActor = userEmail || userName || 'unknown'
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
      ammo: listAmmo(),
      config: cfg,
    })
  }))

  router.get('/ammo', asyncHandler(async (_req, res) => {
    res.json({ ammo: listAmmo() })
  }))

  router.post('/ammo/purchases', asyncHandler(async (req, res) => {
    const { make, model, caliber, count, price, store, purchaseDate, purchasedBy } = req.body || {}
    const ammo = addAmmoPurchase({
      make,
      model,
      caliber,
      count,
      price,
      store,
      purchaseDate,
      purchasedBy: purchasedBy || req.gunActor,
    })
    auditMutation({
      endpoint: '/api/v1/guns/ammo/purchases',
      operation: 'add_ammo_purchase',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { ammoId: ammo.id, make: ammo.make, model: ammo.model, caliber: ammo.caliber, count },
      result: 'success',
    })
    res.status(201).json({ ammo })
  }))

  router.post('/ammo/stocktake', asyncHandler(async (req, res) => {
    const { items, notes } = req.body || {}
    const result = recordWholeAmmoStocktake({
      items,
      notes,
      performedBy: req.gunActor,
    })
    auditMutation({
      endpoint: '/api/v1/guns/ammo/stocktake',
      operation: 'record_whole_ammo_stocktake',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { count: result.stocktakes.length },
      result: 'success',
    })
    res.json(result)
  }))

  router.post('/ammo/:id/stocktake', asyncHandler(async (req, res) => {
    const { actualCount, notes } = req.body || {}
    const result = recordAmmoStocktake({
      ammoId: req.params.id,
      actualCount,
      notes,
      performedBy: req.gunActor,
    })
    auditMutation({
      endpoint: `/api/v1/guns/ammo/${req.params.id}/stocktake`,
      operation: 'record_ammo_stocktake',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: {
        ammoId: result.ammo.id,
        actualCount: result.stocktake.actualCount,
        discrepancy: result.stocktake.discrepancy,
      },
      result: 'success',
    })
    res.json(result)
  }))

  router.get('/export/guns.csv', asyncHandler(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="guns.csv"')
    res.send(buildGunsCsv())
  }))

  router.get('/export/gun-events.csv', asyncHandler(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="gun-events.csv"')
    res.send(buildGunEventsCsv())
  }))

  router.get('/export/ammo.csv', asyncHandler(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ammo.csv"')
    res.send(buildAmmoCsv())
  }))

  router.get('/export/ammo-events.csv', asyncHandler(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ammo-events.csv"')
    res.send(buildAmmoEventsCsv())
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const { make, model, serialNumber, acquisitionYear, defaultAmmoId, ammoMake } = req.body || {}
    const gun = createGun({ make, model, serialNumber, acquisitionYear, defaultAmmoId, ammoMake })
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
    const { make, model, serialNumber, acquisitionYear, defaultAmmoId, ammoMake } = req.body || {}
    const gun = updateGun(req.params.id, { make, model, serialNumber, acquisitionYear, defaultAmmoId, ammoMake })
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
    const gun = retireGun(req.params.id, {
      reason: req.body?.reason || '',
      retiredBy: req.gunActor,
    })
    auditMutation({
      endpoint: `/api/v1/guns/${req.params.id}`,
      operation: 'retire_gun',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { gunId: gun.id, serialNumber: gun.serialNumber, state: gun.state },
      result: 'success',
    })
    res.json({ gun })
  }))

  router.post('/:id/restore', asyncHandler(async (req, res) => {
    const gun = restoreGun(req.params.id, {
      restoredBy: req.gunActor,
    })
    auditMutation({
      endpoint: `/api/v1/guns/${req.params.id}/restore`,
      operation: 'restore_gun',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { gunId: gun.id, serialNumber: gun.serialNumber, state: gun.state },
      result: 'success',
    })
    res.json({ gun })
  }))

  router.post('/:id/undo-checkout', asyncHandler(async (req, res) => {
    const gun = undoCheckoutGun({
      gunId: req.params.id,
      undoneBy: req.gunActor,
    })
    auditMutation({
      endpoint: `/api/v1/guns/${req.params.id}/undo-checkout`,
      operation: 'undo_checkout_gun',
      initiatingUserId: req.gunActor,
      executionIdentityUserId: req.gunActor,
      targetEntity: { gunId: gun.id, serialNumber: gun.serialNumber },
      result: 'success',
    })
    res.json({ gun })
  }))

  router.post('/:id/checkout', asyncHandler(async (req, res) => {
    const { shooterName, shooterEmail, cupId, cupName, cartridgesGiven, ammoId } = req.body || {}
    const gun = checkoutGun({
      gunId: req.params.id,
      shooterName,
      shooterEmail,
      cupId,
      cupName,
      cartridgesGiven,
      ammoId,
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
        ammoId: gun.currentCheckout?.ammoId,
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
