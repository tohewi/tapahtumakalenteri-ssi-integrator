import { describe, it, expect, vi } from 'vitest'
import {
  runPostEventWorkflows,
  validateWorkflows,
  WORKFLOW_TYPES,
} from '../lib/services/post-event-workflow-service.js'

// ---- Test event/template builders ----

function makeEvent(overrides = {}) {
  return {
    id: 'evt-001',
    eventName: 'Test Cup 15.03.2026',
    eventDate: '2026-03-15',
    status: 'calendar_published',
    ssiReferences: {
      cupId: '201',
      cupTypeId: '136',
      cupContentTypeId: '136',
      cupUrl: 'https://shootnscoreit.com/event/136/201/',
      isCup: true,
      matches: [{ matchId: '301', matchContentTypeId: '102' }],
    },
    calendarReference: {
      eventId: '555',
      eventUrl: 'https://example.com/?post_type=event&p=555',
      status: 'publish',
    },
    ...overrides,
  }
}

function makeTemplate(overrides = {}) {
  return {
    id: 'tpl-001',
    name: 'SRA Training Cup',
    calendarTemplate: { shotsPerParticipant: 100 },
    postEventWorkflows: [
      { type: 'complete_ssi', enabled: true },
      { type: 'update_calendar_stats', enabled: true },
      { type: 'email_shooter_count', enabled: true, config: { to: ['admin@test.com'] } },
    ],
    ...overrides,
  }
}

const ssiCredentials = { email: 'test@ssi.com', password: 'pass' }
const calendarConfig = { wpBaseUrl: 'https://example.com', wpUsername: 'admin', wpPassword: 'secret' }

// ---- Mock services ----

function makeMockServices() {
  return {
    completeEventFn: vi.fn().mockResolvedValue({ success: true, results: [{ matchId: '301', status: 'completed' }] }),
    updateCalendarStatsFn: vi.fn().mockResolvedValue({ success: true, stats: { approvedCount: 12, shotsFired: 1200 } }),
    ssiGetEventStatsFn: vi.fn().mockResolvedValue({ approvedCount: 12, status: 'cp' }),
    sendEmailFn: vi.fn().mockResolvedValue({ success: true }),
  }
}

// ============================================================
// validateWorkflows
// ============================================================

describe('validateWorkflows', () => {
  it('accepts valid workflow array', () => {
    const result = validateWorkflows([
      { type: 'complete_ssi', enabled: true },
      { type: 'update_calendar_stats' },
      { type: 'email_shooter_count', config: { to: ['a@b.com'] } },
    ])
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects non-array', () => {
    const result = validateWorkflows('not an array')
    expect(result.valid).toBe(false)
  })

  it('rejects missing type', () => {
    const result = validateWorkflows([{ enabled: true }])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("missing 'type'")
  })

  it('rejects unknown type', () => {
    const result = validateWorkflows([{ type: 'launch_missiles' }])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('unknown type')
  })

  it('requires to array for email workflow', () => {
    const result = validateWorkflows([{ type: 'email_shooter_count' }])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('config.to')
  })

  it('accepts empty array', () => {
    const result = validateWorkflows([])
    expect(result.valid).toBe(true)
  })
})

// ============================================================
// WORKFLOW_TYPES
// ============================================================

describe('WORKFLOW_TYPES', () => {
  it('has all three types', () => {
    expect(WORKFLOW_TYPES.complete_ssi).toBeDefined()
    expect(WORKFLOW_TYPES.update_calendar_stats).toBeDefined()
    expect(WORKFLOW_TYPES.email_shooter_count).toBeDefined()
  })
})

// ============================================================
// runPostEventWorkflows — full pipeline
// ============================================================

describe('runPostEventWorkflows', () => {
  it('returns empty result for no workflows', async () => {
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({ postEventWorkflows: [] }),
      ssiCredentials,
      services: makeMockServices(),
    })
    expect(result.summary.totalSteps).toBe(0)
    expect(result.steps).toHaveLength(0)
    expect(result.executedAt).toBeDefined()
  })

  it('returns empty result when template has no workflows', async () => {
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: { id: 'tpl-001', name: 'No Workflows' },
      ssiCredentials,
      services: makeMockServices(),
    })
    expect(result.summary.totalSteps).toBe(0)
  })

  it('executes all three workflow types successfully', async () => {
    const services = makeMockServices()
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate(),
      ssiCredentials,
      calendarConfig,
      services,
    })
    expect(result.summary.totalSteps).toBe(3)
    expect(result.summary.succeeded).toBe(3)
    expect(result.summary.failed).toBe(0)
    expect(result.steps).toHaveLength(3)
    expect(services.completeEventFn).toHaveBeenCalled()
    expect(services.updateCalendarStatsFn).toHaveBeenCalled()
    expect(services.ssiGetEventStatsFn).toHaveBeenCalled()
    expect(services.sendEmailFn).toHaveBeenCalled()
  })

  it('skips disabled workflows', async () => {
    const services = makeMockServices()
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({
        postEventWorkflows: [
          { type: 'complete_ssi', enabled: false },
          { type: 'update_calendar_stats', enabled: true },
        ],
      }),
      ssiCredentials,
      calendarConfig,
      services,
    })
    expect(result.summary.totalSteps).toBe(1)
    expect(services.completeEventFn).not.toHaveBeenCalled()
    expect(services.updateCalendarStatsFn).toHaveBeenCalled()
  })

  it('calls onProgress callback', async () => {
    const progress = vi.fn()
    await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({
        postEventWorkflows: [{ type: 'complete_ssi', enabled: true }],
      }),
      ssiCredentials,
      services: makeMockServices(),
      onProgress: progress,
    })
    expect(progress).toHaveBeenCalledWith(1, 1, expect.objectContaining({ type: 'complete_ssi', success: true }))
  })

  it('continues on step failure', async () => {
    const services = makeMockServices()
    services.completeEventFn.mockRejectedValue(new Error('SSI down'))
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate(),
      ssiCredentials,
      calendarConfig,
      services,
    })
    expect(result.summary.failed).toBe(1)
    expect(result.summary.succeeded).toBe(2) // stats + email still run
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].message).toContain('SSI down')
  })
})

// ============================================================
// PEW-4: complete_ssi step
// ============================================================

describe('complete_ssi workflow step', () => {
  it('skips when event is already completed', async () => {
    const services = makeMockServices()
    const result = await runPostEventWorkflows({
      event: makeEvent({ status: 'completed' }),
      template: makeTemplate({ postEventWorkflows: [{ type: 'complete_ssi', enabled: true }] }),
      ssiCredentials,
      services,
    })
    expect(result.steps[0].skipped).toBe(true)
    expect(services.completeEventFn).not.toHaveBeenCalled()
  })

  it('fails for events in wrong status', async () => {
    const result = await runPostEventWorkflows({
      event: makeEvent({ status: 'planned' }),
      template: makeTemplate({ postEventWorkflows: [{ type: 'complete_ssi', enabled: true }] }),
      ssiCredentials,
      services: makeMockServices(),
    })
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].message).toContain("status 'planned'")
  })

  it('fails when SSI references missing', async () => {
    const result = await runPostEventWorkflows({
      event: makeEvent({ ssiReferences: {} }),
      template: makeTemplate({ postEventWorkflows: [{ type: 'complete_ssi', enabled: true }] }),
      ssiCredentials,
      services: makeMockServices(),
    })
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].message).toContain('No SSI references')
  })

  it('fails when SSI credentials missing', async () => {
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({ postEventWorkflows: [{ type: 'complete_ssi', enabled: true }] }),
      ssiCredentials: {},
      services: makeMockServices(),
    })
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].message).toContain('Missing SSI credentials')
  })

  it('reports completeEvent failure', async () => {
    const services = makeMockServices()
    services.completeEventFn.mockResolvedValue({ success: false, error: 'Cup already closed' })
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({ postEventWorkflows: [{ type: 'complete_ssi', enabled: true }] }),
      ssiCredentials,
      services,
    })
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].message).toContain('Cup already closed')
  })
})

// ============================================================
// PEW-3: update_calendar_stats step
// ============================================================

describe('update_calendar_stats workflow step', () => {
  it('skips when no calendar reference', async () => {
    const services = makeMockServices()
    const result = await runPostEventWorkflows({
      event: makeEvent({ calendarReference: {} }),
      template: makeTemplate({ postEventWorkflows: [{ type: 'update_calendar_stats', enabled: true }] }),
      ssiCredentials,
      calendarConfig,
      services,
    })
    expect(result.steps[0].skipped).toBe(true)
    expect(services.updateCalendarStatsFn).not.toHaveBeenCalled()
  })

  it('skips when no calendar config', async () => {
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({ postEventWorkflows: [{ type: 'update_calendar_stats', enabled: true }] }),
      ssiCredentials,
      services: makeMockServices(),
    })
    expect(result.steps[0].skipped).toBe(true)
  })

  it('fails when no SSI references', async () => {
    const result = await runPostEventWorkflows({
      event: makeEvent({ ssiReferences: {} }),
      template: makeTemplate({ postEventWorkflows: [{ type: 'update_calendar_stats', enabled: true }] }),
      ssiCredentials,
      calendarConfig,
      services: makeMockServices(),
    })
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].message).toContain('No SSI references')
  })

  it('passes correct params to updateCalendarStatsFn', async () => {
    const services = makeMockServices()
    await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({ postEventWorkflows: [{ type: 'update_calendar_stats', enabled: true }] }),
      ssiCredentials,
      calendarConfig,
      services,
    })
    expect(services.updateCalendarStatsFn).toHaveBeenCalledWith(expect.objectContaining({
      ssiReferences: expect.objectContaining({ cupId: '201' }),
      calendarReference: expect.objectContaining({ eventId: '555' }),
      calendarConfig,
      ssiCredentials,
    }))
  })
})

// ============================================================
// PEW-2: email_shooter_count step
// ============================================================

describe('email_shooter_count workflow step', () => {
  it('sends email with correct content', async () => {
    const services = makeMockServices()
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({
        postEventWorkflows: [{ type: 'email_shooter_count', enabled: true, config: { to: ['admin@test.com'], cc: ['cc@test.com'] } }],
      }),
      ssiCredentials,
      services,
    })
    expect(result.steps[0].success).toBe(true)
    expect(result.steps[0].details.shooterCount).toBe(12)
    expect(services.sendEmailFn).toHaveBeenCalledWith(expect.objectContaining({
      to: ['admin@test.com'],
      cc: ['cc@test.com'],
      subject: expect.stringContaining('Shooter Count'),
      html: expect.stringContaining('12'),
    }))
  })

  it('fails when no recipients configured', async () => {
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({
        postEventWorkflows: [{ type: 'email_shooter_count', enabled: true, config: {} }],
      }),
      ssiCredentials,
      services: makeMockServices(),
    })
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].message).toContain('No email recipients')
  })

  it('fails when SSI references missing', async () => {
    const result = await runPostEventWorkflows({
      event: makeEvent({ ssiReferences: {} }),
      template: makeTemplate({
        postEventWorkflows: [{ type: 'email_shooter_count', enabled: true, config: { to: ['a@b.com'] } }],
      }),
      ssiCredentials,
      services: makeMockServices(),
    })
    expect(result.steps[0].success).toBe(false)
  })

  it('fails when email send fails', async () => {
    const services = makeMockServices()
    services.sendEmailFn.mockResolvedValue({ success: false, error: 'Resend API error' })
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({
        postEventWorkflows: [{ type: 'email_shooter_count', enabled: true, config: { to: ['a@b.com'] } }],
      }),
      ssiCredentials,
      services,
    })
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].message).toContain('Resend API error')
  })

  it('handles ssiGetEventStats error', async () => {
    const services = makeMockServices()
    services.ssiGetEventStatsFn.mockRejectedValue(new Error('GraphQL timeout'))
    const result = await runPostEventWorkflows({
      event: makeEvent(),
      template: makeTemplate({
        postEventWorkflows: [{ type: 'email_shooter_count', enabled: true, config: { to: ['a@b.com'] } }],
      }),
      ssiCredentials,
      services,
    })
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[0].message).toContain('GraphQL timeout')
  })
})
