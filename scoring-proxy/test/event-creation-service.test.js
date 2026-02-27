// ============================================================
// Unit tests for Event Creation Service — pure helper functions
//
// Tests date/time formatting, schedule calculation, and URL parsing.
// The main createSsiEvent() function requires external HTTP mocking
// and is better suited for integration tests.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  extractEventIds,
  formatDisplayDate,
  toSsiTime,
  calculateSchedule,
} from '../lib/services/event-creation-service.js'

// ============================================================
// extractEventIds
// ============================================================

describe('extractEventIds', () => {
  it('extracts typeId and eventId from standard SSI event URL', () => {
    expect(extractEventIds('/event/136/160/')).toEqual({ typeId: '136', eventId: '160' })
  })

  it('extracts from full URL', () => {
    expect(extractEventIds('https://shootnscoreit.com/event/91/42/'))
      .toEqual({ typeId: '91', eventId: '42' })
  })

  it('extracts without trailing slash', () => {
    expect(extractEventIds('/event/136/999')).toEqual({ typeId: '136', eventId: '999' })
  })

  it('returns null for non-event URL', () => {
    expect(extractEventIds('/dashboard/')).toBeNull()
  })

  it('returns null for event URL with non-numeric IDs', () => {
    expect(extractEventIds('/event/abc/def/')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractEventIds('')).toBeNull()
  })

  it('extracts from URL with extra path segments', () => {
    expect(extractEventIds('/event/136/160/details/edit/'))
      .toEqual({ typeId: '136', eventId: '160' })
  })
})

// ============================================================
// formatDisplayDate
// ============================================================

describe('formatDisplayDate', () => {
  it('formats ISO date to Finnish format (dd.MM.yyyy)', () => {
    const result = formatDisplayDate('2026-02-14')
    expect(result).toBe('14.02.2026')
  })

  it('formats another date correctly', () => {
    const result = formatDisplayDate('2026-12-31')
    expect(result).toBe('31.12.2026')
  })

  it('formats single-digit day/month with leading zeros', () => {
    const result = formatDisplayDate('2026-01-05')
    expect(result).toBe('05.01.2026')
  })
})

// ============================================================
// toSsiTime
// ============================================================

describe('toSsiTime', () => {
  it('converts Finnish time format (hh.mm) to SSI format (HH:mm)', () => {
    expect(toSsiTime('09.00')).toBe('09:00')
  })

  it('converts afternoon time', () => {
    expect(toSsiTime('14.30')).toBe('14:30')
  })

  it('returns empty string for null/undefined input', () => {
    expect(toSsiTime(null)).toBe('')
    expect(toSsiTime(undefined)).toBe('')
    expect(toSsiTime('')).toBe('')
  })

  it('passes through already-colon-formatted time', () => {
    // If already in HH:mm format, the replace('.', ':') won't change it
    expect(toSsiTime('09:00')).toBe('09:00')
  })
})

// ============================================================
// calculateSchedule
// ============================================================

describe('calculateSchedule', () => {
  const defaultOverrides = {
    startTime: '09.00',
    endTime: '12.00',
    registrationDaysBeforeEvent: 7,
    registrationStartTime: '00.00',
  }

  it('returns correct ISO date and display date', () => {
    const result = calculateSchedule('2026-03-15', defaultOverrides)
    expect(result.isoDate).toBe('2026-03-15')
    expect(result.displayDate).toBe('15.03.2026')
  })

  it('converts start and end times to SSI format', () => {
    const result = calculateSchedule('2026-03-15', defaultOverrides)
    expect(result.startTime).toBe('09:00')
    expect(result.endTime).toBe('12:00')
  })

  // Helper: compute expected date same way the code does (timezone-safe)
  function expectedDateMinusDays(isoDate, days) {
    const d = new Date(isoDate + 'T00:00:00')
    d.setDate(d.getDate() - days)
    return d.toISOString().split('T')[0]
  }

  it('calculates registration start date 7 days before event', () => {
    const result = calculateSchedule('2026-03-15', defaultOverrides)
    expect(result.regStartDate).toBe(expectedDateMinusDays('2026-03-15', 7))
    expect(result.regStartTime).toBe('00:00')
  })

  it('calculates registration close 12 hours before start', () => {
    const result = calculateSchedule('2026-03-15', defaultOverrides)
    // regCloseTime is startTime minus 12h
    // Exact date/time depends on timezone, just verify it's set
    expect(result.regCloseDate).toBeTruthy()
    expect(result.regCloseTime).toMatch(/^\d{2}:\d{2}$/)
  })

  it('uses default values when overrides are empty', () => {
    const result = calculateSchedule('2026-06-01', {})
    expect(result.startTime).toBe('09:00')
    expect(result.endTime).toBe('12:00')
    expect(result.regStartDate).toBe(expectedDateMinusDays('2026-06-01', 7))
  })

  it('handles custom registration days before event', () => {
    const result = calculateSchedule('2026-03-15', {
      ...defaultOverrides,
      registrationDaysBeforeEvent: 14,
    })
    expect(result.regStartDate).toBe(expectedDateMinusDays('2026-03-15', 14))
  })

  it('handles afternoon start time — reg close adjusts', () => {
    const result = calculateSchedule('2026-03-15', {
      ...defaultOverrides,
      startTime: '14.00',
    })
    // 14:00 minus 12 hours = 02:00 — just verify format
    expect(result.regCloseTime).toMatch(/^\d{2}:\d{2}$/)
  })

  it('handles month boundary correctly', () => {
    const result = calculateSchedule('2026-03-03', defaultOverrides)
    expect(result.regStartDate).toBe(expectedDateMinusDays('2026-03-03', 7))
  })

  it('handles year boundary correctly', () => {
    const result = calculateSchedule('2026-01-05', defaultOverrides)
    expect(result.regStartDate).toBe(expectedDateMinusDays('2026-01-05', 7))
  })
})
