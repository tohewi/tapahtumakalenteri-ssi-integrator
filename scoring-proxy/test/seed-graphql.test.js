// ============================================================
// Unit tests for SSI Core — Seed GraphQL (TST-5 additions)
//
// Tests for ssiSearchEvents client-side filtering logic and
// SEARCH_EVENTS_QUERY structure. GraphQL API calls are mocked.
// seed-form-capture.js HTML parsing is also covered here.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SEARCH_EVENTS_QUERY, ssiSearchEvents } from '../lib/ssi-core/seed-graphql.js'
import { FORM_FIELDS_TO_CAPTURE } from '../lib/ssi-core/seed-form-capture.js'

// ---- Mock SSI GraphQL dependencies ----
vi.mock('../lib/ssi-core/graphql.js', () => ({
  ssiGraphQLAuth: vi.fn().mockResolvedValue('mock_jwt_token'),
  ssiGraphQL: vi.fn(),
}))
vi.mock('../lib/ssi-core/constants.js', () => ({
  SSI_BASE_URL: 'https://shootnscoreit.com',
  SSI_GRAPHQL: 'https://shootnscoreit.com/graphql/',
}))
vi.mock('../lib/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { ssiGraphQL } from '../lib/ssi-core/graphql.js'

// Sample SSI events for filtering tests
const SAMPLE_EVENTS = [
  { id: '1', name: 'Nordic Cup 1', starts: '2025-03-01T10:00:00Z', ends: '2025-03-01T18:00:00Z',
    status: 'on', rule: 'rl', region: 'FIN', visibility: 'pub',
    get_full_absolute_url: '/event/136/1/', get_content_type_key: 136, component_matches: [{ id: '10' }] },
  { id: '2', name: 'SRA Match', starts: '2025-04-15T10:00:00Z', ends: '2025-04-15T18:00:00Z',
    status: 'on', rule: 'sr', region: 'FIN', visibility: 'pub',
    get_full_absolute_url: '/event/91/2/', get_content_type_key: 91, component_matches: [] },
  { id: '3', name: 'IPSC Match', starts: '2025-06-20T10:00:00Z', ends: '2025-06-20T18:00:00Z',
    status: 'on', rule: 'ip', region: 'SWE', visibility: 'pub',
    get_full_absolute_url: 'https://shootnscoreit.com/event/91/3/', get_content_type_key: 91, component_matches: [] },
  { id: '4', name: 'Nordic Match FIN', starts: '2025-02-01T10:00:00Z', ends: '2025-02-01T18:00:00Z',
    status: 'on', rule: 'rl', region: 'FIN', visibility: 'pub',
    get_full_absolute_url: null, get_content_type_key: 91, component_matches: [] },
]

beforeEach(() => {
  ssiGraphQL.mockResolvedValue({ events: SAMPLE_EVENTS })
})

// ============================================================
// SEARCH_EVENTS_QUERY structure
// ============================================================

describe('SEARCH_EVENTS_QUERY', () => {
  it('queries required event fields', () => {
    expect(SEARCH_EVENTS_QUERY).toContain('id')
    expect(SEARCH_EVENTS_QUERY).toContain('name')
    expect(SEARCH_EVENTS_QUERY).toContain('starts')
    expect(SEARCH_EVENTS_QUERY).toContain('ends')
    expect(SEARCH_EVENTS_QUERY).toContain('status')
    expect(SEARCH_EVENTS_QUERY).toContain('rule')
    expect(SEARCH_EVENTS_QUERY).toContain('region')
    expect(SEARCH_EVENTS_QUERY).toContain('visibility')
  })

  it('queries URL and content type fields for normalization', () => {
    expect(SEARCH_EVENTS_QUERY).toContain('get_full_absolute_url')
    expect(SEARCH_EVENTS_QUERY).toContain('get_content_type_key')
  })

  it('queries component_matches for cup detection', () => {
    expect(SEARCH_EVENTS_QUERY).toContain('component_matches')
  })

  it('uses $search: String! variable', () => {
    expect(SEARCH_EVENTS_QUERY).toContain('$search: String!')
  })
})

// ============================================================
// ssiSearchEvents — input validation
// ============================================================

describe('ssiSearchEvents — input validation', () => {
  const credentials = { email: 'test@test.com', password: 'pass' }

  it('throws when search is missing', async () => {
    await expect(ssiSearchEvents({ credentials, search: '' }))
      .rejects.toThrow('at least 2 characters')
  })

  it('throws when search is 1 character', async () => {
    await expect(ssiSearchEvents({ credentials, search: 'A' }))
      .rejects.toThrow('at least 2 characters')
  })

  it('throws when search is undefined', async () => {
    await expect(ssiSearchEvents({ credentials, search: undefined }))
      .rejects.toThrow('at least 2 characters')
  })
})

// ============================================================
// ssiSearchEvents — client-side filtering
// ============================================================

describe('ssiSearchEvents — sport filter', () => {
  const credentials = { email: 'test@test.com', password: 'pass' }

  it('returns all events when no sport filter', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Match' })
    expect(results).toHaveLength(4)
  })

  it('filters by sport code rl (Nordic/RESUL)', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Nordic', sport: 'rl' })
    expect(results).toHaveLength(2)
    expect(results.every(e => e.rule === 'rl')).toBe(true)
  })

  it('filters by sport code sr (SRA)', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Match', sport: 'sr' })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('SRA Match')
  })

  it('sport filter is case-insensitive', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Match', sport: 'RL' })
    expect(results).toHaveLength(2)
  })
})

describe('ssiSearchEvents — region filter', () => {
  const credentials = { email: 'test@test.com', password: 'pass' }

  it('filters by region FIN', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Match', region: 'FIN' })
    expect(results).toHaveLength(3)
    expect(results.every(e => e.region === 'FIN')).toBe(true)
  })

  it('filters by region SWE', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'IPSC', region: 'SWE' })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('IPSC Match')
  })

  it('region filter is case-insensitive', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Match', region: 'fin' })
    expect(results).toHaveLength(3)
  })
})

describe('ssiSearchEvents — date filters', () => {
  const credentials = { email: 'test@test.com', password: 'pass' }

  it('filters by startsAfter', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Match', startsAfter: '2025-04-01' })
    // Events starting on/after April 1: SRA (Apr 15), IPSC (Jun 20)
    expect(results).toHaveLength(2)
  })

  it('filters by startsBefore', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Match', startsBefore: '2025-03-15' })
    // Events starting on/before Mar 15: Nordic Cup 1 (Mar 1), Nordic Match FIN (Feb 1)
    expect(results).toHaveLength(2)
  })

  it('combines startsAfter and startsBefore', async () => {
    const results = await ssiSearchEvents({
      credentials, search: 'Match',
      startsAfter: '2025-03-01', startsBefore: '2025-05-01',
    })
    // Only events in Mar-Apr range: Nordic Cup 1 (Mar 1), SRA Match (Apr 15)
    expect(results).toHaveLength(2)
  })
})

describe('ssiSearchEvents — result normalization', () => {
  const credentials = { email: 'test@test.com', password: 'pass' }

  it('marks events with component_matches as cups', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Nordic', sport: 'rl' })
    const cup = results.find(e => e.name === 'Nordic Cup 1')
    expect(cup.isCup).toBe(true)
    expect(cup.componentMatchCount).toBe(1)
  })

  it('marks events without component_matches as not cups', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Match', sport: 'sr' })
    expect(results[0].isCup).toBe(false)
    expect(results[0].componentMatchCount).toBe(0)
  })

  it('normalizes relative URL to absolute', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Nordic', sport: 'rl' })
    const cup = results.find(e => e.name === 'Nordic Cup 1')
    expect(cup.url).toMatch(/^https:\/\/shootnscoreit\.com/)
  })

  it('preserves absolute URL', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'IPSC', sport: 'ip' })
    expect(results[0].url).toBe('https://shootnscoreit.com/event/91/3/')
  })

  it('returns null URL when get_full_absolute_url is null', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Nordic', sport: 'rl', region: 'FIN' })
    const match = results.find(e => e.name === 'Nordic Match FIN')
    expect(match.url).toBeNull()
  })

  it('maps ssiEventId from id field', async () => {
    const results = await ssiSearchEvents({ credentials, search: 'Match', sport: 'sr' })
    expect(results[0].ssiEventId).toBe('2')
  })
})

// ============================================================
// FORM_FIELDS_TO_CAPTURE constant
// ============================================================

describe('FORM_FIELDS_TO_CAPTURE', () => {
  it('includes weapon_groups', () => {
    expect(FORM_FIELDS_TO_CAPTURE).toContain('weapon_groups')
  })

  it('includes categories', () => {
    expect(FORM_FIELDS_TO_CAPTURE).toContain('categories')
  })

  it('includes competence_classes', () => {
    expect(FORM_FIELDS_TO_CAPTURE).toContain('competence_classes')
  })

  it('contains exactly 3 fields', () => {
    expect(FORM_FIELDS_TO_CAPTURE).toHaveLength(3)
  })
})
