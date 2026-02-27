// ============================================================
// Unit tests for SSI Core — Seed Event Import
//
// Tests the discovery logic, query building, URL parsing,
// squad type inference, and snapshot construction.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseSsiEventUrl,
  buildStructureQuery,
  SERIE_TYPE_FIELDS,
  SQUAD_TYPE_FIELDS,
  EVENT_TO_SQUAD_TYPE,
} from '../lib/ssi-core/seed-import.js'

// ============================================================
// parseSsiEventUrl
// ============================================================

describe('parseSsiEventUrl', () => {
  it('parses a standard SSI event URL', () => {
    const result = parseSsiEventUrl('https://shootnscoreit.com/event/136/160/')
    expect(result).toEqual({ contentType: '136', eventId: '160' })
  })

  it('parses URL without trailing slash', () => {
    const result = parseSsiEventUrl('https://shootnscoreit.com/event/91/42')
    expect(result).toEqual({ contentType: '91', eventId: '42' })
  })

  it('parses URL with extra path segments', () => {
    const result = parseSsiEventUrl('https://shootnscoreit.com/event/136/160/details/')
    expect(result).toEqual({ contentType: '136', eventId: '160' })
  })

  it('throws on invalid URL — no event path', () => {
    expect(() => parseSsiEventUrl('https://shootnscoreit.com/dashboard/'))
      .toThrow('Invalid SSI event URL')
  })

  it('throws on non-SSI URL', () => {
    expect(() => parseSsiEventUrl('https://example.com/event/136/160/'))
      .toThrow('Invalid SSI event URL')
  })

  it('throws on empty string', () => {
    expect(() => parseSsiEventUrl(''))
      .toThrow('Invalid SSI event URL')
  })

  it('throws on URL with non-numeric IDs', () => {
    expect(() => parseSsiEventUrl('https://shootnscoreit.com/event/abc/def/'))
      .toThrow('Invalid SSI event URL')
  })
})

// ============================================================
// buildStructureQuery — Cup (Serie) queries
// ============================================================

describe('buildStructureQuery — Cup', () => {
  it('generates correct query for NordicSerie cup', () => {
    const query = buildStructureQuery(true, 'NordicSerieNode', 'NordicResulMatchNode', 'NordicSquadNode')

    // Should have NordicSerieNode inline fragment with type-specific fields
    expect(query).toContain('... on NordicSerieNode { scoring_mode match_registration_mode timezone }')

    // Should have component_matches with match-type inline fragment for squads
    expect(query).toContain('component_matches')
    expect(query).toContain('... on NordicResulMatchNode {')
    expect(query).toContain('squads {')

    // Should have squad inline fragment with name, starts, competitors
    expect(query).toContain('... on NordicSquadNode { name starts competitors { id } }')

    // Should NOT have event-level squads (cups don't have squads)
    // Count occurrences: squads should only appear inside component_matches
    const eventLevel = query.split('event(content_type')[1]
    const topLevelSquads = eventLevel.split('component_matches')[0]
    expect(topLevelSquads).not.toContain('squads')
  })

  it('includes common EventInterface fields', () => {
    const query = buildStructureQuery(true, 'NordicSerieNode', 'NordicResulMatchNode', 'NordicSquadNode')

    const commonFields = ['id', 'name', 'starts', 'ends', 'status', 'rule',
      'description', 'information', 'venue', 'url', 'url_display',
      'max_competitors', 'region', 'visibility', 'registration', 'results', 'currency']

    for (const field of commonFields) {
      expect(query).toContain(field)
    }
  })

  it('includes component_matches fields', () => {
    const query = buildStructureQuery(true, 'NordicSerieNode', 'NordicResulMatchNode', 'NordicSquadNode')

    expect(query).toContain('get_content_type_key')
    expect(query).toContain('description')
    expect(query).toContain('information')
  })

  it('uses $id as String! not ID!', () => {
    const query = buildStructureQuery(true, 'NordicSerieNode', 'NordicResulMatchNode', 'NordicSquadNode')
    expect(query).toContain('$id: String!')
    expect(query).not.toContain('$id: ID!')
  })

  it('handles null matchTypeName gracefully — no inline fragment for squads', () => {
    const query = buildStructureQuery(true, 'NordicSerieNode', null, 'NordicSquadNode')

    // Should still have component_matches but without match-type inline fragment
    expect(query).toContain('component_matches')
    expect(query).not.toContain('... on null')
  })

  it('generates correct query for PrecisionSerie cup', () => {
    const query = buildStructureQuery(true, 'PrecisionSerieNode', 'PrecisionMatchNode', 'PrecisionSquadNode')

    expect(query).toContain('... on PrecisionSerieNode { scoring_mode match_registration_mode timezone }')
    expect(query).toContain('... on PrecisionMatchNode {')
    expect(query).toContain('... on PrecisionSquadNode { name starts competitors { id } }')
  })

  it('generates correct query for IpscSerie cup — no scoring_mode', () => {
    const query = buildStructureQuery(true, 'IpscSerieNode', 'IpscMatchNode', 'GenericSquadNode')

    expect(query).toContain('... on IpscSerieNode { match_registration_mode timezone }')
    expect(query).not.toContain('scoring_mode')
    expect(query).toContain('... on GenericSquadNode { name starts }')
  })
})

// ============================================================
// buildStructureQuery — Standalone match queries
// ============================================================

describe('buildStructureQuery — Standalone Match', () => {
  it('generates event-level squads for standalone match', () => {
    const query = buildStructureQuery(false, 'NordicSerieNode', null, 'NordicSquadNode')

    // Should have squads at event level
    expect(query).toContain('squads {')
    expect(query).toContain('... on NordicSquadNode { name starts competitors { id } }')

    // Should NOT have component_matches
    expect(query).not.toContain('component_matches')
  })

  it('handles unknown event type — no serie fragment', () => {
    const query = buildStructureQuery(false, 'UnknownSerieNode', null, 'GenericSquadNode')

    // No inline fragment for unknown type (empty serieFields)
    expect(query).not.toContain('... on UnknownSerieNode')
    // But still has squads
    expect(query).toContain('squads {')
    expect(query).toContain('... on GenericSquadNode { name starts }')
  })
})

// ============================================================
// EVENT_TO_SQUAD_TYPE — Squad type inference
// ============================================================

describe('EVENT_TO_SQUAD_TYPE', () => {
  it('maps Nordic event types to NordicSquadNode', () => {
    expect(EVENT_TO_SQUAD_TYPE['NordicSerieNode']).toBe('NordicSquadNode')
    expect(EVENT_TO_SQUAD_TYPE['NordicResulMatchNode']).toBe('NordicSquadNode')
  })

  it('maps Precision event types to PrecisionSquadNode', () => {
    expect(EVENT_TO_SQUAD_TYPE['PrecisionSerieNode']).toBe('PrecisionSquadNode')
    expect(EVENT_TO_SQUAD_TYPE['PrecisionMatchNode']).toBe('PrecisionSquadNode')
  })

  it('maps IPSC and PPC to GenericSquadNode', () => {
    expect(EVENT_TO_SQUAD_TYPE['IpscSerieNode']).toBe('GenericSquadNode')
    expect(EVENT_TO_SQUAD_TYPE['PpcSerieNode']).toBe('GenericSquadNode')
  })

  it('returns undefined for unknown type — caller should use fallback', () => {
    expect(EVENT_TO_SQUAD_TYPE['UnknownNode']).toBeUndefined()
  })

  // Business rule: matchTypeName takes precedence over eventTypeName
  it('match type takes precedence for squad inference', () => {
    const matchType = 'NordicResulMatchNode'
    const eventType = 'NordicSerieNode'
    const inferred = EVENT_TO_SQUAD_TYPE[matchType] || EVENT_TO_SQUAD_TYPE[eventType] || 'GenericSquadNode'
    expect(inferred).toBe('NordicSquadNode')
  })

  it('falls back to eventType when matchType is null', () => {
    const matchType = null
    const eventType = 'NordicSerieNode'
    const inferred = EVENT_TO_SQUAD_TYPE[matchType] || EVENT_TO_SQUAD_TYPE[eventType] || 'GenericSquadNode'
    expect(inferred).toBe('NordicSquadNode')
  })

  it('falls back to GenericSquadNode when both are unknown', () => {
    const matchType = null
    const eventType = 'UnknownNode'
    const inferred = EVENT_TO_SQUAD_TYPE[matchType] || EVENT_TO_SQUAD_TYPE[eventType] || 'GenericSquadNode'
    expect(inferred).toBe('GenericSquadNode')
  })
})

// ============================================================
// SERIE_TYPE_FIELDS — Type-specific field mapping
// ============================================================

describe('SERIE_TYPE_FIELDS', () => {
  it('NordicSerieNode has scoring_mode, match_registration_mode, timezone', () => {
    expect(SERIE_TYPE_FIELDS['NordicSerieNode']).toContain('scoring_mode')
    expect(SERIE_TYPE_FIELDS['NordicSerieNode']).toContain('match_registration_mode')
    expect(SERIE_TYPE_FIELDS['NordicSerieNode']).toContain('timezone')
  })

  it('IpscSerieNode has match_registration_mode and timezone but not scoring_mode', () => {
    expect(SERIE_TYPE_FIELDS['IpscSerieNode']).toContain('match_registration_mode')
    expect(SERIE_TYPE_FIELDS['IpscSerieNode']).toContain('timezone')
    expect(SERIE_TYPE_FIELDS['IpscSerieNode']).not.toContain('scoring_mode')
  })
})

// ============================================================
// SQUAD_TYPE_FIELDS — Squad field mapping
// ============================================================

describe('SQUAD_TYPE_FIELDS', () => {
  it('NordicSquadNode includes competitors', () => {
    expect(SQUAD_TYPE_FIELDS['NordicSquadNode']).toContain('competitors { id }')
    expect(SQUAD_TYPE_FIELDS['NordicSquadNode']).toContain('name')
    expect(SQUAD_TYPE_FIELDS['NordicSquadNode']).toContain('starts')
  })

  it('GenericSquadNode has name and starts only', () => {
    expect(SQUAD_TYPE_FIELDS['GenericSquadNode']).toBe('name starts')
  })

  it('CmpSquadNode has name and starts only — no competitors', () => {
    expect(SQUAD_TYPE_FIELDS['CmpSquadNode']).toBe('name starts')
    expect(SQUAD_TYPE_FIELDS['CmpSquadNode']).not.toContain('competitors')
  })
})

// ============================================================
// Business rule: Cups don't have squads
// ============================================================

describe('Business rule: Cup vs Match squad access', () => {
  it('Cup query does NOT include event-level squads block', () => {
    const query = buildStructureQuery(true, 'NordicSerieNode', 'NordicResulMatchNode', 'NordicSquadNode')

    // Split at component_matches to check what comes after it at event level
    // The query structure should be: event { ...fields, ...serieFragment, component_matches {...}, NO squads }
    const afterMatches = query.split(/\}\s*\n\s*\}$/m)
    // Verify no standalone "squads {" at event level (only inside component_matches)
    const lines = query.split('\n')
    let depth = 0
    let foundEventSquads = false
    for (const line of lines) {
      if (line.includes('event(content_type')) depth = 1
      if (line.includes('component_matches')) depth = 2
      if (depth === 1 && line.trim().startsWith('squads {')) foundEventSquads = true
      if (line.trim() === '}') depth = Math.max(0, depth - 1)
    }
    expect(foundEventSquads).toBe(false)
  })

  it('Match query includes event-level squads block', () => {
    const query = buildStructureQuery(false, 'NordicSerieNode', null, 'NordicSquadNode')
    expect(query).toContain('squads {')
    expect(query).not.toContain('component_matches')
  })
})
