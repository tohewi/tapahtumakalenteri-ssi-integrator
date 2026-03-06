// ============================================================
// Platform Routes — Discipline CRUD
// Mounted under /api/v1/platform by createPlatformRouter
// ============================================================

import { log } from '../../lib/logger.js'
import { AppError } from '../../lib/errors/AppError.js'
import {
  createDiscipline,
  getDiscipline,
  listTenantDisciplines,
  updateDiscipline,
  deleteDiscipline,
  listSsiDiscoveredDisciplines,
  createAuditLog,
  TENANT_ROLES,
} from '../../lib/db/platform-store.js'

export function mountDisciplineRoutes(router, { requirePlatformAuth, requireTenantRole, platformMutationLimiter }) {

  // GET /api/v1/platform/ssi-discipline-registry
  // Any authenticated user can read the registry (static + discovered)
  router.get('/ssi-discipline-registry', requirePlatformAuth(), async (req, res) => {
    try {
      const { SSI_DISCIPLINE_REGISTRY } = await import('../../lib/ssi-core/discipline-registry.js')

      const staticRegistry = [...SSI_DISCIPLINE_REGISTRY]

      let discovered = []
      try {
        discovered = await listSsiDiscoveredDisciplines()
      } catch (dbErr) {
        log.warn('[platform] Failed to fetch discovered SSI disciplines:', dbErr.message)
      }

      // Merge: prefer static ones if ID matches (though they shouldn't conflict)
      const staticIds = new Set(staticRegistry.map(d => d.id))
      const combinedRegistry = [
        ...staticRegistry,
        ...discovered.filter(d => !staticIds.has(d.id))
      ]

      res.json({ registry: combinedRegistry })
    } catch (err) {
      log.error('[platform] Error fetching SSI discipline registry:', err.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/v1/platform/tenants/:tenantId/disciplines
  // Any member can read disciplines
  router.get('/tenants/:tenantId/disciplines', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    const disciplines = await listTenantDisciplines(req.params.tenantId)
    res.json({ disciplines })
  })

  // POST /api/v1/platform/tenants/:tenantId/disciplines
  // Requires: owner, tenant_admin, or discipline_admin
  router.post('/tenants/:tenantId/disciplines', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'discipline_admin'), async (req, res, next) => {
    const { name, labelFi, labelEn, ssiGroupId, ssiOrganizerId, ssiCreateUrl } = req.body
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Discipline name is required (min 2 characters)' })
    }

    try {
      const { disciplineId, discipline } = await createDiscipline({
        tenantId: req.params.tenantId,
        name, labelFi, labelEn, ssiGroupId, ssiOrganizerId, ssiCreateUrl,
      })
      log.info(`[platform] Discipline created: ${name} (${disciplineId}) for tenant ${req.params.tenantId}`)
      res.status(201).json({ success: true, discipline })
    } catch (err) {
      log.error('[platform] Discipline creation failed:', err.message)
      return next(new AppError('Failed to create discipline', 500, 'INTERNAL_ERROR'))
    }
  })

  // GET /api/v1/platform/tenants/:tenantId/disciplines/:id
  // Any member can read
  router.get('/tenants/:tenantId/disciplines/:id', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    const discipline = await getDiscipline(req.params.id)
    if (!discipline || discipline.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Discipline not found' })
    }
    res.json({ discipline })
  })

  // PATCH /api/v1/platform/tenants/:tenantId/disciplines/:id
  // Requires: owner, tenant_admin, or discipline_admin
  router.patch('/tenants/:tenantId/disciplines/:id', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'discipline_admin'), async (req, res, next) => {
    const discipline = await getDiscipline(req.params.id)
    if (!discipline || discipline.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Discipline not found' })
    }

    const allowedFields = ['name', 'labelFi', 'labelEn', 'ssiGroupId', 'ssiOrganizerId', 'ssiCreateUrl']
    const updates = {}
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field]
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    try {
      const updated = await updateDiscipline(req.params.id, updates)
      res.json({ success: true, discipline: updated })
    } catch (err) {
      log.error('[platform] Discipline update failed:', err.message)
      return next(new AppError('Failed to update discipline', 500, 'INTERNAL_ERROR'))
    }
  })

  // DELETE /api/v1/platform/tenants/:tenantId/disciplines/:id
  // Requires: owner, tenant_admin, or discipline_admin
  router.delete('/tenants/:tenantId/disciplines/:id', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'discipline_admin'), async (req, res) => {
    const discipline = await getDiscipline(req.params.id)
    if (!discipline || discipline.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Discipline not found' })
    }

    const deleted = await deleteDiscipline(req.params.id)
    if (!deleted) {
      return res.status(404).json({ error: 'Discipline not found' })
    }

    // SEC-H4: Audit log
    await createAuditLog({
      tenantId: req.params.tenantId,
      accountId: req.account.id,
      action: 'delete_discipline',
      targetType: 'discipline',
      targetId: req.params.id,
      metadata: { name: discipline.name },
      ipAddress: req.ip
    })

    log.info(`[platform] Discipline deleted: ${req.params.id} from tenant ${req.params.tenantId}`)
    res.json({ success: true })
  })
}
