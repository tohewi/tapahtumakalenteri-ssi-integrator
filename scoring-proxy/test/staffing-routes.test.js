// ============================================================
// Unit tests for Staffing Routes (TST-8)
//
// Tests auth rejection, input validation, and pure logic
// for the staffing API. SSI + staffing engine mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// ---- Mock external dependencies ----
vi.mock('../lib/staffing/engine.js', () => ({
  getAllEvents: vi.fn().mockReturnValue([]),
  getEventStatus: vi.fn().mockReturnValue(null),
  signup: vi.fn(),
  resign: vi.fn(),
  upsertEvent: vi.fn(),
  syncStaffFromSSI: vi.fn(),
}))
vi.mock('../lib/staffing/config-loader.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    roles: { leadInstructor: 'Lead Instructor', equipmentManager: 'Equipment Manager', staff: 'Staff' },
    trainingTypes: {
      sra: { label: 'SRA Training', searchPatterns: ['SRA', 'training'], staffSquad: 5 },
    },
    eventDiscovery: {
      searchStrings: ['SRA Training'],
      matchContentType: 91,
      staffSquadName: 'Trainers',
    },
  }),
  isAdminEmail: vi.fn().mockReturnValue(false),
  isServiceAccount: vi.fn().mockReturnValue(false),
}))
vi.mock('../lib/ssi-core/participants.js', () => ({
  ssiRegisterToTrainerSquad: vi.fn(),
  ssiDeleteMatchParticipant: vi.fn(),
  ssiSetParticipantSquad: vi.fn(),
  ssiFindParticipantInEvent: vi.fn(),
}))
vi.mock('../lib/ssi-core/management.js', () => ({
  ssiGetMatchGroupId: vi.fn(),
  ssiAddToMatchManagement: vi.fn(),
  ssiRemoveFromMatchManagement: vi.fn(),
  ssiGetMatchOfficials: vi.fn().mockResolvedValue([]),
}))
vi.mock('../lib/ssi-core/http-helpers.js', () => ({
  ssiFetchPage: vi.fn().mockResolvedValue('<html></html>'),
}))
vi.mock('../lib/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createStaffingRouter } from '../routes/staffing.js'
import { signup, resign, getEventStatus } from '../lib/staffing/engine.js'

// ---- Test helpers ----

function makeApp({
  graphqlResponse = {},
  ssiCookies = { sessionid: 'test' },
  getAdminSession = vi.fn().mockResolvedValue({ cookies: { sessionid: 'admin-session' } }),
} = {}) {
  const app = express()
  app.use(express.json())

  const requireAuth = (_scope) => (req, _res, next) => {
    req.ssiSession = { jwt: 'test_jwt', ssiCookies }
    next()
  }
  const graphqlWithRefresh = vi.fn().mockResolvedValue(graphqlResponse)

  const router = createStaffingRouter({ requireAuth, graphqlWithRefresh, getAdminSession })
  app.use('/api', router)
  app._graphqlWithRefresh = graphqlWithRefresh
  return app
}

function makeUnauthApp() {
  const app = express()
  app.use(express.json())
  const requireAuth = (_scope) => (_req, res, _next) => res.status(401).json({ error: 'Unauthorized' })
  const router = createStaffingRouter({ requireAuth, graphqlWithRefresh: vi.fn(), getAdminSession: null })
  app.use('/api', router)
  return app
}

// ============================================================
// GET /api/config — Staffing configuration
// ============================================================

describe('GET /api/config', () => {
  it('returns roles and trainingTypes', async () => {
    const app = makeApp()
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(200)
    expect(res.body.roles).toBeDefined()
    expect(res.body.trainingTypes).toBeDefined()
  })

  it('roles includes leadInstructor and equipmentManager', async () => {
    const app = makeApp()
    const res = await request(app).get('/api/config')
    expect(res.body.roles.leadInstructor).toBeDefined()
    expect(res.body.roles.equipmentManager).toBeDefined()
  })

  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app).get('/api/config')
    expect(res.status).toBe(401)
  })
})

// ============================================================
// GET /api/events — Event listing
// ============================================================

describe('GET /api/events — auth', () => {
  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app).get('/api/events')
    expect(res.status).toBe(401)
  })

  it('returns events/isAdmin/userEmail structure', async () => {
    const app = makeApp({
      graphqlResponse: { me: { email: 'user@test.com' }, events: [] },
    })
    const res = await request(app).get('/api/events')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('events')
    expect(res.body).toHaveProperty('isAdmin')
    expect(res.body).toHaveProperty('userEmail')
  })

  it('sets userEmail from GraphQL me response', async () => {
    const app = makeApp({
      graphqlResponse: { me: { email: 'test@example.com' }, events: [] },
    })
    const res = await request(app).get('/api/events')
    expect(res.status).toBe(200)
    expect(res.body.userEmail).toBe('test@example.com')
  })
})

// ============================================================
// POST /api/events/:eventId/signup
// ============================================================

describe('POST /api/events/:eventId/signup — validation', () => {
  it('returns 400 when role is missing', async () => {
    const app = makeApp({
      graphqlResponse: { me: { email: 'user@test.com', first_name: 'User', last_name: 'Test' } },
    })
    const res = await request(app)
      .post('/api/events/event-1/signup')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/role is required/i)
  })

  it('returns 401 when user email cannot be fetched', async () => {
    const app = makeApp({ graphqlResponse: { me: null } })
    const res = await request(app)
      .post('/api/events/event-1/signup')
      .send({ role: 'staff' })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/user info/i)
  })

  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app)
      .post('/api/events/event-1/signup')
      .send({ role: 'staff' })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/events/:eventId/signup — engine call', () => {
  beforeEach(() => {
    signup.mockReturnValue({ status: 'signed_up', role: 'staff', eventId: 'event-1', email: 'user@test.com' })
    getEventStatus.mockReturnValue({ eventId: 'event-1', contentType: 91, trainingType: 'sra' })
  })

  it('calls signup engine and returns result', async () => {
    const app = makeApp({
      graphqlResponse: { me: { email: 'user@test.com', first_name: 'User', last_name: 'Test' } },
    })
    const res = await request(app)
      .post('/api/events/event-1/signup')
      .send({ role: 'staff' })
    expect(res.status).toBe(200)
    expect(signup).toHaveBeenCalledWith('event-1', { email: 'user@test.com', userName: 'User Test' }, 'staff')
  })
})

// ============================================================
// DELETE /api/events/:eventId/signup — resign
// ============================================================

describe('DELETE /api/events/:eventId/signup', () => {
  it('returns 401 when user email cannot be fetched', async () => {
    const app = makeApp({ graphqlResponse: { me: null } })
    const res = await request(app)
      .delete('/api/events/event-1/signup')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app).delete('/api/events/event-1/signup')
    expect(res.status).toBe(401)
  })

  it('calls resign engine with correct email', async () => {
    resign.mockReturnValue({ status: 'resigned', eventId: 'event-1', email: 'user@test.com' })
    getEventStatus.mockReturnValue({ eventId: 'event-1', contentType: 91, trainingType: 'sra' })

    const app = makeApp({
      graphqlResponse: { me: { email: 'user@test.com', first_name: 'User', last_name: 'Test' } },
    })
    const res = await request(app).delete('/api/events/event-1/signup')
    expect(res.status).toBe(200)
    expect(resign).toHaveBeenCalledWith('event-1', 'user@test.com')
  })
})
