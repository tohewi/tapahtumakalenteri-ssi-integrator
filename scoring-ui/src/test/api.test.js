import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseStringScore,
  transformMatch,
  transformMatchListItem,
  buildScoresFromSSI,
  login,
  searchCups,
  getCup,
  getMatch,
  submitScore,
} from '../api'

// ============================================================
// Unit tests: Data transformers
// ============================================================

describe('parseStringScore', () => {
  it('returns all zeros for null/undefined input', () => {
    const result = parseStringScore(null)
    expect(result).toEqual({ X: 0, '10': 0, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 })
  })

  it('returns all zeros for empty zero string', () => {
    const result = parseStringScore('0,0,0,0,0,0,0,0,0,0,0,0,0')
    expect(result).toEqual({ X: 0, '10': 0, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 })
  })

  it('parses a valid SSI score string correctly', () => {
    // SSI format: X, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, M, max_hits
    const result = parseStringScore('1,2,1,0,1,0,0,0,0,0,0,0,5')
    expect(result.X).toBe(1)
    expect(result['10']).toBe(2)
    expect(result['9']).toBe(1)
    expect(result['8']).toBe(0)
    expect(result['7']).toBe(1)
    expect(result.M).toBe(0)
  })

  it('handles all-miss string', () => {
    const result = parseStringScore('0,0,0,0,0,0,0,0,0,0,0,5,5')
    expect(result.M).toBe(5)
    expect(result.X).toBe(0)
  })

  it('handles perfect score string', () => {
    const result = parseStringScore('5,0,0,0,0,0,0,0,0,0,0,0,5')
    expect(result.X).toBe(5)
    expect(result['10']).toBe(0)
    expect(result.M).toBe(0)
  })

  // Edge cases
  it('handles empty string', () => {
    const result = parseStringScore('')
    expect(result).toEqual({ X: 0, '10': 0, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 })
  })

  it('handles undefined input', () => {
    const result = parseStringScore(undefined)
    expect(result).toEqual({ X: 0, '10': 0, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 })
  })

  it('handles non-numeric segments by converting to NaN then 0', () => {
    // Number('abc') returns NaN, and NaN || 0 returns 0
    const result = parseStringScore('1,abc,3,4,5,6,7,8,9,10,11,12,13')
    expect(result.X).toBe(1)
    expect(result['10']).toBe(0) // NaN becomes 0 due to || 0
    expect(result['9']).toBe(3)
  })

  it('handles partial string (fewer than 13 values)', () => {
    const result = parseStringScore('1,2,3')
    expect(result.X).toBe(1)
    expect(result['10']).toBe(2)
    expect(result['9']).toBe(3)
    expect(result['8']).toBe(0) // Missing values default to 0
    expect(result['7']).toBe(0)
    expect(result.M).toBe(0)
  })

  it('handles extra values (more than 13 values)', () => {
    const result = parseStringScore('1,2,3,4,5,6,7,8,9,10,11,12,13,14,15')
    expect(result.X).toBe(1)
    expect(result['10']).toBe(2)
    expect(result['9']).toBe(3)
    expect(result.M).toBe(12)
    // Extra values are ignored
  })

  it('handles string with whitespace (trimmed by Number())', () => {
    const result = parseStringScore(' 1 , 2 , 3 , 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 , 5 ')
    expect(result.X).toBe(1)
    expect(result['10']).toBe(2)
    expect(result['9']).toBe(3)
  })

  it('handles negative numbers', () => {
    const result = parseStringScore('-1,2,3,0,0,0,0,0,0,0,0,0,5')
    expect(result.X).toBe(-1) // Negative values are preserved
    expect(result['10']).toBe(2)
  })

  it('handles floating point numbers', () => {
    const result = parseStringScore('1.5,2.7,3.2,0,0,0,0,0,0,0,0,0,5')
    expect(result.X).toBe(1.5)
    expect(result['10']).toBe(2.7)
    expect(result['9']).toBe(3.2)
  })

  it('handles single value', () => {
    const result = parseStringScore('5')
    expect(result.X).toBe(5)
    expect(result['10']).toBe(0)
    expect(result.M).toBe(0)
  })

  it('handles all NaN values', () => {
    const result = parseStringScore('a,b,c,d,e,f,g,h,i,j,k,l,m')
    // All become 0 due to NaN || 0
    expect(result).toEqual({ X: 0, '10': 0, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 })
  })
})

describe('transformMatch', () => {
  const ssiMatch = {
    id: '1850',
    name: 'Kupittaa 14.02.2026 Pika',
    starts: '2026-02-14T07:00:00+00:00',
    rule: 'RESUL',
    status: 'on',
    number_of_strings: 6,
    number_of_rounds_per_string: 5,
    squads: [
      {
        id: '4143',
        number: 1,
        comment: 'Morning squad',
        competitors: [
          {
            id: '12345',
            first_name: 'Matti',
            last_name: 'Meikäläinen',
            number: 1,
            status: 'a',
            did_not_finish: false,
            is_scoring_started: false,
            is_verified: false,
            weapon_group: 'Pistooli',
            category: 'Avoin',
            classification: null,
            s1: '1,2,1,0,1,0,0,0,0,0,0,0,5',
            s2: null,
            s3: null,
            s4: null,
            s5: null,
            s6: null,
            tot_hits: 5,
            tot_inner_hits: 1,
            tot_precision_points: 47,
          },
          {
            id: '12346',
            first_name: 'Declined',
            last_name: 'User',
            number: 2,
            status: 'd',
            did_not_finish: false,
            is_scoring_started: false,
            is_verified: false,
          },
        ],
      },
    ],
  }

  it('returns null for null input', () => {
    expect(transformMatch(null)).toBeNull()
  })

  it('transforms match basic fields', () => {
    const result = transformMatch(ssiMatch)
    expect(result.id).toBe(1850)
    expect(result.name).toBe('Kupittaa 14.02.2026 Pika')
    expect(result.date).toBe('2026-02-14')
    expect(result.type).toBe('RESUL Nordic')
    expect(result.status).toBe('on')
    expect(result.numberOfStrings).toBe(6)
    expect(result.roundsPerString).toBe(5)
  })

  it('transforms squads with number-based name', () => {
    const result = transformMatch(ssiMatch)
    expect(result.squads).toHaveLength(1)
    expect(result.squads[0].name).toBe('Squad 1')
    expect(result.squads[0].comment).toBe('Morning squad')
  })

  it('falls back to squad ID when number is missing', () => {
    const noNumber = { ...ssiMatch, squads: [{ id: '999', competitors: [] }] }
    const result = transformMatch(noNumber)
    expect(result.squads[0].name).toBe('Squad 999')
  })

  it('filters out non-approved competitors', () => {
    const result = transformMatch(ssiMatch)
    expect(result.squads[0].shooters).toHaveLength(1)
    expect(result.squads[0].shooters[0].name).toBe('Matti Meikäläinen')
  })

  it('transforms competitor fields correctly', () => {
    const result = transformMatch(ssiMatch)
    const shooter = result.squads[0].shooters[0]
    expect(shooter.id).toBe(12345)
    expect(shooter.number).toBe(1)
    expect(shooter.division).toBe('Pistooli · Avoin')
    expect(shooter.totPoints).toBe(47)
    expect(shooter.totHits).toBe(5)
    expect(shooter.ssiScores.s1).toBe('1,2,1,0,1,0,0,0,0,0,0,0,5')
    expect(shooter.ssiScores.s2).toBeNull()
  })

  it('uses today as fallback date when starts is missing', () => {
    const noStarts = { ...ssiMatch, starts: undefined }
    const result = transformMatch(noStarts)
    expect(result.date).toBe(new Date().toISOString().split('T')[0])
  })

  // Edge cases
  it('handles undefined input', () => {
    expect(transformMatch(undefined)).toBeNull()
  })

  it('handles empty object', () => {
    const result = transformMatch({})
    expect(result.id).toBeNaN() // Number(undefined)
    expect(result.name).toBeUndefined()
    expect(result.type).toBe('RESUL Nordic')
    expect(result.status).toBeUndefined()
    expect(result.numberOfStrings).toBe(6) // Default value
    expect(result.roundsPerString).toBe(5) // Default value
    expect(result.squads).toEqual([])
  })

  it('handles match with empty squads array', () => {
    const emptySquads = { ...ssiMatch, squads: [] }
    const result = transformMatch(emptySquads)
    expect(result.squads).toEqual([])
  })

  it('handles match with null squads', () => {
    const nullSquads = { ...ssiMatch, squads: null }
    const result = transformMatch(nullSquads)
    expect(result.squads).toEqual([])
  })

  it('handles squad with null competitors array', () => {
    const noCompetitors = { ...ssiMatch, squads: [{ id: '999', number: 1, competitors: null }] }
    const result = transformMatch(noCompetitors)
    expect(result.squads[0].shooters).toEqual([])
  })

  it('handles squad with empty competitors array', () => {
    const emptyCompetitors = { ...ssiMatch, squads: [{ id: '999', number: 1, competitors: [] }] }
    const result = transformMatch(emptyCompetitors)
    expect(result.squads[0].shooters).toEqual([])
    expect(result.squads[0].maxShooters).toBe(0)
  })

  it('handles competitor with missing optional fields', () => {
    const minimalCompetitor = {
      ...ssiMatch,
      squads: [{
        id: '999',
        competitors: [{
          id: '1',
          first_name: 'John',
          last_name: 'Doe',
          status: 'a',
        }],
      }],
    }
    const result = transformMatch(minimalCompetitor)
    const shooter = result.squads[0].shooters[0]
    expect(shooter.number).toBe(0)
    expect(shooter.division).toBe('')
    expect(shooter.totPoints).toBe(0)
    expect(shooter.totHits).toBe(0)
    expect(shooter.isVerified).toBe(false)
    expect(shooter.isScoringStarted).toBe(false)
  })

  it('handles competitor with only weapon_group in division', () => {
    const weaponOnly = {
      ...ssiMatch,
      squads: [{
        id: '999',
        competitors: [{
          id: '1',
          first_name: 'John',
          last_name: 'Doe',
          status: 'a',
          weapon_group: 'Rifle',
          category: null,
          classification: null,
        }],
      }],
    }
    const result = transformMatch(weaponOnly)
    expect(result.squads[0].shooters[0].division).toBe('Rifle')
  })

  it('handles competitor with all division fields', () => {
    const allFields = {
      ...ssiMatch,
      squads: [{
        id: '999',
        competitors: [{
          id: '1',
          first_name: 'John',
          last_name: 'Doe',
          status: 'a',
          weapon_group: 'Rifle',
          category: 'Open',
          classification: 'A',
        }],
      }],
    }
    const result = transformMatch(allFields)
    expect(result.squads[0].shooters[0].division).toBe('Rifle · Open · A')
  })

  it('handles match with string id', () => {
    const stringId = { ...ssiMatch, id: '12345' }
    const result = transformMatch(stringId)
    expect(result.id).toBe(12345)
    expect(typeof result.id).toBe('number')
  })

  it('handles match with number_of_strings missing', () => {
    const noStrings = { ...ssiMatch, number_of_strings: undefined }
    const result = transformMatch(noStrings)
    expect(result.numberOfStrings).toBe(6) // Default value
  })

  it('handles match with number_of_rounds_per_string missing', () => {
    const noRounds = { ...ssiMatch, number_of_rounds_per_string: undefined }
    const result = transformMatch(noRounds)
    expect(result.roundsPerString).toBe(5) // Default value
  })

  it('handles squad with missing comment', () => {
    const noComment = {
      ...ssiMatch,
      squads: [{ ...ssiMatch.squads[0], comment: undefined }],
    }
    const result = transformMatch(noComment)
    expect(result.squads[0].comment).toBe('')
  })

  it('handles multiple competitor statuses correctly', () => {
    const multiStatus = {
      ...ssiMatch,
      squads: [{
        id: '999',
        competitors: [
          { id: '1', first_name: 'A', last_name: 'Active', status: 'a' },
          { id: '2', first_name: 'D', last_name: 'Declined', status: 'd' },
          { id: '3', first_name: 'P', last_name: 'Pending', status: 'p' },
          { id: '4', first_name: 'W', last_name: 'Withdrawn', status: 'w' },
        ],
      }],
    }
    const result = transformMatch(multiStatus)
    expect(result.squads[0].shooters).toHaveLength(1)
    expect(result.squads[0].shooters[0].name).toBe('A Active')
  })
})

describe('transformMatchListItem', () => {
  it('transforms a cup component match', () => {
    const ssiMatch = {
      id: '1850',
      name: 'Kupittaa 14.02.2026 Pika',
      starts: '2026-02-14T07:00:00+00:00',
      status: 'on',
    }
    const result = transformMatchListItem(ssiMatch)
    expect(result.id).toBe(1850)
    expect(result.name).toBe('Kupittaa 14.02.2026 Pika')
    expect(result.date).toBe('2026-02-14')
    expect(result.status).toBe('on')
    expect(result.type).toBe('RESUL Nordic')
    expect(result.squads).toEqual([])
  })
})

describe('buildScoresFromSSI', () => {
  it('builds empty scores for shooter with no SSI data', () => {
    const shooter = { ssiScores: {} }
    const scores = buildScoresFromSSI(shooter, 6)
    expect(Object.keys(scores)).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      expect(scores[i].X).toBe(0)
      expect(scores[i].M).toBe(0)
    }
  })

  it('builds scores from existing SSI data', () => {
    const shooter = {
      ssiScores: {
        s1: '1,2,1,0,1,0,0,0,0,0,0,0,5',
        s2: '0,0,0,0,0,0,0,0,0,0,0,5,5',
        s3: null,
        s4: null,
        s5: null,
        s6: null,
      },
    }
    const scores = buildScoresFromSSI(shooter, 6)
    expect(scores[0].X).toBe(1)
    expect(scores[0]['10']).toBe(2)
    expect(scores[1].M).toBe(5)
    expect(scores[2].X).toBe(0)
  })

  it('respects custom series count', () => {
    const shooter = { ssiScores: {} }
    const scores = buildScoresFromSSI(shooter, 3)
    expect(Object.keys(scores)).toHaveLength(3)
  })

  // Edge cases
  it('handles null shooter object', () => {
    const scores = buildScoresFromSSI(null, 6)
    expect(Object.keys(scores)).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      expect(scores[i].X).toBe(0)
      expect(scores[i].M).toBe(0)
    }
  })

  it('handles undefined shooter object', () => {
    const scores = buildScoresFromSSI(undefined, 6)
    expect(Object.keys(scores)).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      expect(scores[i].X).toBe(0)
      expect(scores[i].M).toBe(0)
    }
  })

  it('handles shooter without ssiScores property', () => {
    const shooter = { id: 123, name: 'Test Shooter' }
    const scores = buildScoresFromSSI(shooter, 6)
    expect(Object.keys(scores)).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      expect(scores[i].X).toBe(0)
      expect(scores[i].M).toBe(0)
    }
  })

  it('handles ssiScores being null', () => {
    const shooter = { ssiScores: null }
    const scores = buildScoresFromSSI(shooter, 6)
    expect(Object.keys(scores)).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      expect(scores[i].X).toBe(0)
      expect(scores[i].M).toBe(0)
    }
  })

  it('handles mixed valid and invalid score strings', () => {
    const shooter = {
      ssiScores: {
        s1: '1,2,3,0,0,0,0,0,0,0,0,0,5',
        s2: 'invalid,data,here',
        s3: '0,0,0,0,0,0,0,0,0,0,0,5,5',
        s4: '',
        s5: null,
        s6: undefined,
      },
    }
    const scores = buildScoresFromSSI(shooter, 6)
    expect(scores[0].X).toBe(1)
    expect(scores[1].X).toBe(0) // Invalid string becomes all zeros
    expect(scores[2].M).toBe(5)
    expect(scores[3].X).toBe(0) // Empty string becomes all zeros
    expect(scores[4].X).toBe(0) // Null becomes all zeros
    expect(scores[5].X).toBe(0) // Undefined becomes all zeros
  })

  it('handles seriesCount of 0', () => {
    const shooter = { ssiScores: {} }
    const scores = buildScoresFromSSI(shooter, 0)
    expect(Object.keys(scores)).toHaveLength(0)
  })

  it('handles very large seriesCount', () => {
    const shooter = { ssiScores: {} }
    const scores = buildScoresFromSSI(shooter, 100)
    expect(Object.keys(scores)).toHaveLength(100)
    // Spot check a few
    expect(scores[0].X).toBe(0)
    expect(scores[50].X).toBe(0)
    expect(scores[99].X).toBe(0)
  })

  it('handles partial SSI data with some strings present', () => {
    const shooter = {
      ssiScores: {
        s1: '5,0,0,0,0,0,0,0,0,0,0,0,5',
        s3: '0,5,0,0,0,0,0,0,0,0,0,0,5',
      },
    }
    const scores = buildScoresFromSSI(shooter, 6)
    expect(scores[0].X).toBe(5) // s1
    expect(scores[1].X).toBe(0) // s2 missing
    expect(scores[2]['10']).toBe(5) // s3
    expect(scores[3].X).toBe(0) // s4 missing
  })
})

// ============================================================
// Unit tests: API client (fetch mocking)
// ============================================================

describe('API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('login', () => {
    it('sends credentials and returns data on success', async () => {
      const mockResponse = { success: true, hasJwt: true, hasSession: true }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await login('test@test.com', 'pass123', 'apikey')
      expect(result).toEqual(mockResponse)
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: 'test@test.com', password: 'pass123', apiKey: 'apikey' }),
      })
    })

    it('throws on invalid credentials', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid email or password' }),
      })

      await expect(login('bad@test.com', 'wrong', '')).rejects.toThrow('Invalid email or password')
    })

    it('throws on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      await expect(login('a@b.com', 'p', '')).rejects.toThrow('Network error')
    })
  })

  describe('searchCups', () => {
    it('returns cups array on success', async () => {
      const cups = [{ id: '141', name: 'TurRes Kupittaa CUP', starts: '2026-02-14T07:00:00+00:00', status: 'on' }]
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cups }),
      })

      const result = await searchCups('Kupittaa')
      expect(result).toEqual(cups)
      expect(fetch).toHaveBeenCalledWith('/api/cups?search=Kupittaa', { credentials: 'include' })
    })

    it('returns empty array when no cups found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cups: [] }),
      })

      const result = await searchCups('NonExistent')
      expect(result).toEqual([])
    })

    it('throws on server error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      })

      await expect(searchCups('test')).rejects.toThrow('Failed to search cups')
    })
  })

  describe('getCup', () => {
    it('returns cup with matches', async () => {
      const cupData = {
        id: '141',
        name: 'TurRes Kupittaa CUP 14.02.2026',
        matches: [{ id: '1850', name: 'Pika', starts: '2026-02-14T07:00:00+00:00', status: 'on' }],
      }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(cupData),
      })

      const result = await getCup('141')
      expect(result.name).toBe('TurRes Kupittaa CUP 14.02.2026')
      expect(result.matches).toHaveLength(1)
    })
  })

  describe('getMatch', () => {
    it('returns match data', async () => {
      const matchData = { id: '1850', name: 'Pika', squads: [] }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(matchData),
      })

      const result = await getMatch('1850')
      expect(result.id).toBe('1850')
    })

    it('throws on 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Not found' }),
      })

      await expect(getMatch('9999')).rejects.toThrow('Failed to fetch match')
    })
  })

  describe('submitScore', () => {
    it('sends score data correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const scores = { s1: '1,0,0,0,0,0,0,0,0,0,0,4,5' }
      await submitScore('12345', scores, { warning: false, comment: 'test' })

      expect(fetch).toHaveBeenCalledWith('/api/competitor/12345/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scores,
          warning: false,
          dqReason: 'no',
          comment: 'test',
        }),
      })
    })

    it('throws on submission failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Submission failed' }),
      })

      await expect(submitScore('12345', {}, {})).rejects.toThrow('Submission failed')
    })
  })
})
