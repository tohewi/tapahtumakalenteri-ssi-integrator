import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock functions so they're available in vi.mock factories
const { mockSsiGetScoringPage, mockSsiSubmitScore } = vi.hoisted(() => ({
  mockSsiGetScoringPage: vi.fn(),
  mockSsiSubmitScore: vi.fn()
}))

// Mock the logger
vi.mock('../lib/logger.js', () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }
}))

// Mock SSI core functions
vi.mock('../lib/ssi-core/scoring.js', () => ({
  ssiGetScoringPage: mockSsiGetScoringPage,
  ssiSubmitScore: mockSsiSubmitScore
}))

import scoringService from '../lib/services/scoring-service.js'

describe('Scoring Service', () => {
  let mockSession, mockGraphQL

  beforeEach(() => {
    vi.clearAllMocks()
    mockSession = { jwt: 'test-jwt', ssiCookies: 'test-cookies' }
    mockGraphQL = vi.fn()
  })

  describe('searchCups', () => {
    it('returns empty array for short search terms', async () => {
      const result1 = await scoringService.searchCups('', mockSession, mockGraphQL)
      expect(result1).toEqual([])

      const result2 = await scoringService.searchCups('a', mockSession, mockGraphQL)
      expect(result2).toEqual([])

      // graphQL should not have been called
      expect(mockGraphQL).not.toHaveBeenCalled()
    })

    it('returns cups sorted by date proximity', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-18T00:00:00Z'))

      mockGraphQL.mockResolvedValue({
        events: [
          { id: '1', name: 'Cup A', starts: '2026-02-20T00:00:00Z', status: 'on', get_content_type_key: 136 },
          { id: '2', name: 'Cup B', starts: '2026-02-15T00:00:00Z', status: 'on', get_content_type_key: 136 },
          { id: '3', name: 'Cup C', starts: '2026-02-25T00:00:00Z', status: 'on', get_content_type_key: 136 }
        ]
      })

      const result = await scoringService.searchCups('test', mockSession, mockGraphQL)

      // Sorted by absolute distance from now: Feb 15 (3d), Feb 20 (2d), Feb 25 (7d)
      expect(result[0].id).toBe('1') // 2d away
      expect(result[1].id).toBe('2') // 3d away
      expect(result[2].id).toBe('3') // 7d away

      vi.useRealTimers()
    })

    it('filters to cups only (CT=136)', async () => {
      mockGraphQL.mockResolvedValue({
        events: [
          { id: '1', name: 'Cup', starts: '2026-02-20T00:00:00Z', status: 'on', get_content_type_key: 136 },
          { id: '2', name: 'Match', starts: '2026-02-20T00:00:00Z', status: 'on', get_content_type_key: 91 }
        ]
      })

      const result = await scoringService.searchCups('test', mockSession, mockGraphQL)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('1')
    })

    it('wraps GraphQL errors as SSIError', async () => {
      mockGraphQL.mockRejectedValue(new Error('Network error'))

      await expect(scoringService.searchCups('test', mockSession, mockGraphQL))
        .rejects.toThrow('SSI API error: Failed to search cups')
    })
  })

  describe('validateScores', () => {
    const matchConfig = {
      uses_strings: true,
      number_of_strings: 1,
      number_of_rounds_per_string: 5
    }

    it('throws for null/undefined scores', () => {
      expect(() => scoringService.validateScores(null, matchConfig))
        .toThrow('Invalid scores data')

      expect(() => scoringService.validateScores(undefined, matchConfig))
        .toThrow('Invalid scores data')
    })

    it('throws for missing string data', () => {
      expect(() => scoringService.validateScores({}, matchConfig))
        .toThrow('Invalid scores for string 1')
    })

    it('throws for negative zone counts', () => {
      expect(() => scoringService.validateScores({
        string1: { xxx: -1, ten: 0, nine: 0, eight: 0, seven: 0, six: 0, five: 0, four: 0, three: 0, two: 0, one: 0, miss: 0 }
      }, matchConfig)).toThrow('Invalid score count for zone xxx')
    })

    it('throws when total shots exceed max', () => {
      expect(() => scoringService.validateScores({
        string1: { xxx: 3, ten: 3, nine: 0, eight: 0, seven: 0, six: 0, five: 0, four: 0, three: 0, two: 0, one: 0, miss: 0 }
      }, matchConfig)).toThrow('Too many shots in string 1')
    })

    it('passes valid scores', () => {
      expect(() => scoringService.validateScores({
        string1: { xxx: 1, ten: 1, nine: 1, eight: 1, seven: 1, six: 0, five: 0, four: 0, three: 0, two: 0, one: 0, miss: 0 }
      }, matchConfig)).not.toThrow()
    })
  })

  describe('submitScores', () => {
    const matchConfig = {
      uses_strings: true,
      number_of_strings: 1,
      number_of_rounds_per_string: 5
    }

    it('validates scores before submitting', async () => {
      await expect(scoringService.submitScores('123', null, mockSession, matchConfig))
        .rejects.toThrow('Invalid scores data')
    })

    it('submits valid scores successfully', async () => {
      const validScores = {
        string1: { xxx: 1, ten: 1, nine: 1, eight: 1, seven: 1, six: 0, five: 0, four: 0, three: 0, two: 0, one: 0, miss: 0 }
      }

      mockSsiGetScoringPage.mockResolvedValue({ csrfToken: 'csrf-abc' })
      mockSsiSubmitScore.mockResolvedValue({ success: true })

      const result = await scoringService.submitScores('123', validScores, mockSession, matchConfig)

      expect(result).toEqual({
        success: true,
        competitorId: '123',
        submittedAt: expect.any(String)
      })
      expect(mockSsiGetScoringPage).toHaveBeenCalledWith('123', 'test-cookies')
    })

    it('wraps SSI errors', async () => {
      const validScores = {
        string1: { xxx: 1, ten: 0, nine: 0, eight: 0, seven: 0, six: 0, five: 0, four: 0, three: 0, two: 0, one: 0, miss: 0 }
      }

      mockSsiGetScoringPage.mockRejectedValue(new Error('SSI down'))

      await expect(scoringService.submitScores('123', validScores, mockSession, matchConfig))
        .rejects.toThrow('SSI API error: Failed to submit scores')
    })
  })
})
