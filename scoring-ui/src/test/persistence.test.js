import { describe, it, expect, beforeEach } from 'vitest'

// ============================================================
// localStorage persistence tests
// ============================================================

const LS_KEYS = {
  CREDS: 'ssi_credentials',
  CUP: 'ssi_last_cup',
  SCORES: 'ssi_scores',
  NAV: 'ssi_nav_state',
}

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ }
}

beforeEach(() => {
  localStorage.clear()
})

describe('Credential persistence', () => {
  it('stores credentials in localStorage', () => {
    const creds = { email: 'test@test.com', password: 'pass', apiKey: 'key123' }
    lsSet(LS_KEYS.CREDS, creds)
    expect(lsGet(LS_KEYS.CREDS)).toEqual(creds)
  })

  it('returns null when no credentials stored', () => {
    expect(lsGet(LS_KEYS.CREDS)).toBeNull()
  })

  it('clears credentials on remove', () => {
    lsSet(LS_KEYS.CREDS, { email: 'a@b.com', password: 'p', apiKey: '' })
    localStorage.removeItem(LS_KEYS.CREDS)
    expect(lsGet(LS_KEYS.CREDS)).toBeNull()
  })
})

describe('Cup persistence', () => {
  it('stores last selected cup', () => {
    const cup = { id: '141', name: 'TurRes Kupittaa CUP 14.02.2026' }
    lsSet(LS_KEYS.CUP, cup)
    expect(lsGet(LS_KEYS.CUP)).toEqual(cup)
  })

  it('overwrites previous cup on new selection', () => {
    lsSet(LS_KEYS.CUP, { id: '141', name: 'Cup A' })
    lsSet(LS_KEYS.CUP, { id: '142', name: 'Cup B' })
    expect(lsGet(LS_KEYS.CUP).id).toBe('142')
  })
})

describe('Score persistence', () => {
  it('stores scores keyed by match_squad', () => {
    const scores = {
      '1850_4143': {
        12345: {
          0: { X: 1, '10': 2, '9': 1, '8': 0, '7': 1, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 },
          1: { X: 0, '10': 0, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, M: 0 },
        },
      },
    }
    lsSet(LS_KEYS.SCORES, scores)
    const restored = lsGet(LS_KEYS.SCORES)
    expect(restored['1850_4143'][12345][0].X).toBe(1)
    expect(restored['1850_4143'][12345][0]['10']).toBe(2)
  })

  it('supports multiple match_squad keys', () => {
    const scores = {
      '1850_4143': { 12345: { 0: { X: 1 } } },
      '1851_4144': { 12346: { 0: { X: 3 } } },
    }
    lsSet(LS_KEYS.SCORES, scores)
    const restored = lsGet(LS_KEYS.SCORES)
    expect(Object.keys(restored)).toHaveLength(2)
    expect(restored['1851_4144'][12346][0].X).toBe(3)
  })
})

describe('Navigation state persistence', () => {
  it('stores full navigation state', () => {
    const nav = {
      view: 'scoring',
      cupId: '141',
      matchId: 1850,
      squadId: 4143,
      shooterId: 12345,
      activeSeries: 2,
    }
    lsSet(LS_KEYS.NAV, nav)
    expect(lsGet(LS_KEYS.NAV)).toEqual(nav)
  })

  it('restores view correctly', () => {
    lsSet(LS_KEYS.NAV, { view: 'series', cupId: '141', matchId: 1850, squadId: 4143, shooterId: null, activeSeries: 0 })
    expect(lsGet(LS_KEYS.NAV).view).toBe('series')
  })

  it('handles all view states', () => {
    const views = ['cup', 'match', 'squad', 'series', 'scoring']
    for (const view of views) {
      lsSet(LS_KEYS.NAV, { view })
      expect(lsGet(LS_KEYS.NAV).view).toBe(view)
    }
  })
})

describe('Logout clears session state but keeps credentials', () => {
  it('removes session keys but preserves credentials on logout', () => {
    lsSet(LS_KEYS.CREDS, { email: 'a@b.com', password: 'p', apiKey: '' })
    lsSet(LS_KEYS.CUP, { id: '141', name: 'Cup' })
    lsSet(LS_KEYS.SCORES, { '1850_4143': {} })
    lsSet(LS_KEYS.NAV, { view: 'scoring' })

    // Simulate logout — credentials persist for remember-me pre-fill
    localStorage.removeItem(LS_KEYS.CUP)
    localStorage.removeItem(LS_KEYS.SCORES)
    localStorage.removeItem(LS_KEYS.NAV)

    expect(lsGet(LS_KEYS.CREDS)).toEqual({ email: 'a@b.com', password: 'p', apiKey: '' })
    expect(lsGet(LS_KEYS.CUP)).toBeNull()
    expect(lsGet(LS_KEYS.SCORES)).toBeNull()
    expect(lsGet(LS_KEYS.NAV)).toBeNull()
  })
})
