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
        createdAt: t.createdAt,
      })),
    })
  })

  // ============================================================
  // GET /api/v1/platform/me — Get current account profile
  // ============================================================
  router.get('/me', requirePlatformAuth(), async (req, res) => {
    const tenants = await listAccountTenants(req.account.id)
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
        disciplines: t.disciplines || [],
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
      log.error('[platform] Tenant creation failed:', err.message)
      return next(new AppError('Failed to create tenant', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // GET /api/v1/platform/tenants — List account's tenants
  // ============================================================
  router.get('/tenants', requirePlatformAuth(), async (req, res) => {
    const tenants = await listAccountTenants(req.account.id)
    res.json({
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        subscription: t.subscription,
        disciplines: t.disciplines || [],
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    })
  })

  // ============================================================
  // GET /api/v1/platform/tenants/:id — Get tenant details
  // ============================================================
  router.get('/tenants/:id', requirePlatformAuth(), async (req, res) => {
    const tenant = await getTenant(req.params.id)
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' })
    }

    // Verify ownership
    if (tenant.accountId !== req.account.id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    res.json({ tenant })
  })

  // ============================================================
  // PATCH /api/v1/platform/tenants/:id — Update tenant settings
  // ============================================================
  router.patch('/tenants/:id', requirePlatformAuth(), async (req, res, next) => {
    const tenant = await getTenant(req.params.id)
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' })
    }

    // Verify ownership
    if (tenant.accountId !== req.account.id) {
      return res.status(403).json({ error: 'Access denied' })
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
  // Discipline CRUD — nested under /tenants/:tenantId/disciplines
  // ============================================================

  // Middleware: verify tenant ownership for discipline routes
  async function requireTenantOwnership(req, res, next) {
    const tenant = await getTenant(req.params.tenantId)
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' })
    if (tenant.accountId !== req.account.id) return res.status(403).json({ error: 'Access denied' })
    req.tenant = tenant
    next()
  }

  // GET /api/v1/platform/tenants/:tenantId/disciplines
  router.get('/tenants/:tenantId/disciplines', requirePlatformAuth(), requireTenantOwnership, async (req, res) => {
    const disciplines = await listTenantDisciplines(req.params.tenantId)
    res.json({ disciplines })
  })

  // POST /api/v1/platform/tenants/:tenantId/disciplines
  router.post('/tenants/:tenantId/disciplines', requirePlatformAuth(), requireTenantOwnership, async (req, res, next) => {
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
  router.get('/tenants/:tenantId/disciplines/:id', requirePlatformAuth(), requireTenantOwnership, async (req, res) => {
    const discipline = await getDiscipline(req.params.id)
    if (!discipline || discipline.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Discipline not found' })
    }
    res.json({ discipline })
  })

  // PATCH /api/v1/platform/tenants/:tenantId/disciplines/:id
  router.patch('/tenants/:tenantId/disciplines/:id', requirePlatformAuth(), requireTenantOwnership, async (req, res, next) => {
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
  router.delete('/tenants/:tenantId/disciplines/:id', requirePlatformAuth(), requireTenantOwnership, async (req, res) => {
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

  return router
}
