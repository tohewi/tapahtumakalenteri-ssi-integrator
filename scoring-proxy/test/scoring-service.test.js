import { describe, it, expect } from 'vitest'
import {
  isDebugModeEnabled,
  getTodayStart,
  startsOnOrAfterDate,
  sortByProximityToNow,
  isUnsupportedStatusFilterError,
  buildScoreFormData,
  buildMatchSearchWindows,
  mergeAndFormatEvents,
} from '../lib/services/scoring-service.js'

describe('scoring-service pure helpers', () => {
  it('parses debug mode values', () => {
    expect(isDebugModeEnabled('true')).toBe(true)
    expect(isDebugModeEnabled('1')).toBe(true)
    expect(isDebugModeEnabled('false')).toBe(false)
    expect(isDebugModeEnabled(undefined)).toBe(false)
  })

  it('checks startsOnOrAfterDate accurately', () => {
    const todayStart = getTodayStart(new Date('2026-06-15T14:30:00Z'))
    expect(startsOnOrAfterDate('2026-06-15T09:00:00Z', todayStart)).toBe(true)
    expect(startsOnOrAfterDate('2026-06-14T20:00:00Z', todayStart)).toBe(false)
    expect(startsOnOrAfterDate('invalid-date', todayStart)).toBe(false)
  })

  it('sorts cups by proximity to reference timestamp', () => {
    const nowMs = new Date('2026-06-15T10:00:00Z').getTime()
    const cups = [
      { id: 'c3', starts: '2026-06-20T10:00:00Z' },
      { id: 'c1', starts: '2026-06-15T11:00:00Z' },
      { id: 'c2', starts: '2026-06-14T10:00:00Z' },
    ]
    const sorted = [...cups].sort(sortByProximityToNow(nowMs))
    expect(sorted.map(c => c.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('detects unsupported status filter GraphQL error', () => {
    expect(isUnsupportedStatusFilterError(new Error('Unknown argument "status" on field "events"'))).toBe(true)
    expect(isUnsupportedStatusFilterError(new Error('Network failure'))).toBe(false)
  })

  it('builds Django formset data for score submission', () => {
    const formData = buildScoreFormData({
      scores: {
        0: { X: 2, '10': 3 },
        1: { '9': 5 },
      },
      csrfToken: 'csrf-123',
      warning: true,
      dqReason: 'no',
      comment: 'good series',
    })

    expect(formData.get('csrfmiddlewaretoken')).toBe('csrf-123')
    expect(formData.get('form-TOTAL_FORMS')).toBe('2')
    expect(formData.get('form-0-xxx')).toBe('2')
    expect(formData.get('form-0-ten')).toBe('3')
    expect(formData.get('form-1-nine')).toBe('5')
    expect(formData.get('warning')).toBe('on')
    expect(formData.get('score_comment')).toBe('good series')
  })

  it('builds 11 search windows and merges/deduplicates events descending by date', () => {
    const windows = buildMatchSearchWindows(new Date('2026-06-15T00:00:00Z'))
    expect(windows).toHaveLength(11)

    const merged = mergeAndFormatEvents([
      {
        events: [
          { id: '1', name: 'Older Match', starts: '2026-01-01T09:00:00Z', status: 'cp', get_content_type_key: 91 },
          {
            id: '2',
            name: 'Newer Cup',
            starts: '2026-05-01T09:00:00Z',
            status: 'on',
            get_content_type_key: 136,
            component_matches: [
              { included: true, match: { id: 'm1', name: 'Sub 1', starts: '2026-05-01T09:00:00Z', status: 'on' } },
              { included: false, match: { id: 'm2', name: 'Excluded', starts: '2026-05-01T09:00:00Z', status: 'on' } },
            ],
          },
        ],
      },
      {
        events: [
          { id: '1', name: 'Older Match Duplicate', starts: '2026-01-01T09:00:00Z', status: 'cp', get_content_type_key: 91 },
        ],
      },
    ])

    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('2')
    expect(merged[0].componentMatches).toHaveLength(1)
    expect(merged[1].id).toBe('1')
  })
})
