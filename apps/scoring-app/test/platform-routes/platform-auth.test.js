// ============================================================
// Platform Auth & Tenant Route Tests
//
// Tests the /api/v1/platform/* endpoints with all external
// dependencies mocked. Covers:
//   - Registration (validation, success, duplicate)
//   - Login (success, wrong password, MFA flow)
//   - Logout / status / me
//   - requirePlatformAuth guard
//   - requireTenantRole RBAC guard
//   - Tenant list + detail (GET /tenants, GET /tenants/:id)
//
// PostgreSQL, Redis, bcrypt, and email are all mocked — no live
// connections required.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

// ---- Mock: platform-store ----
const storeMocks = vi.hoisted(() => ({
  createAccountWithTenant: vi.fn(),
  createAccount: vi.fn(),
  authenticateAccount: vi.fn(),
  createPlatformSession: vi.fn(),
  deletePlatformSession: vi.fn(),
  getPlatformSession: vi.fn(),
  upgradeMfaSession: vi.fn(),
  getAccount: vi.fn(),
  getAccountWithMfaSecrets: vi.fn(),
  updateAccount: vi.fn(),
  changePassword: vi.fn(),
  listAccountTenants: vi.fn(),
  countDisciplinesByTenant: vi.fn(),
  createTenant: vi.fn(),
  updateTenant: vi.fn(),
  getTenant: vi.fn(),
  getTenantMembership: vi.fn(),
  hasRequiredRole: vi.fn(),
  createPasswordResetToken: vi.fn(),
  resetPasswordWithToken: vi.fn(),
  invalidateAccountSessions: vi.fn(),
  autoAcceptPendingInvitations: vi.fn(),
  createAuditLog: vi.fn(),
  TENANT_ROLES: ['owner', 'tenant_admin', 'match_admin', 'instructor_admin', 'discipline_admin', 'member'],
}))
vi.mock('../../lib/db/platform-store.js', () => storeMocks)

// ---- Mock: email ----
vi.mock('../../lib/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

// ---- Mock: mfa-service ----
vi.mock('../../lib/services/mfa-service.js', () => ({
  generateMfaSetup: vi.fn(),
  verifyTotpCode: vi.fn(),
  hashRecoveryCodes: vi.fn(),
  verifyRecoveryCode: vi.fn(),
}))

// ---- Mock: platform-validation ----
vi.mock('../../lib/services/platform-validation.js', () => ({
  validateSignUp: vi.fn(() => []),       // no validation errors by default
  validateTenantCreate: vi.fn(() => []),
}))

// ---- Mock: integrations registry ----
vi.mock('../../lib/integrations/registry.js', () => ({
  getIntegrationTypes: vi.fn(() => []),
}))

// ---- Mock: ssi-core modules (used by disciplines/templates) ----
vi.mock('../../lib/ssi-core/discipline-registry.js', () => ({
  SSI_DISCIPLINE_REGISTRY: [],
  getSsiDisciplineByProperties: vi.fn(),
  getSsiDisciplineByUrl: vi.fn(),
}))
vi.mock('../../lib/ssi-core/graphql.js', () => ({
  ssiGraphQL: vi.fn(),
}))
vi.mock('../../lib/ssi-core/seed-import.js', () => ({
  ssiFetchEventStructure: vi.fn(),
}))
vi.mock('../../lib/db/postgres.js', () => ({
  initPostgres: vi.fn().mockResolvedValue(false),
  getPool: vi.fn().mockReturnValue(null),
  query: vi.fn(),
  withTransaction: vi.fn(),
}))

import { createPlatformRouter } from '../../routes/platform.js'
import { errorHandler } from '../../middleware/errorHandler.js'

// ---- Helpers ----

const PLATFORM_COOKIE = 'platform_sid'
const TEST_SESSION_ID = 'test_session_abc123'
const TEST_ACCOUNT_ID = 'acc_test001'
const TEST_TENANT_ID  = 'tnt_test001'

function noopLimiter(req, res, next) { next() }

function buildApp() {
  const app = express()
  app.set('trust proxy', true)
  app.use(express.json())
  app.use(cookieParser())

  const platformRouter = createPlatformRouter({
    platformSignUpLimiter:         noopLimiter,
    platformLoginLimiter:          noopLimiter,
    platformPasswordResetLimiter:  noopLimiter,
    platformMutationLimiter:       noopLimiter,
    platformSsiLimiter:            noopLimiter,
    getAdminSession:               vi.fn().mockResolvedValue(null),
  })
  app.use('/api/v1/platform', platformRouter)
  app.use(errorHandler)
  return app
}

function mockValidSession(accountId = TEST_ACCOUNT_ID) {
  storeMocks.getPlatformSession.mockResolvedValue({ accountId, mfaPending: false })
  storeMocks.getAccount.mockResolvedValue({
    id: accountId,
    email: 'test@example.com',
    name: 'Test User',
    mfaEnabled: false,
    tenants: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

function mockTenantOwner(tenantId = TEST_TENANT_ID, accountId = TEST_ACCOUNT_ID) {
  storeMocks.getTenant.mockResolvedValue({
    id: tenantId,
    accountId,
    name: 'Test Org',
    subscription: {},
    ssiCredentials: null,
    calendarConfig: null,
    disciplines: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  storeMocks.getTenantMembership.mockResolvedValue({
    id: 'mem_001',
    tenantId,
    accountId,
    roles: ['owner'],
    status: 'active',
  })
  storeMocks.hasRequiredRole.mockReturnValue(true)
}

// ============================================================
describe('POST /api/v1/platform/register', () => {
  let app
  beforeAll(() => { app = buildApp() })
  beforeEach(() => vi.clearAllMocks())

  it('creates account + tenant and returns 201', async () => {
    storeMocks.createAccountWithTenant.mockResolvedValue({
      accountId: TEST_ACCOUNT_ID,
      account: { id: TEST_ACCOUNT_ID, email: 'new@example.com' },
      tenantId: TEST_TENANT_ID,
      tenant: { id: TEST_TENANT_ID, name: 'New Org', subscription: {} },
    })
    storeMocks.autoAcceptPendingInvitations.mockResolvedValue([])
    storeMocks.createPlatformSession.mockResolvedValue({ sessionId: TEST_SESSION_ID })

    const res = await request(app)
      .post('/api/v1/platform/register')
      .send({ email: 'new@example.com', password: 'Secret123!', name: 'New User', organizationName: 'New Org' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.account.email).toBe('new@example.com')
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 409 when email already exists', async () => {
    storeMocks.createAccountWithTenant.mockRejectedValue(new Error('email already exists'))

    const res = await request(app)
      .post('/api/v1/platform/register')
      .send({ email: 'dup@example.com', password: 'Secret123!', name: 'Dup User', organizationName: 'Dup Org' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/)
  })

  it('returns 400 when validation fails', async () => {
    const { validateSignUp } = await import('../../lib/services/platform-validation.js')
    validateSignUp.mockReturnValueOnce(['Email is required'])

    const res = await request(app)
      .post('/api/v1/platform/register')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Validation failed')
    expect(res.body.details).toContain('Email is required')
  })
})

// ============================================================
describe('POST /api/v1/platform/login', () => {
  let app
  beforeAll(() => { app = buildApp() })
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 if email or password missing', async () => {
    const res = await request(app)
      .post('/api/v1/platform/login')
      .send({ email: 'x@x.com' })
    expect(res.status).toBe(400)
  })

  it('returns 401 on wrong credentials', async () => {
    storeMocks.authenticateAccount.mockResolvedValue(null)
    const res = await request(app)
      .post('/api/v1/platform/login')
      .send({ email: 'x@x.com', password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Invalid/)
  })

  it('creates session and sets cookie on success', async () => {
    storeMocks.authenticateAccount.mockResolvedValue({
      accountId: TEST_ACCOUNT_ID,
      account: { id: TEST_ACCOUNT_ID, email: 'test@example.com', mfaEnabled: false },
    })
    storeMocks.autoAcceptPendingInvitations.mockResolvedValue([])
    storeMocks.createPlatformSession.mockResolvedValue({ sessionId: TEST_SESSION_ID })
    storeMocks.listAccountTenants.mockResolvedValue([])

    const res = await request(app)
      .post('/api/v1/platform/login')
      .send({ email: 'test@example.com', password: 'correct' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.headers['set-cookie']).toBeDefined()
    expect(res.headers['set-cookie'][0]).toContain(PLATFORM_COOKIE)
  })

  it('returns mfaRequired flag when MFA is enabled', async () => {
    storeMocks.authenticateAccount.mockResolvedValue({
      accountId: TEST_ACCOUNT_ID,
      account: { id: TEST_ACCOUNT_ID, email: 'mfa@example.com', mfaEnabled: true },
    })
    storeMocks.createPlatformSession.mockResolvedValue({ sessionId: 'mfa_challenge_sid' })

    const res = await request(app)
      .post('/api/v1/platform/login')
      .send({ email: 'mfa@example.com', password: 'correct' })

    expect(res.status).toBe(200)
    expect(res.body.mfaRequired).toBe(true)
    expect(res.body.success).toBe(true)
  })
})

// ============================================================
describe('POST /api/v1/platform/logout', () => {
  let app
  beforeAll(() => { app = buildApp() })
  beforeEach(() => vi.clearAllMocks())

  it('clears cookie and deletes session', async () => {
    storeMocks.deletePlatformSession.mockResolvedValue(undefined)

    const res = await request(app)
      .post('/api/v1/platform/logout')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(storeMocks.deletePlatformSession).toHaveBeenCalledWith(TEST_SESSION_ID)
    // Cookie should be cleared
    const setCookie = res.headers['set-cookie']?.[0] || ''
    expect(setCookie).toContain(`${PLATFORM_COOKIE}=;`)
  })

  it('returns 200 without a session cookie (idempotent)', async () => {
    const res = await request(app).post('/api/v1/platform/logout')
    expect(res.status).toBe(200)
    expect(storeMocks.deletePlatformSession).not.toHaveBeenCalled()
  })
})

// ============================================================
describe('GET /api/v1/platform/status', () => {
  let app
  beforeAll(() => { app = buildApp() })
  beforeEach(() => vi.clearAllMocks())

  it('returns authenticated:false with no cookie', async () => {
    const res = await request(app).get('/api/v1/platform/status')
    expect(res.status).toBe(200)
    expect(res.body.authenticated).toBe(false)
  })

  it('returns authenticated:false for unknown session', async () => {
    storeMocks.getPlatformSession.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/v1/platform/status')
      .set('Cookie', `${PLATFORM_COOKIE}=unknown_sid`)
    expect(res.status).toBe(200)
    expect(res.body.authenticated).toBe(false)
  })

  it('returns authenticated:false with mfaPending flag for MFA challenge session', async () => {
    storeMocks.getPlatformSession.mockResolvedValue({ accountId: TEST_ACCOUNT_ID, mfaPending: true })
    const res = await request(app)
      .get('/api/v1/platform/status')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)
    expect(res.status).toBe(200)
    expect(res.body.authenticated).toBe(false)
    expect(res.body.mfaPending).toBe(true)
  })

  it('returns authenticated:true with account + tenants for valid session', async () => {
    mockValidSession()
    storeMocks.listAccountTenants.mockResolvedValue([
      { id: TEST_TENANT_ID, name: 'Test Org', subscription: {}, createdAt: Date.now() },
    ])
    storeMocks.countDisciplinesByTenant.mockResolvedValue(new Map([[TEST_TENANT_ID, 2]]))

    const res = await request(app)
      .get('/api/v1/platform/status')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.authenticated).toBe(true)
    expect(res.body.account.email).toBe('test@example.com')
    expect(res.body.tenants).toHaveLength(1)
    expect(res.body.tenants[0].disciplineCount).toBe(2)
  })
})

// ============================================================
describe('requirePlatformAuth — guard behaviour', () => {
  let app
  beforeAll(() => { app = buildApp() })
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 on protected route with no cookie', async () => {
    const res = await request(app).get('/api/v1/platform/me')
    expect(res.status).toBe(401)
  })

  it('returns 401 on protected route with invalid session', async () => {
    storeMocks.getPlatformSession.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/v1/platform/me')
      .set('Cookie', `${PLATFORM_COOKIE}=bad_sid`)
    expect(res.status).toBe(401)
  })

  it('returns 401 when MFA is still pending', async () => {
    storeMocks.getPlatformSession.mockResolvedValue({ accountId: TEST_ACCOUNT_ID, mfaPending: true })
    const res = await request(app)
      .get('/api/v1/platform/me')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MFA_REQUIRED')
  })

  it('passes through for valid session', async () => {
    mockValidSession()
    storeMocks.listAccountTenants.mockResolvedValue([])
    storeMocks.countDisciplinesByTenant.mockResolvedValue(new Map())

    const res = await request(app)
      .get('/api/v1/platform/me')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.account.id).toBe(TEST_ACCOUNT_ID)
  })
})

// ============================================================
describe('GET /api/v1/platform/tenants', () => {
  let app
  beforeAll(() => { app = buildApp() })
  beforeEach(() => vi.clearAllMocks())

  it('returns tenant list with discipline counts', async () => {
    mockValidSession()
    storeMocks.listAccountTenants.mockResolvedValue([
      { id: TEST_TENANT_ID, name: 'Org A', subscription: {}, createdAt: Date.now(), updatedAt: Date.now() },
    ])
    storeMocks.countDisciplinesByTenant.mockResolvedValue(new Map([[TEST_TENANT_ID, 3]]))

    const res = await request(app)
      .get('/api/v1/platform/tenants')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.tenants).toHaveLength(1)
    expect(res.body.tenants[0].name).toBe('Org A')
    expect(res.body.tenants[0].disciplineCount).toBe(3)
  })
})

// ============================================================
describe('GET /api/v1/platform/tenants/:id — requireTenantRole', () => {
  let app
  beforeAll(() => { app = buildApp() })
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when tenant does not exist', async () => {
    mockValidSession()
    storeMocks.getTenant.mockResolvedValue(null)

    const res = await request(app)
      .get(`/api/v1/platform/tenants/${TEST_TENANT_ID}`)
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Tenant not found/)
  })

  it('returns 403 when caller has no membership', async () => {
    mockValidSession()
    storeMocks.getTenant.mockResolvedValue({
      id: TEST_TENANT_ID,
      accountId: 'other_account', // different owner
      name: 'Someone Else Org',
    })
    storeMocks.getTenantMembership.mockResolvedValue(null)

    const res = await request(app)
      .get(`/api/v1/platform/tenants/${TEST_TENANT_ID}`)
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    expect(res.status).toBe(403)
  })

  it('returns tenant details for owner', async () => {
    mockValidSession()
    mockTenantOwner()

    const res = await request(app)
      .get(`/api/v1/platform/tenants/${TEST_TENANT_ID}`)
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    expect(res.status).toBe(200)
    expect(res.body.tenant.id).toBe(TEST_TENANT_ID)
  })

  it('masks SSI credentials for non-owner members', async () => {
    mockValidSession()
    storeMocks.getTenant.mockResolvedValue({
      id: TEST_TENANT_ID,
      accountId: 'another_owner',
      name: 'Org With Creds',
      ssiCredentials: { email: 'ssi@example.com', password: 'secret' },
      subscription: {},
    })
    storeMocks.getTenantMembership.mockResolvedValue({
      id: 'mem_002',
      tenantId: TEST_TENANT_ID,
      accountId: TEST_ACCOUNT_ID,
      roles: ['member'],
      status: 'active',
    })
    // requireTenantRole calls hasRequiredRole(membership.roles, requiredRoles) — must return true
    // (member satisfies TENANT_ROLES). The route handler then calls hasRequiredRole(roles, ['owner'])
    // which must return false so credentials are masked.
    storeMocks.hasRequiredRole
      .mockImplementation((userRoles, required) => {
        // TENANT_ROLES check (all roles qualify) — called by requireTenantRole
        if (required.length > 2) return true
        // owner-only check inside the route handler body
        if (required.includes('owner') && !userRoles.includes('owner')) return false
        return true
      })

    const res = await request(app)
      .get(`/api/v1/platform/tenants/${TEST_TENANT_ID}`)
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    expect(res.status).toBe(200)
    // Credentials should be masked to { configured: true }, not raw values
    expect(res.body.tenant.ssiCredentials).toEqual({ configured: true })
  })
})

// ============================================================
describe('POST /api/v1/platform/tenants', () => {
  let app
  beforeAll(() => { app = buildApp() })
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when validation fails', async () => {
    const { validateTenantCreate } = await import('../../lib/services/platform-validation.js')
    validateTenantCreate.mockReturnValueOnce(['Name is required'])
    mockValidSession()

    const res = await request(app)
      .post('/api/v1/platform/tenants')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.details).toContain('Name is required')
  })

  it('creates tenant and returns 201', async () => {
    mockValidSession()
    storeMocks.createTenant.mockResolvedValue({
      tenantId: TEST_TENANT_ID,
      tenant: { id: TEST_TENANT_ID, name: 'New Org', subscription: {}, createdAt: Date.now() },
    })

    const res = await request(app)
      .post('/api/v1/platform/tenants')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)
      .send({ name: 'New Org' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.tenant.name).toBe('New Org')
  })

  it('returns 409 on duplicate tenant name', async () => {
    mockValidSession()
    storeMocks.createTenant.mockRejectedValue(Object.assign(new Error('already exists'), { code: '23505' }))

    const res = await request(app)
      .post('/api/v1/platform/tenants')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)
      .send({ name: 'Existing Org' })

    expect(res.status).toBe(409)
  })
})

// ============================================================
describe('Error propagation — unhandled DB errors reach errorHandler', () => {
  let app
  beforeAll(() => { app = buildApp() })
  beforeEach(() => vi.clearAllMocks())

  it('returns 500 when listAccountTenants throws unexpectedly', async () => {
    mockValidSession()
    storeMocks.listAccountTenants.mockRejectedValue(new Error('DB connection lost'))

    const res = await request(app)
      .get('/api/v1/platform/tenants')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    // Must return 500 via errorHandler — not crash or hang
    expect(res.status).toBe(500)
  })

  it('returns 500 when status route throws unexpectedly', async () => {
    storeMocks.getPlatformSession.mockRejectedValue(new Error('Redis timeout'))

    const res = await request(app)
      .get('/api/v1/platform/status')
      .set('Cookie', `${PLATFORM_COOKIE}=${TEST_SESSION_ID}`)

    expect(res.status).toBe(500)
  })
})
