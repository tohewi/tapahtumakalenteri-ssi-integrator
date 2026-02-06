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
