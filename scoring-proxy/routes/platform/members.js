// ============================================================
// Platform Routes — Tenant Member Management
// Mounted under /api/v1/platform by createPlatformRouter
// ============================================================

import { log } from '../../lib/logger.js'
import { AppError } from '../../lib/errors/AppError.js'
import {
  listTenantMembers,
  addTenantMember,
  updateMemberRoles,
  removeTenantMember,
  createAuditLog,
  TENANT_ROLES,
  getAssignableRoles,
  validateRoleAssignment,
} from '../../lib/db/platform-store.js'

export function mountMemberRoutes(router, { requirePlatformAuth, requireTenantRole }) {

  // GET /api/v1/platform/tenants/:tenantId/members
  router.get('/tenants/:tenantId/members', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'instructor_admin'), async (req, res) => {
    const members = await listTenantMembers(req.params.tenantId)
    // Include the actor's assignable roles so frontend can filter role checkboxes
    const assignableRoles = getAssignableRoles(req.membership.roles)
    res.json({ members, assignableRoles })
  })

  // POST /api/v1/platform/tenants/:tenantId/members — Add a member
  router.post('/tenants/:tenantId/members', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
    const { accountId, roles } = req.body
    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' })
    }
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: 'roles array is required (at least one role)' })
    }

    // Validate role names
    const invalidRoles = roles.filter(r => !TENANT_ROLES.includes(r))
    if (invalidRoles.length > 0) {
      return res.status(400).json({ error: `Invalid roles: ${invalidRoles.join(', ')}` })
    }

    // Enforce role assignment matrix
    const { allowed: canAssign, disallowed: badRoles } = validateRoleAssignment(req.membership.roles, roles)
    if (!canAssign) {
      return res.status(403).json({ error: `You cannot assign these roles: ${badRoles.join(', ')}. Your permissions do not allow it.` })
    }

    try {
      const { memberId, member } = await addTenantMember({
        tenantId: req.params.tenantId,
        accountId,
        roles,
        invitedBy: req.account.id,
      })
      log.info(`[platform] Member added: ${accountId} → tenant ${req.params.tenantId} with roles [${roles}]`)
      res.status(201).json({ success: true, member })
    } catch (err) {
      log.error('[platform] Add member failed:', err.message)
      return next(new AppError('Failed to add member', 500, 'INTERNAL_ERROR'))
    }
  })

  // PATCH /api/v1/platform/tenants/:tenantId/members/:memberId — Update roles
  router.patch('/tenants/:tenantId/members/:memberId', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
    const { roles } = req.body
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: 'roles array is required (at least one role)' })
    }

    const invalidRoles = roles.filter(r => !TENANT_ROLES.includes(r))
    if (invalidRoles.length > 0) {
      return res.status(400).json({ error: `Invalid roles: ${invalidRoles.join(', ')}` })
    }

    // Enforce role assignment matrix
    const { allowed: canAssign, disallowed: badRoles } = validateRoleAssignment(req.membership.roles, roles)
    if (!canAssign) {
      return res.status(403).json({ error: `You cannot assign these roles: ${badRoles.join(', ')}. Your permissions do not allow it.` })
    }

    try {
      const updated = await updateMemberRoles(req.params.memberId, roles)
      if (!updated) {
        return res.status(404).json({ error: 'Membership not found' })
      }

      // SEC-H4: Audit log
      await createAuditLog({
        tenantId: req.params.tenantId,
        accountId: req.account.id,
        action: 'update_member_roles',
        targetType: 'member',
        targetId: req.params.memberId,
        metadata: { newRoles: roles },
        ipAddress: req.ip
      })
      log.info(`[platform] Member roles updated: ${req.params.memberId} → [${roles}]`)
      res.json({ success: true, member: updated })
    } catch (err) {
      if (err.message.includes('last owner')) {
        return res.status(400).json({ error: err.message })
      }
      log.error('[platform] Update member roles failed:', err.message)
      return next(new AppError('Failed to update member roles', 500, 'INTERNAL_ERROR'))
    }
  })

  // DELETE /api/v1/platform/tenants/:tenantId/members/:memberId — Remove member
  router.delete('/tenants/:tenantId/members/:memberId', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
    try {
      const removed = await removeTenantMember(req.params.memberId)
      if (!removed) {
        return res.status(404).json({ error: 'Membership not found' })
      }

      // SEC-H4: Audit log
      await createAuditLog({
        tenantId: req.params.tenantId,
        accountId: req.account.id,
        action: 'remove_member',
        targetType: 'member',
        targetId: req.params.memberId,
        ipAddress: req.ip
      })
      log.info(`[platform] Member removed: ${req.params.memberId} from tenant ${req.params.tenantId}`)
      res.json({ success: true })
    } catch (err) {
      if (err.message.includes('last owner')) {
        return res.status(400).json({ error: err.message })
      }
      log.error('[platform] Remove member failed:', err.message)
      return next(new AppError('Failed to remove member', 500, 'INTERNAL_ERROR'))
    }
  })
}
