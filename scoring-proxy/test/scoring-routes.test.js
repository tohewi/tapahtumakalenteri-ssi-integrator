// ============================================================
// Unit tests for Scoring Routes (TST-8)
//
// Tests input validation, auth rejection, and response shape
// for scoring API endpoints. SSI GraphQL calls are mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock SSI dependencies before importing router
vi.mock('../lib/ssi-core/scoring.js', () => ({
  ssiGetScoringPage: vi.fn(),
  ssiSubmitScore: vi.fn(),
}))
vi.mock('../lib/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createScoringRouter } from '../routes/scoring.js'
import { ssiGetScoringPage, ssiSubmitScore } from '../lib/ssi-core/scoring.js'

// ---- Test helpers ----

/**
 * Create an Express app with the scoring router mounted.
 * requireAuth is mocked to always succeed and set a fake SSI session.
 * graphqlWithRefresh is a mock that returns the provided fixture.
 */
function makeApp({ graphqlResponse = {}, ssiCookies = { sessionid: 'test' } } = {}) {
  const app = express()
  app.use(express.json())

  const requireAuth = (_scope) => (req, _res, next) => {
    req.ssiSession = { jwt: 'test_jwt', ssiCookies }
    next()
  }

  const graphqlWithRefresh = vi.fn().mockResolvedValue(graphqlResponse)

  const router = createScoringRouter({ requireAuth, graphqlWithRefresh })
  app.use('/api', router)
  app._graphqlWithRefresh = graphqlWithRefresh
  return app
}

function makeUnauthApp() {
  const app = express()
  app.use(express.json())

  const requireAuth = (_scope) => (_req, res, _next) => {
    res.status(401).json({ error: 'Unauthorized' })
  }

  const graphqlWithRefresh = vi.fn()
  const router = createScoringRouter({ requireAuth, graphqlWithRefresh })
  app.use('/api', router)
  return app
}

// ============================================================
// GET /api/cups — Cup search
// ============================================================

describe('GET /api/cups — input validation', () => {
  it('returns empty array when search param is missing', async () => {
    const app = makeApp()
    const res = await request(app).get('/api/cups')
    expect(res.status).toBe(200)
    expect(res.body.cups).toEqual([])
  })

  it('returns empty array when search is 1 character', async () => {
    const app = makeApp()
    const res = await request(app).get('/api/cups?search=A')
    expect(res.status).toBe(200)
    expect(res.body.cups).toEqual([])
  })

  it('calls GraphQL when search is ≥ 2 chars', async () => {
    const app = makeApp({
      graphqlResponse: {
        events: [{ id: '1', name: 'Test Cup', starts: '2025-06-01', status: 'on', get_content_type_key: 136 }],
      },
    })
    const res = await request(app).get('/api/cups?search=Te')
    expect(res.status).toBe(200)
    expect(res.body.cups).toHaveLength(1)
    expect(app._graphqlWithRefresh).toHaveBeenCalledOnce()
  })

  it('filters to cups only (CT=136)', async () => {
    const app = makeApp({
      graphqlResponse: {
        events: [
          { id: '1', name: 'Cup', starts: '2025-06-01', status: 'on', get_content_type_key: 136 },
          { id: '2', name: 'Match', starts: '2025-06-01', status: 'on', get_content_type_key: 91 },
        ],
      },
    })
    const res = await request(app).get('/api/cups?search=Test')
    expect(res.status).toBe(200)
    expect(res.body.cups).toHaveLength(1)
    expect(res.body.cups[0].name).toBe('Cup')
  })

  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app).get('/api/cups?search=Test')
    expect(res.status).toBe(401)
  })
})

// ============================================================
// GET /api/cup/:id — Cup detail
// ============================================================

describe('GET /api/cup/:id', () => {
  const cupFixture = {
    event: {
      id: '42', name: 'Test Cup', starts: '2025-06-01T10:00:00Z', status: 'on',
      component_matches: [
        { number: 1, included: true, match: { id: '10', name: 'Match 1', starts: '2025-06-01', status: 'on' } },
        { number: 2, included: false, match: { id: '11', name: 'Match 2', starts: '2025-06-01', status: 'on' } },
      ],
    },
  }

  it('returns 404 when event not found', async () => {
    const app = makeApp({ graphqlResponse: { event: null } })
    const res = await request(app).get('/api/cup/999')
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })

  it('returns cup with only included matches', async () => {
    const app = makeApp({ graphqlResponse: cupFixture })
    const res = await request(app).get('/api/cup/42')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('42')
    expect(res.body.matches).toHaveLength(1)
    expect(res.body.matches[0].id).toBe('10')
  })

  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app).get('/api/cup/42')
    expect(res.status).toBe(401)
  })
})

// ============================================================
// GET /api/match/:id — Match detail
// ============================================================

describe('GET /api/match/:id', () => {
  it('returns match data from GraphQL', async () => {
    const matchFixture = {
      event: { id: '91', name: 'Test Match', starts: '2025-06-01', status: 'on', squads: [] },
    }
    const app = makeApp({ graphqlResponse: matchFixture })
    const res = await request(app).get('/api/match/91')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('91')
  })

  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app).get('/api/match/91')
    expect(res.status).toBe(401)
  })
})

// ============================================================
// POST /api/competitor/:id/score — Score submission
// ============================================================

describe('POST /api/competitor/:id/score', () => {
  it('returns 400 when scores are missing', async () => {
    const app = makeApp()
    const res = await request(app)
      .post('/api/competitor/123/score')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/scores object required/i)
  })

  it('returns 401 when no ssiCookies in session', async () => {
    const app = makeApp({ ssiCookies: null })
    const res = await request(app)
      .post('/api/competitor/123/score')
      .send({ scores: { 0: { X: 0, '10': 3 } } })
    expect(res.status).toBe(401)
  })

  it('submits scores and returns result', async () => {
    ssiGetScoringPage.mockResolvedValue({ csrfToken: 'csrf123', formAction: '/score/123/' })
    ssiSubmitScore.mockResolvedValue({ success: true, message: 'Scores saved' })

    const app = makeApp({ graphqlResponse: { competitor: { id: '123', first_name: 'Test', last_name: 'User' } } })
    const res = await request(app)
      .post('/api/competitor/123/score')
      .send({ scores: { 0: { X: 2, '10': 3, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 } } })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app)
      .post('/api/competitor/123/score')
      .send({ scores: {} })
    expect(res.status).toBe(401)
  })
})

// ============================================================
// GET /api/matches — Match search (multi-window)
// ============================================================

describe('GET /api/matches', () => {
  it('returns empty when search is missing', async () => {
    const app = makeApp({ graphqlResponse: { events: [] } })
    const res = await request(app).get('/api/matches')
    expect(res.status).toBe(200)
    expect(res.body.matches).toEqual([])
  })

  it('returns empty when search is 1 character', async () => {
    const app = makeApp({ graphqlResponse: { events: [] } })
    const res = await request(app).get('/api/matches?search=A')
    expect(res.status).toBe(200)
    expect(res.body.matches).toEqual([])
  })

  it('deduplicates matches across windows', async () => {
    // Same event returned from multiple windows
    const app = makeApp({
      graphqlResponse: {
        events: [{ id: '99', name: 'Test', starts: '2025-06-01', status: 'on', rule: 'rl', get_content_type_key: 91 }],
      },
    })
    const res = await request(app).get('/api/matches?search=Test')
    expect(res.status).toBe(200)
    // Even though mock returns same event many times (one per window), dedup ensures only 1
    const ids = res.body.matches.map(m => m.id)
    const uniqueIds = [...new Set(ids)]
    expect(ids.length).toBe(uniqueIds.length)
  })

  it('rejects unauthenticated requests', async () => {
    const app = makeUnauthApp()
    const res = await request(app).get('/api/matches?search=Test')
    expect(res.status).toBe(401)
  })
})
