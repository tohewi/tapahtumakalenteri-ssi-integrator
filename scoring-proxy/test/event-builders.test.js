// ============================================================
// Unit tests for Event Builders (TST-6)
//
// Tests builder registry selection logic and pure functions:
// - createEventWithBuilder — selects the right builder
// - applyTemplateFormFields — merges snapshot + override form fields
// External SSI calls mocked via vi.mock.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mock all external dependencies ----
vi.mock('../lib/ssi-core/client.js', () => ({
  ssiLogin: vi.fn().mockResolvedValue({ sessionid: 'test-session' }),
}))
vi.mock('../lib/ssi-core/event-creation.js', () => ({
  ssiCreateEvent: vi.fn().mockResolvedValue({
    id: 'event-123',
    get_content_type_key: 91,
    get_full_absolute_url: '/event/91/123/',
  }),
}))
vi.mock('../lib/services/event-creation-service.js', () => ({
  fetchCsrf: vi.fn().mockResolvedValue({ html: '<form></form>', csrfToken: 'test-csrf', cookies: {} }),
  postForm: vi.fn().mockResolvedValue({ html: '<html><body>success body eventId-99</body></html>', cookies: {} }),
  extractEventIds: vi.fn().mockReturnValue({ typeId: 136, eventId: 99 }),
  extractFormErrors: vi.fn().mockReturnValue([]),
  extractPageTitle: vi.fn().mockReturnValue('Test Event'),
  parseFormFields: vi.fn().mockReturnValue({ fields: {}, arrayFields: {} }),
}))
vi.mock('../lib/ssi-core/constants.js', () => ({
  SSI_BASE_URL: 'https://shootnscoreit.com',
}))
vi.mock('../lib/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createEventWithBuilder } from '../lib/services/event-builders/index.js'
import { applyTemplateFormFields } from '../lib/services/event-builders/nordic-cup-graphql-builder.js'
import { fetchCsrf, postForm, parseFormFields, extractEventIds, extractFormErrors, extractPageTitle } from '../lib/services/event-creation-service.js'

// ============================================================
// applyTemplateFormFields — pure function tests
// ============================================================

describe('applyTemplateFormFields — snapshot format', () => {
  it('extracts selected values from snapshot format { selected, values }', () => {
    const body = {}
    const arrayFields = {}
    const snapshot = {
      weapon_groups: { values: ['STD', 'RVL', 'HST'], selected: ['STD', 'RVL'] },
    }
    applyTemplateFormFields(body, arrayFields, snapshot, null)
    expect(arrayFields.weapon_groups).toEqual(['STD', 'RVL'])
  })

  it('extracts simple array from snapshot', () => {
    const body = {}
    const arrayFields = {}
    const snapshot = { categories: ['Open', 'Ladies'] }
    applyTemplateFormFields(body, arrayFields, snapshot, null)
    expect(arrayFields.categories).toEqual(['Open', 'Ladies'])
  })

  it('does nothing when snapshot is null', () => {
    const body = {}
    const arrayFields = {}
    applyTemplateFormFields(body, arrayFields, null, null)
    expect(arrayFields).toEqual({})
  })
})

describe('applyTemplateFormFields — override priority', () => {
  it('overrides take priority over snapshot', () => {
    const body = {}
    const arrayFields = {}
    const snapshot = { weapon_groups: { values: ['STD', 'RVL'], selected: ['STD', 'RVL'] } }
    const overrides = { weapon_groups: ['STD'] }
    applyTemplateFormFields(body, arrayFields, snapshot, overrides)
    expect(arrayFields.weapon_groups).toEqual(['STD'])
  })

  it('snapshot fields not in overrides are preserved', () => {
    const body = {}
    const arrayFields = {}
    const snapshot = {
      weapon_groups: ['STD', 'RVL'],
      categories: ['Open', 'Ladies'],
    }
    const overrides = { weapon_groups: ['STD'] }
    applyTemplateFormFields(body, arrayFields, snapshot, overrides)
    expect(arrayFields.weapon_groups).toEqual(['STD'])
    expect(arrayFields.categories).toEqual(['Open', 'Ladies'])
  })

  it('removes field from body when it becomes an arrayField', () => {
    const body = { weapon_groups: 'STD' }
    const arrayFields = {}
    const snapshot = { weapon_groups: ['STD', 'RVL'] }
    applyTemplateFormFields(body, arrayFields, snapshot, null)
    expect('weapon_groups' in body).toBe(false)
    expect(arrayFields.weapon_groups).toEqual(['STD', 'RVL'])
  })

  it('skips empty arrays', () => {
    const body = {}
    const arrayFields = {}
    const snapshot = { weapon_groups: [] }
    applyTemplateFormFields(body, arrayFields, snapshot, null)
    expect('weapon_groups' in arrayFields).toBe(false)
  })
})

// ============================================================
// createEventWithBuilder — builder selection
// ============================================================

describe('createEventWithBuilder — builder selection', () => {
  const baseParams = {
    credentials: { email: 'test@test.com', password: 'pass' },
    schedule: { isoDate: '2025-06-15', startTime: '10:00', endTime: '18:00',
      regStartDate: '2025-05-15', regStartTime: '10:00', regCloseDate: '2025-06-14', regCloseTime: '20:00' },
    overrides: {},
    progress: vi.fn(),
    eventName: 'Test Event',
  }

  it('selects SRA GraphQL builder for SRA standalone match', async () => {
    const params = {
      ...baseParams,
      snapshot: { rule: 'sr', description: '', information: '', venue: '', url: '', urlDisplay: '',
        settings: { maxCompetitors: 50, region: 'FIN', visibility: 'pub', registration: 'op', results: 'org' },
        squads: [] },
      isCup: false,
      discipline: { sportCode: 'sr' },
    }
    // Should not throw — SRA builder mocks are set up
    const result = await createEventWithBuilder(params)
    expect(result).toBeDefined()
    expect(result.eventIds).toBeDefined()
  })

  it('falls back to legacy builder for unknown discipline', async () => {
    const params = {
      ...baseParams,
      snapshot: { rule: 'xx', description: '', information: '', venue: '', url: '', urlDisplay: '',
        settings: { maxCompetitors: 50 }, squads: [] },
      isCup: false,
      discipline: { sportCode: 'xx', ssiCreateUrl: '/events/xx/create/' },
      createUrl: 'https://shootnscoreit.com/events/xx/create/',
      // Legacy builder receives helpers via params
      fetchCsrf, postForm, parseFormFields, extractEventIds, extractFormErrors, extractPageTitle,
    }
    const result = await createEventWithBuilder(params)
    expect(result).toBeDefined()
  })

  it('SRA builder is NOT selected for cup events', async () => {
    // For a cup with SRA rule, no specific SRA cup builder exists → falls back to legacy
    const params = {
      ...baseParams,
      snapshot: { rule: 'sr', description: '', information: '', venue: '', url: '', urlDisplay: '',
        settings: { maxCompetitors: 50 }, squads: [], matches: [] },
      isCup: true,  // cup — SRA builder only matches !isCup
      discipline: { sportCode: 'sr', ssiCreateUrl: '/events/sr/create/' },
      createUrl: 'https://shootnscoreit.com/events/sr/create/',
      // Legacy builder receives helpers via params
      fetchCsrf, postForm, parseFormFields, extractEventIds, extractFormErrors, extractPageTitle,
    }
    const result = await createEventWithBuilder(params)
    expect(result).toBeDefined()
  })
})

// ============================================================
// createEventWithBuilder — SRA builder input mapping
// ============================================================

describe('createEventWithBuilder — SRA builder data mapping', () => {
  const makeParams = (overrideSnapshot = {}) => ({
    credentials: { email: 'test@test.com', password: 'pass' },
    schedule: { isoDate: '2025-06-15', startTime: '10:00', endTime: '18:00',
      regStartDate: '2025-05-15', regStartTime: '10:00', regCloseDate: '2025-06-14', regCloseTime: '20:00' },
    overrides: {},
    progress: vi.fn(),
    eventName: 'SRA Test Match',
    isCup: false,
    discipline: { sportCode: 'sr' },
    snapshot: {
      rule: 'sr',
      description: 'Test desc',
      information: 'Test info',
      venue: 'Test venue',
      url: 'https://example.com',
      urlDisplay: 'example.com',
      settings: { maxCompetitors: 30, region: 'FIN', visibility: 'pub',
        registration: 'op', results: 'org', currency: 'EUR' },
      squads: [],
      ...overrideSnapshot,
    },
  })

  it('uses eventName as the match name', async () => {
    const { ssiCreateEvent } = await import('../lib/ssi-core/event-creation.js')
    ssiCreateEvent.mockClear()
    await createEventWithBuilder(makeParams())
    expect(ssiCreateEvent).toHaveBeenCalled()
    const call = ssiCreateEvent.mock.calls[0][0]
    expect(call.formInput.name).toBe('SRA Test Match')
  })

  it('includes max_competitors from snapshot', async () => {
    const { ssiCreateEvent } = await import('../lib/ssi-core/event-creation.js')
    ssiCreateEvent.mockClear()
    await createEventWithBuilder(makeParams())
    const call = ssiCreateEvent.mock.calls[0][0]
    expect(call.formInput.max_competitors).toBe('30')
  })

  it('uses Helsinki timezone', async () => {
    const { ssiCreateEvent } = await import('../lib/ssi-core/event-creation.js')
    ssiCreateEvent.mockClear()
    await createEventWithBuilder(makeParams())
    const call = ssiCreateEvent.mock.calls[0][0]
    expect(call.formInput.timezone).toBe('Europe/Helsinki')
  })
})
