// ============================================================
// Unit tests for Reports Routes (TST-8)
//
// Tests input validation, auth rejection, and response shape
// for the summary report endpoint. SSI calls are mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../lib/ssi-core/management.js', () => ({
  ssiGetEventStaff: vi.fn().mockResolvedValue([]),
}))
vi.mock('../lib/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createReportsRouter } from '../routes/reports.js'
import { ssiGetEventStaff } from '../lib/ssi-core/management.js'

// ---- Test helpers ----

function makeApp({ graphqlResponse = {}, ssiCookies = { sessionid: 'test' } } = {}) {
  const app = express()
  app.use(express.json())

  const requireAuth = (_scope) => (req, _res, next) => {
    req.ssiSession = { jwt: 'test_jwt', ssiCookies }
    next()
  }
  const graphqlWithRefresh = vi.fn().mockResolvedValue(graphqlResponse)

  const router = createReportsRouter({ requireAuth, graphqlWithRefresh })
  app.use('/api', router)
  app._graphqlWithRefresh = graphqlWithRefresh
  return app
}

function makeUnauthApp() {
  const app = express()
  app.use(express.json())
  const requireAuth = (_scope) => (_req, res, _next) => res.status(401).json({ error: 'Unauthorized' })
  const graphqlWithRefresh = vi.fn()
  const router = createReportsRouter({ requireAuth, graphqlWithRefresh })
  app.use('/api', router)
  return app
}

// ---- Match fixture ----

function makeMatchFixture(id = '1', name = 'Test Match') {
  return {
    event: {
      id, name,
      starts: '2025-06-01T10:00:00Z',
      squads: [
        {
          id: 'sq1', number: 1, comment: 'Squad A',
          competitors: [
            { id: 'c1', status: 'a', first_name: 'Alice', last_name: 'Smith' },
            { id: 'c2', status: 'a', first_name: 'Bob', last_name: 'Jones' },
            { id: 'c3', status: 'x', first_name: 'Carol', last_name: 'White' },  // withdrawn
          ],
        },
        {
          id: 'sq2', number: 2, comment: 'Squad B',
          competitors: [
            { id: 'c4', status: 'a', first_name: 'Dave', last_name: 'Brown' },
          ],
        },
      ],
    },
  }
}

// ============================================================
// POST /api/summary — Input validation
// ============================================================

describe('POST /api/summary — input validation', () => {
  it('returns 400 when matches array is missing', async () => {
    const app = makeApp()
    const res = await request(app).post('/api/summary').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/matches array required/i)
  })

  it('returns 400 when matches is empty array', async () => {
    const app = makeApp()
    const res = await request(app).post('/api/summary').send({ matches: [] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/matches array required/i)
  })

  it('returns 400 when matches has more than 50 items', async () => {
    const app = makeApp()
    const matches = Array.from({ length: 51 }, (_, i) => ({ id: String(i), contentType: 91 }))
    const res = await request(app).post('/api/summary').send({ matches })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/maximum 50/i)
  })

  it('accepts exactly 50 matches without error', async () => {
    const app = makeApp({ graphqlResponse: { event: null } })
    const matches = Array.from({ length: 50 }, (_, i) => ({ id: String(i), contentType: 91 }))
    const res = await request(app).post('/api/summary').send({ matches })
    expect(res.status).toBe(200)
  })

  it('accepts legacy matchIds array format', async () => {
    const app = makeApp({ graphqlResponse: { event: null } })
    const res = await request(app).post('/api/summary').send({ matchIds: ['1', '2', '3'] })
    expect(res.status).toBe(200)
  })

  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app).post('/api/summary').send({ matches: [{ id: '1' }] })
    expect(res.status).toBe(401)
  })
})

// ============================================================
// POST /api/summary — Response shape
// ============================================================

describe('POST /api/summary — response shape', () => {
  it('returns empty array when GraphQL returns null event', async () => {
    const app = makeApp({ graphqlResponse: { event: null } })
    const res = await request(app).post('/api/summary').send({ matches: [{ id: '999', contentType: 91 }] })
    expect(res.status).toBe(200)
    expect(res.body.rows).toEqual([])
  })

  it('returns match summary with shooter count', async () => {
    const app = makeApp({ graphqlResponse: makeMatchFixture('1', 'Nordic Match') })
    const res = await request(app)
      .post('/api/summary')
      .send({ matches: [{ id: '1', contentType: 91 }] })
    expect(res.status).toBe(200)
    expect(res.body.rows).toHaveLength(1)
    const row = res.body.rows[0]
    expect(row.match).toBe('Nordic Match')
    // uniqueShooters: active competitors (c1, c2, c4 with status='a')
    expect(row.uniqueShooters).toBe(3)
    expect(row.squadCount).toBe(2)
  })

  it('includes correct date from starts field', async () => {
    const app = makeApp({ graphqlResponse: makeMatchFixture() })
    const res = await request(app)
      .post('/api/summary')
      .send({ matches: [{ id: '1', contentType: 91 }] })
    expect(res.status).toBe(200)
    expect(res.body.rows[0].date).toBe('2025-06-01')
  })

  it('uses contentType 91 as default when not specified', async () => {
    const app = makeApp({ graphqlResponse: makeMatchFixture() })
    const res = await request(app)
      .post('/api/summary')
      .send({ matches: [{ id: '1' }] })  // no contentType
    expect(res.status).toBe(200)
    expect(app._graphqlWithRefresh).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      { ct: 91, id: '1' }
    )
  })

  it('reports unique admin count from ssiGetEventStaff', async () => {
    ssiGetEventStaff.mockResolvedValueOnce([
      { name: 'Alice Smith' },
    ])
    const app = makeApp({ graphqlResponse: makeMatchFixture() })
    const res = await request(app)
      .post('/api/summary')
      .send({ matches: [{ id: '1', contentType: 91 }] })
    expect(res.status).toBe(200)
    // uniqueAdmins = staff members found in approved competitor list
    expect(typeof res.body.rows[0].uniqueAdmins).toBe('number')
  })

  it('handles multiple matches in one request', async () => {
    const app = makeApp({ graphqlResponse: makeMatchFixture() })
    const res = await request(app)
      .post('/api/summary')
      .send({ matches: [{ id: '1', contentType: 91 }, { id: '2', contentType: 91 }] })
    expect(res.status).toBe(200)
    // Both return the same fixture, so 2 rows
    expect(res.body.rows).toHaveLength(2)
  })
})
