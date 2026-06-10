// ============================================================
// Platform Store — Staffing (Roster) Operations
// ============================================================

import { query, getPool } from '../postgres.js'
import { generateId } from './utils.js'

// ---- Staffing Queries ----

/**
 * Get upcoming events that need staff for a tenant.
 * Returns array of { event, needs[], isUnderstaffed }.
 */
export async function getUpcomingStaffingNeeds(tenantId) {
  const result = await query(`
    SELECT 
      e.id as event_id, e.event_date, e.event_name, e.status as event_status, e.ssi_references,
      e.created_by,
      mt.name as template_name, mt.overrides as template_overrides,
      mt.ssi_seed_snapshot as seed_snapshot,
      mt.staffing_rules as template_staffing_rules,
      d.name as discipline_name,
      creator.name as creator_name,
      n.id as need_id, n.role_key, n.role_label, n.min_count, n.max_count,
      s.id as signup_id, s.account_id, a.name as account_name, s.status, s.notes
    FROM scheduled_events e
    JOIN event_staffing_needs n ON e.id = n.event_id
    LEFT JOIN staff_signups s ON n.id = s.need_id AND s.status = 'confirmed'
    LEFT JOIN accounts a ON s.account_id = a.id
    LEFT JOIN match_templates mt ON e.template_id = mt.id
    LEFT JOIN disciplines d ON mt.discipline_id = d.id
    LEFT JOIN accounts creator ON e.created_by = creator.id
    WHERE e.tenant_id = $1 AND e.event_date >= CURRENT_DATE
    ORDER BY e.event_date ASC, n.role_label ASC
  `, [tenantId])

  const eventsMap = {}
  for (const row of result.rows) {
    if (!eventsMap[row.event_id]) {
      // Derive venue from template overrides
      const overrides = row.template_overrides || {}
      const snapshot = row.seed_snapshot || {}
      const venue = overrides.venue || snapshot.venue || null
      // Derive match count from seed snapshot
      const matchCount = snapshot.matchCount || (snapshot.matches ? snapshot.matches.length : null)

      eventsMap[row.event_id] = {
        event: {
          id: row.event_id,
          eventDate: row.event_date,
          eventName: row.event_name || row.template_name || 'Unnamed Event',
          status: row.event_status,
          ssiReferences: row.ssi_references || {},
          templateName: row.template_name || null,
          disciplineName: row.discipline_name || null,
          venue,
          matchCount,
          createdBy: row.creator_name || null,
          templateStaffingRules: row.template_staffing_rules || {},
        },
        needs: [],
        isUnderstaffed: false
      }
    }
    const evt = eventsMap[row.event_id]

    let need = evt.needs.find(n => n.id === row.need_id)
    if (!need) {
      need = {
        id: row.need_id,
        roleKey: row.role_key,
        roleLabel: row.role_label,
        minCount: row.min_count,
        maxCount: row.max_count,
        signups: []
      }
      evt.needs.push(need)
    }

    if (row.signup_id) {
      need.signups.push({
        id: row.signup_id,
        accountId: row.account_id,
        accountName: row.account_name,
        status: row.status,
        notes: row.notes
      })
    }
  }

  const events = Object.values(eventsMap)
  for (const evt of events) {
    evt.isUnderstaffed = evt.needs.some(n => n.signups.length < n.minCount)
  }

  return events
}

/**
 * Get my own staffing commitments for a tenant.
 * Returns array of { event, need, signup }.
 */
export async function getMyStaffingAssignments(tenantId, accountId) {
  const result = await query(`
    SELECT 
      e.id as event_id, e.event_date, e.event_name,
      n.id as need_id, n.role_key, n.role_label,
      s.id as signup_id, s.status, s.notes, s.signed_up_at
    FROM staff_signups s
    JOIN event_staffing_needs n ON s.need_id = n.id
    JOIN scheduled_events e ON n.event_id = e.id
    WHERE e.tenant_id = $1 AND s.account_id = $2 AND s.status = 'confirmed' AND e.event_date >= CURRENT_DATE
    ORDER BY e.event_date ASC
  `, [tenantId, accountId])

  return result.rows.map(row => ({
    event: { id: row.event_id, eventDate: row.event_date, eventName: row.event_name },
    need: { id: row.need_id, roleKey: row.role_key, roleLabel: row.role_label },
    signup: { id: row.signup_id, status: row.status, notes: row.notes, signedUpAt: row.signed_up_at }
  }))
}

/**
 * Get staffing details for a specific event (needs + signups).
 * Returns { event, needs[] } or null if event not found.
 */
export async function getEventStaffing(tenantId, eventId) {
  const evtRes = await query(`
    SELECT e.id, e.event_date, e.event_name, e.ssi_references, mt.staffing_rules as template_staffing_rules
    FROM scheduled_events e
    LEFT JOIN match_templates mt ON e.template_id = mt.id
    WHERE e.id = $1 AND e.tenant_id = $2
  `, [eventId, tenantId])
  if (evtRes.rows.length === 0) return null

  const event = {
    id: evtRes.rows[0].id,
    eventDate: evtRes.rows[0].event_date,
    eventName: evtRes.rows[0].event_name,
    ssiReferences: evtRes.rows[0].ssi_references || {},
    templateStaffingRules: evtRes.rows[0].template_staffing_rules || {},
  }

  const result = await query(`
    SELECT 
      n.id as need_id, n.role_key, n.role_label, n.min_count, n.max_count,
      s.id as signup_id, s.account_id, a.name as account_name, a.email as account_email, s.status, s.notes
    FROM event_staffing_needs n
    LEFT JOIN staff_signups s ON n.id = s.need_id AND s.status = 'confirmed'
    LEFT JOIN accounts a ON s.account_id = a.id
    WHERE n.event_id = $1
    ORDER BY n.role_label ASC
  `, [eventId])

  const needsMap = {}

  for (const row of result.rows) {
    if (!row.need_id) continue
    if (!needsMap[row.need_id]) {
      needsMap[row.need_id] = {
        id: row.need_id,
        roleKey: row.role_key,
        roleLabel: row.role_label,
        minCount: row.min_count,
        maxCount: row.max_count,
        signups: []
      }
    }

    if (row.signup_id) {
      needsMap[row.need_id].signups.push({
        id: row.signup_id,
        accountId: row.account_id,
        accountName: row.account_name,
        accountEmail: row.account_email,
        status: row.status,
        notes: row.notes
      })
    }
  }

  return { event, needs: Object.values(needsMap) }
}

/**
 * Update staffing needs for an event (upsert/delete pattern).
 */
export async function updateEventStaffingNeeds(tenantId, eventId, needsArray) {
  const evtRes = await query('SELECT id FROM scheduled_events WHERE id = $1 AND tenant_id = $2', [eventId, tenantId])
  if (evtRes.rows.length === 0) throw new Error('Event not found')

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    const currentRes = await client.query('SELECT id, role_key FROM event_staffing_needs WHERE event_id = $1', [eventId])
    const currentNeeds = currentRes.rows

    const keptNeedIds = new Set()
    for (const need of needsArray) {
      if (need.id) {
        await client.query(
          'UPDATE event_staffing_needs SET role_label = $1, min_count = $2, max_count = $3 WHERE id = $4 AND event_id = $5',
          [need.roleLabel, need.minCount, need.maxCount, need.id, eventId]
        )
        keptNeedIds.add(need.id)
      } else {
        const newId = generateId('ned')
        await client.query(
          'INSERT INTO event_staffing_needs (id, event_id, role_key, role_label, min_count, max_count) VALUES ($1, $2, $3, $4, $5, $6)',
          [newId, eventId, need.roleKey, need.roleLabel, need.minCount, need.maxCount]
        )
        keptNeedIds.add(newId)
      }
    }

    for (const cn of currentNeeds) {
      if (!keptNeedIds.has(cn.id)) {
        await client.query('DELETE FROM event_staffing_needs WHERE id = $1', [cn.id])
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Sign up for an event staffing role.
 * Validates need exists, role isn't full, and account hasn't already signed up.
 */
export async function signupForEventStaffing(tenantId, eventId, needId, accountId, notes) {
  const res = await query(
    'SELECT n.id, n.max_count FROM event_staffing_needs n JOIN scheduled_events e ON n.event_id = e.id WHERE n.id = $1 AND e.id = $2 AND e.tenant_id = $3',
    [needId, eventId, tenantId]
  )
  if (res.rows.length === 0) throw new Error('Need or event not found')

  const maxCount = res.rows[0].max_count

  const countRes = await query(
    "SELECT COUNT(*) as count FROM staff_signups WHERE need_id = $1 AND status = 'confirmed'",
    [needId]
  )
  if (parseInt(countRes.rows[0].count) >= maxCount) {
    throw new Error('This role is already fully staffed')
  }

  // Check if already signed up for THIS specific role
  const existingRes = await query(
    "SELECT id, status FROM staff_signups WHERE need_id = $1 AND account_id = $2",
    [needId, accountId]
  )
  if (existingRes.rows.length > 0 && existingRes.rows[0].status === 'confirmed') {
    throw new Error('You are already signed up for this role')
  }

  // Check if already signed up for ANY other role in the same event
  const otherRoleRes = await query(
    `SELECT s.id, n.role_label FROM staff_signups s
     JOIN event_staffing_needs n ON s.need_id = n.id
     WHERE n.event_id = $1 AND s.account_id = $2 AND s.status = 'confirmed' AND s.need_id != $3`,
    [eventId, accountId, needId]
  )
  if (otherRoleRes.rows.length > 0) {
    const existingRole = otherRoleRes.rows[0].role_label
    throw new Error(`You are already signed up as ${existingRole} for this event. Withdraw first to change roles.`)
  }

  const id = generateId('sup')
  const insertRes = await query(
    `INSERT INTO staff_signups (id, event_id, need_id, account_id, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (need_id, account_id) DO UPDATE SET status = 'confirmed', notes = EXCLUDED.notes
     RETURNING *`,
    [id, eventId, needId, accountId, 'confirmed', notes || null]
  )
  return insertRes.rows[0]
}

/**
 * Backfill staffing needs for existing events that have a template with staffing_rules
 * but no event_staffing_needs rows yet. Purely local DB — no SSI writes.
 * @param {string} tenantId
 * @returns {{ backfilledCount, skippedCount, errors[] }}
 */
export async function backfillStaffingNeeds(tenantId, { defaultTemplateId } = {}) {
  // Find upcoming events with no staffing needs rows yet
  const { rows: events } = await query(`
    SELECT e.id as event_id, e.event_name, e.template_id, e.discipline_id, e.event_date
    FROM scheduled_events e
    LEFT JOIN event_staffing_needs n ON e.id = n.event_id
    WHERE e.tenant_id = $1
      AND n.id IS NULL
      AND e.event_date >= CURRENT_DATE
  `, [tenantId])

  console.log(`[backfill] Found ${events.length} events without staffing needs for tenant ${tenantId}`)
  for (const e of events) {
    console.log(`[backfill]   event=${e.event_id} name="${e.event_name}" date=${e.event_date} tpl=${e.template_id} disc=${e.discipline_id}`)
  }

  // Pre-load all templates for this tenant (keyed by id and by discipline_id)
  const { rows: tplRows } = await query(
    `SELECT id, name, discipline_id, staffing_rules FROM match_templates WHERE tenant_id = $1`, [tenantId]
  )
  console.log(`[backfill] Found ${tplRows.length} templates for tenant`)
  for (const t of tplRows) {
    const rolesCount = Array.isArray(t.staffing_rules?.roles) ? t.staffing_rules.roles.length : 0
    console.log(`[backfill]   tpl=${t.id} name="${t.name}" disc=${t.discipline_id} roles=${rolesCount} staffing_rules=${JSON.stringify(t.staffing_rules)}`)
  }

  const templatesById = {}
  const templatesByDiscipline = {}
  for (const t of tplRows) {
    templatesById[t.id] = t
    if (t.discipline_id) {
      // Keep first match per discipline (if multiple templates, first wins)
      if (!templatesByDiscipline[t.discipline_id]) {
        templatesByDiscipline[t.discipline_id] = t
      }
    }
  }

  let backfilledCount = 0
  let skippedCount = 0
  const errors = []
  const populated = []  // events that got staffing needs
  const skipped = []    // events skipped (no template or no roles)

  for (const evt of events) {
    // Format event date for display (YYYY-MM-DD → dd.mm.yyyy)
    const dateStr = evt.event_date instanceof Date
      ? evt.event_date.toISOString().split('T')[0]
      : String(evt.event_date || '').split('T')[0]
    const displayDate = dateStr ? dateStr.split('-').reverse().join('.') : '?'
    const displayName = evt.event_name || displayDate

    try {
      // Resolve template: direct link first, then match by discipline, then default
      let tpl = evt.template_id ? templatesById[evt.template_id] : null
      let matchMethod = evt.template_id ? 'template_id' : 'none'
      if (!tpl && evt.discipline_id) {
        tpl = templatesByDiscipline[evt.discipline_id]
        if (tpl) matchMethod = 'discipline_id'
      }
      if (!tpl && defaultTemplateId) {
        tpl = templatesById[defaultTemplateId]
        if (tpl) matchMethod = 'default_template'
      }
      // Auto-link the template to the event for future consistency
      if (tpl && matchMethod !== 'template_id') {
        await query(
          'UPDATE scheduled_events SET template_id = $1, discipline_id = COALESCE(discipline_id, $2) WHERE id = $3',
          [tpl.id, tpl.discipline_id, evt.event_id]
        )
      }
      console.log(`[backfill]   processing event=${evt.event_id}: matched=${matchMethod} tpl=${tpl?.id || 'NONE'}`)

      const staffingRules = tpl?.staffing_rules || {}
      const roles = staffingRules?.roles
      if (!Array.isArray(roles) || roles.length === 0) {
        console.log(`[backfill]   SKIP event=${evt.event_id}: no roles in staffing_rules (keys: ${Object.keys(staffingRules).join(',')})`)
        skippedCount++
        skipped.push({ eventId: evt.event_id, name: displayName, date: displayDate, reason: tpl ? 'no roles in template' : 'no template matched' })
        continue
      }
      for (const role of roles) {
        const needId = generateId('ned')
        await query(
          'INSERT INTO event_staffing_needs (id, event_id, role_key, role_label, min_count, max_count) VALUES ($1, $2, $3, $4, $5, $6)',
          [needId, evt.event_id, role.key, role.label || role.key, role.min || 0, role.max || 1]
        )
      }
      backfilledCount++
      populated.push({ eventId: evt.event_id, name: displayName, date: displayDate, template: tpl.name, roles: roles.length, matchMethod })
    } catch (err) {
      errors.push({ eventId: evt.event_id, name: displayName, date: displayDate, error: err.message })
    }
  }

  return { backfilledCount, skippedCount, errors, populated, skipped }
}

/**
 * Get staffing leaderboard for a tenant.
 * @param {string} tenantId
 * @param {object} [options] - { period: 'all' | '12m' | '6m' | '3m' }
 * @returns {Array<{ accountId, accountName, eventsStaffed, totalSignups, roles }>}
 */
export async function getStaffingLeaderboard(tenantId, options = {}) {
  const { period = 'all' } = options

  let dateFilter = ''
  const params = [tenantId]

  if (period === '12m') {
    dateFilter = " AND e.event_date >= CURRENT_DATE - INTERVAL '12 months'"
  } else if (period === '6m') {
    dateFilter = " AND e.event_date >= CURRENT_DATE - INTERVAL '6 months'"
  } else if (period === '3m') {
    dateFilter = " AND e.event_date >= CURRENT_DATE - INTERVAL '3 months'"
  }

  const result = await query(`
    SELECT
      s.account_id,
      a.name as account_name,
      COUNT(DISTINCT s.event_id) as events_staffed,
      COUNT(s.id) as total_signups,
      ARRAY_AGG(DISTINCT n.role_label ORDER BY n.role_label) as roles
    FROM staff_signups s
    JOIN scheduled_events e ON s.event_id = e.id
    JOIN event_staffing_needs n ON s.need_id = n.id
    JOIN accounts a ON s.account_id = a.id
    WHERE e.tenant_id = $1
      AND s.status = 'confirmed'
      ${dateFilter}
    GROUP BY s.account_id, a.name
    ORDER BY events_staffed DESC, total_signups DESC, a.name ASC
  `, params)

  return result.rows.map(row => ({
    accountId: row.account_id,
    accountName: row.account_name,
    eventsStaffed: parseInt(row.events_staffed),
    totalSignups: parseInt(row.total_signups),
    roles: row.roles || [],
  }))
}

/**
 * Update the cached SSI identity on a staff signup record.
 */
export async function updateStaffSignupSsiIds(signupId, { ssiShooterId, ssiParticipantId }) {
  const sets = []
  const params = [signupId]
  if (ssiShooterId !== undefined) {
    params.push(ssiShooterId)
    sets.push(`ssi_shooter_id = $${params.length}`)
  }
  if (ssiParticipantId !== undefined) {
    params.push(ssiParticipantId)
    sets.push(`ssi_participant_id = $${params.length}`)
  }
  if (sets.length === 0) return
  await query(`UPDATE staff_signups SET ${sets.join(', ')} WHERE id = $1`, params)
}

/**
 * Get the cached SSI shooter.id for an account in a specific event.
 * Returns the most recent confirmed signup's ssi_shooter_id, or null.
 */
export async function getAccountSsiShooterId(eventId, accountId) {
  const res = await query(
    `SELECT ssi_shooter_id FROM staff_signups
     WHERE event_id = $1 AND account_id = $2 AND ssi_shooter_id IS NOT NULL
     ORDER BY signed_up_at DESC LIMIT 1`,
    [eventId, accountId]
  )
  return res.rows[0]?.ssi_shooter_id || null
}

export async function withdrawFromEventStaffing(tenantId, eventId, signupId, accountId) {
  const res = await query(
    "SELECT s.id FROM staff_signups s JOIN scheduled_events e ON s.event_id = e.id WHERE s.id = $1 AND e.id = $2 AND e.tenant_id = $3 AND s.account_id = $4 AND s.status = 'confirmed'",
    [signupId, eventId, tenantId, accountId]
  )
  if (res.rows.length === 0) throw new Error('Signup not found or already withdrawn')

  const updateRes = await query(
    "UPDATE staff_signups SET status = 'withdrawn', withdrawn_at = NOW() WHERE id = $1 RETURNING *",
    [signupId]
  )
  return updateRes.rows[0]
}
