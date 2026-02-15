import { describe, it, expect } from 'vitest'
import {
  normalizeSiteKey,
  resolveSearchStrings,
  isFutureOnlyEnabled,
  parseDateRange,
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
})
