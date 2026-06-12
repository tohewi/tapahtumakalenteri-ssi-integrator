// ============================================================
// Platform Store — Scheduled Events CRUD
// ============================================================

import { query } from '../postgres.js'
import { generateId } from './utils.js'
import { getMatchTemplate } from './templates.js'

// ---- Constants ----

/**
 * Valid scheduled event statuses.
 * Lifecycle: planned → ssi_created → calendar_published → staffed → ready → completed
 * Any state can transition to → failed (with error_details)
 */
export const EVENT_STATUSES = ['planned', 'ssi_created', 'calendar_published', 'staffed', 'ready', 'completed', 'cancelled', 'failed']

// ---- Row mapper ----

function rowToEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateId: row.template_id || null,
    disciplineId: row.discipline_id || null,
    eventName: row.event_name || null,
    eventDate: row.event_date,
    status: row.status,
    ssiReferences: row.ssi_references || {},
    calendarReference: row.calendar_reference || {},
    assignedStaff: row.assigned_staff || [],
    errorDetails: row.error_details || null,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

// ---- Event CRUD ----

/**
 * Create a scheduled event for a specific date from a template.
 * @param {object} params - { tenantId, templateId, eventDate, createdBy }
 * @returns {{ eventId, event }}
 */
export async function createScheduledEvent({ tenantId, templateId, disciplineId = null, eventDate, createdBy, eventName = null }) {
  const eventId = generateId('evt')
  const { rows } = await query(
    `INSERT INTO scheduled_events (id, tenant_id, template_id, discipline_id, event_name, event_date, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7)
     RETURNING *`,
    [eventId, tenantId, templateId, disciplineId, eventName, eventDate, createdBy]
  )

  // Auto-populate staffing needs from template's staffing_rules
  if (templateId) {
    try {
      const template = await getMatchTemplate(templateId)
      const roles = template?.staffingRules?.roles
      if (Array.isArray(roles) && roles.length > 0) {
        for (const role of roles) {
          const needId = generateId('ned')
          await query(
            'INSERT INTO event_staffing_needs (id, event_id, role_key, role_label, min_count, max_count) VALUES ($1, $2, $3, $4, $5, $6)',
            [needId, eventId, role.key, role.label || role.key, role.min || 0, role.max || 1]
          )
        }
      }
    } catch (err) {
      // Log but don't fail event creation if staffing auto-populate fails
      console.warn('[platform-store] Failed to auto-populate staffing needs:', err.message)
    }
  }

  return { eventId, event: rowToEvent(rows[0]) }
}

/**
 * Get the set of SSI event IDs that are already imported for a tenant.
 * Used to mark already-imported events in search results.
 */
export async function getImportedSsiEventIds(tenantId) {
  const { rows } = await query(
    `SELECT ssi_references->>'ssiEventId' as ssi_event_id
     FROM scheduled_events
     WHERE tenant_id = $1 AND ssi_references->>'ssiEventId' IS NOT NULL`,
    [tenantId]
  )
  return new Set(rows.map(r => r.ssi_event_id))
}

export async function importSsiEvent({ tenantId, eventName, eventDate, ssiReferences, createdBy, templateId = null, disciplineId = null }) {
  // Prevent duplicate imports: check if this SSI event is already imported for this tenant
  if (ssiReferences?.ssiEventId) {
    const { rows: existing } = await query(
      `SELECT id FROM scheduled_events WHERE tenant_id = $1 AND ssi_references->>'ssiEventId' = $2`,
      [tenantId, String(ssiReferences.ssiEventId)]
    )
    if (existing.length > 0) {
      throw new Error(`Already imported: "${eventName}" (SSI #${ssiReferences.ssiEventId})`)
    }
  }

  const eventId = generateId('evt')
  const { rows } = await query(
    `INSERT INTO scheduled_events (id, tenant_id, template_id, discipline_id, event_name, event_date, status, ssi_references, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'ssi_created', $7, $8)
     RETURNING *`,
    [eventId, tenantId, templateId, disciplineId, eventName, eventDate, JSON.stringify(ssiReferences), createdBy]
  )

  // Auto-populate staffing needs from template's staffing_rules
  if (templateId) {
    try {
      const template = await getMatchTemplate(templateId)
      const roles = template?.staffingRules?.roles
      if (Array.isArray(roles) && roles.length > 0) {
        for (const role of roles) {
          const needId = generateId('ned')
          await query(
            'INSERT INTO event_staffing_needs (id, event_id, role_key, role_label, min_count, max_count) VALUES ($1, $2, $3, $4, $5, $6)',
            [needId, eventId, role.key, role.label || role.key, role.min || 0, role.max || 1]
          )
        }
      }
    } catch (err) {
      console.warn('[platform-store] Failed to auto-populate staffing needs for SSI import:', err.message)
    }
  }

  return { eventId, event: rowToEvent(rows[0]) }
}

/**
 * Create multiple scheduled events in a batch (one per date).
 * Returns array of { eventId, event } or { error, date } for failures.
 * Uses individual inserts (not transaction) so partial success is possible.
 */
export async function createScheduledEventBatch({ tenantId, templateId, dates, createdBy }) {
  // Look up template once to derive event names and disciplineId
  let template = null
  try { template = await getMatchTemplate(templateId) } catch { /* ignore */ }

  const results = []
  for (const date of dates) {
    try {
      const { eventId, event } = await createScheduledEvent({
        tenantId, templateId, eventDate: date, createdBy,
        disciplineId: template?.disciplineId || null,
        eventName: template?.name || null,
      })
      results.push({ success: true, eventId, event, date })
    } catch (err) {
      const isDuplicate = err.code === '23505' || err.message.includes('duplicate')
      results.push({
        success: false,
        date,
        error: isDuplicate ? `Event already exists for ${date}` : err.message,
      })
    }
  }
  return results
}

/**
 * Get a scheduled event by ID.
 */
export async function getScheduledEvent(eventId) {
  const { rows } = await query(
    'SELECT * FROM scheduled_events WHERE id = $1',
    [eventId]
  )
  if (rows.length === 0) return null
  return rowToEvent(rows[0])
}

/**
 * List scheduled events for a tenant, ordered by date.
 * Optionally filter by templateId and/or status.
 */
export async function listScheduledEvents(tenantId, { templateId, status } = {}) {
  let sql = 'SELECT * FROM scheduled_events WHERE tenant_id = $1'
  const params = [tenantId]
  let paramIdx = 2

  if (templateId) {
    sql += ` AND template_id = $${paramIdx}`
    params.push(templateId)
    paramIdx++
  }
  if (status) {
    sql += ` AND status = $${paramIdx}`
    params.push(status)
    paramIdx++
  }

  sql += ' ORDER BY event_date ASC'
  const { rows } = await query(sql, params)
  return rows.map(rowToEvent)
}

/**
 * Update a scheduled event's status and optional fields.
 * Used during SSI creation, calendar publishing, staffing, etc.
 */
export async function updateScheduledEvent(eventId, updates) {
  const allowedFields = {
    status: 'status',
    ssiReferences: 'ssi_references',
    calendarReference: 'calendar_reference',
    assignedStaff: 'assigned_staff',
    errorDetails: 'error_details',
  }

  for (const key of Object.keys(updates)) {
    if (!(key in allowedFields)) {
      throw new Error(`updateScheduledEvent: unknown field '${key}'`)
    }
  }

  const setClauses = []
  const params = [eventId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      const value = typeof updates[key] === 'object' ? JSON.stringify(updates[key]) : updates[key]
      setClauses.push(`${column} = $${paramIndex}`)
      params.push(value)
      paramIndex++
    }
  }

  if (setClauses.length === 0) return getScheduledEvent(eventId)

  setClauses.push('updated_at = NOW()')

  const { rows } = await query(
    `UPDATE scheduled_events SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  if (rows.length === 0) return null
  return rowToEvent(rows[0])
}

/**
 * Delete a scheduled event. Allows deleting events in any status.
 * The caller should handle cascading deletions to external systems before calling this.
 * @returns {boolean}
 */
export async function deleteScheduledEvent(eventId) {
  const { rows } = await query(
    `DELETE FROM scheduled_events WHERE id = $1 RETURNING id`,
    [eventId]
  )
  return rows.length > 0
}

/**
 * Soft-cancel a scheduled event: set status to 'cancelled'.
 * Cannot cancel events that are already 'cancelled' or 'completed'.
 * @returns {object|null} updated event, or null if not found / not cancellable
 */
export async function cancelScheduledEvent(eventId) {
  const { rows } = await query(
    `UPDATE scheduled_events
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND status NOT IN ('cancelled', 'completed')
     RETURNING *`,
    [eventId]
  )
  return rows.length > 0 ? rowToEvent(rows[0]) : null
}
