import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { initRedis, closeRedis } from '../lib/session/redis.js'
import { createSession } from '../lib/session/store.js'
import { createMockSessionInput } from './fixtures/sessions.js'
import { requireAuthV7 } from '../middleware/auth-v7.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { createScoringRouter } from '../routes/scoring.js'

let server
let baseUrl
let app

function createMockState(defaultResponse) {
  let hasMockResponse = false
  let mockResponse = null
  let mockError = null
  let mockResponder = null
  const calls = []

  return {
    setResponse: (response) => {
      mockResponse = response
      hasMockResponse = true
      mockError = null
      mockResponder = null
    },
    setError: (error) => {
      mockError = error
      hasMockResponse = false
      mockResponder = null
    },
    setResponder: (responder) => {
      mockResponder = responder
      mockError = null
      hasMockResponse = false
    },
    clear: () => {
      mockResponse = null
      hasMockResponse = false
      mockError = null
      mockResponder = null
      calls.length = 0
    },
    getCalls: () => [...calls],
    execute: async (session, query, variables) => {
      calls.push({ session, query, variables })

      if (mockError) {
        throw mockError
      }
      if (mockResponder) {
        return await mockResponder(session, query, variables)
      }
      if (hasMockResponse) {
        return mockResponse
      }
      return defaultResponse
    },
  }
}

// Counter for unique IPs per test to isolate rate limiter state
let ipCounter = 0
function uniqueIp() {
  ipCounter++
  return `10.5.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`
}

async function request(method, path, body = null, ip = null, cookies = {}) {
  const url = `${baseUrl}${path}`
  const opts = { method, headers: {} }

  if (ip) opts.headers['X-Forwarded-For'] = ip

  if (Object.keys(cookies).length > 0) {
    opts.headers.Cookie = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }

  const resp = await fetch(url, opts)
  const data = await resp.json().catch(() => null)
  return { status: resp.status, data }
}

async function createScoringSessionCookie() {
  const { sessionId } = await createSession(createMockSessionInput({ scope: 'scoring' }))
  return { ssi_session: sessionId }
}

beforeAll(async () => {
  await initRedis()

  app = express()
  app.set('trust proxy', true)
  app.use(express.json())
  app.use(cookieParser())

  const graphqlState = createMockState({ events: [] })

  app.setMockResponse = graphqlState.setResponse
  app.setMockError = graphqlState.setError
  app.setMockResponder = graphqlState.setResponder
  app.clearMock = graphqlState.clear
  app.getScoringQueryCalls = graphqlState.getCalls

  const scoringRouter = createScoringRouter({
    requireAuth: requireAuthV7,
    graphqlWithRefresh: graphqlState.execute,
  })

  app.use('/api/scoring', scoringRouter)
  app.use(errorHandler)

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`
      resolve()
    })
  })
})

afterAll(async () => {
  server?.close()
  await closeRedis()
})

beforeEach(() => {
  app.clearMock()
})

describe('GET /api/scoring/cups', () => {
  it('requires authentication with scoring scope', async () => {
    const ip = uniqueIp()
    const res = await request('GET', '/api/scoring/cups?search=Kupittaa', null, ip)

    expect(res.status).toBe(401)
    expect(res.data.sessionExpired).toBe(true)
  })

  it('returns empty array and skips GraphQL for short search terms', async () => {
    const ip = uniqueIp()
    const cookies = await createScoringSessionCookie()

    const res = await request('GET', '/api/scoring/cups?search=K', null, ip, cookies)

    expect(res.status).toBe(200)
    expect(res.data.cups).toEqual([])
    expect(app.getScoringQueryCalls()).toHaveLength(0)
  })

  it('uses GraphQL status filter and returns active cups on or after current date', async () => {
    const ip = uniqueIp()
    const cookies = await createScoringSessionCookie()

    const now = new Date()
    const dayMs = 24 * 60 * 60 * 1000

    app.setMockResponse({
      events: [
        {
          id: '1',
          name: 'Kupittaa Active Today',
          starts: now.toISOString(),
          status: 'on',
          get_content_type_key: 136,
        },
        {
          id: '2',
          name: 'Kupittaa Active Future',
          starts: new Date(now.getTime() + dayMs).toISOString(),
          status: 'on',
          get_content_type_key: 136,
        },
        {
          id: '5',
          name: 'Kupittaa Past Active',
          starts: new Date(now.getTime() - dayMs).toISOString(),
          status: 'on',
          get_content_type_key: 136,
        },
        {
          id: '6',
          name: 'Not a cup',
          starts: new Date(now.getTime() + dayMs).toISOString(),
          status: 'on',
          get_content_type_key: 91,
        },
      ],
    })

    const res = await request('GET', '/api/scoring/cups?search=Kupittaa', null, ip, cookies)

    expect(res.status).toBe(200)
    expect(res.data.cups.map(c => c.id)).toEqual(['1', '2'])

    const calls = app.getScoringQueryCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].query).toContain('starts_after')
    expect(calls[0].query).toContain('status: $status')
    expect(calls[0].variables.search).toBe('Kupittaa')
    expect(calls[0].variables.status).toBe('on')
    expect(typeof calls[0].variables.startsAfter).toBe('string')
  })

  it('falls back to local status filter if GraphQL status argument is unsupported', async () => {
    const ip = uniqueIp()
    const cookies = await createScoringSessionCookie()

    const now = new Date()
    const dayMs = 24 * 60 * 60 * 1000

    app.setMockResponder(async (_session, query) => {
      if (query.includes('status: $status')) {
        throw new Error('GraphQL Error: Unknown argument "status" on field "events".')
      }

      return {
        events: [
          {
            id: '20',
            name: 'Fallback Active',
            starts: new Date(now.getTime() + dayMs).toISOString(),
            status: 'on',
            get_content_type_key: 136,
          },
          {
            id: '21',
            name: 'Fallback Completed',
            starts: new Date(now.getTime() + dayMs).toISOString(),
            status: 'cp',
            get_content_type_key: 136,
          },
          {
            id: '22',
            name: 'Fallback Cancelled',
            starts: new Date(now.getTime() + dayMs).toISOString(),
            status: 'cs',
            get_content_type_key: 136,
          },
        ],
      }
    })

    const res = await request('GET', '/api/scoring/cups?search=Kupittaa', null, ip, cookies)

    expect(res.status).toBe(200)
    expect(res.data.cups.map(c => c.id)).toEqual(['20'])

    const calls = app.getScoringQueryCalls()
    expect(calls).toHaveLength(2)
    expect(calls[0].query).toContain('status: $status')
    expect(calls[1].query).not.toContain('status: $status')
    expect(calls[1].query).toContain('starts_after')
  })

  it('returns unfiltered cup list in debug mode', async () => {
    const ip = uniqueIp()
    const cookies = await createScoringSessionCookie()

    const now = new Date()
    const dayMs = 24 * 60 * 60 * 1000

    app.setMockResponse({
      events: [
        {
          id: '10',
          name: 'Active Future',
          starts: new Date(now.getTime() + dayMs).toISOString(),
          status: 'on',
          get_content_type_key: 136,
        },
        {
          id: '11',
          name: 'Cancelled Future',
          starts: new Date(now.getTime() + 2 * dayMs).toISOString(),
          status: 'cs',
          get_content_type_key: 136,
        },
        {
          id: '12',
          name: 'Past Completed',
          starts: new Date(now.getTime() - 2 * dayMs).toISOString(),
          status: 'cp',
          get_content_type_key: 136,
        },
      ],
    })

    const res = await request('GET', '/api/scoring/cups?search=Kupittaa&debug=true', null, ip, cookies)

    expect(res.status).toBe(200)
    expect(res.data.cups.map(c => c.id)).toEqual(['12', '10', '11'])
    expect(res.data.debug).toEqual({
      enabled: true,
      totalRaw: 3,
      activeUpcoming: 1,
      filteredOut: 2,
    })

    const calls = app.getScoringQueryCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].query).not.toContain('starts_after')
    expect(calls[0].variables).toEqual({ search: 'Kupittaa' })
  })
})
