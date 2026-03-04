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
  normalizeDate,
  subtractDays,
  deleteSsiEvent,
} from '../lib/services/event-creation-service.js'

// ============================================================
// normalizeDate — handles PostgreSQL DATE objects and strings
// ============================================================

describe('normalizeDate', () => {
  it('passes through YYYY-MM-DD string unchanged', () => {
    expect(normalizeDate('2026-03-15')).toBe('2026-03-15')
  })

  it('extracts date from ISO timestamp string', () => {
    expect(normalizeDate('2026-03-15T14:30:00.000Z')).toBe('2026-03-15')
  })

  it('converts JS Date object (PostgreSQL DATE) to YYYY-MM-DD', () => {
    const pgDate = new Date('2026-03-15T00:00:00Z')
    expect(normalizeDate(pgDate)).toBe('2026-03-15')
  })

  it('handles Date object at midnight UTC correctly', () => {
    const d = new Date(Date.UTC(2026, 2, 15)) // March 15
    expect(normalizeDate(d)).toBe('2026-03-15')
  })

  it('throws on null/undefined', () => {
    expect(() => normalizeDate(null)).toThrow('Event date is required')
    expect(() => normalizeDate(undefined)).toThrow('Event date is required')
  })

  it('throws on invalid string', () => {
    expect(() => normalizeDate('not-a-date')).toThrow('Invalid event date')
  })
})

// ============================================================
// subtractDays — timezone-safe date arithmetic
// ============================================================

describe('subtractDays', () => {
  it('subtracts days correctly', () => {
    expect(subtractDays('2026-03-15', 7)).toBe('2026-03-08')
  })

  it('handles month boundary', () => {
    expect(subtractDays('2026-03-03', 7)).toBe('2026-02-24')
  })

  it('handles year boundary', () => {
    expect(subtractDays('2026-01-05', 7)).toBe('2025-12-29')
  })

  it('handles zero days', () => {
    expect(subtractDays('2026-03-15', 0)).toBe('2026-03-15')
  })

  it('handles DST transition (March)', () => {
    // Finland DST starts last Sunday of March
    expect(subtractDays('2026-03-30', 1)).toBe('2026-03-29')
  })
})

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

  it('calculates registration start date 7 days before event', () => {
    const result = calculateSchedule('2026-03-15', defaultOverrides)
    expect(result.regStartDate).toBe('2026-03-08')
    expect(result.regStartTime).toBe('00:00')
  })

  it('calculates registration close 12 hours before start', () => {
    const result = calculateSchedule('2026-03-15', defaultOverrides)
    // Start 09:00 minus 12h = 21:00 previous day
    expect(result.regCloseDate).toBe('2026-03-14')
    expect(result.regCloseTime).toBe('21:00')
  })

})

// ============================================================
// deleteSsiEvent — guard / reference-shape resolution
//
// The guard throws before ssiLogin() is called, so no HTTP mocking needed.
// Verifies that all three ssiReferences shapes are accepted and that
// missing/empty refs are rejected correctly.
// ============================================================

describe('deleteSsiEvent — reference guard', () => {
  it('throws when ssiReferences is null', async () => {
    await expect(deleteSsiEvent({ ssiReferences: null, credentials: {} }))
      .rejects.toThrow('No SSI reference ID provided for deletion')
  })

  it('throws when ssiReferences has no usable ID fields', async () => {
    await expect(deleteSsiEvent({ ssiReferences: {}, credentials: {} }))
      .rejects.toThrow('No SSI reference ID provided for deletion')
  })

  it('throws when ssiReferences has ssiEventId but no typeId field', async () => {
    // ssiEventId present but contentTypeKey missing — guard passes, second check fires
    await expect(deleteSsiEvent({ ssiReferences: { ssiEventId: '123' }, credentials: {} }))
      .rejects.toThrow('Missing SSI eventId or typeId in references')
  })

  it('throws when cupId present but cupTypeId missing', async () => {
    await expect(deleteSsiEvent({ ssiReferences: { cupId: '456' }, credentials: {} }))
      .rejects.toThrow('Missing SSI eventId or typeId in references')
  })

  it('accepts platform-created cup shape (cupId + cupTypeId) and proceeds to login', async () => {
    // Guard passes — function will fail at ssiLogin() because credentials are empty,
    // not at the guard check. That confirms the reference shape is accepted.
    await expect(deleteSsiEvent({
      ssiReferences: { cupId: '100', cupTypeId: '136', isCup: false },
      credentials: { email: '', password: '' },
    })).rejects.not.toThrow('No SSI reference ID provided for deletion')
  })

  it('accepts platform-created match shape (id + typeId) and proceeds to login', async () => {
    await expect(deleteSsiEvent({
      ssiReferences: { id: '200', typeId: '22' },
      credentials: { email: '', password: '' },
    })).rejects.not.toThrow('No SSI reference ID provided for deletion')
  })

  it('accepts imported event shape (ssiEventId + contentTypeKey) and proceeds to login', async () => {
    // This is the shape stored by importSsiEvent() — previously rejected before the fix.
    await expect(deleteSsiEvent({
      ssiReferences: { ssiEventId: '300', contentTypeKey: 22 },
      credentials: { email: '', password: '' },
    })).rejects.not.toThrow('No SSI reference ID provided for deletion')
  })
})

// ============================================================
// calculateSchedule — edge cases (continued)
// ============================================================

describe('calculateSchedule — edge cases', () => {
  const defaultOverrides = {
    startTime: '09.00',
    endTime: '12.00',
    registrationDaysBeforeEvent: 7,
  }

  it('uses default values when overrides are empty', () => {
    const result = calculateSchedule('2026-06-01', {})
    expect(result.startTime).toBe('09:00')
    expect(result.endTime).toBe('12:00')
    expect(result.regStartDate).toBe('2026-05-25')
  })

  it('handles custom registration days before event', () => {
    const result = calculateSchedule('2026-03-15', {
      ...defaultOverrides,
      registrationDaysBeforeEvent: 14,
    })
    expect(result.regStartDate).toBe('2026-03-01')
  })

  it('handles afternoon start time — reg close same day', () => {
    const result = calculateSchedule('2026-03-15', {
      ...defaultOverrides,
      startTime: '14.00',
    })
    // 14:00 minus 12 hours = 02:00 same day
    expect(result.regCloseDate).toBe('2026-03-15')
    expect(result.regCloseTime).toBe('02:00')
  })

  it('handles month boundary correctly', () => {
    const result = calculateSchedule('2026-03-03', defaultOverrides)
    expect(result.regStartDate).toBe('2026-02-24')
  })

  it('handles year boundary correctly', () => {
    const result = calculateSchedule('2026-01-05', defaultOverrides)
    expect(result.regStartDate).toBe('2025-12-29')
  })

  it('handles PostgreSQL Date object as eventDate', () => {
    const pgDate = new Date('2026-03-15T00:00:00Z')
    const result = calculateSchedule(pgDate, defaultOverrides)
    expect(result.isoDate).toBe('2026-03-15')
    expect(result.displayDate).toBe('15.03.2026')
    expect(result.regStartDate).toBe('2026-03-08')
  })
})
