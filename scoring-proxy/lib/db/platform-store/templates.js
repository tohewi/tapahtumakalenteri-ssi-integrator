// ============================================================
// Platform Store — Match Templates CRUD
// ============================================================

import { query } from '../postgres.js'
import { generateId } from './utils.js'

// ---- Row mapper ----

function rowToTemplate(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    disciplineId: row.discipline_id,
    name: row.name,
    ssiSeedEventId: row.ssi_seed_event_id || null,
    ssiSeedSnapshot: row.ssi_seed_snapshot || null,
    overrides: row.overrides || {},
    calendarTemplate: row.calendar_template || {},
    staffingRules: row.staffing_rules || {},
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

// Allowed fields for updateMatchTemplate
const TEMPLATE_UPDATE_FIELDS = {
  name: 'name',
  ssiSeedEventId: 'ssi_seed_event_id',
  ssiSeedSnapshot: 'ssi_seed_snapshot',
  overrides: 'overrides',
  calendarTemplate: 'calendar_template',
  staffingRules: 'staffing_rules',
}

// Fields that must be JSON-stringified before storage
const TEMPLATE_JSON_FIELDS = new Set(['ssiSeedSnapshot', 'overrides', 'calendarTemplate', 'staffingRules'])

// ---- Match Template CRUD ----

/**
 * Create a new match template.
 * @param {object} params - { tenantId, disciplineId, name, ssiSeedEventId?, overrides?, calendarTemplate?, staffingRules? }
 */
export async function createMatchTemplate({ tenantId, disciplineId, name, ssiSeedEventId, ssiSeedSnapshot, overrides, calendarTemplate, staffingRules }) {
  const templateId = generateId('tpl')
  const { rows } = await query(
    `INSERT INTO match_templates (id, tenant_id, discipline_id, name, ssi_seed_event_id, ssi_seed_snapshot, overrides, calendar_template, staffing_rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      templateId, tenantId, disciplineId, name.trim(),
      ssiSeedEventId || null,
      ssiSeedSnapshot ? JSON.stringify(ssiSeedSnapshot) : null,
      JSON.stringify(overrides || {}),
      JSON.stringify(calendarTemplate || {}),
      JSON.stringify(staffingRules || {}),
    ]
  )
  return { templateId, template: rowToTemplate(rows[0]) }
}

/**
 * Get a match template by ID.
 */
export async function getMatchTemplate(templateId) {
  const { rows } = await query(
    'SELECT * FROM match_templates WHERE id = $1',
    [templateId]
  )
  if (rows.length === 0) return null
  return rowToTemplate(rows[0])
}

/**
 * List all match templates for a discipline.
 */
export async function listDisciplineTemplates(disciplineId) {
  const { rows } = await query(
    'SELECT * FROM match_templates WHERE discipline_id = $1 ORDER BY created_at',
    [disciplineId]
  )
  return rows.map(rowToTemplate)
}

/**
 * List all match templates for a tenant (across all disciplines).
 */
export async function listTenantTemplates(tenantId) {
  const { rows } = await query(
    'SELECT * FROM match_templates WHERE tenant_id = $1 ORDER BY created_at',
    [tenantId]
  )
  return rows.map(rowToTemplate)
}

/**
 * Update match template fields.
 */
export async function updateMatchTemplate(templateId, updates) {
  for (const key of Object.keys(updates)) {
    if (!(key in TEMPLATE_UPDATE_FIELDS)) {
      throw new Error(`updateMatchTemplate: unknown field '${key}'`)
    }
  }

  const setClauses = []
  const params = [templateId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(TEMPLATE_UPDATE_FIELDS)) {
    if (updates[key] !== undefined) {
      const value = TEMPLATE_JSON_FIELDS.has(key)
        ? JSON.stringify(updates[key])
        : updates[key]
      setClauses.push(`${column} = $${paramIndex}`)
      params.push(value)
      paramIndex++
    }
  }

  if (setClauses.length === 0) {
    return getMatchTemplate(templateId)
  }

  setClauses.push(`updated_at = NOW()`)

  const { rows } = await query(
    `UPDATE match_templates SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  if (rows.length === 0) return null
  return rowToTemplate(rows[0])
}

/**
 * Delete a match template by ID.
 * @returns {boolean} true if deleted, false if not found
 */
export async function deleteMatchTemplate(templateId) {
  const { rows } = await query(
    'DELETE FROM match_templates WHERE id = $1 RETURNING id',
    [templateId]
  )
  return rows.length > 0
}
