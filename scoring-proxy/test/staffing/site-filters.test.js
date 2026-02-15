import { describe, it, expect } from 'vitest'
import {
  normalizeSiteKey,
  resolveSearchStrings,
  resolveEventTypes,
  isFutureOnlyEnabled,
  parseDateRange,
  matchesEventType,
  matchesEventFilters,
} from '../../lib/staffing/site-filters.js'

describe('staffing site filter helpers', () => {
  describe('normalizeSiteKey', () => {
    it('normalizes valid keys to lowercase', () => {
      expect(normalizeSiteKey('Temppeli-SRA')).toBe('temppeli-sra')
    })

    it('returns fallback for invalid keys', () => {
      expect(normalizeSiteKey('temppeli sra', 'sra-training')).toBe('sra-training')
    })

    it('returns fallback for empty values', () => {
      expect(normalizeSiteKey('', 'sra-training')).toBe('sra-training')
      expect(normalizeSiteKey(null, 'sra-training')).toBe('sra-training')
    })
  })

  describe('resolveEventTypes', () => {
    it('prefers explicit event_type filter over fallback config event types', () => {
      const filters = [
        { type: 'event_type', value: 'cup' },
      ]
      const fallback = ['match']

      expect(resolveEventTypes(filters, fallback)).toEqual(['cup'])
    })

    it('supports event_kind alias and comma-separated values', () => {
      const filters = [
        { type: 'event_kind', value: 'cup,league,invalid' },
      ]

      expect(resolveEventTypes(filters, [])).toEqual(['cup', 'league'])
    })

    it('uses fallback event types when no explicit event filters exist', () => {
      expect(resolveEventTypes([], ['match', 'cup', 'match'])).toEqual(['match', 'cup'])
    })
  })

  describe('resolveSearchStrings', () => {
    it('prefers name_contains filter values over fallback search strings', () => {
      const filters = [
        { type: 'name_contains', value: 'Temppeli' },
        { type: 'cup_id', value: '123' },
      ]
      const fallback = ['Fallback Search']

      expect(resolveSearchStrings(filters, fallback)).toEqual(['Temppeli'])
    })

    it('uses fallback search strings when no name filters exist', () => {
      const filters = [{ type: 'cup_id', value: '123' }]
      const fallback = ['SRA', 'SRA', 'Shotgun']

      expect(resolveSearchStrings(filters, fallback)).toEqual(['SRA', 'Shotgun'])
    })
  })

  describe('isFutureOnlyEnabled', () => {
    it('defaults to true when no filters exist', () => {
      expect(isFutureOnlyEnabled([])).toBe(true)
    })

    it('returns false when any filter has futureOnly=false', () => {
      const filters = [
        { type: 'name_contains', value: 'Temppeli', futureOnly: true },
        { type: 'cup_id', value: '123', futureOnly: false },
      ]

      expect(isFutureOnlyEnabled(filters)).toBe(false)
    })
  })

  describe('parseDateRange', () => {
    it('parses start:end date range string', () => {
      const range = parseDateRange('2026-01-01:2026-12-31')

      expect(range).toBeTruthy()
      expect(range.start).toBeInstanceOf(Date)
      expect(range.end).toBeInstanceOf(Date)
      expect(range.start.toISOString()).toContain('2026-01-01')
      expect(range.end.toISOString()).toContain('2026-12-31')
    })

    it('parses json object format', () => {
      const range = parseDateRange({ start: '2026-01-01', end: '2026-06-30' })

      expect(range).toBeTruthy()
      expect(range.start.toISOString()).toContain('2026-01-01')
      expect(range.end.toISOString()).toContain('2026-06-30')
    })
  })

  describe('matchesEventFilters', () => {
    it('matches by name_contains filter', () => {
      const event = { id: '1', name: 'Temppeli SRA harjoitus', starts: '2026-05-01T09:00:00.000Z' }
      const filters = [{ type: 'name_contains', value: 'temppeli' }]

      expect(matchesEventFilters(event, filters)).toBe(true)
    })

    it('matches by cup_id filter against event id', () => {
      const event = { id: '1234', name: 'Any Event', starts: '2026-05-01T09:00:00.000Z' }
      const filters = [{ type: 'cup_id', value: '1234' }]

      expect(matchesEventFilters(event, filters)).toBe(true)
    })

    it('matches when any filter matches (OR semantics)', () => {
      const event = { id: '1234', name: 'Kupittaa SRA', starts: '2026-05-01T09:00:00.000Z' }
      const filters = [
        { type: 'cup_id', value: '9999' },
        { type: 'name_contains', value: 'kupittaa' },
      ]

      expect(matchesEventFilters(event, filters)).toBe(true)
    })

    it('returns false when no filter matches', () => {
      const event = { id: '1234', name: 'Kupittaa SRA', starts: '2026-05-01T09:00:00.000Z' }
      const filters = [
        { type: 'cup_id', value: '9999' },
        { type: 'name_contains', value: 'temppeli' },
      ]

      expect(matchesEventFilters(event, filters)).toBe(false)
    })

    it('applies date_range filter boundaries', () => {
      const event = { id: '10', name: 'Range Event', starts: '2026-05-01T00:00:00.000Z' }
      const filters = [{ type: 'date_range', value: '2026-04-01T00:00:00.000Z:2026-06-01T00:00:00.000Z' }]

      expect(matchesEventFilters(event, filters)).toBe(true)
    })
  })

  describe('matchesEventType', () => {
    it('returns true when allowed types are empty', () => {
      const event = { id: '1', get_content_type_key: '22' }
      expect(matchesEventType(event, [], { contentTypeMap: { match: 22, cup: 136 } })).toBe(true)
    })

    it('matches cup event by content type mapping', () => {
      const event = { id: '2', get_content_type_key: '136' }
      expect(matchesEventType(event, ['cup'], { contentTypeMap: { match: 22, cup: 136 } })).toBe(true)
      expect(matchesEventType(event, ['match'], { contentTypeMap: { match: 22, cup: 136 } })).toBe(false)
    })

    it('matches using explicit eventType when provided', () => {
      const event = { id: '3', eventType: 'league' }
      expect(matchesEventType(event, ['league'], { contentTypeMap: { match: 22, cup: 136 } })).toBe(true)
    })
  })
})
