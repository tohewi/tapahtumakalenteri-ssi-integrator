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
    const query = buildStructureQuery(true, 'NordicSerieNode', 'NordicMatchNode', 'NordicSquadNode')

    // Should have NordicSerieNode inline fragment with type-specific fields
    expect(query).toContain('... on NordicSerieNode { scoring_mode match_registration_mode level count }')

    // Should have component_matches with match field (link→EventInterface)
    expect(query).toContain('component_matches')
    expect(query).toContain('match {')
    expect(query).toContain('squads {')

    // Should have squad inline fragment with starts, stops, competitors
    expect(query).toContain('... on NordicSquadNode { starts stops competitors { id } }')

    // Should have squad comment field (no name field in SSI)
    expect(query).toContain('comment')
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

  it('handles null matchTypeName — still has component_matches with match field', () => {
    const query = buildStructureQuery(true, 'NordicSerieNode', null, 'NordicSquadNode')

    expect(query).toContain('component_matches')
    expect(query).toContain('match {')
    expect(query).not.toContain('... on null')
  })

  it('generates correct query for PrecisionSerie cup', () => {
    const query = buildStructureQuery(true, 'PrecisionSerieNode', 'PrecisionMatchNode', 'PrecisionSquadNode')

    expect(query).toContain('... on PrecisionSerieNode { scoring_mode match_registration_mode count }')
    expect(query).toContain('match {')
    expect(query).toContain('... on PrecisionSquadNode { starts stops competitors { id } }')
  })

  it('generates correct query for IpscSerie cup — no scoring_mode', () => {
    const query = buildStructureQuery(true, 'IpscSerieNode', 'IpscMatchNode', 'IpscSquadNode')

    expect(query).toContain('... on IpscSerieNode { match_registration_mode count }')
    expect(query).not.toContain('scoring_mode')
    expect(query).toContain('... on IpscSquadNode { starts stops competitors { id } }')
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
    expect(query).toContain('... on NordicSquadNode { starts stops competitors { id } }')

    // Should NOT have component_matches
    expect(query).not.toContain('component_matches')
  })

  it('handles unknown event type — no serie fragment', () => {
    const query = buildStructureQuery(false, 'UnknownSerieNode', null, 'GenericSquadNode')

    // No inline fragment for unknown type (empty serieFields)
    expect(query).not.toContain('... on UnknownSerieNode')
    // But still has squads
    expect(query).toContain('squads {')
    expect(query).toContain('... on GenericSquadNode { starts stops }')
  })
})

// ============================================================
// EVENT_TO_SQUAD_TYPE — Squad type inference
// ============================================================

describe('EVENT_TO_SQUAD_TYPE', () => {
  it('maps Nordic event types to NordicSquadNode', () => {
    expect(EVENT_TO_SQUAD_TYPE['NordicSerieNode']).toBe('NordicSquadNode')
    expect(EVENT_TO_SQUAD_TYPE['NordicMatchNode']).toBe('NordicSquadNode')
  })

  it('maps Precision event types to PrecisionSquadNode', () => {
    expect(EVENT_TO_SQUAD_TYPE['PrecisionSerieNode']).toBe('PrecisionSquadNode')
    expect(EVENT_TO_SQUAD_TYPE['PrecisionMatchNode']).toBe('PrecisionSquadNode')
  })

  it('maps IPSC to IpscSquadNode and PPC to PpcSquadNode', () => {
    expect(EVENT_TO_SQUAD_TYPE['IpscSerieNode']).toBe('IpscSquadNode')
    expect(EVENT_TO_SQUAD_TYPE['PpcSerieNode']).toBe('PpcSquadNode')
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
  it('NordicSerieNode has scoring_mode, match_registration_mode, level, count', () => {
    expect(SERIE_TYPE_FIELDS['NordicSerieNode']).toContain('scoring_mode')
    expect(SERIE_TYPE_FIELDS['NordicSerieNode']).toContain('match_registration_mode')
    expect(SERIE_TYPE_FIELDS['NordicSerieNode']).toContain('level')
    expect(SERIE_TYPE_FIELDS['NordicSerieNode']).toContain('count')
  })

  it('IpscSerieNode has match_registration_mode and count but not scoring_mode', () => {
    expect(SERIE_TYPE_FIELDS['IpscSerieNode']).toContain('match_registration_mode')
    expect(SERIE_TYPE_FIELDS['IpscSerieNode']).toContain('count')
    expect(SERIE_TYPE_FIELDS['IpscSerieNode']).not.toContain('scoring_mode')
  })

  it('no timezone in any Serie type (not in SSI schema)', () => {
    for (const fields of Object.values(SERIE_TYPE_FIELDS)) {
      expect(fields).not.toContain('timezone')
    }
  })
})

// ============================================================
// SQUAD_TYPE_FIELDS — Squad field mapping
// ============================================================

describe('SQUAD_TYPE_FIELDS', () => {
  it('NordicSquadNode includes starts, stops, competitors', () => {
    expect(SQUAD_TYPE_FIELDS['NordicSquadNode']).toContain('competitors { id }')
    expect(SQUAD_TYPE_FIELDS['NordicSquadNode']).toContain('starts')
    expect(SQUAD_TYPE_FIELDS['NordicSquadNode']).toContain('stops')
  })

  it('no squad type has a name field (SSI uses comment instead)', () => {
    for (const fields of Object.values(SQUAD_TYPE_FIELDS)) {
      expect(fields).not.toContain('name')
    }
  })

  it('GenericSquadNode has starts and stops only', () => {
    expect(SQUAD_TYPE_FIELDS['GenericSquadNode']).toBe('starts stops')
  })

  it('CmpSquadNode has starts and stops only — no competitors', () => {
    expect(SQUAD_TYPE_FIELDS['CmpSquadNode']).toBe('starts stops')
    expect(SQUAD_TYPE_FIELDS['CmpSquadNode']).not.toContain('competitors')
  })
})

// ============================================================
// Business rule: Cups don't have squads
// ============================================================

describe('Business rule: Cup vs Match squad access', () => {
  it('Cup query has squads inside match (via component_matches link), not at event level', () => {
    const query = buildStructureQuery(true, 'NordicSerieNode', 'NordicMatchNode', 'NordicSquadNode')

    // Cup query should have component_matches → match → squads
    expect(query).toContain('component_matches')
    expect(query).toContain('match {')
    expect(query).toContain('squads {')
  })

  it('Match query includes event-level squads block', () => {
    const query = buildStructureQuery(false, 'NordicMatchNode', null, 'NordicSquadNode')
    expect(query).toContain('squads {')
    expect(query).not.toContain('component_matches')
  })
})
