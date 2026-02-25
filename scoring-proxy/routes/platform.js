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
  createAccount,
  authenticateAccount,
  getAccount,
  createTenant,
  getTenant,
  listAccountTenants,
  updateTenant,
  createPlatformSession,
  deletePlatformSession,
  getPlatformSession,
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

      // 1. Create account
      const { accountId, account } = await createAccount({ email, password, name })
      log.info(`[platform] Account registered: ${email} (${accountId})`)

      // 2. Create first tenant automatically
      const { tenantId, tenant } = await createTenant({
        accountId,
        name: organizationName,
      })
      log.info(`[platform] Tenant created: ${organizationName} (${tenantId}) for account ${accountId}`)

      // 3. Create platform session
      const { sessionId } = await createPlatformSession(accountId)

      // 4. Set session cookie
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

  return router
}
