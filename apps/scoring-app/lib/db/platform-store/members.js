// ============================================================
// Platform Store — Tenant Membership CRUD (RBAC)
// ============================================================

import { query } from '../postgres.js'
import { NotFoundError } from '../../errors/AppError.js'
import { generateId } from './utils.js'
import { TENANT_ROLES } from './rbac.js'

// ---- Row mapper ----

function rowToMember(row) {
  if (!row) return null
  return {
    id: row.id,
    memberId: row.id, // alias used by frontend
    tenantId: row.tenant_id,
    accountId: row.account_id,
    roles: row.roles || [],
    invitedBy: row.invited_by || null,
    status: row.status,
    joinedAt: new Date(row.created_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

// ---- Member CRUD ----

/**
 * Get the membership for an account in a specific tenant.
 * Returns null if no active membership exists.
 * @param {string} tenantId
 * @param {string} accountId
 * @returns {object|null} membership with roles array
 */
export async function getTenantMembership(tenantId, accountId) {
  const { rows } = await query(
    `SELECT * FROM tenant_members
     WHERE tenant_id = $1 AND account_id = $2 AND status = 'active'`,
    [tenantId, accountId]
  )
  if (rows.length === 0) return null
  return rowToMember(rows[0])
}

/**
 * List all active members of a tenant.
 * Joins with accounts to include member name and email.
 */
export async function listTenantMembers(tenantId) {
  const { rows } = await query(
    `SELECT tm.*, a.name AS account_name, a.email AS account_email
     FROM tenant_members tm
     JOIN accounts a ON a.id = tm.account_id
     WHERE tm.tenant_id = $1 AND tm.status = 'active'
     ORDER BY tm.created_at`,
    [tenantId]
  )
  return rows.map(row => ({
    ...rowToMember(row),
    accountName: row.account_name,
    accountEmail: row.account_email,
  }))
}

/**
 * Add a member to a tenant with specified roles.
 * @param {object} params - { tenantId, accountId, roles, invitedBy }
 * @returns {{ memberId, member }}
 */
export async function addTenantMember({ tenantId, accountId, roles, invitedBy }) {
  // Validate roles
  for (const role of roles) {
    if (!TENANT_ROLES.includes(role)) {
      throw new Error(`addTenantMember: invalid role '${role}'`)
    }
  }

  const memberId = generateId('mbr')
  const { rows } = await query(
    `INSERT INTO tenant_members (id, tenant_id, account_id, roles, invited_by, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (tenant_id, account_id) DO UPDATE
       SET roles = $4, invited_by = $5, status = 'active', updated_at = NOW()
     RETURNING *`,
    [memberId, tenantId, accountId, roles, invitedBy || null]
  )
  return { memberId: rows[0].id, member: rowToMember(rows[0]) }
}

/**
 * Update the roles for an existing tenant member.
 * Enforces last-owner protection: cannot remove the last owner.
 *
 * @param {string} memberId
 * @param {string[]} newRoles
 * @returns {object} updated membership
 */
export async function updateMemberRoles(memberId, newRoles) {
  // Validate roles
  for (const role of newRoles) {
    if (!TENANT_ROLES.includes(role)) {
      throw new Error(`updateMemberRoles: invalid role '${role}'`)
    }
  }
  if (newRoles.length === 0) {
    throw new Error('updateMemberRoles: at least one role is required')
  }

  // Get current membership to check last-owner protection
  const { rows: currentRows } = await query(
    'SELECT * FROM tenant_members WHERE id = $1',
    [memberId]
  )
  if (currentRows.length === 0) throw new NotFoundError('Membership')

  const current = currentRows[0]
  const hadOwner = (current.roles || []).includes('owner')
  const willHaveOwner = newRoles.includes('owner')

  // If removing owner role, check that another owner exists
  if (hadOwner && !willHaveOwner) {
    const { rows: ownerRows } = await query(
      `SELECT id FROM tenant_members
       WHERE tenant_id = $1 AND 'owner' = ANY(roles) AND status = 'active' AND id != $2`,
      [current.tenant_id, memberId]
    )
    if (ownerRows.length === 0) {
      throw new Error('Cannot remove the last owner from a tenant')
    }
  }

  const { rows } = await query(
    `UPDATE tenant_members SET roles = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [newRoles, memberId]
  )
  if (rows.length === 0) return null
  return rowToMember(rows[0])
}

/**
 * Remove a member from a tenant (sets status to 'suspended').
 * Enforces last-owner protection.
 *
 * @param {string} memberId
 * @returns {boolean} true if removed
 */
export async function removeTenantMember(memberId) {
  const { rows: currentRows } = await query(
    'SELECT * FROM tenant_members WHERE id = $1',
    [memberId]
  )
  if (currentRows.length === 0) return false

  const current = currentRows[0]

  // Last-owner protection
  if ((current.roles || []).includes('owner')) {
    const { rows: ownerRows } = await query(
      `SELECT id FROM tenant_members
       WHERE tenant_id = $1 AND 'owner' = ANY(roles) AND status = 'active' AND id != $2`,
      [current.tenant_id, memberId]
    )
    if (ownerRows.length === 0) {
      throw new Error('Cannot remove the last owner from a tenant')
    }
  }

  const { rows } = await query(
    `UPDATE tenant_members SET status = 'suspended', updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [memberId]
  )
  return rows.length > 0
}
