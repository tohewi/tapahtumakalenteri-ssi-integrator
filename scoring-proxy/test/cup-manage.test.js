// ============================================================
// Cup Management Service Tests
//
// Unit tests for the pure business logic extracted from
// routes/management.js into lib/services/cup-manage.js.
// No HTTP, no Express — just data transformation.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  buildSquaddingOverview,
  attachCupStatuses,
  getIncludedMatchIds,
  filterManageableCups,
  makeShooterKey,
} from '../lib/services/cup-manage.js'

// ============================================================
// filterManageableCups
// ============================================================

describe('filterManageableCups', () => {
  const baseCup = {
    id: '1',
    name: 'Test Cup',
    get_content_type_key: 136,
    status: 'on',
    starts: '2026-03-01T10:00:00Z',
    ends: '2026-03-01T18:00:00Z',
    registration: 'op',
    registration_starts: '2026-01-01T00:00:00Z',
    registration_closes: '2026-02-28T23:59:59Z',
    max_competitors: 25,
    component_matches: [],
  }

  it('includes active cups with registration started', () => {
    const now = new Date('2026-02-15T12:00:00Z')
    const cups = filterManageableCups([baseCup], now)
    expect(cups).toHaveLength(1)
    expect(cups[0].name).toBe('Test Cup')
  })

  it('excludes cups where registration has not started', () => {
    const now = new Date('2025-12-01T12:00:00Z')
    const cups = filterManageableCups([baseCup], now)
    expect(cups).toHaveLength(0)
  })

  it('excludes cups that have ended', () => {
    const now = new Date('2026-03-02T12:00:00Z')
    const cups = filterManageableCups([baseCup], now)
    expect(cups).toHaveLength(0)
  })

  it('uses starts + 24h fallback when no ends date', () => {
    const cupNoEnds = { ...baseCup, ends: null }
    // 12 hours after starts — should still be visible
    const now12h = new Date('2026-03-01T22:00:00Z')
    expect(filterManageableCups([cupNoEnds], now12h)).toHaveLength(1)
    // 25 hours after starts — should be gone
    const now25h = new Date('2026-03-02T11:01:00Z')
    expect(filterManageableCups([cupNoEnds], now25h)).toHaveLength(0)
  })

  it('excludes non-cup events (wrong content type)', () => {
    const match = { ...baseCup, get_content_type_key: 91 }
    const now = new Date('2026-02-15T12:00:00Z')
    expect(filterManageableCups([match], now)).toHaveLength(0)
  })

  it('excludes inactive cups', () => {
    const inactive = { ...baseCup, status: 'off' }
    const now = new Date('2026-02-15T12:00:00Z')
    expect(filterManageableCups([inactive], now)).toHaveLength(0)
  })

  it('excludes cups with no registration_starts', () => {
    const noReg = { ...baseCup, registration_starts: null }
    const now = new Date('2026-02-15T12:00:00Z')
    expect(filterManageableCups([noReg], now)).toHaveLength(0)
  })

  it('calculates registered count and full status', () => {
    const cupWithMatch = {
      ...baseCup,
      max_competitors: 2,
      component_matches: [{
        included: true,
        match: {
          squads: [{
            competitors: [
              { id: 'c1', status: 'a' },
              { id: 'c2', status: 'a' },
            ]
          }]
        }
      }]
    }
    const now = new Date('2026-02-15T12:00:00Z')
    const cups = filterManageableCups([cupWithMatch], now)
    expect(cups[0].registered).toBe(2)
    expect(cups[0].full).toBe(true)
    expect(cups[0].registrationOpen).toBe(false)
  })

  it('sorts cups by start date', () => {
    const cup1 = { ...baseCup, id: '1', starts: '2026-03-10T10:00:00Z', ends: '2026-03-10T18:00:00Z' }
    const cup2 = { ...baseCup, id: '2', starts: '2026-03-05T10:00:00Z', ends: '2026-03-05T18:00:00Z' }
    const now = new Date('2026-02-15T12:00:00Z')
    const cups = filterManageableCups([cup1, cup2], now)
    expect(cups[0].id).toBe('2')
    expect(cups[1].id).toBe('1')
  })
})

// ============================================================
// getIncludedMatchIds
// ============================================================

describe('getIncludedMatchIds', () => {
  it('returns included match IDs and names', () => {
    const event = {
      component_matches: [
        { included: true, match: { id: 'm1', name: 'Match 1' } },
        { included: false, match: { id: 'm2', name: 'Match 2' } },
        { included: true, match: { id: 'm3', name: 'Match 3' } },
        { included: true, match: null },
      ]
    }
    const result = getIncludedMatchIds(event)
    expect(result).toEqual([
      { id: 'm1', name: 'Match 1' },
      { id: 'm3', name: 'Match 3' },
    ])
  })

  it('returns empty array when no component_matches', () => {
    expect(getIncludedMatchIds({})).toEqual([])
  })
})

// ============================================================
// buildSquaddingOverview
// ============================================================

describe('buildSquaddingOverview', () => {
  const cupData = {
    competitors: [
      { id: 'cp1', status: 'a', email: 'alice@ex.com', shooter: { first_name: 'Alice', last_name: 'A', email: 'alice@ex.com' } },
      { id: 'cp2', status: 'a', email: 'bob@ex.com', shooter: { first_name: 'Bob', last_name: 'B', email: 'bob@ex.com' } },
      { id: 'cp3', status: 'p', email: 'pending@ex.com', shooter: { first_name: 'Pending', last_name: 'P', email: 'pending@ex.com' } },
    ],
    component_matches: [{
      number: 1,
      included: true,
      match: {
        id: 'm1',
        name: 'Match 1',
        competitors: [
          { id: 'mc1', status: 'a', first_name: 'Alice', last_name: 'A', email: 'alice@ex.com' },
          { id: 'mc2', status: 'a', first_name: 'Bob', last_name: 'B', email: 'bob@ex.com' },
        ],
        squads: [{
          number: 1,
          comment: 'Squad One',
          max_competitors: 10,
          competitors: [
            { id: 'mc1', status: 'a', first_name: 'Alice', last_name: 'A', email: 'alice@ex.com' },
          ]
        }]
      }
    }]
  }

  it('builds matches with squads and participants', () => {
    const result = buildSquaddingOverview(cupData)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].squads[0].name).toBe('Squad One')
    expect(result.matches[0].squads[0].shooters).toHaveLength(1)
    expect(result.matches[0].allParticipants).toHaveLength(2)
  })

  it('identifies shooters with squad assignments', () => {
    const result = buildSquaddingOverview(cupData)
    // Alice is in squad 1, Bob is unsquadded (null)
    const alice = result.shooters.find(s => s.firstName === 'Alice')
    const bob = result.shooters.find(s => s.firstName === 'Bob')
    expect(alice.matches['m1']).toBe(1)
    expect(bob.matches['m1']).toBeNull()
  })

  it('identifies cup-only participants (not in any match)', () => {
    // Add a cup participant not in any match
    const cupWithExtra = {
      ...cupData,
      competitors: [
        ...cupData.competitors,
        { id: 'cp4', status: 'a', email: 'extra@ex.com', shooter: { first_name: 'Extra', last_name: 'E', email: 'extra@ex.com' } },
      ]
    }
    const result = buildSquaddingOverview(cupWithExtra)
    expect(result.cupOnly).toHaveLength(1)
    expect(result.cupOnly[0].firstName).toBe('Extra')
  })

  it('tracks pending shooters from cup', () => {
    const result = buildSquaddingOverview(cupData)
    expect(result.pendingShooters).toHaveLength(1)
    expect(result.pendingShooters[0].firstName).toBe('Pending')
    expect(result.pendingShooters[0].inCup).toBe(true)
  })

  it('handles empty cup data gracefully', () => {
    const result = buildSquaddingOverview({ competitors: [], component_matches: [] })
    expect(result.matches).toEqual([])
    expect(result.shooters).toEqual([])
    expect(result.cupOnly).toEqual([])
    expect(result.matchOnly).toEqual([])
    expect(result.pendingShooters).toEqual([])
  })
})

// ============================================================
// attachCupStatuses
// ============================================================

describe('attachCupStatuses', () => {
  it('attaches paid and DNS status to shooters', () => {
    const shooters = [{ name: 'Alice A', firstName: 'Alice', lastName: 'A' }]
    const cupOnly = [{ name: 'Bob B', firstName: 'Bob', lastName: 'B' }]
    const cupCompetitors = [
      { id: 'cp1', status: 'a', shooter: { first_name: 'Alice', last_name: 'A' } },
      { id: 'cp2', status: 'a', shooter: { first_name: 'Bob', last_name: 'B' } },
    ]
    const statuses = new Map([
      ['cp1', { paid: true, didNotShow: false }],
      ['cp2', { paid: false, didNotShow: true }],
    ])

    const result = attachCupStatuses(shooters, cupOnly, cupCompetitors, statuses)
    expect(result.shootersWithStatus[0].paid).toBe(true)
    expect(result.shootersWithStatus[0].didNotShow).toBe(false)
    expect(result.cupOnlyWithStatus[0].paid).toBe(false)
    expect(result.cupOnlyWithStatus[0].didNotShow).toBe(true)
  })

  it('defaults to false when no status data', () => {
    const shooters = [{ name: 'Alice A', firstName: 'Alice', lastName: 'A' }]
    const result = attachCupStatuses(shooters, [], [], new Map())
    expect(result.shootersWithStatus[0].paid).toBe(false)
    expect(result.shootersWithStatus[0].didNotShow).toBe(false)
    expect(result.shootersWithStatus[0].cupParticipantId).toBeNull()
  })
})

// ============================================================
// makeShooterKey
// ============================================================

describe('makeShooterKey', () => {
  it('creates consistent key from name and email', () => {
    const key = makeShooterKey('Alice', 'A', 'alice@ex.com')
    expect(key).toBe('Alice|||A|||alice@ex.com')
  })

  it('creates unique error key when email is missing', () => {
    const key1 = makeShooterKey('Alice', 'A', '')
    const key2 = makeShooterKey('Alice', 'A', '')
    expect(key1).toContain('ERROR_NO_EMAIL')
    expect(key1).not.toBe(key2) // Each call produces unique key
  })
})
