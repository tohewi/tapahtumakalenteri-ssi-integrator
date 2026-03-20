// ============================================================
// SSI Stats GraphQL Tests (CAL-5)
// ============================================================
// Tests for lib/ssi-core/stats-graphql.js
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock functions
const { mockGraphQL, mockGraphQLAuth } = vi.hoisted(() => ({
  mockGraphQL: vi.fn(),
  mockGraphQLAuth: vi.fn(),
}))

vi.mock('../lib/ssi-core/graphql.js', () => ({
  ssiGraphQL: mockGraphQL,
  ssiGraphQLAuth: mockGraphQLAuth,
}))

import { ssiGetEventStats } from '../lib/ssi-core/stats-graphql.js'

// ---- Test data ----

const validCredentials = { email: 'test@example.com', password: 'secret' }

const cupEventData = {
  event: {
    id: '141',
    name: 'TurRes Kupittaa CUP 14.02.2026',
    status: 'cp',
    starts: '2026-02-14T08:00:00+00:00',
    ends: '2026-02-14T18:00:00+00:00',
    competitors_count: 25,
    count: 3,
    number_of_mainmatch_competitors_approved: 22,
    number_of_mainmatch_competitors_pending: 0,
    component_matches: [
      {
        id: '1', number: 1,
        match: {
          id: '201', name: 'Kupittaa Tarkkuus', status: 'cp',
          competitors_count: 26,
          number_of_mainmatch_competitors_approved: 23,
          number_of_mainmatch_competitors_pending: 0,
        },
      },
      {
        id: '2', number: 2,
        match: {
          id: '202', name: 'Kupittaa Pika', status: 'cp',
          competitors_count: 25,
          number_of_mainmatch_competitors_approved: 23,
          number_of_mainmatch_competitors_pending: 0,
        },
      },
      {
        id: '3', number: 3,
        match: {
          id: '203', name: 'Kupittaa Kuvio', status: 'cp',
          competitors_count: 25,
          number_of_mainmatch_competitors_approved: 23,
          number_of_mainmatch_competitors_pending: 0,
        },
      },
    ],
  },
}

const matchEventData = {
  event: {
    id: '300',
    name: 'Standalone Match 01.03.2026',
    status: 'cp',
    starts: '2026-03-01T08:00:00+00:00',
    ends: '2026-03-01T18:00:00+00:00',
    competitors_count: 15,
    number_of_mainmatch_competitors_approved: 12,
    number_of_mainmatch_competitors_pending: 1,
  },
}

// ---- Tests ----

describe('ssiGetEventStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGraphQLAuth.mockResolvedValue({ token: 'jwt-token-123' })
  })

  it('should fetch cup statistics via GraphQL', async () => {
    mockGraphQL.mockResolvedValue(cupEventData)

    const result = await ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: 136,
      cupId: 141,
      isCup: true,
    })

    expect(result.approvedCount).toBe(22)
    expect(result.totalCount).toBe(25)
    expect(result.matchCount).toBe(3)
    expect(result.status).toBe('cp')
    expect(result.eventName).toBe('TurRes Kupittaa CUP 14.02.2026')
    expect(result.matches).toHaveLength(3)
    expect(result.matches[0].approvedCount).toBe(23)
    expect(result.matches[0].name).toBe('Kupittaa Tarkkuus')
  })

  it('should authenticate with SSI before querying', async () => {
    mockGraphQL.mockResolvedValue(cupEventData)

    await ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: 136,
      cupId: 141,
    })

    expect(mockGraphQLAuth).toHaveBeenCalledWith(validCredentials)
    expect(mockGraphQL).toHaveBeenCalledWith(
      'jwt-token-123',
      expect.stringContaining('CupStats'),
      { ct: 136, id: '141' }
    )
  })

  it('should fetch standalone match statistics', async () => {
    mockGraphQL.mockResolvedValue(matchEventData)

    const result = await ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: 91,
      cupId: 300,
      isCup: false,
    })

    expect(result.approvedCount).toBe(12)
    expect(result.totalCount).toBe(15)
    expect(result.matchCount).toBe(0) // standalone match = no sub-matches
    expect(result.matches).toHaveLength(0)
    expect(mockGraphQL).toHaveBeenCalledWith(
      'jwt-token-123',
      expect.stringContaining('MatchStats'),
      { ct: 91, id: '300' }
    )
  })

  it('should default isCup to true', async () => {
    mockGraphQL.mockResolvedValue(cupEventData)

    await ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: 136,
      cupId: 141,
    })

    expect(mockGraphQL).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('CupStats'),
      expect.any(Object)
    )
  })

  it('should throw if credentials are missing', async () => {
    await expect(ssiGetEventStats({
      credentials: {},
      cupTypeId: 136,
      cupId: 141,
    })).rejects.toThrow('SSI credentials required')
  })

  it('should throw if cupTypeId is missing', async () => {
    await expect(ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: null,
      cupId: 141,
    })).rejects.toThrow('cupTypeId and cupId are required')
  })

  it('should throw if cupId is missing', async () => {
    await expect(ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: 136,
      cupId: null,
    })).rejects.toThrow('cupTypeId and cupId are required')
  })

  it('should throw if event not found in SSI', async () => {
    mockGraphQL.mockResolvedValue({ event: null })

    await expect(ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: 136,
      cupId: 999,
    })).rejects.toThrow('SSI event not found')
  })

  it('should handle zero approved participants', async () => {
    mockGraphQL.mockResolvedValue({
      event: {
        ...cupEventData.event,
        number_of_mainmatch_competitors_approved: 0,
        competitors_count: 0,
        component_matches: [],
        count: 0,
      },
    })

    const result = await ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: 136,
      cupId: 141,
    })

    expect(result.approvedCount).toBe(0)
    expect(result.totalCount).toBe(0)
    expect(result.matchCount).toBe(0)
  })

  it('should handle missing fields gracefully (default to 0)', async () => {
    mockGraphQL.mockResolvedValue({
      event: {
        id: '141',
        name: 'Test Cup',
        status: 'op',
        starts: null,
        ends: null,
        // number_of_mainmatch_competitors_approved intentionally missing
        // competitors_count intentionally missing
        component_matches: [],
      },
    })

    const result = await ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: 136,
      cupId: 141,
    })

    expect(result.approvedCount).toBe(0)
    expect(result.totalCount).toBe(0)
  })

  it('should convert string cupId to string for GraphQL variable', async () => {
    mockGraphQL.mockResolvedValue(cupEventData)

    await ssiGetEventStats({
      credentials: validCredentials,
      cupTypeId: '136',
      cupId: '141',
    })

    expect(mockGraphQL).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { ct: 136, id: '141' }
    )
  })
})
