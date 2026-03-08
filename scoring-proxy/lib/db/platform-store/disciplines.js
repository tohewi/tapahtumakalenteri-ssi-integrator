// ============================================================
// Platform Store — Disciplines CRUD + SSI Discovered Disciplines
// ============================================================

import { query } from '../postgres.js'
import { generateId } from './utils.js'

// ---- Row mapper ----

function rowToDiscipline(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    labelFi: row.label_fi || '',
    labelEn: row.label_en || '',
    ssiGroupId: row.ssi_group_id || null,
    ssiOrganizerId: row.ssi_organizer_id || null,
    ssiCreateUrl: row.ssi_create_url || null,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

// Allowed fields for updateDiscipline
const DISCIPLINE_UPDATE_FIELDS = {
  name: 'name',
  labelFi: 'label_fi',
  labelEn: 'label_en',
  ssiGroupId: 'ssi_group_id',
  ssiOrganizerId: 'ssi_organizer_id',
  ssiCreateUrl: 'ssi_create_url',
}

// ---- Discipline CRUD ----

/**
 * Get discipline counts for a list of tenant IDs in a single query.
 * Returns a Map of tenantId → count.
 */
export async function countDisciplinesByTenant(tenantIds) {
  if (!tenantIds || tenantIds.length === 0) return new Map()
  const placeholders = tenantIds.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await query(
    `SELECT tenant_id, COUNT(*)::int AS count
     FROM disciplines WHERE tenant_id IN (${placeholders})
     GROUP BY tenant_id`,
    tenantIds
  )
  const map = new Map()
  for (const row of rows) map.set(row.tenant_id, row.count)
  return map
}

/**
 * Create a new discipline for a tenant.
 * @param {object} params - { tenantId, name, labelFi, labelEn, ssiGroupId?, ssiOrganizerId? }
 */
export async function createDiscipline({ tenantId, name, labelFi, labelEn, ssiGroupId, ssiOrganizerId, ssiCreateUrl }) {
  const disciplineId = generateId('dis')
  const { rows } = await query(
    `INSERT INTO disciplines (id, tenant_id, name, label_fi, label_en, ssi_group_id, ssi_organizer_id, ssi_create_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [disciplineId, tenantId, name, labelFi || null, labelEn || null, ssiGroupId || null, ssiOrganizerId || null, ssiCreateUrl || null]
  )
  return { disciplineId, discipline: rowToDiscipline(rows[0]) }
}

/**
 * Get a discipline by ID.
 */
export async function getDiscipline(disciplineId) {
  const { rows } = await query(
    'SELECT * FROM disciplines WHERE id = $1',
    [disciplineId]
  )
  return rowToDiscipline(rows[0] || null)
}

/**
 * List all disciplines for a tenant.
 */
export async function listTenantDisciplines(tenantId) {
  const { rows } = await query(
    'SELECT * FROM disciplines WHERE tenant_id = $1 ORDER BY created_at',
    [tenantId]
  )
  return rows.map(rowToDiscipline)
}

/**
 * Update discipline fields.
 */
export async function updateDiscipline(disciplineId, updates) {
  for (const key of Object.keys(updates)) {
    if (!(key in DISCIPLINE_UPDATE_FIELDS)) {
      throw new Error(`updateDiscipline: unknown field '${key}'`)
    }
  }

  const setClauses = []
  const params = [disciplineId]
  let paramIndex = 2

  for (const [key, column] of Object.entries(DISCIPLINE_UPDATE_FIELDS)) {
    if (updates[key] !== undefined) {
      setClauses.push(`${column} = $${paramIndex}`)
      params.push(updates[key])
      paramIndex++
    }
  }

  if (setClauses.length === 0) {
    return getDiscipline(disciplineId)
  }

  setClauses.push(`updated_at = NOW()`)

  const { rows } = await query(
    `UPDATE disciplines SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    params
  )
  if (rows.length === 0) return null
  return rowToDiscipline(rows[0])
}

/**
 * Delete a discipline by ID.
 * @returns {boolean} true if deleted, false if not found
 */
export async function deleteDiscipline(disciplineId) {
  const { rows } = await query(
    'DELETE FROM disciplines WHERE id = $1 RETURNING id',
    [disciplineId]
  )
  return rows.length > 0
}

// ---- SSI Discovered Disciplines (SSI-R3) ----

export async function upsertSsiDiscoveredDisciplines(disciplines) {
  if (!disciplines || disciplines.length === 0) return

  const values = []
  const params = []
  let paramIdx = 1

  for (const d of disciplines) {
    values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`)
    params.push(d.id, d.displayName, d.ssiCreateUrl || null, d.isCup || false, d.ruleCode || null, d.description || null)
    paramIdx += 6
  }

  const queryStr = `
    INSERT INTO ssi_discovered_disciplines (id, display_name, ssi_create_url, is_cup, rule_code, description)
    VALUES ${values.join(', ')}
    ON CONFLICT (id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          ssi_create_url = EXCLUDED.ssi_create_url,
          is_cup = EXCLUDED.is_cup,
          rule_code = EXCLUDED.rule_code,
          description = EXCLUDED.description,
          last_seen_at = NOW()
  `
  await query(queryStr, params)
}

export async function listSsiDiscoveredDisciplines() {
  const { rows } = await query('SELECT * FROM ssi_discovered_disciplines ORDER BY display_name')
  return rows.map(r => ({
    id: r.id,
    displayName: r.display_name,
    ssiCreateUrl: r.ssi_create_url,
    isCup: r.is_cup,
    ruleCode: r.rule_code,
    description: r.description,
    lastSeenAt: r.last_seen_at
  }))
}
