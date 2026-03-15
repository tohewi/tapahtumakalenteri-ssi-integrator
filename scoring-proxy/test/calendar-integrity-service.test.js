import { describe, it, expect, vi } from 'vitest'
import { checkDbConsistency, checkLiveWp, checkIntegrity, SEVERITY } from '../lib/services/calendar-integrity-service.js'

// ---- Helpers to build test events ----

function makeEvent(overrides = {}) {
  return {
    id: 'evt-001',
    eventName: 'Test Cup 01.01.2026',
    eventDate: '2026-01-01',
    status: 'calendar_published',
    ssiReferences: {
      cupId: '201',
      cupTypeId: '136',
      cupUrl: 'https://shootnscoreit.com/event/136/201/',
      matches: [],
    },
    calendarReference: {
      eventId: '555',
      eventUrl: 'https://example.com/?post_type=event&p=555',
      editUrl: 'https://example.com/wp-admin/post.php?post=555&action=edit',
      title: 'Test Cup 01.01.2026',
      status: 'publish',
      publishedAt: '2026-01-01T10:00:00Z',
    },
    ...overrides,
  }
}

// ============================================================
// DB Consistency Checks
// ============================================================

describe('checkDbConsistency', () => {
  it('returns no issues for a healthy event', () => {
    const events = [makeEvent()]
    const issues = checkDbConsistency(events)
    expect(issues).toHaveLength(0)
  })

  it('detects missing SSI reference for ssi_created event', () => {
    const events = [makeEvent({ status: 'ssi_created', ssiReferences: {} })]
    const issues = checkDbConsistency(events)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('missing_ssi_reference')
    expect(issues[0].severity).toBe(SEVERITY.ERROR)
  })

  it('detects missing SSI reference for calendar_published event', () => {
    const events = [makeEvent({ ssiReferences: {} })]
    const issues = checkDbConsistency(events)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('missing_ssi_reference')
  })

  it('detects missing SSI reference for completed event', () => {
    const events = [makeEvent({ status: 'completed', ssiReferences: {} })]
    const issues = checkDbConsistency(events)
    expect(issues.some(i => i.type === 'missing_ssi_reference')).toBe(true)
  })

  it('does not flag missing SSI reference for planned events', () => {
    const events = [makeEvent({ status: 'planned', ssiReferences: {} })]
    const issues = checkDbConsistency(events)
    expect(issues.filter(i => i.type === 'missing_ssi_reference')).toHaveLength(0)
  })

  it('detects missing calendar reference for calendar_published event', () => {
    const events = [makeEvent({ calendarReference: {} })]
    const issues = checkDbConsistency(events)
    expect(issues.some(i => i.type === 'missing_calendar_reference')).toBe(true)
    expect(issues.find(i => i.type === 'missing_calendar_reference').severity).toBe(SEVERITY.ERROR)
  })

  it('does not flag missing calendar reference for ssi_created events', () => {
    const events = [makeEvent({ status: 'ssi_created', calendarReference: {} })]
    const issues = checkDbConsistency(events)
    expect(issues.filter(i => i.type === 'missing_calendar_reference')).toHaveLength(0)
  })

  it('detects orphaned calendar reference with unexpected status', () => {
    const events = [makeEvent({ status: 'planned' })]
    const issues = checkDbConsistency(events)
    expect(issues.some(i => i.type === 'orphaned_calendar_reference')).toBe(true)
    expect(issues.find(i => i.type === 'orphaned_calendar_reference').severity).toBe(SEVERITY.WARNING)
  })

  it('does not flag calendar reference for ssi_created (retry scenario)', () => {
    const events = [makeEvent({ status: 'ssi_created' })]
    const issues = checkDbConsistency(events)
    expect(issues.filter(i => i.type === 'orphaned_calendar_reference')).toHaveLength(0)
  })

  it('does not flag calendar reference for completed events', () => {
    const events = [makeEvent({ status: 'completed' })]
    const issues = checkDbConsistency(events)
    expect(issues.filter(i => i.type === 'orphaned_calendar_reference')).toHaveLength(0)
  })

  it('detects missing SSI Cup URL', () => {
    const events = [makeEvent({
      ssiReferences: { cupId: '201', cupTypeId: '136', matches: [] },
    })]
    const issues = checkDbConsistency(events)
    expect(issues.some(i => i.type === 'missing_ssi_cup_url')).toBe(true)
    expect(issues.find(i => i.type === 'missing_ssi_cup_url').severity).toBe(SEVERITY.WARNING)
  })

  it('detects duplicate SSI event references', () => {
    const events = [
      makeEvent({ id: 'evt-001' }),
      makeEvent({ id: 'evt-002' }),
    ]
    const issues = checkDbConsistency(events)
    expect(issues.some(i => i.type === 'duplicate_ssi_event')).toBe(true)
    expect(issues.find(i => i.type === 'duplicate_ssi_event').severity).toBe(SEVERITY.ERROR)
    expect(issues.find(i => i.type === 'duplicate_ssi_event').details.eventIds).toEqual(['evt-001', 'evt-002'])
  })

  it('does not flag different SSI events as duplicates', () => {
    const events = [
      makeEvent({ id: 'evt-001', ssiReferences: { cupId: '201', cupUrl: 'https://ssi/201' } }),
      makeEvent({ id: 'evt-002', ssiReferences: { cupId: '202', cupUrl: 'https://ssi/202' } }),
    ]
    const issues = checkDbConsistency(events)
    expect(issues.filter(i => i.type === 'duplicate_ssi_event')).toHaveLength(0)
  })

  it('handles multiple issues across events', () => {
    const events = [
      makeEvent({ id: 'evt-001', ssiReferences: {} }), // missing SSI ref + missing cal ref (no cupId for cal check)
      makeEvent({ id: 'evt-002', calendarReference: {} }), // missing cal ref
    ]
    const issues = checkDbConsistency(events)
    expect(issues.length).toBeGreaterThanOrEqual(2)
  })
})

// ============================================================
// Live WordPress Checks
// ============================================================

describe('checkLiveWp', () => {
  it('returns no issues when WP events are healthy', async () => {
    const events = [makeEvent()]
    const adapter = {
      getEvent: vi.fn().mockResolvedValue({
        title: 'Test Cup 01.01.2026',
        status: 'publish',
        acfFields: { content: 'See results at https://shootnscoreit.com/event/136/201/' },
      }),
    }
    const issues = await checkLiveWp(events, adapter)
    expect(issues).toHaveLength(0)
    expect(adapter.getEvent).toHaveBeenCalledWith('555')
  })

  it('skips events without calendarReference', async () => {
    const events = [makeEvent({ calendarReference: {} })]
    const adapter = { getEvent: vi.fn() }
    const issues = await checkLiveWp(events, adapter)
    expect(issues).toHaveLength(0)
    expect(adapter.getEvent).not.toHaveBeenCalled()
  })

  it('detects WP event not found', async () => {
    const events = [makeEvent()]
    const adapter = {
      getEvent: vi.fn().mockRejectedValue(new Error('Could not load edit page for post 555')),
    }
    const issues = await checkLiveWp(events, adapter)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('wp_event_not_found')
    expect(issues[0].severity).toBe(SEVERITY.ERROR)
  })

  it('detects WP status mismatch', async () => {
    const events = [makeEvent()]
    const adapter = {
      getEvent: vi.fn().mockResolvedValue({
        title: 'Test Cup 01.01.2026',
        status: 'draft',
        acfFields: { content: 'https://shootnscoreit.com/event/136/201/' },
      }),
    }
    const issues = await checkLiveWp(events, adapter)
    expect(issues.some(i => i.type === 'wp_status_mismatch')).toBe(true)
    expect(issues.find(i => i.type === 'wp_status_mismatch').details.actualStatus).toBe('draft')
  })

  it('does not flag status mismatch for non-calendar_published events', async () => {
    const events = [makeEvent({ status: 'completed' })]
    const adapter = {
      getEvent: vi.fn().mockResolvedValue({
        title: 'Test Cup',
        status: 'draft',
        acfFields: { content: 'https://shootnscoreit.com/event/136/201/' },
      }),
    }
    const issues = await checkLiveWp(events, adapter)
    expect(issues.filter(i => i.type === 'wp_status_mismatch')).toHaveLength(0)
  })

  it('detects WP content missing SSI link', async () => {
    const events = [makeEvent()]
    const adapter = {
      getEvent: vi.fn().mockResolvedValue({
        title: 'Test Cup 01.01.2026',
        status: 'publish',
        acfFields: { content: 'No SSI link here' },
      }),
    }
    const issues = await checkLiveWp(events, adapter)
    expect(issues.some(i => i.type === 'wp_content_missing_ssi_link')).toBe(true)
  })

  it('accepts SSI link by Cup ID pattern in content', async () => {
    const events = [makeEvent()]
    const adapter = {
      getEvent: vi.fn().mockResolvedValue({
        title: 'Test Cup 01.01.2026',
        status: 'publish',
        acfFields: { content: 'Link: shootnscoreit.com/event/136/201/ here' },
      }),
    }
    const issues = await checkLiveWp(events, adapter)
    expect(issues.filter(i => i.type === 'wp_content_missing_ssi_link')).toHaveLength(0)
  })

  it('detects WP title mismatch (info level)', async () => {
    const events = [makeEvent()]
    const adapter = {
      getEvent: vi.fn().mockResolvedValue({
        title: 'Completely Different Name',
        status: 'publish',
        acfFields: { content: 'https://shootnscoreit.com/event/136/201/' },
      }),
    }
    const issues = await checkLiveWp(events, adapter)
    expect(issues.some(i => i.type === 'wp_title_mismatch')).toBe(true)
    expect(issues.find(i => i.type === 'wp_title_mismatch').severity).toBe(SEVERITY.INFO)
  })

  it('calls onProgress callback', async () => {
    const events = [
      makeEvent({ id: 'evt-001' }),
      makeEvent({ id: 'evt-002', calendarReference: { eventId: '556' } }),
    ]
    const adapter = {
      getEvent: vi.fn().mockResolvedValue({
        title: 'Test Cup 01.01.2026',
        status: 'publish',
        acfFields: { content: 'https://shootnscoreit.com/event/136/201/' },
      }),
    }
    const progress = vi.fn()
    await checkLiveWp(events, adapter, progress)
    expect(progress).toHaveBeenCalledWith(1, 2)
    expect(progress).toHaveBeenCalledWith(2, 2)
  })
})

// ============================================================
// Full Integrity Check (checkIntegrity)
// ============================================================

describe('checkIntegrity', () => {
  it('runs DB checks without adapter', async () => {
    const events = [makeEvent()]
    const result = await checkIntegrity(events)
    expect(result.summary.totalEvents).toBe(1)
    expect(result.summary.liveCheckPerformed).toBe(false)
    expect(result.summary.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.checkedAt).toBeDefined()
  })

  it('runs DB + live WP checks with adapter', async () => {
    const events = [makeEvent()]
    const adapter = {
      getEvent: vi.fn().mockResolvedValue({
        title: 'Test Cup 01.01.2026',
        status: 'publish',
        acfFields: { content: 'https://shootnscoreit.com/event/136/201/' },
      }),
    }
    const result = await checkIntegrity(events, { adapter })
    expect(result.summary.liveCheckPerformed).toBe(true)
    expect(result.summary.liveCheckCount).toBe(1)
    expect(result.summary.passed).toBe(true)
  })

  it('combines DB and WP issues', async () => {
    const events = [
      makeEvent({ id: 'evt-001', calendarReference: {} }), // missing cal ref (DB issue)
      makeEvent({ id: 'evt-002' }), // healthy in DB, WP will fail
    ]
    const adapter = {
      getEvent: vi.fn().mockRejectedValue(new Error('not found')),
    }
    const result = await checkIntegrity(events, { adapter })
    expect(result.summary.errorCount).toBeGreaterThanOrEqual(2)
    expect(result.summary.passed).toBe(false)
  })

  it('summary counts are correct', async () => {
    const events = [
      makeEvent({ id: 'evt-001' }),
      makeEvent({ id: 'evt-002', status: 'ssi_created', calendarReference: {},
        ssiReferences: { cupId: '202', cupUrl: 'https://ssi/202' } }),
      makeEvent({ id: 'evt-003', status: 'planned', ssiReferences: {}, calendarReference: {} }),
    ]
    const result = await checkIntegrity(events)
    expect(result.summary.totalEvents).toBe(3)
    expect(result.summary.eventsWithSsi).toBe(2) // evt-001 and evt-002
    expect(result.summary.eventsWithCalendar).toBe(1) // evt-001 only
  })
})
