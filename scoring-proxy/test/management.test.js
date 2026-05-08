// ============================================================
// Management Endpoint Tests
//
// Tests for /api/manage/* endpoints with authentication
// and adminGraphQL mocking.
//
// Note: These tests use a separate test app instance with
// mocked adminGraphQL to avoid requiring actual SSI credentials.
// ============================================================

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'

const ssiClientMocks = vi.hoisted(() => ({
  ssiSearchAndAddParticipant: vi.fn(),
  ssiFindCompetitorInMatch: vi.fn(),
  ssiSetParticipantSquad: vi.fn(),
  ssiFindAndApproveCupParticipant: vi.fn(),
  ssiFindAndDeleteCupParticipant: vi.fn(),
  ssiDeleteMatchParticipant: vi.fn(),
  ssiSetDidNotShow: vi.fn(),
  ssiUndoDidNotShow: vi.fn(),
  ssiTogglePaid: vi.fn(),
  ssiGetCupParticipantStatuses: vi.fn(),
}))

vi.mock('../lib/ssi-core/participants.js', () => ssiClientMocks)

import express from 'express'
import cookieParser from 'cookie-parser'
import { initRedis, closeRedis } from '../lib/session/redis.js'
import { createSession } from '../lib/session/store.js'
import { createMockSessionInput } from './fixtures/sessions.js'
import { requireAuthV7 } from '../middleware/auth-v7.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { createManagementRouter } from '../routes/management.js'

let server, baseUrl, app

beforeAll(async () => {
  await initRedis()
  
  // Create a test app with mocked adminGraphQL
  app = express()
  app.set('trust proxy', true)
  app.use(express.json())
  app.use(cookieParser())
  
  // Encapsulated mock state factory
  const createMockState = (defaultResponse) => {
    let hasMockResponse = false
    let mockResponse = null
    let mockError = null
    
    return {
      setResponse: (response) => {
        mockResponse = response
        hasMockResponse = true
        mockError = null
      },
      setError: (error) => {
        mockError = error
        hasMockResponse = false
      },
      clear: () => {
        mockResponse = null
        hasMockResponse = false
        mockError = null
      },
      execute: async (query, variables) => {
        if (mockError) {
          throw mockError
        }
        if (hasMockResponse) {
          return mockResponse
        }
        return defaultResponse
      }
    }
  }
  
  const mockState = createMockState({ events: [] })
  const graphState = createMockState({ event: null })
  const adminSessionState = createMockState({ cookies: { sessionid: 'admin-cookie' } })
  
  // Expose mock control methods on app for test access
  app.setMockResponse = mockState.setResponse
  app.setMockError = mockState.setError
  app.clearMock = mockState.clear
  app.setGraphqlResponse = graphState.setResponse
  app.setGraphqlError = graphState.setError
  app.clearGraphqlMock = graphState.clear
  app.setAdminSession = adminSessionState.setResponse
  app.setAdminSessionError = adminSessionState.setError
  app.clearAdminSessionMock = adminSessionState.clear
  
  // Create management router with mocked dependencies
  const managementRouter = createManagementRouter({
    requireAuth: requireAuthV7,
    graphqlWithRefresh: graphState.execute,
    adminGraphQL: mockState.execute,
    getAdminSession: adminSessionState.execute,
  })
  
  app.use('/api/manage', managementRouter)
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

// Counter for unique IPs per test to isolate rate limiters
let ipCounter = 0
function uniqueIp() {
  ipCounter++
  return `10.0.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`
}

// Lightweight test HTTP client
async function request(method, path, body = null, ip = null, cookies = {}) {
  const url = `${baseUrl}${path}`
  const opts = { method, headers: {} }
  if (ip) opts.headers['X-Forwarded-For'] = ip
  if (Object.keys(cookies).length > 0) {
    opts.headers['Cookie'] = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const resp = await fetch(url, opts)
  const data = await resp.json().catch(() => null)
  return { status: resp.status, data, headers: Object.fromEntries(resp.headers.entries()) }
}

async function createManageSessionCookie() {
  const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
  return { ssi_session: sessionId }
}

beforeEach(() => {
  for (const fn of Object.values(ssiClientMocks)) {
    fn.mockReset()
  }
  if (app?.clearGraphqlMock) app.clearGraphqlMock()
  if (app?.clearAdminSessionMock) app.clearAdminSessionMock()
})

// ============================================================
// GET /api/manage/cups
// ============================================================

describe('GET /api/manage/cups', () => {
  beforeEach(() => {
    // Clear any previous mock state
    app.clearMock()
    // Reset IP counter for this test suite
    ipCounter = 0
  })

  it('requires authentication with manage scope', async () => {
    const ip = uniqueIp()
    const res = await request('GET', '/api/manage/cups', null, ip)
    
    expect(res.status).toBe(401)
    expect(res.data.sessionExpired).toBe(true)
  })

  it('rejects user without manage scope', async () => {
    const ip = uniqueIp()
    // Create session with 'scoring' scope (not 'manage')
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'scoring' }))
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(403)
    expect(res.data.error).toContain('Access denied')
  })

  it('returns cups filtered by end date with manage scope', async () => {
    const ip = uniqueIp()
    // Create session with 'manage' scope
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    // Mock adminGraphQL to return test data
    app.setMockResponse({
      events: [
        {
          id: '100',
          name: 'Future Cup',
          starts: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
          ends: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),   // 8 days from now
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 30,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(), // just started
          registration_closes: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: [{
            number: 1,
            included: true,
            match: {
              squads: [{
                competitors: [
                  { id: '1', status: 'a' },
                  { id: '2', status: 'a' },
                ]
              }]
            }
          }]
        },
        {
          id: '101',
          name: 'Old Ended Cup',
          starts: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
          ends: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),   // 2 days ago (past 24h grace)
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 25,
          registration: 'op',
          registration_starts: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          registration_closes: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: []
        },
      ]
    })
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(200)
    expect(res.data.cups).toBeDefined()
    expect(Array.isArray(res.data.cups)).toBe(true)
    
    // Should only include the future cup (not the ended one)
    expect(res.data.cups.length).toBe(1)
    expect(res.data.cups[0].id).toBe('100')
    expect(res.data.cups[0].name).toBe('Future Cup')
  })

  it('filters out cups with registration_starts in the future', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    app.setMockResponse({
      events: [
        {
          id: '200',
          name: 'Registration Not Yet Started',
          starts: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 25,
          registration: 'op',
          registration_starts: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days future
          registration_closes: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: []
        },
        {
          id: '201',
          name: 'Registration Already Started',
          starts: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 25,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(), // just started
          registration_closes: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: []
        },
      ]
    })
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(200)
    expect(res.data.cups.length).toBe(1)
    expect(res.data.cups[0].id).toBe('201') // Only the one with registration started
  })

  it('only returns active cups (status === on)', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    app.setMockResponse({
      events: [
        {
          id: '300',
          name: 'Active Cup',
          starts: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 25,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(),
          registration_closes: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: []
        },
        {
          id: '301',
          name: 'Inactive Cup',
          starts: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'off',
          get_content_type_key: 136,
          max_competitors: 25,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(),
          registration_closes: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: []
        },
      ]
    })
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(200)
    expect(res.data.cups.length).toBe(1)
    expect(res.data.cups[0].id).toBe('300') // Only the active one
    expect(res.data.cups[0].name).toBe('Active Cup')
  })

  it('sorts cups by start date (earliest first)', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    app.setMockResponse({
      events: [
        {
          id: '400',
          name: 'Later Cup',
          starts: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 25,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(),
          registration_closes: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: []
        },
        {
          id: '401',
          name: 'Earlier Cup',
          starts: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 25,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(),
          registration_closes: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: []
        },
      ]
    })
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(200)
    expect(res.data.cups.length).toBe(2)
    // Should be sorted by start date, earliest first
    expect(res.data.cups[0].id).toBe('401') // Earlier Cup
    expect(res.data.cups[1].id).toBe('400') // Later Cup
    
    // Verify the start dates are in ascending order
    const start1 = new Date(res.data.cups[0].starts)
    const start2 = new Date(res.data.cups[1].starts)
    expect(start1.getTime()).toBeLessThan(start2.getTime())
  })

  it('returns 500 on GraphQL failure', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    // Mock a GraphQL error
    app.setMockError(new Error('GraphQL network error'))
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(500)
    expect(res.data.error).toBeDefined()
    expect(res.data.error).toContain('Hallintapalvelu ei ole käytettävissä')
  })

  it('uses end date for filtering (not registration status)', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    app.setMockResponse({
      events: [
        {
          id: '500',
          name: 'Registration Closed But Not Ended',
          starts: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          ends: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),   // 1 day future
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 25,
          registration: 'cl', // closed
          registration_starts: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          registration_closes: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // closed 2 days ago
          component_matches: []
        },
      ]
    })
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(200)
    // Should include the cup even though registration is closed, because it hasn't ended yet
    expect(res.data.cups.length).toBe(1)
    expect(res.data.cups[0].id).toBe('500')
    expect(res.data.cups[0].registrationOpen).toBe(false) // registration is closed
  })

  it('uses starts + 24h as fallback when ends is null', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    app.setMockResponse({
      events: [
        {
          id: '600',
          name: 'No End Date Cup',
          starts: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours from now
          ends: null, // no end date
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 25,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(),
          registration_closes: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
          component_matches: []
        },
      ]
    })
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(200)
    // Should include cup because effective end (starts + 24h) is still in the future
    expect(res.data.cups.length).toBe(1)
    expect(res.data.cups[0].id).toBe('600')
    expect(res.data.cups[0].ends).toBe(null)
  })

  it('correctly calculates registered count and full status', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    app.setMockResponse({
      events: [
        {
          id: '700',
          name: 'Almost Full Cup',
          starts: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 3,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(),
          registration_closes: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: [{
            number: 1,
            included: true,
            match: {
              squads: [
                {
                  competitors: [
                    { id: '1', status: 'a' },
                    { id: '2', status: 'a' },
                    { id: '3', status: 'p' }, // pending, not approved
                  ]
                },
                {
                  competitors: [
                    { id: '1', status: 'a' }, // duplicate ID (should count once)
                  ]
                }
              ]
            }
          }]
        },
      ]
    })
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(200)
    expect(res.data.cups.length).toBe(1)
    expect(res.data.cups[0].registered).toBe(2) // Only approved (status 'a') and unique IDs
    expect(res.data.cups[0].maxCompetitors).toBe(3)
    expect(res.data.cups[0].full).toBe(false) // 2 < 3
  })

  it('marks cup as full when registered >= maxCompetitors', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    app.setMockResponse({
      events: [
        {
          id: '701',
          name: 'Full Cup',
          starts: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 2,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(),
          registration_closes: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: [{
            number: 1,
            included: true,
            match: {
              squads: [{
                competitors: [
                  { id: '1', status: 'a' },
                  { id: '2', status: 'a' },
                ]
              }]
            }
          }]
        },
      ]
    })
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(200)
    expect(res.data.cups.length).toBe(1)
    expect(res.data.cups[0].registered).toBe(2)
    expect(res.data.cups[0].maxCompetitors).toBe(2)
    expect(res.data.cups[0].full).toBe(true) // 2 >= 2
    expect(res.data.cups[0].registrationOpen).toBe(false) // full means not open
  })

  it('marks registrationOpen as true when registration is open and not full', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))
    
    app.setMockResponse({
      events: [
        {
          id: '702',
          name: 'Open Cup',
          starts: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 5,
          registration: 'op', // open
          registration_starts: new Date(Date.now() - 1000).toISOString(),
          registration_closes: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          component_matches: [{
            number: 1,
            included: true,
            match: {
              squads: [{
                competitors: [
                  { id: '1', status: 'a' },
                ]
              }]
            }
          }]
        },
      ]
    })
    
    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })
    
    expect(res.status).toBe(200)
    expect(res.data.cups.length).toBe(1)
    expect(res.data.cups[0].registered).toBe(1)
    expect(res.data.cups[0].maxCompetitors).toBe(5)
    expect(res.data.cups[0].full).toBe(false) // 1 < 5
    expect(res.data.cups[0].registrationOpen).toBe(true) // open and has space
  })

  it('uses cup-level competitors for count when squads are empty', async () => {
    const ip = uniqueIp()
    const { sessionId } = await createSession(createMockSessionInput({ scope: 'manage' }))

    app.setMockResponse({
      events: [
        {
          id: '703',
          name: 'Cup Competitor Count Fallback',
          starts: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          ends: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'on',
          get_content_type_key: 136,
          max_competitors: 5,
          registration: 'op',
          registration_starts: new Date(Date.now() - 1000).toISOString(),
          registration_closes: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          competitors: [
            { id: 'cp1', status: 'a' },
            { id: 'cp2', status: 'a' },
            { id: 'cp3', status: 'p' },
          ],
          component_matches: [{
            number: 1,
            included: true,
            match: {
              squads: [],
            },
          }],
        },
      ],
    })

    const res = await request('GET', '/api/manage/cups', null, ip, { ssi_session: sessionId })

    expect(res.status).toBe(200)
    expect(res.data.cups.length).toBe(1)
    expect(res.data.cups[0].registered).toBe(2)
    expect(res.data.cups[0].maxCompetitors).toBe(5)
  })
})

// ============================================================
// POST /api/manage/cup/:id/set-dns
// ============================================================

describe('POST /api/manage/cup/:id/set-dns', () => {
  it('returns 400 when shooterName is missing', async () => {
    const ip = uniqueIp()
    const cookies = await createManageSessionCookie()

    const res = await request('POST', '/api/manage/cup/123/set-dns', {
      email: 'shooter@example.com',
      cupParticipantId: 'cup-1'
    }, ip, cookies)

    expect(res.status).toBe(400)
    expect(res.data.error).toBe('shooterName required')
  })

  it('returns 500 when admin session cookies are unavailable', async () => {
    const ip = uniqueIp()
    const cookies = await createManageSessionCookie()
    app.setAdminSession({ cookies: null })

    const res = await request('POST', '/api/manage/cup/123/set-dns', {
      shooterName: 'Test Shooter',
      email: 'test@example.com',
      cupParticipantId: 'cup-1'
    }, ip, cookies)

    expect(res.status).toBe(500)
    expect(res.data.error).toBe('Admin session not available')
  })

  it('sets DNS on cup and matches, returning partial success if one match participant is missing', async () => {
    const ip = uniqueIp()
    const cookies = await createManageSessionCookie()

    app.setGraphqlResponse({
      event: {
        id: '123',
        component_matches: [
          { number: 1, included: true, match: { id: 'm1', name: 'Match One' } },
          { number: 2, included: true, match: { id: 'm2', name: 'Match Two' } },
          { number: 3, included: false, match: { id: 'm3', name: 'Excluded Match' } }
        ]
      }
    })

    ssiClientMocks.ssiFindCompetitorInMatch
      .mockResolvedValueOnce('match-participant-1')
      .mockResolvedValueOnce(null)

    ssiClientMocks.ssiSetDidNotShow
      .mockResolvedValueOnce({ success: true, message: 'CUP updated' })
      .mockResolvedValueOnce({ success: true, message: 'Match updated' })

    const res = await request('POST', '/api/manage/cup/123/set-dns', {
      shooterName: 'Test Shooter',
      email: 'test@example.com',
      cupParticipantId: 'cup-77'
    }, ip, cookies)

    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
    expect(res.data.results).toEqual([
      { location: 'CUP', success: true, message: 'CUP updated' },
      { location: 'Match One', success: true, message: 'Match updated' },
      { location: 'Match Two', success: false, message: 'Participant not found' }
    ])

    expect(ssiClientMocks.ssiSetDidNotShow).toHaveBeenCalledTimes(2)
    expect(ssiClientMocks.ssiSetDidNotShow).toHaveBeenNthCalledWith(1, 137, 'cup-77', expect.any(Object))
    expect(ssiClientMocks.ssiSetDidNotShow).toHaveBeenNthCalledWith(2, 93, 'match-participant-1', expect.any(Object))

    expect(ssiClientMocks.ssiFindCompetitorInMatch).toHaveBeenCalledTimes(2)
    expect(ssiClientMocks.ssiFindCompetitorInMatch).toHaveBeenNthCalledWith(1, 'm1', 'Test Shooter', expect.any(Object), 'test@example.com')
    expect(ssiClientMocks.ssiFindCompetitorInMatch).toHaveBeenNthCalledWith(2, 'm2', 'Test Shooter', expect.any(Object), 'test@example.com')
  })
})

// ============================================================
// POST /api/manage/cup/:id/undo-dns
// ============================================================

describe('POST /api/manage/cup/:id/undo-dns', () => {
  it('undoes DNS on cup and included matches', async () => {
    const ip = uniqueIp()
    const cookies = await createManageSessionCookie()

    app.setGraphqlResponse({
      event: {
        id: '123',
        component_matches: [
          { number: 1, included: true, match: { id: 'm1', name: 'Match One' } },
          { number: 2, included: true, match: { id: 'm2', name: 'Match Two' } }
        ]
      }
    })

    ssiClientMocks.ssiFindCompetitorInMatch
      .mockResolvedValueOnce('match-participant-1')
      .mockResolvedValueOnce('match-participant-2')

    ssiClientMocks.ssiUndoDidNotShow
      .mockResolvedValueOnce({ success: true, message: 'CUP reverted' })
      .mockResolvedValueOnce({ success: true, message: 'Match one reverted' })
      .mockResolvedValueOnce({ success: true, message: 'Match two reverted' })

    const res = await request('POST', '/api/manage/cup/123/undo-dns', {
      shooterName: 'Test Shooter',
      email: 'test@example.com',
      cupParticipantId: 'cup-77'
    }, ip, cookies)

    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
    expect(res.data.results).toEqual([
      { location: 'CUP', success: true, message: 'CUP reverted' },
      { location: 'Match One', success: true, message: 'Match one reverted' },
      { location: 'Match Two', success: true, message: 'Match two reverted' }
    ])

    expect(ssiClientMocks.ssiUndoDidNotShow).toHaveBeenCalledTimes(3)
    expect(ssiClientMocks.ssiUndoDidNotShow).toHaveBeenNthCalledWith(1, 137, 'cup-77', expect.any(Object))
    expect(ssiClientMocks.ssiUndoDidNotShow).toHaveBeenNthCalledWith(2, 93, 'match-participant-1', expect.any(Object))
    expect(ssiClientMocks.ssiUndoDidNotShow).toHaveBeenNthCalledWith(3, 93, 'match-participant-2', expect.any(Object))
  })
})

// ============================================================
// POST /api/manage/cup/:id/toggle-paid
// ============================================================

describe('POST /api/manage/cup/:id/toggle-paid', () => {
  it('returns 400 when required fields are missing', async () => {
    const ip = uniqueIp()
    const cookies = await createManageSessionCookie()

    const res = await request('POST', '/api/manage/cup/123/toggle-paid', {
      shooterName: 'Test Shooter'
    }, ip, cookies)

    expect(res.status).toBe(400)
    expect(res.data.error).toBe('shooterName and cupParticipantId required')
  })

  it('toggles paid status at cup level', async () => {
    const ip = uniqueIp()
    const cookies = await createManageSessionCookie()

    ssiClientMocks.ssiTogglePaid.mockResolvedValue({ success: true, message: 'Marked as paid' })

    const res = await request('POST', '/api/manage/cup/123/toggle-paid', {
      shooterName: 'Test Shooter',
      cupParticipantId: 'cup-88'
    }, ip, cookies)

    expect(res.status).toBe(200)
    expect(res.data).toEqual({ success: true, message: 'Marked as paid' })
    expect(ssiClientMocks.ssiTogglePaid).toHaveBeenCalledTimes(1)
    expect(ssiClientMocks.ssiTogglePaid).toHaveBeenCalledWith(137, 'cup-88', expect.any(Object))
  })
})
