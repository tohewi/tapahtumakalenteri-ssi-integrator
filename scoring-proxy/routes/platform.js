// ============================================================
// Platform Routes — Account Registration, Login, Tenant CRUD
//
// These routes handle the self-service onboarding flow:
//   1. User signs up (email + password + org name) → account created
//   2. User signs in → gets platform session cookie
//   3. Account creates tenants (organizations)
//   4. Account manages tenant list
//
// Separate from SSI auth — platform accounts have their own
// identity system independent of ShootNScoreIt accounts.
// ============================================================

import express from 'express'
import { log } from '../lib/logger.js'
import { AppError } from '../lib/errors/AppError.js'
import { ssiFetchEventStructure } from '../lib/ssi-core/seed-import.js'
import {
  createAccountWithTenant,
  authenticateAccount,
  getAccount,
  updateAccount,
  changePassword,
  createTenant,
  getTenant,
  listAccountTenants,
  updateTenant,
  createPlatformSession,
  deletePlatformSession,
  getPlatformSession,
  createDiscipline,
  getDiscipline,
  listTenantDisciplines,
  updateDiscipline,
  deleteDiscipline,
  createMatchTemplate,
  getMatchTemplate,
  listTenantTemplates,
  listDisciplineTemplates,
  updateMatchTemplate,
  deleteMatchTemplate,
  getTenantMembership,
  listTenantMembers,
  addTenantMember,
  updateMemberRoles,
  removeTenantMember,
  hasRequiredRole,
  TENANT_ROLES,
  countDisciplinesByTenant,
} from '../lib/db/platform-store.js'
import { requirePlatformAuth, PLATFORM_COOKIE } from '../middleware/platform-auth.js'

// ---- Input validation helpers ----

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NAME_LEN = 100
const MIN_PASSWORD_LEN = 8
const MAX_PASSWORD_LEN = 128

function validateSignUp(body) {
  const errors = []
  if (!body.email || !EMAIL_RE.test(body.email)) errors.push('Valid email is required')
  if (!body.password || body.password.length < MIN_PASSWORD_LEN) errors.push(`Password must be at least ${MIN_PASSWORD_LEN} characters`)
  if (body.password && body.password.length > MAX_PASSWORD_LEN) errors.push(`Password must be at most ${MAX_PASSWORD_LEN} characters`)
  if (!body.name || body.name.trim().length < 2) errors.push('Name is required (min 2 characters)')
  if (body.name && body.name.length > MAX_NAME_LEN) errors.push(`Name must be at most ${MAX_NAME_LEN} characters`)
  if (!body.organizationName || body.organizationName.trim().length < 2) errors.push('Organization name is required (min 2 characters)')
  if (body.organizationName && body.organizationName.length > MAX_NAME_LEN) errors.push(`Organization name must be at most ${MAX_NAME_LEN} characters`)
  return errors
}

function validateTenantCreate(body) {
  const errors = []
  if (!body.name || body.name.trim().length < 2) errors.push('Tenant name is required (min 2 characters)')
  if (body.name && body.name.length > MAX_NAME_LEN) errors.push(`Tenant name must be at most ${MAX_NAME_LEN} characters`)
  return errors
}

// ---- Cookie config ----

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
}

// ---- Router factory ----

export function createPlatformRouter({ platformSignUpLimiter, platformLoginLimiter }) {
  const router = express.Router()

  // ============================================================
  // POST /api/v1/platform/register — Sign up for a platform account
  // Creates account + first tenant (from organizationName)
  // ============================================================
  router.post('/register', platformSignUpLimiter, async (req, res, next) => {
    const errors = validateSignUp(req.body)
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors })
    }

    try {
      const { email, password, name, organizationName } = req.body

      // Create account + first tenant atomically — if tenant creation fails
      // the account is rolled back, preventing orphaned accounts.
      const { accountId, account, tenantId, tenant } = await createAccountWithTenant({
        email, password, name, organizationName,
      })
      log.info(`[platform] Account registered: ${email} (${accountId}), tenant: ${organizationName} (${tenantId})`)

      // 2. Create platform session
      const { sessionId } = await createPlatformSession(accountId)

      // 3. Set session cookie
      res.cookie(PLATFORM_COOKIE, sessionId, COOKIE_OPTIONS)

      res.status(201).json({
        success: true,
        account: {
          id: account.id,
          email: account.email,
          name: account.name,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          subscription: tenant.subscription,
        },
      })
    } catch (err) {
      if (err.message.includes('already exists')) {
        return res.status(409).json({ error: err.message })
      }
      log.error('[platform] Registration failed:', err.message)
      return next(new AppError('Registration failed', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/login — Sign in to platform account
  // ============================================================
  router.post('/login', platformLoginLimiter, async (req, res, next) => {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    try {
      const result = await authenticateAccount(email, password)
      if (!result) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const { accountId, account } = result
      const { sessionId } = await createPlatformSession(accountId)

      res.cookie(PLATFORM_COOKIE, sessionId, COOKIE_OPTIONS)

      log.info(`[platform] Account logged in: ${email}`)

      // Fetch tenants for response
      const tenants = await listAccountTenants(accountId)

      res.json({
        success: true,
        account: {
          id: account.id,
          email: account.email,
          name: account.name,
        },
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          subscription: t.subscription,
          createdAt: t.createdAt,
        })),
      })
    } catch (err) {
      log.error('[platform] Login failed:', err.message)
      return next(new AppError('Login failed', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/logout — Destroy platform session
  // ============================================================
  router.post('/logout', async (req, res) => {
    const sessionId = req.cookies?.[PLATFORM_COOKIE]
    if (sessionId) {
      await deletePlatformSession(sessionId)
    }
    res.clearCookie(PLATFORM_COOKIE, { path: '/' })
    res.json({ success: true })
  })

  // ============================================================
  // GET /api/v1/platform/status — Check platform session
  // ============================================================
  router.get('/status', async (req, res) => {
    const sessionId = req.cookies?.[PLATFORM_COOKIE]
    if (!sessionId) {
      return res.json({ authenticated: false })
    }

    const session = await getPlatformSession(sessionId)
    if (!session) {
      return res.json({ authenticated: false })
    }

    const account = await getAccount(session.accountId)
    if (!account) {
      return res.json({ authenticated: false })
    }

    const tenants = await listAccountTenants(session.accountId)
    const disCounts = await countDisciplinesByTenant(tenants.map(t => t.id))

    res.json({
      authenticated: true,
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
      },
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        subscription: t.subscription,
        disciplineCount: disCounts.get(t.id) || 0,
        createdAt: t.createdAt,
      })),
    })
  })

  // ============================================================
  // GET /api/v1/platform/me — Get current account profile
  // ============================================================
  router.get('/me', requirePlatformAuth(), async (req, res) => {
    const tenants = await listAccountTenants(req.account.id)
    const disCounts = await countDisciplinesByTenant(tenants.map(t => t.id))
    res.json({
      account: {
        id: req.account.id,
        email: req.account.email,
        name: req.account.name,
        createdAt: req.account.createdAt,
      },
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        subscription: t.subscription,
        disciplineCount: disCounts.get(t.id) || 0,
        createdAt: t.createdAt,
      })),
    })
  })

  // ============================================================
  // PATCH /api/v1/platform/account — Update account profile
  // ============================================================
  router.patch('/account', requirePlatformAuth(), async (req, res, next) => {
    const { name, email } = req.body
    const updates = {}

    if (name !== undefined) {
      if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' })
      }
      if (name.length > MAX_NAME_LEN) {
        return res.status(400).json({ error: `Name must be at most ${MAX_NAME_LEN} characters` })
      }
      updates.name = name.trim()
    }

    if (email !== undefined) {
      if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Valid email is required' })
      }
      updates.email = email
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    try {
      const updated = await updateAccount(req.account.id, updates)
      if (!updated) {
        return res.status(404).json({ error: 'Account not found' })
      }
      log.info(`[platform] Account updated: ${updated.email} (${updated.id})`)
      res.json({
        success: true,
        account: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          createdAt: updated.createdAt,
        },
      })
    } catch (err) {
      if (err.message.includes('already exists') || err.code === '23505') {
        return res.status(409).json({ error: 'Email is already in use by another account' })
      }
      log.error('[platform] Account update failed:', err.message)
      return next(new AppError('Failed to update account', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/account/change-password
  // ============================================================
  router.post('/account/change-password', requirePlatformAuth(), async (req, res, next) => {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' })
    }
    if (newPassword.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LEN} characters` })
    }
    if (newPassword.length > MAX_PASSWORD_LEN) {
      return res.status(400).json({ error: `New password must be at most ${MAX_PASSWORD_LEN} characters` })
    }

    try {
      await changePassword(req.account.id, currentPassword, newPassword)
      log.info(`[platform] Password changed for account: ${req.account.email}`)
      res.json({ success: true })
    } catch (err) {
      if (err.message.includes('incorrect')) {
        return res.status(401).json({ error: 'Current password is incorrect' })
      }
      log.error('[platform] Password change failed:', err.message)
      return next(new AppError('Failed to change password', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/tenants — Create a new tenant
  // ============================================================
  router.post('/tenants', requirePlatformAuth(), async (req, res, next) => {
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

  // ============================================================
  // GET /api/v1/platform/tenants — List account's tenants
  // ============================================================
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

  // ============================================================
  // GET /api/v1/platform/tenants/:id — Get tenant details
  // Any member can read tenant details
  // ============================================================
  router.get('/tenants/:id', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    // SSI credentials are sensitive — only show to owner
    const tenant = { ...req.tenant }
    if (!hasRequiredRole(req.membership.roles, ['owner'])) {
      tenant.ssiCredentials = tenant.ssiCredentials ? { configured: true } : null
    }
    res.json({ tenant })
  })

  // ============================================================
  // PATCH /api/v1/platform/tenants/:id — Update tenant settings
  // Name: owner or tenant_admin
  // SSI credentials, calendar config: owner only
  // ============================================================
  router.patch('/tenants/:id', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
    // Field-level permission check:
    // SSI credentials and calendar config require owner role
    const ownerOnlyFields = ['ssiCredentials', 'calendarConfig']
    const hasOwnerOnlyFields = ownerOnlyFields.some(f => req.body[f] !== undefined)
    if (hasOwnerOnlyFields && !hasRequiredRole(req.membership.roles, ['owner'])) {
      return res.status(403).json({ error: 'Only the tenant owner can update SSI credentials and calendar config' })
    }

    // Only allow updating safe fields
    const allowedFields = ['name', 'ssiCredentials', 'calendarConfig', 'disciplines']
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
      res.json({ success: true, tenant: updated })
    } catch (err) {
      log.error('[platform] Tenant update failed:', err.message)
      return next(new AppError('Failed to update tenant', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // RBAC Middleware — role-based access for tenant-scoped routes
  // ============================================================

  /**
   * Middleware factory: verify the caller has an active membership in the tenant
   * and at least one of the required roles. Sets req.tenant and req.membership.
   *
   * Usage:
   *   requireTenantRole('owner')                          // owner only (billing, SSI creds)
   *   requireTenantRole('owner', 'tenant_admin')          // owner or tenant_admin
   *   requireTenantRole('owner', 'tenant_admin', 'discipline_admin')  // discipline ops
   *   requireTenantRole('owner', 'tenant_admin', 'match_admin')       // template/scheduling
   *   requireTenantRole(...TENANT_ROLES)                  // any member (read-only)
   *
   * Note: hasRequiredRole() handles implicit escalation:
   *   - owner satisfies ALL roles
   *   - tenant_admin satisfies all except owner-only actions
   */
  function requireTenantRole(...requiredRoles) {
    return async (req, res, next) => {
      const tenantId = req.params.tenantId || req.params.id
      const tenant = await getTenant(tenantId)
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' })

      // Check membership
      const membership = await getTenantMembership(tenantId, req.account.id)

      // Backward compatibility: if no membership exists but account owns the tenant,
      // treat as owner (for tenants created before RBAC migration)
      if (!membership && tenant.accountId === req.account.id) {
        req.tenant = tenant
        req.membership = { roles: ['owner'], id: null, tenantId, accountId: req.account.id }
        return next()
      }

      if (!membership) {
        return res.status(403).json({ error: 'Access denied' })
      }

      if (!hasRequiredRole(membership.roles, requiredRoles)) {
        return res.status(403).json({ error: 'Insufficient permissions for this action' })
      }

      req.tenant = tenant
      req.membership = membership
      next()
    }
  }

  // ============================================================
  // Discipline CRUD — nested under /tenants/:tenantId/disciplines
  // ============================================================

  // GET /api/v1/platform/tenants/:tenantId/disciplines
  // Any member can read disciplines
  router.get('/tenants/:tenantId/disciplines', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    const disciplines = await listTenantDisciplines(req.params.tenantId)
    res.json({ disciplines })
  })

  // POST /api/v1/platform/tenants/:tenantId/disciplines
  // Requires: owner, tenant_admin, or discipline_admin
  router.post('/tenants/:tenantId/disciplines', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'discipline_admin'), async (req, res, next) => {
    const { name, labelFi, labelEn, ssiGroupId, ssiOrganizerId } = req.body
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Discipline name is required (min 2 characters)' })
    }

    try {
      const { disciplineId, discipline } = await createDiscipline({
        tenantId: req.params.tenantId,
        name, labelFi, labelEn, ssiGroupId, ssiOrganizerId,
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
  router.patch('/tenants/:tenantId/disciplines/:id', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'discipline_admin'), async (req, res, next) => {
    const discipline = await getDiscipline(req.params.id)
    if (!discipline || discipline.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Discipline not found' })
    }

    const allowedFields = ['name', 'labelFi', 'labelEn', 'ssiGroupId', 'ssiOrganizerId']
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
  router.delete('/tenants/:tenantId/disciplines/:id', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'discipline_admin'), async (req, res) => {
    const discipline = await getDiscipline(req.params.id)
    if (!discipline || discipline.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Discipline not found' })
    }

    const deleted = await deleteDiscipline(req.params.id)
    if (!deleted) {
      return res.status(404).json({ error: 'Discipline not found' })
    }

    log.info(`[platform] Discipline deleted: ${req.params.id} from tenant ${req.params.tenantId}`)
    res.json({ success: true })
  })

  // ============================================================
  // Match Template CRUD — nested under /tenants/:tenantId/templates
  // ============================================================

  // GET /api/v1/platform/tenants/:tenantId/templates
  // Any member can read templates
  router.get('/tenants/:tenantId/templates', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    const { disciplineId } = req.query
    const templates = disciplineId
      ? await listDisciplineTemplates(disciplineId)
      : await listTenantTemplates(req.params.tenantId)
    res.json({ templates })
  })

  // POST /api/v1/platform/tenants/:tenantId/templates
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/templates', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const { name, disciplineId, ssiSeedEventId, ssiSeedSnapshot, overrides, calendarTemplate, staffingRules } = req.body
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Template name is required (min 2 characters)' })
    }
    if (!disciplineId) {
      return res.status(400).json({ error: 'disciplineId is required' })
    }

    // Verify discipline belongs to this tenant
    const discipline = await getDiscipline(disciplineId)
    if (!discipline || discipline.tenantId !== req.params.tenantId) {
      return res.status(400).json({ error: 'Discipline not found in this tenant' })
    }

    try {
      const { templateId, template } = await createMatchTemplate({
        tenantId: req.params.tenantId,
        disciplineId, name, ssiSeedEventId, ssiSeedSnapshot,
        overrides, calendarTemplate, staffingRules,
      })
      log.info(`[platform] Template created: ${name} (${templateId}) for discipline ${disciplineId}`)
      res.status(201).json({ success: true, template })
    } catch (err) {
      log.error('[platform] Template creation failed:', err.message)
      return next(new AppError('Failed to create template', 500, 'INTERNAL_ERROR'))
    }
  })

  // GET /api/v1/platform/tenants/:tenantId/templates/:id
  // Any member can read
  router.get('/tenants/:tenantId/templates/:id', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    const template = await getMatchTemplate(req.params.id)
    if (!template || template.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Template not found' })
    }
    res.json({ template })
  })

  // PATCH /api/v1/platform/tenants/:tenantId/templates/:id
  // Requires: owner, tenant_admin, or match_admin
  router.patch('/tenants/:tenantId/templates/:id', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const template = await getMatchTemplate(req.params.id)
    if (!template || template.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Template not found' })
    }

    const allowedFields = ['name', 'ssiSeedEventId', 'ssiSeedSnapshot', 'overrides', 'calendarTemplate', 'staffingRules']
    const updates = {}
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field]
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    try {
      const updated = await updateMatchTemplate(req.params.id, updates)
      res.json({ success: true, template: updated })
    } catch (err) {
      log.error('[platform] Template update failed:', err.message)
      return next(new AppError('Failed to update template', 500, 'INTERNAL_ERROR'))
    }
  })

  // DELETE /api/v1/platform/tenants/:tenantId/templates/:id
  // Requires: owner, tenant_admin, or match_admin
  router.delete('/tenants/:tenantId/templates/:id', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res) => {
    const template = await getMatchTemplate(req.params.id)
    if (!template || template.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Template not found' })
    }

    const deleted = await deleteMatchTemplate(req.params.id)
    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' })
    }

    log.info(`[platform] Template deleted: ${req.params.id} from tenant ${req.params.tenantId}`)
    res.json({ success: true })
  })

  // POST /api/v1/platform/tenants/:tenantId/templates/:id/import-seed
  // Fetches SSI event structure from the template's ssiSeedEventId URL
  // and stores it as ssi_seed_snapshot. Requires tenant SSI credentials.
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/templates/:id/import-seed', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const template = await getMatchTemplate(req.params.id)
    if (!template || template.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Template not found' })
    }

    if (!template.ssiSeedEventId) {
      return res.status(400).json({ error: 'Template has no SSI event URL configured' })
    }

    // Tenant must have SSI credentials configured
    const tenant = req.tenant
    if (!tenant.ssiCredentials?.email || !tenant.ssiCredentials?.password) {
      return res.status(400).json({ error: 'Tenant SSI credentials must be configured before importing seed events' })
    }

    try {
      const snapshot = await ssiFetchEventStructure({
        ssiEventUrl: template.ssiSeedEventId,
        credentials: {
          email: tenant.ssiCredentials.email,
          password: tenant.ssiCredentials.password,
          apiKey: tenant.ssiCredentials.apiKey || null,
        },
      })

      // Store snapshot in the template
      const updated = await updateMatchTemplate(req.params.id, {
        ssiSeedSnapshot: snapshot,
      })

      log.info(`[platform] Seed imported for template ${req.params.id}: "${snapshot.name}" (${snapshot.isCup ? snapshot.matchCount + ' matches' : 'single match'})`)
      res.json({ success: true, template: updated, snapshot })
    } catch (err) {
      log.error(`[platform] Seed import failed for template ${req.params.id}:`, err.message)
      if (err.message.includes('authentication failed') || err.message.includes('credentials')) {
        return res.status(401).json({ error: 'SSI authentication failed — check tenant SSI credentials' })
      }
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: `SSI event not found at ${template.ssiSeedEventId}` })
      }
      return next(new AppError('Failed to import seed event', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // Member Management — nested under /tenants/:tenantId/members
  // Requires: owner or tenant_admin
  // ============================================================

  // GET /api/v1/platform/tenants/:tenantId/members
  router.get('/tenants/:tenantId/members', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res) => {
    const members = await listTenantMembers(req.params.tenantId)
    res.json({ members })
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

    // tenant_admin cannot assign owner role
    if (roles.includes('owner') && !hasRequiredRole(req.membership.roles, ['owner'])) {
      return res.status(403).json({ error: 'Only an owner can assign the owner role' })
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

    // tenant_admin cannot assign or remove owner role
    if (roles.includes('owner') && !hasRequiredRole(req.membership.roles, ['owner'])) {
      return res.status(403).json({ error: 'Only an owner can assign the owner role' })
    }

    try {
      const updated = await updateMemberRoles(req.params.memberId, roles)
      if (!updated) {
        return res.status(404).json({ error: 'Membership not found' })
      }
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

  return router
}
