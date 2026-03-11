import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock platform-store functions
vi.mock('../lib/db/platform-store.js', () => ({
  listAllTenants: vi.fn(),
  listAllAccounts: vi.fn(),
}))

// Mock session functions
vi.mock('../lib/session/index.js', () => ({
  getActiveSessionCount: vi.fn(),
  getUserSessions: vi.fn(),
}))

import { createAdminRouter } from '../routes/admin.js'
import { listAllTenants, listAllAccounts } from '../lib/db/platform-store.js'
import { getActiveSessionCount } from '../lib/session/index.js'

// ---- Test helpers ----

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1/admin', createAdminRouter())
  return app
}

const VALID_KEY = 'test-admin-secret-key-123'
const mockTenants = [
  { id: 'ten_001', name: 'TurRes', ownerEmail: 'admin@turres.fi', ownerName: 'Admin User', memberCount: 3, createdAt: 1710000000000 },
  { id: 'ten_002', name: 'Test Club', ownerEmail: 'test@club.fi', ownerName: 'Test User', memberCount: 1, createdAt: 1710100000000 },
]
const mockAccounts = [
  { id: 'acc_001', email: 'admin@turres.fi', name: 'Admin User', tenantCount: 2, mfaEnabled: false },
  { id: 'acc_002', email: 'test@club.fi', name: 'Test User', tenantCount: 1, mfaEnabled: true },
]

beforeEach(() => {
  vi.resetAllMocks()
  process.env.ADMIN_API_KEY = VALID_KEY
  listAllTenants.mockResolvedValue(mockTenants)
  listAllAccounts.mockResolvedValue(mockAccounts)
  getActiveSessionCount.mockResolvedValue(5)
})

// ============================================================
// Auth middleware
// ============================================================

describe('Admin auth middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const app = createApp()
    const res = await request(app).get('/api/v1/admin/tenants')
    expect(res.status).toBe(401)
    expect(res.body.error).toContain('Authorization required')
  })

  it('rejects requests with wrong key', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', 'Bearer wrong-key')
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('Invalid admin key')
  })

  it('rejects non-Bearer auth', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Basic ${VALID_KEY}`)
    expect(res.status).toBe(401)
  })

  it('returns 503 when ADMIN_API_KEY not configured', async () => {
    delete process.env.ADMIN_API_KEY
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${VALID_KEY}`)
    expect(res.status).toBe(503)
    expect(res.body.error).toContain('not configured')
  })

  it('accepts valid admin key', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${VALID_KEY}`)
    expect(res.status).toBe(200)
  })
})

// ============================================================
// GET /tenants
// ============================================================

describe('GET /admin/tenants', () => {
  it('returns all tenants with owner info', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${VALID_KEY}`)
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
    expect(res.body.tenants).toHaveLength(2)
    expect(res.body.tenants[0].ownerEmail).toBe('admin@turres.fi')
    expect(res.body.tenants[0].memberCount).toBe(3)
  })

  it('handles empty tenant list', async () => {
    listAllTenants.mockResolvedValue([])
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${VALID_KEY}`)
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(0)
    expect(res.body.tenants).toHaveLength(0)
  })

  it('handles DB error gracefully', async () => {
    listAllTenants.mockRejectedValue(new Error('DB connection lost'))
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${VALID_KEY}`)
    expect(res.status).toBe(500)
  })
})

// ============================================================
// GET /accounts
// ============================================================

describe('GET /admin/accounts', () => {
  it('returns all accounts with tenant count', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/accounts')
      .set('Authorization', `Bearer ${VALID_KEY}`)
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
    expect(res.body.accounts[0].tenantCount).toBe(2)
    expect(res.body.accounts[1].mfaEnabled).toBe(true)
  })
})

// ============================================================
// GET /sessions
// ============================================================

describe('GET /admin/sessions', () => {
  it('returns session count', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/sessions')
      .set('Authorization', `Bearer ${VALID_KEY}`)
    expect(res.status).toBe(200)
    expect(res.body.ssiSessions).toBe(5)
  })
})

// ============================================================
// GET /overview
// ============================================================

describe('GET /admin/overview', () => {
  it('returns combined dashboard data', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${VALID_KEY}`)
    expect(res.status).toBe(200)
    expect(res.body.tenants.count).toBe(2)
    expect(res.body.accounts.count).toBe(2)
    expect(res.body.sessions.ssiSessions).toBe(5)
    expect(res.body.generatedAt).toBeDefined()
  })

  it('handles partial failures gracefully', async () => {
    listAllTenants.mockRejectedValue(new Error('DB error'))
    const app = createApp()
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${VALID_KEY}`)
    expect(res.status).toBe(500)
  })
})
