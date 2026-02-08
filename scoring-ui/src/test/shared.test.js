import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isToday, isFuture } from '../components/shared'

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

    // In UTC it's Feb 15, but in some timezones (like PST -8) it might still be Feb 14
    // However, isToday uses the local date extraction, so it should correctly identify
    expect(isToday('2026-02-15')).toBe(true)
    expect(isToday('2026-02-14T23:00:00Z')).toBe(false)
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
