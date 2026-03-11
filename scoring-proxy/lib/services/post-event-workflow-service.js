// ============================================================
// Post-Event Workflow Service (PEW-1, PEW-2, PEW-3, PEW-4)
// ============================================================
// Framework for executing post-event workflows after an event
// reaches a terminal state. Workflows are configured per template
// and executed sequentially.
//
// Workflow types:
//   - complete_ssi (PEW-4): Mark SSI event as completed
//   - update_calendar_stats (PEW-3): Update WP calendar with stats
//   - email_shooter_count (PEW-2): Email shooter count report
//
// Each workflow step produces a result with success/error/skipped
// status. The framework continues on step failure (non-blocking).
//
// Usage:
//   import { runPostEventWorkflows } from './post-event-workflow-service.js'
//   const result = await runPostEventWorkflows({ event, template, ... })
// ============================================================

import { log } from '../logger.js'

/**
 * Known workflow types and their display labels.
 */
export const WORKFLOW_TYPES = {
  complete_ssi: 'Complete SSI Event',
  update_calendar_stats: 'Update Calendar Statistics',
  email_shooter_count: 'Email Shooter Count Report',
}

/**
 * Validate a workflow configuration array.
 * @param {Array<{type: string, enabled?: boolean, config?: object}>} workflows
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWorkflows(workflows) {
  const errors = []
  if (!Array.isArray(workflows)) {
    return { valid: false, errors: ['postEventWorkflows must be an array'] }
  }
  for (let i = 0; i < workflows.length; i++) {
    const wf = workflows[i]
    if (!wf.type) {
      errors.push(`Workflow ${i}: missing 'type' field`)
    } else if (!WORKFLOW_TYPES[wf.type]) {
      errors.push(`Workflow ${i}: unknown type '${wf.type}' (valid: ${Object.keys(WORKFLOW_TYPES).join(', ')})`)
    }
    if (wf.type === 'email_shooter_count') {
      const to = wf.config?.to
      if (!to || !Array.isArray(to) || to.length === 0) {
        errors.push(`Workflow ${i} (email_shooter_count): config.to must be a non-empty array of email addresses`)
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Execute a single workflow step.
 *
 * @param {string} type - Workflow type
 * @param {object} config - Workflow-specific config
 * @param {object} context - Shared context (event, template, credentials, services)
 * @returns {Promise<{success: boolean, skipped?: boolean, message: string, details?: object}>}
 */
async function executeStep(type, config, context) {
  switch (type) {
    case 'complete_ssi':
      return executeCompleteSsi(context)
    case 'update_calendar_stats':
      return executeUpdateCalendarStats(context)
    case 'email_shooter_count':
      return executeEmailShooterCount(config, context)
    default:
      return { success: false, message: `Unknown workflow type: ${type}` }
  }
}

/**
 * PEW-4: Complete SSI event.
 * Skips if event is already completed.
 */
async function executeCompleteSsi(context) {
  const { event, ssiCredentials, completeEventFn } = context

  // Skip if already completed
  if (event.status === 'completed') {
    return { success: true, skipped: true, message: 'Event already completed in SSI' }
  }

  // Validate prerequisites
  if (!['ssi_created', 'calendar_published'].includes(event.status)) {
    return { success: false, message: `Cannot complete SSI event in status '${event.status}' (need ssi_created or calendar_published)` }
  }

  if (!event.ssiReferences?.cupId) {
    return { success: false, message: 'No SSI references — cannot complete' }
  }

  if (!ssiCredentials?.email || !ssiCredentials?.password) {
    return { success: false, message: 'Missing SSI credentials' }
  }

  if (!completeEventFn) {
    return { success: false, message: 'completeEvent function not provided' }
  }

  try {
    const result = await completeEventFn({
      ssiReferences: event.ssiReferences,
      ssiCredentials,
    })
    if (result.success) {
      return {
        success: true,
        message: `SSI event completed (${result.results?.length || 0} matches)`,
        details: { matchResults: result.results },
      }
    }
    return { success: false, message: result.error || 'SSI completion failed' }
  } catch (err) {
    return { success: false, message: `SSI completion error: ${err.message}` }
  }
}

/**
 * PEW-3: Update WordPress calendar with statistics.
 * Requires calendarReference and calendarConfig.
 */
async function executeUpdateCalendarStats(context) {
  const { event, template, ssiCredentials, calendarConfig, updateCalendarStatsFn } = context

  if (!event.calendarReference?.eventId) {
    return { success: true, skipped: true, message: 'No calendar reference — skipping stats update' }
  }

  if (!calendarConfig) {
    return { success: true, skipped: true, message: 'No calendar configuration — skipping stats update' }
  }

  if (!event.ssiReferences?.cupId) {
    return { success: false, message: 'No SSI references — cannot query stats' }
  }

  if (!updateCalendarStatsFn) {
    return { success: false, message: 'updateCalendarStats function not provided' }
  }

  try {
    const result = await updateCalendarStatsFn({
      ssiReferences: event.ssiReferences,
      calendarReference: event.calendarReference,
      calendarConfig,
      calendarTemplate: template?.calendarTemplate || {},
      ssiCredentials,
    })
    if (result.success) {
      return {
        success: true,
        message: `Calendar stats updated: ${result.stats?.approvedCount} participants, ${result.stats?.shotsFired} shots`,
        details: { stats: result.stats },
      }
    }
    return { success: false, message: result.error || 'Calendar stats update failed' }
  } catch (err) {
    return { success: false, message: `Calendar stats error: ${err.message}` }
  }
}

/**
 * PEW-2: Email shooter count report.
 * Requires SSI credentials to query stats, and Resend for email.
 */
async function executeEmailShooterCount(config, context) {
  const { event, ssiCredentials, ssiGetEventStatsFn, sendEmailFn } = context

  const to = config?.to
  if (!to || !Array.isArray(to) || to.length === 0) {
    return { success: false, message: 'No email recipients configured (config.to)' }
  }

  if (!event.ssiReferences?.cupId || !event.ssiReferences?.cupTypeId) {
    return { success: false, message: 'No SSI references — cannot query shooter count' }
  }

  if (!ssiCredentials?.email || !ssiCredentials?.password) {
    return { success: false, message: 'Missing SSI credentials' }
  }

  if (!ssiGetEventStatsFn) {
    return { success: false, message: 'ssiGetEventStats function not provided' }
  }

  if (!sendEmailFn) {
    return { success: false, message: 'sendEmail function not provided' }
  }

  try {
    // Query SSI for participant count
    const stats = await ssiGetEventStatsFn({
      credentials: ssiCredentials,
      cupTypeId: event.ssiReferences.cupTypeId,
      cupId: event.ssiReferences.cupId,
      isCup: event.ssiReferences.isCup !== false,
    })

    const shooterCount = stats.approvedCount
    const eventName = event.eventName || 'Unknown event'
    const eventDate = event.eventDate

    // Build and send email
    const subject = `Shooter Count: ${eventName} (${eventDate})`
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#1a73e8;">Shooter Count Report</h2>
        <table style="border-collapse:collapse;width:100%;margin-top:12px;">
          <tr><td style="padding:6px 12px;font-weight:bold;">Event</td><td style="padding:6px 12px;">${eventName}</td></tr>
          <tr style="background:#f8f9fa;"><td style="padding:6px 12px;font-weight:bold;">Date</td><td style="padding:6px 12px;">${eventDate}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;">Approved Shooters</td><td style="padding:6px 12px;font-size:1.2em;font-weight:bold;">${shooterCount}</td></tr>
        </table>
        <p style="color:#666;font-size:12px;margin-top:20px;">This report was generated automatically after event completion.</p>
      </div>
    `

    const cc = config?.cc || []
    const emailResult = await sendEmailFn({
      to: Array.isArray(to) ? to : [to],
      cc: Array.isArray(cc) ? cc : [cc],
      subject,
      html,
    })

    if (emailResult.success) {
      return {
        success: true,
        message: `Shooter count email sent to ${to.join(', ')} (${shooterCount} shooters)`,
        details: { shooterCount, recipients: to },
      }
    }
    return { success: false, message: emailResult.error || 'Email send failed' }
  } catch (err) {
    return { success: false, message: `Email workflow error: ${err.message}` }
  }
}

/**
 * Run all configured post-event workflows for an event.
 *
 * @param {object} params
 * @param {object} params.event - Scheduled event from DB
 * @param {object} [params.template] - Match template with postEventWorkflows config
 * @param {object} params.ssiCredentials - { email, password }
 * @param {object} [params.calendarConfig] - Tenant WP config
 * @param {object} params.services - Injected service functions:
 *   { completeEventFn, updateCalendarStatsFn, ssiGetEventStatsFn, sendEmailFn }
 * @param {function} [params.onProgress] - Progress callback (stepIndex, totalSteps, stepResult)
 * @returns {Promise<{summary: object, steps: Array<object>, executedAt: string}>}
 */
export async function runPostEventWorkflows({
  event,
  template,
  ssiCredentials,
  calendarConfig,
  services = {},
  onProgress,
}) {
  const workflows = template?.postEventWorkflows || []

  // Filter to enabled workflows only
  const enabledWorkflows = workflows.filter(wf => wf.enabled !== false)

  log.info(`[pew] Running ${enabledWorkflows.length} post-event workflows for event ${event.id} (${event.eventName || event.id})`)

  if (enabledWorkflows.length === 0) {
    return {
      summary: { totalSteps: 0, succeeded: 0, failed: 0, skipped: 0 },
      steps: [],
      executedAt: new Date().toISOString(),
    }
  }

  // Build shared context for all steps
  const context = {
    event,
    template,
    ssiCredentials,
    calendarConfig,
    completeEventFn: services.completeEventFn,
    updateCalendarStatsFn: services.updateCalendarStatsFn,
    ssiGetEventStatsFn: services.ssiGetEventStatsFn,
    sendEmailFn: services.sendEmailFn,
  }

  const steps = []

  for (let i = 0; i < enabledWorkflows.length; i++) {
    const wf = enabledWorkflows[i]
    const stepLabel = WORKFLOW_TYPES[wf.type] || wf.type

    log.info(`[pew] Step ${i + 1}/${enabledWorkflows.length}: ${stepLabel}`)

    const result = await executeStep(wf.type, wf.config || {}, context)
    const step = {
      type: wf.type,
      label: stepLabel,
      ...result,
    }
    steps.push(step)

    if (onProgress) onProgress(i + 1, enabledWorkflows.length, step)

    if (result.success) {
      log.info(`[pew] Step ${i + 1} ${result.skipped ? 'skipped' : 'succeeded'}: ${result.message}`)
    } else {
      log.warn(`[pew] Step ${i + 1} failed: ${result.message}`)
    }
  }

  const summary = {
    totalSteps: enabledWorkflows.length,
    succeeded: steps.filter(s => s.success && !s.skipped).length,
    failed: steps.filter(s => !s.success).length,
    skipped: steps.filter(s => s.success && s.skipped).length,
  }

  log.info(`[pew] Workflow complete: ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.skipped} skipped`)

  return {
    summary,
    steps,
    executedAt: new Date().toISOString(),
  }
}
