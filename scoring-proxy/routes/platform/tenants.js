// ============================================================
// Platform Routes — Tenant CRUD
// Mounted under /api/v1/platform by createPlatformRouter
// ============================================================

import { log } from '../../lib/logger.js'
import { AppError } from '../../lib/errors/AppError.js'
import {
  createTenant,
  listAccountTenants,
  updateTenant,
  countDisciplinesByTenant,
  createAuditLog,
  hasRequiredRole,
  TENANT_ROLES,
} from '../../lib/db/platform-store.js'
import { validateTenantCreate } from '../../lib/services/platform-validation.js'

export function mountTenantRoutes(router, { requirePlatformAuth, requireTenantRole, platformMutationLimiter }) {

  // POST /api/v1/platform/tenants — Create a new tenant
  router.post('/tenants', platformMutationLimiter, requirePlatformAuth(), async (req, res, next) => {
    const errors = validateTenantCreate(req.body)
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors })
    }

    try {
      const { tenantId, tenant } = await createTenant({
        accountId: req.account.id,
        name: req.body.name,
      })

      log.info(`[platform] Tenant created: ${req.body.name} (${tenantId}) by ${req.account.email}`)

      res.status(201).json({
        success: true,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          subscription: tenant.subscription,
          createdAt: tenant.createdAt,
        },
      })
    } catch (err) {
      if (err.message.includes('already exists') || err.code === '23505') {
        return res.status(409).json({ error: 'A tenant with this name already exists' })
      }
      log.error('[platform] Tenant creation failed:', err.message)
      return next(new AppError('Failed to create tenant', 500, 'INTERNAL_ERROR'))
    }
  })

  // GET /api/v1/platform/tenants — List account's tenants
  router.get('/tenants', requirePlatformAuth(), async (req, res) => {
    const tenants = await listAccountTenants(req.account.id)
    const disCounts = await countDisciplinesByTenant(tenants.map(t => t.id))
    res.json({
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        subscription: t.subscription,
        disciplineCount: disCounts.get(t.id) || 0,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    })
  })

  // GET /api/v1/platform/tenants/:id — Get tenant details
  // Any member can read tenant details
  router.get('/tenants/:id', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    // SSI credentials are sensitive — only show to owner
    const tenant = { ...req.tenant }
    if (!hasRequiredRole(req.membership.roles, ['owner'])) {
      tenant.ssiCredentials = tenant.ssiCredentials ? { configured: true } : null
    }
    res.json({ tenant })
  })

  // PATCH /api/v1/platform/tenants/:id — Update tenant settings
  // Name: owner or tenant_admin
  // SSI credentials, calendar config: owner only
  router.patch('/tenants/:id', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
    // Field-level permission check:
    // SSI credentials and calendar config require owner role
    const ownerOnlyFields = ['ssiCredentials', 'calendarConfig']
    const hasOwnerOnlyFields = ownerOnlyFields.some(f => req.body[f] !== undefined)
    if (hasOwnerOnlyFields && !hasRequiredRole(req.membership.roles, ['owner'])) {
      return res.status(403).json({ error: 'Only the tenant owner can update SSI credentials and calendar config' })
    }

    // Only allow updating safe fields
    const allowedFields = ['name', 'city', 'country', 'timezone', 'locale', 'ssiCredentials', 'calendarConfig', 'disciplines']
    const updates = {}
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    try {
      const updated = await updateTenant(req.params.id, updates)

      // SEC-H4: Audit log for SSI credentials update
      if (updates.ssiCredentials) {
        await createAuditLog({
          tenantId: req.params.id,
          accountId: req.account.id,
          action: 'update_ssi_credentials',
          targetType: 'tenant',
          targetId: req.params.id,
          ipAddress: req.ip
        })
      }

      res.json({ success: true, tenant: updated })
    } catch (err) {
      log.error('[platform] Tenant update failed:', err.message)
      return next(new AppError('Failed to update tenant', 500, 'INTERNAL_ERROR'))
    }
  })
}
