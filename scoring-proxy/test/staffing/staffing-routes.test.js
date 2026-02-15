import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const mocks = vi.hoisted(() => ({
  // engine
  getAllEvents: vi.fn(),
  getEventStatus: vi.fn(),
  signup: vi.fn(),
  resign: vi.fn(),
  upsertEvent: vi.fn(),
  syncStaffFromSSI: vi.fn(),

  // config-loader
  loadConfig: vi.fn(),
  isAdminEmail: vi.fn(),
  isServiceAccount: vi.fn(),

  // db
  getEventFilters: vi.fn(),
  listStaffSites: vi.fn(),
  isDbAvailable: vi.fn(),

  // ssi-client
  ssiRegisterToTrainerSquad: vi.fn(),
  ssiGetMatchGroupId: vi.fn(),
  ssiAddToMatchManagement: vi.fn(),
  ssiRemoveFromMatchManagement: vi.fn(),
  ssiGetMatchOfficials: vi.fn(),
  ssiDeleteMatchParticipant: vi.fn(),
  ssiSetParticipantSquad: vi.fn(),
  ssiFetchPage: vi.fn(),
  ssiFindParticipantInEvent: vi.fn(),
}))

vi.mock('../../lib/staffing/engine.js', () => ({
  getAllEvents: mocks.getAllEvents,
  getEventStatus: mocks.getEventStatus,
  signup: mocks.signup,
  resign: mocks.resign,
  upsertEvent: mocks.upsertEvent,
  syncStaffFromSSI: mocks.syncStaffFromSSI,
}))

vi.mock('../../lib/staffing/config-loader.js', () => ({
  loadConfig: mocks.loadConfig,
  isAdminEmail: mocks.isAdminEmail,
  isServiceAccount: mocks.isServiceAccount,
  DEFAULT_SITE_KEY: 'sra-training',
}))

vi.mock('../../lib/db/client.js', () => ({
  getEventFilters: mocks.getEventFilters,
  listStaffSites: mocks.listStaffSites,
  isDbAvailable: mocks.isDbAvailable,
}))

vi.mock('../../lib/ssi-client.js', () => ({
  ssiRegisterToTrainerSquad: mocks.ssiRegisterToTrainerSquad,
  ssiGetMatchGroupId: mocks.ssiGetMatchGroupId,
  ssiAddToMatchManagement: mocks.ssiAddToMatchManagement,
  ssiRemoveFromMatchManagement: mocks.ssiRemoveFromMatchManagement,
  ssiGetMatchOfficials: mocks.ssiGetMatchOfficials,
  ssiDeleteMatchParticipant: mocks.ssiDeleteMatchParticipant,
  ssiSetParticipantSquad: mocks.ssiSetParticipantSquad,
  ssiFetchPage: mocks.ssiFetchPage,
  ssiFindParticipantInEvent: mocks.ssiFindParticipantInEvent,
}))

import { createStaffingRouter } from '../../routes/staffing.js'

function createTestApp({ sessionSiteKey = 'temppeli-sra', graphqlHandler = null } = {}) {
  const app = express()
  app.use(express.json())

  const requireAuth = () => (req, _res, next) => {
    req.ssiSession = { jwt: 'mock-user-jwt' }
    req.staffingSiteKey = sessionSiteKey
    next()
  }

  const defaultGraphqlHandler = async (_session, query) => {
    if (query.includes('me { email')) {
      return {
        me: {
          email: 'instructor@test.com',
          first_name: 'Instruct',
          last_name: 'Or',
        },
      }
    }
    return { events: [] }
  }

  const graphqlWithRefresh = vi.fn(graphqlHandler || defaultGraphqlHandler)

  app.use('/api/staffing', createStaffingRouter({
    requireAuth,
    graphqlWithRefresh,
    getAdminSession: vi.fn(),
  }))

  return { app, graphqlWithRefresh }
}

beforeEach(() => {
  vi.clearAllMocks()

  mocks.isDbAvailable.mockReturnValue(true)
  mocks.listStaffSites.mockResolvedValue([])
  mocks.getEventFilters.mockResolvedValue([])
  mocks.isAdminEmail.mockResolvedValue(true)
  mocks.isServiceAccount.mockResolvedValue(false)
  mocks.getAllEvents.mockReturnValue([])
  mocks.getEventStatus.mockResolvedValue(null)
  mocks.upsertEvent.mockResolvedValue(null)
  mocks.syncStaffFromSSI.mockReturnValue(undefined)

  mocks.loadConfig.mockResolvedValue({
    organization: { name: 'Temppeli SRA', timezone: 'Europe/Helsinki' },
    adminAllowlist: ['instructor@test.com'],
    eventDiscovery: {
      searchStrings: ['Temppeli SRA'],
      matchContentType: 22,
      staffSquadName: 'Trainer',
    },
    trainingTypes: {
      oldies: {
        label: 'Oldies',
        searchPatterns: ['Temppeli SRA'],
        staffSquad: 5,
        maxTrainers: 3,
      },
    },
    roles: {},
    notifications: { templates: {} },
  })
})

describe('staffing routes site-aware behavior', () => {
  it('does not request squads in events search query', async () => {
    const { app, graphqlWithRefresh } = createTestApp()

    const response = await request(app)
      .get('/api/staffing/events')

    expect(response.status).toBe(200)
    const searchCall = graphqlWithRefresh.mock.calls.find(([, query]) => query.includes('events(search: $search)'))
    expect(searchCall).toBeTruthy()
    expect(searchCall[1]).not.toContain('squads')
  })

  it('lists staffing sites from database when available', async () => {
    mocks.isDbAvailable.mockReturnValue(true)
    mocks.listStaffSites.mockResolvedValue([
      { key: 'temppeli-sra', name: 'Temppeli SRA' },
      { key: 'kupittaa-reservilaisammunta', name: 'Kupittaa reservilaisammunta' },
    ])

    const { app } = createTestApp()

    const response = await request(app)
      .get('/api/staffing/sites')

    expect(response.status).toBe(200)
    expect(response.body.sites).toEqual([
      { key: 'temppeli-sra', name: 'Temppeli SRA' },
      { key: 'kupittaa-reservilaisammunta', name: 'Kupittaa reservilaisammunta' },
    ])
    expect(mocks.loadConfig).not.toHaveBeenCalled()
  })

  it('falls back to default site config when database is unavailable', async () => {
    mocks.isDbAvailable.mockReturnValue(false)
    mocks.loadConfig.mockResolvedValueOnce({
      organization: { name: 'SRA training' },
    })

    const { app } = createTestApp()

    const response = await request(app)
      .get('/api/staffing/sites')

    expect(response.status).toBe(200)
    expect(response.body.sites).toEqual([
      { key: 'sra-training', name: 'SRA training' },
    ])
    expect(mocks.loadConfig).toHaveBeenCalledWith('sra-training')
  })

  it('returns 403 when request siteKey mismatches active staffing session site', async () => {
    const { app } = createTestApp({ sessionSiteKey: 'temppeli-sra' })

    const response = await request(app)
      .get('/api/staffing/events?siteKey=kupittaa-reservilaisammunta')

    expect(response.status).toBe(403)
    expect(response.body.error).toMatch(/Site key mismatch/i)
  })

  it('uses explicit request site key when staffing session has no site key', async () => {
    const { app } = createTestApp({ sessionSiteKey: null })

    const response = await request(app)
      .get('/api/staffing/events?siteKey=KUPITTAA-RESERVILAISAMMUNTA')

    expect(response.status).toBe(200)
    expect(response.body.siteKey).toBe('kupittaa-reservilaisammunta')
    expect(mocks.loadConfig).toHaveBeenCalledWith('kupittaa-reservilaisammunta')
    expect(mocks.getEventFilters).toHaveBeenCalledWith('kupittaa-reservilaisammunta')
  })

  it('applies event filters to local fallback events not returned by SSI search', async () => {
    mocks.getEventFilters.mockResolvedValue([
      { type: 'cup_id', value: 'evt-1', futureOnly: false },
    ])

    mocks.getAllEvents.mockReturnValue([
      {
        eventId: 'evt-1',
        eventName: 'Temppeli SRA 1',
        eventDate: '2099-01-01T00:00:00.000Z',
      },
      {
        eventId: 'evt-2',
        eventName: 'Temppeli SRA 2',
        eventDate: '2099-01-02T00:00:00.000Z',
      },
    ])

    mocks.getEventStatus.mockImplementation(async (eventId) => ({
      eventId,
      eventName: eventId === 'evt-1' ? 'Temppeli SRA 1' : 'Temppeli SRA 2',
      eventDate: eventId === 'evt-1'
        ? '2099-01-01T00:00:00.000Z'
        : '2099-01-02T00:00:00.000Z',
      currentTrainers: 0,
      maxTrainers: 3,
      staff: [],
      leadInstructor: null,
      equipmentManager: null,
    }))

    const { app } = createTestApp({ sessionSiteKey: 'temppeli-sra' })

    const response = await request(app)
      .get('/api/staffing/events')

    expect(response.status).toBe(200)
    expect(response.body.siteKey).toBe('temppeli-sra')
    expect(response.body.events).toHaveLength(1)
    expect(response.body.events[0].eventId).toBe('evt-1')
  })

  it('returns site-aware staffing config', async () => {
    const { app } = createTestApp({ sessionSiteKey: 'temppeli-sra' })

    const response = await request(app)
      .get('/api/staffing/config')

    expect(response.status).toBe(200)
    expect(response.body.siteKey).toBe('temppeli-sra')
    expect(response.body.trainingTypes).toBeTruthy()
    expect(response.body.roles).toBeTruthy()
    expect(mocks.loadConfig).toHaveBeenCalledWith('temppeli-sra')
  })

  it('returns 403 on site key mismatch for config endpoint', async () => {
    const { app } = createTestApp({ sessionSiteKey: 'temppeli-sra' })

    const response = await request(app)
      .get('/api/staffing/config?siteKey=kupittaa-reservilaisammunta')

    expect(response.status).toBe(403)
    expect(response.body.error).toMatch(/Site key mismatch/i)
  })

  it('passes resolved site key to signup engine call', async () => {
    mocks.signup.mockReturnValue({ success: true })
    mocks.getEventStatus.mockResolvedValue({
      eventId: 'evt-88',
      trainingType: 'oldies',
      contentType: 22,
    })

    const { app } = createTestApp({ sessionSiteKey: 'temppeli-sra' })

    const response = await request(app)
      .post('/api/staffing/events/evt-88/signup')
      .send({ role: 'staff' })

    expect(response.status).toBe(200)
    expect(response.body.siteKey).toBe('temppeli-sra')
    expect(mocks.signup).toHaveBeenCalledWith(
      'evt-88',
      expect.objectContaining({ email: 'instructor@test.com' }),
      'staff',
      'temppeli-sra'
    )
  })

  it('keeps events endpoint functional when event squads query fails for an event', async () => {
    const graphqlHandler = async (_session, query) => {
      if (query.includes('me { email')) {
        return {
          me: {
            email: 'instructor@test.com',
            first_name: 'Instruct',
            last_name: 'Or',
          },
        }
      }

      if (query.includes('events(search: $search)')) {
        return {
          events: [
            {
              id: 'evt-graph-1',
              name: 'Temppeli SRA compatibility check',
              starts: '2099-06-01T00:00:00.000Z',
              get_content_type_key: '22',
            },
          ],
        }
      }

      if (query.includes('query GetEventSquads')) {
        throw new Error("GraphQL Error: 'NordicSerie' object has no attribute 'squads'")
      }

      return { events: [] }
    }

    mocks.getEventStatus.mockResolvedValue({
      eventId: 'evt-graph-1',
      eventName: 'Temppeli SRA compatibility check',
      eventDate: '2099-06-01T00:00:00.000Z',
      currentTrainers: 0,
      maxTrainers: 3,
      staff: [],
      leadInstructor: null,
      equipmentManager: null,
    })

    const { app } = createTestApp({ graphqlHandler })

    const response = await request(app)
      .get('/api/staffing/events')

    expect(response.status).toBe(200)
    expect(response.body.events).toHaveLength(1)
    expect(mocks.upsertEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'evt-graph-1',
      shooterCount: 0,
      contentType: 22,
      siteKey: 'temppeli-sra',
    }))
  })

  it('filters by cup event type and uses default training type fallback', async () => {
    mocks.loadConfig.mockResolvedValueOnce({
      organization: { name: 'Kupittaa reservilaisammunta', timezone: 'Europe/Helsinki' },
      adminAllowlist: ['instructor@test.com'],
      eventDiscovery: {
        searchStrings: ['Kupittaa'],
        eventTypes: ['cup'],
        defaultTrainingType: 'kupittaa',
        matchContentType: 22,
        cupContentType: 136,
        staffSquadName: 'Vetäjät',
      },
      trainingTypes: {
        kupittaa: {
          label: 'Kupittaa',
          searchPatterns: ['does-not-match-event-name'],
          staffSquad: 5,
          maxTrainers: 4,
        },
      },
      roles: {},
      notifications: { templates: {} },
    })

    const graphqlHandler = async (_session, query) => {
      if (query.includes('me { email')) {
        return {
          me: {
            email: 'instructor@test.com',
            first_name: 'Instruct',
            last_name: 'Or',
          },
        }
      }

      if (query.includes('events(search: $search)')) {
        return {
          events: [
            {
              id: 'cup-100',
              name: 'Kupittaa CUP 2026-03-01',
              starts: '2099-03-01T09:00:00.000Z',
              get_content_type_key: '136',
            },
            {
              id: 'match-200',
              name: 'Kupittaa Match 2026-03-01',
              starts: '2099-03-01T09:00:00.000Z',
              get_content_type_key: '22',
            },
          ],
        }
      }

      if (query.includes('query GetEventSquads')) {
        return {
          event: {
            squads: [],
          },
        }
      }

      return { events: [] }
    }

    mocks.getEventStatus.mockImplementation(async (eventId) => {
      if (eventId === 'cup-100') {
        return {
          eventId: 'cup-100',
          eventName: 'Kupittaa CUP 2026-03-01',
          eventDate: '2099-03-01T09:00:00.000Z',
          currentTrainers: 0,
          maxTrainers: 4,
          staff: [],
          leadInstructor: null,
          equipmentManager: null,
        }
      }
      return null
    })

    const { app } = createTestApp({ graphqlHandler })

    const response = await request(app)
      .get('/api/staffing/events')

    expect(response.status).toBe(200)
    expect(response.body.events).toHaveLength(1)
    expect(response.body.events[0].eventId).toBe('cup-100')
    expect(mocks.upsertEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'cup-100',
      trainingType: 'kupittaa',
      contentType: 136,
      siteKey: 'temppeli-sra',
    }))
    expect(mocks.upsertEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'match-200',
    }))
  })
})
