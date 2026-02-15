import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseDateLocal, isToday, isFuture } from '../components/shared'

// ============================================================
// parseDateLocal()
// ============================================================

describe('parseDateLocal', () => {
  it('returns null for null input', () => {
    expect(parseDateLocal(null)).toBe(null)
  })

  it('returns null for undefined input', () => {
    expect(parseDateLocal(undefined)).toBe(null)
  })

  it('returns null for empty string', () => {
    expect(parseDateLocal('')).toBe(null)
  })

  it('parses date-only strings (YYYY-MM-DD) as local midnight', () => {
    const result = parseDateLocal('2026-02-15')
    
    // Should be parsed as local midnight
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(1) // February (0-indexed)
    expect(result.getDate()).toBe(15)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })

  it('parses datetime strings with time component correctly', () => {
    const result = parseDateLocal('2026-02-15T14:30:45')
    
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(15)
    expect(result.getHours()).toBe(14)
    expect(result.getMinutes()).toBe(30)
    expect(result.getSeconds()).toBe(45)
  })

  it('parses ISO strings with Z (UTC) timezone correctly', () => {
    const result = parseDateLocal('2026-02-15T14:30:00Z')
    
    expect(result).toBeInstanceOf(Date)
    // When parsed, it should represent the UTC time
    expect(result.toISOString()).toBe('2026-02-15T14:30:00.000Z')
  })

  it('parses ISO strings with positive timezone offset correctly', () => {
    const result = parseDateLocal('2026-02-15T14:30:00+02:00')
    
    expect(result).toBeInstanceOf(Date)
    // Should convert to UTC: 14:30+02:00 = 12:30 UTC
    expect(result.toISOString()).toBe('2026-02-15T12:30:00.000Z')
  })

  it('parses ISO strings with negative timezone offset correctly', () => {
    const result = parseDateLocal('2026-02-15T14:30:00-05:00')
    
    expect(result).toBeInstanceOf(Date)
    // Should convert to UTC: 14:30-05:00 = 19:30 UTC
    expect(result.toISOString()).toBe('2026-02-15T19:30:00.000Z')
  })

  it('handles date-only strings without adding UTC offset', () => {
    // This is the critical test - date-only should be local time, not UTC
    const result = parseDateLocal('2026-02-15')
    
    // Get the timezone offset in minutes
    const offsetMinutes = result.getTimezoneOffset()
    
    // When we convert to ISO string, it converts to UTC
    // So the date portion should be adjusted based on local timezone
    const isoString = result.toISOString()
    
    // For local midnight, the UTC representation depends on timezone
    // Example: if timezone is UTC+2 (120 minutes ahead), local midnight is 22:00 UTC previous day
    // Example: if timezone is UTC-5 (300 minutes behind), local midnight is 05:00 UTC same day
    
    // Verify that the constructed date is indeed local midnight
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })

  it('handles DST boundary - spring forward (March)', () => {
    // In many timezones, DST starts in March (spring forward)
    // Test dates around typical DST transition (last Sunday of March in Europe)
    const beforeDST = parseDateLocal('2026-03-28') // Saturday before DST
    const duringDST = parseDateLocal('2026-03-29') // Sunday - DST transition
    const afterDST = parseDateLocal('2026-03-30')  // Monday after DST
    
    // All should be valid Date objects
    expect(beforeDST).toBeInstanceOf(Date)
    expect(duringDST).toBeInstanceOf(Date)
    expect(afterDST).toBeInstanceOf(Date)
    
    // All should represent local midnight
    expect(beforeDST.getHours()).toBe(0)
    expect(duringDST.getHours()).toBe(0)
    expect(afterDST.getHours()).toBe(0)
    
    // Dates should be consecutive
    expect(beforeDST.getDate()).toBe(28)
    expect(duringDST.getDate()).toBe(29)
    expect(afterDST.getDate()).toBe(30)
  })

  it('handles DST boundary - fall back (October)', () => {
    // In many timezones, DST ends in October/November (fall back)
    // Test dates around typical DST transition (last Sunday of October in Europe)
    const beforeDST = parseDateLocal('2026-10-24') // Saturday before DST ends
    const duringDST = parseDateLocal('2026-10-25') // Sunday - DST transition
    const afterDST = parseDateLocal('2026-10-26')  // Monday after DST ends
    
    expect(beforeDST).toBeInstanceOf(Date)
    expect(duringDST).toBeInstanceOf(Date)
    expect(afterDST).toBeInstanceOf(Date)
    
    // All should represent local midnight
    expect(beforeDST.getHours()).toBe(0)
    expect(duringDST.getHours()).toBe(0)
    expect(afterDST.getHours()).toBe(0)
    
    // Dates should be consecutive
    expect(beforeDST.getDate()).toBe(24)
    expect(duringDST.getDate()).toBe(25)
    expect(afterDST.getDate()).toBe(26)
  })

  it('handles midnight edge case - 00:00:00', () => {
    const result = parseDateLocal('2026-02-15T00:00:00')
    
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })

  it('handles midnight edge case - 23:59:59', () => {
    const result = parseDateLocal('2026-02-15T23:59:59')
    
    expect(result.getHours()).toBe(23)
    expect(result.getMinutes()).toBe(59)
    expect(result.getSeconds()).toBe(59)
  })

  it('correctly appends T00:00:00 to date-only strings', () => {
    // This test verifies the implementation detail that prevents UTC interpretation
    const dateOnly = '2026-02-15'
    const result = parseDateLocal(dateOnly)
    
    // Create a reference date using the same approach
    const reference = new Date(dateOnly + 'T00:00:00')
    
    expect(result.getTime()).toBe(reference.getTime())
  })

  it('does not modify strings that already contain time component', () => {
    const dateTime = '2026-02-15T14:30:00'
    const result = parseDateLocal(dateTime)
    
    // Should parse as-is without appending anything
    const reference = new Date(dateTime)
    
    expect(result.getTime()).toBe(reference.getTime())
  })

  it('handles different date-only format edge cases', () => {
    // Test various date strings
    const testCases = [
      '2026-01-01',  // New Year
      '2026-12-31',  // New Year's Eve
      '2024-02-29',  // Leap year
      '2026-07-15',  // Mid-year
    ]
    
    testCases.forEach(dateStr => {
      const result = parseDateLocal(dateStr)
      expect(result).toBeInstanceOf(Date)
      expect(result.getHours()).toBe(0)
      expect(result.getMinutes()).toBe(0)
    })
  })

  it('preserves milliseconds when present', () => {
    const result = parseDateLocal('2026-02-15T14:30:45.123Z')
    
    expect(result).toBeInstanceOf(Date)
    expect(result.getMilliseconds()).toBe(123)
  })

  it('handles date strings from different years correctly', () => {
    const past = parseDateLocal('2020-06-15')
    const present = parseDateLocal('2026-06-15')
    const future = parseDateLocal('2030-06-15')
    
    expect(past.getFullYear()).toBe(2020)
    expect(present.getFullYear()).toBe(2026)
    expect(future.getFullYear()).toBe(2030)
    
    // All should be midnight in local time
    expect(past.getHours()).toBe(0)
    expect(present.getHours()).toBe(0)
    expect(future.getHours()).toBe(0)
  })

  it('ensures date-only strings never have off-by-one day errors', () => {
    // This is the key behavior we want to test
    // Date-only string '2026-02-15' should always represent Feb 15 in local time,
    // regardless of the timezone the code runs in
    const result = parseDateLocal('2026-02-15')
    
    // The local date components should match exactly
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(1) // February
    expect(result.getDate()).toBe(15)
    
    // And it should be midnight
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
  })
})

// ============================================================
// isToday()
// ============================================================

describe('isToday', () => {
  let originalDate

  beforeEach(() => {
    // Save original Date
    originalDate = global.Date
  })

  afterEach(() => {
    // Restore original Date
    global.Date = originalDate
  })

  it('returns false for null or empty input', () => {
    expect(isToday(null)).toBe(false)
    expect(isToday('')).toBe(false)
    expect(isToday(undefined)).toBe(false)
  })

  it('returns true for today\'s date in ISO format', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(isToday(today)).toBe(true)
  })

  it('returns true for today\'s date with time component', () => {
    const now = new Date().toISOString()
    expect(isToday(now)).toBe(true)
  })

  it('returns false for yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayISO = yesterday.toISOString().split('T')[0]
    expect(isToday(yesterdayISO)).toBe(false)
  })

  it('returns false for tomorrow', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowISO = tomorrow.toISOString().split('T')[0]
    expect(isToday(tomorrowISO)).toBe(false)
  })

  it('handles date-only format YYYY-MM-DD correctly', () => {
    // Mock current date to 2026-02-15 at 14:30 local time
    const mockDate = new Date('2026-02-15T14:30:00')
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    expect(isToday('2026-02-15')).toBe(true)
    expect(isToday('2026-02-14')).toBe(false)
    expect(isToday('2026-02-16')).toBe(false)
  })

  it('handles midnight edge case - 23:59:59 same day', () => {
    // Mock to 2026-02-15 at 23:59:59
    const mockDate = new Date('2026-02-15T23:59:59')
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    expect(isToday('2026-02-15')).toBe(true)
    expect(isToday('2026-02-15T23:59:59')).toBe(true)
  })

  it('handles midnight edge case - 00:00:00 same day', () => {
    // Mock to 2026-02-15 at 00:00:00
    const mockDate = new Date('2026-02-15T00:00:00')
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    expect(isToday('2026-02-15')).toBe(true)
    expect(isToday('2026-02-15T00:00:00')).toBe(true)
    expect(isToday('2026-02-14T23:59:59')).toBe(false)
  })

  it('handles timezone-aware ISO strings correctly', () => {
    // Mock to 2026-02-15 at 14:00 UTC
    const mockDate = new Date('2026-02-15T14:00:00Z')
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    // A date string with timezone should be compared correctly
    // 2026-02-15T14:00:00Z is "today" when current time is also 2026-02-15
    expect(isToday('2026-02-15T14:00:00Z')).toBe(true)
    
    // A date from different timezone but same calendar day
    expect(isToday('2026-02-15T23:59:59+10:00')).toBe(true)
    
    // Edge case: a time that's technically next day in UTC but might be same day in another timezone
    expect(isToday('2026-02-16T00:00:00Z')).toBe(false)
  })

  it('handles date strings that cross local midnight boundary', () => {
    // Mock current date to 2026-02-15 at 02:00 UTC
    const mockDate = new Date('2026-02-15T02:00:00Z')
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    // isToday compares LOCAL calendar day. The same UTC instant may map
    // to either previous day or current day depending on local timezone.
    expect(isToday('2026-02-15')).toBe(true)
    const boundaryIso = '2026-02-14T23:00:00Z'
    const boundaryDate = new Date(boundaryIso)
    const expectedBoundaryMatch = (
      boundaryDate.getFullYear() === mockDate.getFullYear() &&
      boundaryDate.getMonth() === mockDate.getMonth() &&
      boundaryDate.getDate() === mockDate.getDate()
    )
    expect(isToday(boundaryIso)).toBe(expectedBoundaryMatch)
  })
})

// ============================================================
// isFuture()
// ============================================================

describe('isFuture', () => {
  let originalDate

  beforeEach(() => {
    originalDate = global.Date
  })

  afterEach(() => {
    global.Date = originalDate
  })

  it('returns false for null or empty input', () => {
    expect(isFuture(null)).toBe(false)
    expect(isFuture('')).toBe(false)
    expect(isFuture(undefined)).toBe(false)
  })

  it('returns true for future dates', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(isFuture(tomorrow.toISOString())).toBe(true)
  })

  it('returns false for past dates', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(isFuture(yesterday.toISOString())).toBe(false)
  })

  it('returns false for current moment', () => {
    const now = new Date()
    // Mock Date to return a fixed time
    const mockDate = now
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    // The exact same timestamp should not be in the future
    expect(isFuture(mockDate.toISOString())).toBe(false)
  })

  it('returns true for date 1 millisecond in future', () => {
    const now = new Date('2026-02-15T14:00:00.000Z')
    const future = new Date('2026-02-15T14:00:00.001Z')
    
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return now
        }
        return new originalDate(...args)
      }
      static now() {
        return now.getTime()
      }
    }

    expect(isFuture(future.toISOString())).toBe(true)
  })

  it('returns false for date 1 millisecond in past', () => {
    const now = new Date('2026-02-15T14:00:00.000Z')
    const past = new Date('2026-02-15T13:59:59.999Z')
    
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return now
        }
        return new originalDate(...args)
      }
      static now() {
        return now.getTime()
      }
    }

    expect(isFuture(past.toISOString())).toBe(false)
  })

  it('handles date-only format YYYY-MM-DD correctly', () => {
    // Mock current time to 2026-02-15 at 14:30
    const mockDate = new Date('2026-02-15T14:30:00')
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    // Date-only strings are parsed as midnight UTC
    // '2026-02-15' as midnight UTC would be in the past if current time is 14:30 on same day
    expect(isFuture('2026-02-15')).toBe(false)
    
    // Tomorrow should be in the future
    expect(isFuture('2026-02-16')).toBe(true)
    
    // Yesterday should be in the past
    expect(isFuture('2026-02-14')).toBe(false)
  })

  it('handles midnight boundary - just before midnight', () => {
    // Current time: 2026-02-15 at 23:59:59
    const mockDate = new Date('2026-02-15T23:59:59Z')
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    // One second later (midnight of next day)
    expect(isFuture('2026-02-16T00:00:00Z')).toBe(true)
    
    // Same moment
    expect(isFuture('2026-02-15T23:59:59Z')).toBe(false)
    
    // One second earlier
    expect(isFuture('2026-02-15T23:59:58Z')).toBe(false)
  })

  it('handles midnight boundary - just after midnight', () => {
    // Current time: 2026-02-15 at 00:00:01
    const mockDate = new Date('2026-02-15T00:00:01Z')
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    // One second earlier (just into yesterday)
    expect(isFuture('2026-02-15T00:00:00Z')).toBe(false)
    
    // Same moment
    expect(isFuture('2026-02-15T00:00:01Z')).toBe(false)
    
    // One second later
    expect(isFuture('2026-02-15T00:00:02Z')).toBe(true)
  })

  it('handles timezone-aware comparisons correctly', () => {
    // Mock to 2026-02-15 at 14:00 UTC
    const mockDate = new Date('2026-02-15T14:00:00Z')
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return mockDate
        }
        return new originalDate(...args)
      }
      static now() {
        return mockDate.getTime()
      }
    }

    // Same absolute time in different timezone notation
    expect(isFuture('2026-02-15T15:00:00+01:00')).toBe(false) // Same as 14:00 UTC
    
    // One hour later in UTC
    expect(isFuture('2026-02-15T15:00:00Z')).toBe(true)
    
    // One hour earlier in UTC
    expect(isFuture('2026-02-15T13:00:00Z')).toBe(false)
  })

  it('handles far future dates', () => {
    expect(isFuture('2099-12-31T23:59:59Z')).toBe(true)
  })

  it('handles far past dates', () => {
    expect(isFuture('2000-01-01T00:00:00Z')).toBe(false)
  })
})
