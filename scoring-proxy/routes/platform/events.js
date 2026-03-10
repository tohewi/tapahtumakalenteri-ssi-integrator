// ============================================================
// Platform Routes — Scheduled Events CRUD + SSI Execute + SSI Search/Import
// Mounted under /api/v1/platform by createPlatformRouter
// ============================================================

import { log } from '../../lib/logger.js'
import { AppError } from '../../lib/errors/AppError.js'
import { ssiFetchEventStructure, ssiSearchEvents } from '../../lib/ssi-core/seed-import.js'
import { createSsiEvent, deleteSsiEvent } from '../../lib/services/event-creation-service.js'
import { publishCalendarEvent, validateCalendarConfig } from '../../lib/services/calendar-publish-service.js'
import { updateCalendarStats } from '../../lib/services/calendar-stats-service.js'
import { completeEvent } from '../../lib/services/event-complete-service.js'
import {
  createScheduledEvent,
  createScheduledEventBatch,
  getScheduledEvent,
  listScheduledEvents,
  updateScheduledEvent,
  deleteScheduledEvent,
  cancelScheduledEvent,
  importSsiEvent,
  getImportedSsiEventIds,
  getMatchTemplate,
  getDiscipline,
  getTenantWithCredentials,
  listDisciplineTemplates,
  createAuditLog,
  TENANT_ROLES,
} from '../../lib/db/platform-store.js'

export function mountEventRoutes(router, { requirePlatformAuth, requireTenantRole, platformMutationLimiter, platformSsiLimiter }) {

  // GET /api/v1/platform/tenants/:tenantId/events
  router.get('/tenants/:tenantId/events', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    const { templateId, status } = req.query
    const events = await listScheduledEvents(req.params.tenantId, { templateId, status })
    res.json({ events })
  })

  // POST /api/v1/platform/tenants/:tenantId/events — Create event(s) for date(s)
  // Body: { templateId, dates: ['2026-03-14', '2026-03-21'] }
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/events', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const { templateId, dates } = req.body
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' })
    }
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: 'dates array is required (at least one date)' })
    }

    // Validate template belongs to this tenant
    const template = await getMatchTemplate(templateId)
    if (!template || template.tenantId !== req.params.tenantId) {
      return res.status(400).json({ error: 'Template not found in this tenant' })
    }

    // Validate date format (YYYY-MM-DD)
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    const invalidDates = dates.filter(d => !dateRe.test(d))
    if (invalidDates.length > 0) {
      return res.status(400).json({ error: `Invalid date format: ${invalidDates.join(', ')}. Use YYYY-MM-DD.` })
    }

    try {
      if (dates.length === 1) {
        // Single event
        const { eventId, event } = await createScheduledEvent({
          tenantId: req.params.tenantId,
          templateId,
          disciplineId: template.disciplineId || null,
          eventDate: dates[0],
          eventName: template.name || null,
          createdBy: req.account.id,
        })
        log.info(`[platform] Event scheduled: ${eventId} for ${dates[0]} (template ${templateId})`)
        res.status(201).json({ success: true, event })
      } else {
        // Batch creation
        const results = await createScheduledEventBatch({
          tenantId: req.params.tenantId,
          templateId,
          dates,
          createdBy: req.account.id,
        })
        const successCount = results.filter(r => r.success).length
        log.info(`[platform] Batch scheduled: ${successCount}/${dates.length} events for template ${templateId}`)
        res.status(201).json({ success: true, results })
      }
    } catch (err) {
      if (err.code === '23505' || err.message.includes('duplicate')) {
        return res.status(409).json({ error: 'An event already exists for this template on one of the specified dates' })
      }
      log.error('[platform] Event creation failed:', err.message)
      return next(new AppError('Failed to create scheduled event', 500, 'INTERNAL_ERROR'))
    }
  })

  // GET /api/v1/platform/tenants/:tenantId/events/:id
  router.get('/tenants/:tenantId/events/:id', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    const event = await getScheduledEvent(req.params.id)
    if (!event || event.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Event not found' })
    }
    res.json({ event })
  })

  // PATCH /api/v1/platform/tenants/:tenantId/events/:id — Update event status/references
  // Requires: owner, tenant_admin, or match_admin
  router.patch('/tenants/:tenantId/events/:id', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const event = await getScheduledEvent(req.params.id)
    if (!event || event.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Event not found' })
    }

    try {
      const updated = await updateScheduledEvent(req.params.id, req.body)
      if (!updated) {
        return res.status(404).json({ error: 'Event not found' })
      }
      res.json({ success: true, event: updated })
    } catch (err) {
      if (err.message.includes('unknown field')) {
        return res.status(400).json({ error: err.message })
      }
      log.error('[platform] Event update failed:', err.message)
      return next(new AppError('Failed to update event', 500, 'INTERNAL_ERROR'))
    }
  })

  // DELETE /api/v1/platform/tenants/:tenantId/events/:id — Delete event (and cascade to SSI if created)
  // Requires: owner, tenant_admin, or match_admin
  router.delete('/tenants/:tenantId/events/:id', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const event = await getScheduledEvent(req.params.id)
    if (!event || event.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Event not found' })
    }

    // MP10: Cascading Deletion
    // If the event is in 'ssi_created' status and has SSI references, try to delete it from SSI first.
    if (event.status === 'ssi_created' && event.ssiReferences) {
      const tenantFull = await getTenantWithCredentials(req.params.tenantId)
      if (!tenantFull?.ssiCredentials?.email || !tenantFull?.ssiCredentials?.password) {
        return res.status(400).json({ error: 'Cannot delete from SSI: Tenant SSI credentials missing' })
      }

      try {
        log.info(`[platform] Attempting cascading delete from SSI for event ${req.params.id}`)
        await deleteSsiEvent({
          ssiReferences: event.ssiReferences,
          credentials: {
            email: tenantFull.ssiCredentials.email,
            password: tenantFull.ssiCredentials.password,
          }
        })
      } catch (err) {
        // If the SSI event is already gone or the reference is stale/invalid, allow local deletion.
        const isStaleOrMissing = /no ssi reference|missing ssi|not found|404|already deleted/i.test(err.message)
        if (isStaleOrMissing) {
          log.warn(`[platform] SSI event already gone or reference invalid for ${req.params.id} — proceeding with local deletion: ${err.message}`)
        } else {
          log.error(`[platform] Failed to delete event from SSI for ${req.params.id}:`, err.message)
          return res.status(500).json({ error: `Failed to delete event from SSI: ${err.message}. Local event was not deleted.` })
        }
      }
    }

    const deleted = await deleteScheduledEvent(req.params.id)
    if (!deleted) {
      return res.status(400).json({ error: 'Failed to delete event from database' })
    }

    // SEC-H4: Audit log
    await createAuditLog({
      tenantId: req.params.tenantId,
      accountId: req.account.id,
      action: 'delete_event',
      targetType: 'event',
      targetId: req.params.id,
      metadata: { ssiCreated: event.status === 'ssi_created', status: event.status },
      ipAddress: req.ip
    })

    log.info(`[platform] Event deleted: ${req.params.id}`)
    res.json({ success: true })
  })

  // POST /api/v1/platform/tenants/:tenantId/events/:id/cancel
  // Soft-cancel a scheduled event. Keeps the DB record as 'cancelled'.
  // If the event is ssi_created and body.removeFromSsi is true, the SSI event is deleted first.
  // Returns { event, impact: { staffingSignups, removedFromSsi } }
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/events/:id/cancel', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    try {
      const event = await getScheduledEvent(req.params.id)
      if (!event || event.tenantId !== req.params.tenantId) {
        return res.status(404).json({ error: 'Event not found' })
      }

      if (event.status === 'cancelled') {
        return res.status(400).json({ error: 'Event is already cancelled' })
      }
      if (event.status === 'completed') {
        return res.status(400).json({ error: 'Completed events cannot be cancelled' })
      }

      // Count confirmed staffing signups for impact summary
      const { pool } = await import('../../lib/db/postgres.js')
      const db = await pool()
      const signupRes = await db.query(
        `SELECT COUNT(*) as count FROM staff_signups s
         JOIN event_staffing_needs n ON s.need_id = n.id
         WHERE n.event_id = $1 AND s.status = 'confirmed'`,
        [event.id]
      )
      const staffingSignups = parseInt(signupRes.rows[0].count, 10)

      // Optionally remove from SSI before cancelling
      let removedFromSsi = false
      const { removeFromSsi } = req.body
      if (removeFromSsi && event.status === 'ssi_created' && event.ssiReferences) {
        const tenantFull = await getTenantWithCredentials(req.params.tenantId)
        if (!tenantFull?.ssiCredentials?.email || !tenantFull?.ssiCredentials?.password) {
          return res.status(400).json({ error: 'Cannot remove from SSI: Tenant SSI credentials missing' })
        }
        try {
          log.info(`[platform] Cancellation: removing SSI event ${event.id}`)
          await deleteSsiEvent({
            ssiReferences: event.ssiReferences,
            credentials: { email: tenantFull.ssiCredentials.email, password: tenantFull.ssiCredentials.password },
          })
          removedFromSsi = true
        } catch (err) {
          const isStaleOrMissing = /no ssi reference|missing ssi|not found|404|already deleted/i.test(err.message)
          if (isStaleOrMissing) {
            log.warn(`[platform] SSI event already gone for ${event.id} — proceeding with cancellation: ${err.message}`)
            removedFromSsi = true
          } else {
            log.error(`[platform] Failed to remove SSI event for ${event.id}:`, err.message)
            return res.status(500).json({ error: `Failed to remove event from SSI: ${err.message}` })
          }
        }
      }

      const cancelled = await cancelScheduledEvent(event.id)
      if (!cancelled) {
        return res.status(409).json({ error: 'Event could not be cancelled (status may have changed)' })
      }

      await createAuditLog({
        tenantId: req.params.tenantId,
        accountId: req.account.id,
        action: 'cancel_event',
        targetType: 'event',
        targetId: event.id,
        metadata: { previousStatus: event.status, removedFromSsi, staffingSignups },
        ipAddress: req.ip
      })

      log.info(`[platform] Event cancelled: ${event.id} (removedFromSsi=${removedFromSsi})`)
      res.json({ event: cancelled, impact: { staffingSignups, removedFromSsi } })
    } catch (err) {
      log.error(`[platform] POST /cancel failed for event ${req.params.id}:`, err.message)
      return next(new AppError('Failed to cancel event', 500, 'INTERNAL_ERROR'))
    }
  })

  // POST /api/v1/platform/tenants/:tenantId/events/:id/execute
  // Triggers SSI event creation for a planned scheduled event.
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/events/:id/execute', platformSsiLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const event = await getScheduledEvent(req.params.id)
    if (!event || event.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Event not found' })
    }

    if (event.status !== 'planned' && event.status !== 'failed') {
      return res.status(400).json({ error: `Event is already ${event.status} — only planned or failed events can be executed` })
    }

    // Load template
    const template = await getMatchTemplate(event.templateId)
    if (!template) {
      return res.status(400).json({ error: 'Template not found for this event' })
    }
    if (!template.ssiSeedSnapshot) {
      return res.status(400).json({ error: 'Template has no imported seed — import from SSI first' })
    }

    // Fetch full credentials for SSI operation
    const tenantFull = await getTenantWithCredentials(req.params.tenantId)
    if (!tenantFull?.ssiCredentials?.email || !tenantFull?.ssiCredentials?.password) {
      return res.status(400).json({ error: 'Tenant SSI credentials must be configured' })
    }

    // Fetch discipline from DB for group/org/createUrl config
    const discipline = template.disciplineId ? await getDiscipline(template.disciplineId) : null

    try {
      const ssiReferences = await createSsiEvent({
        template,
        eventDate: event.eventDate,
        credentials: {
          email: tenantFull.ssiCredentials.email,
          password: tenantFull.ssiCredentials.password,
          apiKey: tenantFull.ssiCredentials.apiKey || null,
        },
        discipline,
      })

      // Update scheduled event with SSI references and status
      let updated = await updateScheduledEvent(req.params.id, {
        status: 'ssi_created',
        ssiReferences,
      })

      log.info(`[platform] SSI event created for ${event.eventDate}: cup ${ssiReferences.cupId}, ${ssiReferences.matches.length} matches`)

      // CAL-4: Attempt calendar publishing if tenant has calendarConfig
      let calendarResult = null
      if (tenantFull.calendarConfig && validateCalendarConfig(tenantFull.calendarConfig).valid) {
        const calendarTemplate = template.calendarTemplate
        if (calendarTemplate && Object.keys(calendarTemplate).length > 0) {
          log.info(`[platform] Attempting calendar publishing for event ${req.params.id}...`)
          calendarResult = await publishCalendarEvent({
            calendarConfig: tenantFull.calendarConfig,
            calendarTemplate,
            eventDate: event.eventDate,
            ssiReferences,
          })

          if (calendarResult.success) {
            updated = await updateScheduledEvent(req.params.id, {
              status: 'calendar_published',
              calendarReference: calendarResult.calendarReference,
            })
            log.info(`[platform] Calendar event published: ${calendarResult.calendarReference.eventId}`)
          } else {
            // Calendar failure — keep ssi_created status, store error
            await updateScheduledEvent(req.params.id, {
              calendarReference: calendarResult.calendarReference || { status: 'error', error: calendarResult.error },
            }).catch(() => {})
            log.warn(`[platform] Calendar publishing failed (non-fatal): ${calendarResult.error}`)
          }
        }
      }

      res.json({ success: true, event: updated, ssiReferences, calendarResult })
    } catch (err) {
      // Mark event as failed with error details
      await updateScheduledEvent(req.params.id, {
        status: 'failed',
        errorDetails: err.message,
      }).catch(() => {}) // don't fail if status update fails

      log.error(`[platform] SSI event creation failed for ${req.params.id}:`, err.message)
      if (err.message.includes('authentication') || err.message.includes('credentials')) {
        return res.status(401).json({ error: 'SSI authentication failed — check tenant credentials' })
      }
      return res.status(500).json({ error: `SSI event creation failed: ${err.message}` })
    }
  })

  // POST /api/v1/platform/tenants/:tenantId/events/:id/publish-calendar
  // Manual (re)trigger of calendar publishing for an event that has SSI references.
  // Useful when automatic calendar publishing failed during execute, or when
  // calendarConfig was configured after SSI creation.
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/events/:id/publish-calendar', platformSsiLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    try {
      const event = await getScheduledEvent(req.params.id)
      if (!event || event.tenantId !== req.params.tenantId) {
        return res.status(404).json({ error: 'Event not found' })
      }

      // Only allow for events that have SSI references
      if (!event.ssiReferences || !event.ssiReferences.cupId) {
        return res.status(400).json({ error: 'Event has no SSI references — execute the event first' })
      }

      // Don't re-publish if already published (unless forced)
      if (event.status === 'calendar_published' && !req.body.force) {
        return res.status(400).json({ error: 'Calendar event already published. Set force=true to re-publish.' })
      }

      // Load tenant with calendar config
      const tenantFull = await getTenantWithCredentials(req.params.tenantId)
      if (!tenantFull?.calendarConfig) {
        return res.status(400).json({ error: 'Tenant calendarConfig must be configured' })
      }

      const configCheck = validateCalendarConfig(tenantFull.calendarConfig)
      if (!configCheck.valid) {
        return res.status(400).json({ error: `Calendar config missing fields: ${configCheck.missing.join(', ')}` })
      }

      // Load template for calendarTemplate
      let calendarTemplate = {}
      if (event.templateId) {
        const template = await getMatchTemplate(event.templateId)
        calendarTemplate = template?.calendarTemplate || {}
      }

      if (!calendarTemplate.titleTemplate) {
        return res.status(400).json({ error: 'Template has no calendarTemplate.titleTemplate configured' })
      }

      log.info(`[platform] Manual calendar publish for event ${req.params.id}`)
      const calendarResult = await publishCalendarEvent({
        calendarConfig: tenantFull.calendarConfig,
        calendarTemplate,
        eventDate: event.eventDate,
        ssiReferences: event.ssiReferences,
      })

      if (calendarResult.success) {
        const updated = await updateScheduledEvent(req.params.id, {
          status: 'calendar_published',
          calendarReference: calendarResult.calendarReference,
        })
        log.info(`[platform] Calendar event published: ${calendarResult.calendarReference.eventId}`)
        res.json({ success: true, event: updated, calendarResult })
      } else {
        // Store error but don't change status
        await updateScheduledEvent(req.params.id, {
          calendarReference: calendarResult.calendarReference || { status: 'error', error: calendarResult.error },
        }).catch(() => {})
        log.warn(`[platform] Manual calendar publish failed: ${calendarResult.error}`)
        res.status(502).json({ success: false, error: calendarResult.error })
      }
    } catch (err) {
      log.error(`[platform] POST /publish-calendar failed for event ${req.params.id}:`, err.message)
      return next(new AppError('Calendar publishing failed', 500, 'INTERNAL_ERROR'))
    }
  })

  // POST /api/v1/platform/tenants/:tenantId/events/:id/update-calendar-stats
  // Update WordPress calendar event with statistics from SSI (CAL-5).
  // Queries SSI GraphQL for approved participant count, calculates shots fired,
  // and updates the calendar event's ACF fields.
  // Requires: calendar must be published + SSI references must exist.
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/events/:id/update-calendar-stats', platformSsiLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    try {
      const event = await getScheduledEvent(req.params.id)
      if (!event || event.tenantId !== req.params.tenantId) {
        return res.status(404).json({ error: 'Event not found' })
      }

      // Require SSI references (event must have been executed)
      if (!event.ssiReferences?.cupId || !event.ssiReferences?.cupTypeId) {
        return res.status(400).json({ error: 'Event has no SSI references — execute the event first' })
      }

      // Require calendar reference (calendar must have been published)
      if (!event.calendarReference?.eventId) {
        return res.status(400).json({ error: 'Event has no calendar reference — publish the calendar event first' })
      }

      // Load tenant with credentials
      const tenantFull = await getTenantWithCredentials(req.params.tenantId)
      if (!tenantFull?.calendarConfig) {
        return res.status(400).json({ error: 'Tenant calendarConfig must be configured' })
      }

      if (!tenantFull?.ssiCredentials?.email || !tenantFull?.ssiCredentials?.password) {
        return res.status(400).json({ error: 'Tenant SSI credentials must be configured' })
      }

      // Load template for shotsPerParticipant
      let calendarTemplate = {}
      if (event.templateId) {
        const template = await getMatchTemplate(event.templateId)
        calendarTemplate = template?.calendarTemplate || {}
      }

      log.info(`[platform] Updating calendar stats for event ${req.params.id}`)
      const result = await updateCalendarStats({
        ssiReferences: event.ssiReferences,
        calendarReference: event.calendarReference,
        calendarConfig: tenantFull.calendarConfig,
        calendarTemplate,
        ssiCredentials: tenantFull.ssiCredentials,
      })

      if (result.success) {
        // Store stats in calendarReference for display
        const updatedCalRef = {
          ...event.calendarReference,
          stats: result.stats,
        }
        const updated = await updateScheduledEvent(req.params.id, {
          calendarReference: updatedCalRef,
        })

        await createAuditLog({
          tenantId: req.params.tenantId,
          accountId: req.platformUser.id,
          action: 'update_calendar_stats',
          resourceType: 'scheduled_event',
          resourceId: req.params.id,
          details: {
            approvedCount: result.stats.approvedCount,
            shotsFired: result.stats.shotsFired,
            calendarEventId: event.calendarReference.eventId,
          },
        }).catch(() => {})

        log.info(`[platform] Calendar stats updated: ${result.stats.approvedCount} participants, ${result.stats.shotsFired} shots`)
        res.json({ success: true, event: updated, stats: result.stats })
      } else {
        log.warn(`[platform] Calendar stats update failed: ${result.error}`)
        res.status(502).json({ success: false, error: result.error })
      }
    } catch (err) {
      log.error(`[platform] POST /update-calendar-stats failed for event ${req.params.id}:`, err.message)
      return next(new AppError('Calendar statistics update failed', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // SSI Event Complete (CAL-7)
  // ============================================================

  // POST /api/v1/platform/tenants/:tenantId/events/:id/complete-ssi
  // Complete an SSI event (set status to 'cp').
  // For cups: completes all component matches, then the cup.
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/events/:id/complete-ssi', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    try {
      const event = await getScheduledEvent(req.params.id)
      if (!event) return res.status(404).json({ error: 'Event not found' })
      if (event.tenant_id !== req.params.tenantId) return res.status(403).json({ error: 'Event belongs to another tenant' })

      // Must have SSI references
      const ssiRefs = event.ssi_references
      if (!ssiRefs?.cupId) {
        return res.status(400).json({ error: 'Event has no SSI references — cannot complete' })
      }

      // Must be in ssi_created or calendar_published status
      const validStatuses = ['ssi_created', 'calendar_published']
      if (!validStatuses.includes(event.status)) {
        return res.status(400).json({ error: `Event status "${event.status}" cannot be completed. Must be one of: ${validStatuses.join(', ')}` })
      }

      // Fetch tenant SSI credentials
      const tenantFull = await getTenantWithCredentials(req.params.tenantId)
      if (!tenantFull?.ssiCredentials?.email || !tenantFull?.ssiCredentials?.password) {
        return res.status(400).json({ error: 'Tenant SSI credentials must be configured before completing events' })
      }

      log.info(`[platform] POST /complete-ssi for event ${req.params.id} (SSI ${ssiRefs.cupTypeId}/${ssiRefs.cupId}) by account ${req.platformUser.id}`)

      const result = await completeEvent({
        ssiReferences: ssiRefs,
        ssiCredentials: {
          email: tenantFull.ssiCredentials.email,
          password: tenantFull.ssiCredentials.password,
        },
      })

      if (result.success) {
        // Update event with completion info
        const completionInfo = {
          completedAt: new Date().toISOString(),
          completedBy: req.platformUser.id,
          matchResults: result.results,
          cupResult: result.cupResult,
        }

        // Store completion info in ssi_references
        await updateScheduledEvent(req.params.id, {
          ssi_references: {
            ...ssiRefs,
            ssiStatus: 'cp',
            completion: completionInfo,
          },
        })

        // Audit log
        const { auditLog } = req.app.locals
        if (auditLog) {
          await auditLog({
            tenant_id: req.params.tenantId,
            account_id: req.platformUser.id,
            action: 'event.complete_ssi',
            target_type: 'scheduled_event',
            target_id: req.params.id,
            details: {
              ssiCupId: ssiRefs.cupId,
              matchesCompleted: result.results?.length || 0,
              cupCompleted: result.cupResult?.success || false,
            },
          })
        }

        // Return updated event
        const updated = await getScheduledEvent(req.params.id)
        res.json({ success: true, event: updated, completion: completionInfo })
      } else {
        log.warn(`[platform] SSI complete failed: ${result.error}`)
        res.status(502).json({ success: false, error: result.error, results: result.results })
      }
    } catch (err) {
      log.error(`[platform] POST /complete-ssi failed for event ${req.params.id}:`, err.message)
      return next(new AppError('SSI event completion failed', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // SSI Event Search & Import
  // ============================================================

  // POST /api/v1/platform/tenants/:tenantId/ssi-search
  // Search SSI events via GraphQL with filtering.
  // Body: { search, sport?, startsAfter?, startsBefore?, region? }
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/ssi-search', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const { search, sport, startsAfter, startsBefore, region } = req.body

    if (!search || search.trim().length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' })
    }

    // Fetch full credentials for SSI operation
    const tenantFull = await getTenantWithCredentials(req.params.tenantId)
    if (!tenantFull?.ssiCredentials?.email || !tenantFull?.ssiCredentials?.password) {
      return res.status(400).json({ error: 'Tenant SSI credentials must be configured before searching SSI events' })
    }

    try {
      const events = await ssiSearchEvents({
        credentials: {
          email: tenantFull.ssiCredentials.email,
          password: tenantFull.ssiCredentials.password,
          apiKey: tenantFull.ssiCredentials.apiKey || null,
        },
        search,
        sport: sport || null,
        startsAfter: startsAfter || null,
        startsBefore: startsBefore || null,
        region: region || null,
      })

      // Check which events are already imported for this tenant
      const importedIds = await getImportedSsiEventIds(req.params.tenantId)
      const enriched = events.map(e => ({
        ...e,
        alreadyImported: importedIds.has(String(e.ssiEventId)),
      }))

      log.info(`[platform] SSI search for "${search}": ${events.length} results (${importedIds.size} already imported)`)
      res.json({ events: enriched })
    } catch (err) {
      log.error(`[platform] SSI search failed:`, err.message)
      if (err.message.includes('authentication') || err.message.includes('credentials')) {
        return res.status(401).json({ error: 'SSI authentication failed — check tenant credentials' })
      }
      return next(new AppError('SSI event search failed', 500, 'INTERNAL_ERROR'))
    }
  })

  // POST /api/v1/platform/tenants/:tenantId/ssi-import
  // Import selected SSI events as local scheduled_events.
  // Body: { events: [{ ssiEventId, name, starts, contentTypeKey, url, rule, region }] }
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/ssi-import', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const { events, disciplineId } = req.body

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array is required (at least one event to import)' })
    }

    if (events.length > 50) {
      return res.status(400).json({ error: 'Cannot import more than 50 events at once' })
    }

    // Auto-resolve template from discipline so imported events get staffing needs
    let templateId = null
    if (disciplineId) {
      const discTemplates = await listDisciplineTemplates(disciplineId)
      if (discTemplates.length > 0) {
        templateId = discTemplates[0].id
      }
    }

    const results = []
    for (const ssiEvent of events) {
      try {
        if (!ssiEvent.ssiEventId || !ssiEvent.name || !ssiEvent.starts) {
          results.push({ success: false, name: ssiEvent.name || '?', error: 'Missing required fields (ssiEventId, name, starts)' })
          continue
        }

        // Extract date from starts (ISO datetime → YYYY-MM-DD)
        const eventDate = ssiEvent.starts.substring(0, 10)

        const ssiReferences = {
          ssiEventId: ssiEvent.ssiEventId,
          contentTypeKey: ssiEvent.contentTypeKey || null,
          url: ssiEvent.url || null,
          name: ssiEvent.name,
          rule: ssiEvent.rule || null,
          region: ssiEvent.region || null,
          componentMatchCount: ssiEvent.componentMatchCount || 0,
          isCup: ssiEvent.isCup || false,
          importedFrom: 'ssi_search',
        }

        const { eventId, event } = await importSsiEvent({
          tenantId: req.params.tenantId,
          eventName: ssiEvent.name,
          eventDate,
          ssiReferences,
          templateId: templateId || null,
          disciplineId: disciplineId || null,
          createdBy: req.account.id,
        })

        results.push({ success: true, eventId, event, name: ssiEvent.name })
      } catch (err) {
        results.push({ success: false, name: ssiEvent.name || '?', error: err.message })
      }
    }

    const successCount = results.filter(r => r.success).length
    log.info(`[platform] SSI import: ${successCount}/${events.length} events imported for tenant ${req.params.tenantId}`)
    res.status(201).json({ success: true, results, imported: successCount, total: events.length })
  })
}
