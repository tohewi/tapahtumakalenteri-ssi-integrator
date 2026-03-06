// ============================================================
// Platform Store — Tenant Invitations
// ============================================================

import crypto from 'node:crypto'
import { query, withTransaction } from '../postgres.js'
import { generateId } from './utils.js'
import { TENANT_ROLES } from './rbac.js'

// ---- Row mapper ----

function rowToInvitation(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    roles: row.roles,
    invitedBy: row.invited_by,
    status: row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
    usedAt: row.used_at ? new Date(row.used_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

// ---- Invitation CRUD ----

/**
 * Create an invitation for a user to join a tenant.
 * Resolves to a securely random token + id.
 */
export async function createTenantInvitation({ tenantId, email, roles, invitedBy, expiresInDays = 7 }) {
  for (const role of roles) {
    if (!TENANT_ROLES.includes(role)) {
      throw new Error(`createTenantInvitation: invalid role '${role}'`)
    }
  }

  const invId = generateId('inv')
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  const normalizedEmail = email.toLowerCase().trim()

  const { rows } = await query(
    `INSERT INTO tenant_invitations (id, tenant_id, email, roles, invited_by, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [invId, tenantId, normalizedEmail, roles, invitedBy, tokenHash, expiresAt]
  )

  return { invitationId: rows[0].id, invitation: rowToInvitation(rows[0]), token }
}

/**
 * Get an invitation by plaintext token.
 * Only returns 'pending' invitations that haven't expired.
 */
export async function getInvitationByToken(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { rows } = await query(
    `SELECT ti.*, t.name as tenant_name, a.name as inviter_name
     FROM tenant_invitations ti
     JOIN tenants t ON t.id = ti.tenant_id
     JOIN accounts a ON a.id = ti.invited_by
     WHERE ti.token_hash = $1
       AND ti.status = 'pending'
       AND ti.expires_at > NOW()`,
    [tokenHash]
  )
  if (rows.length === 0) return null

  const inv = rowToInvitation(rows[0])
  inv.tenantName = rows[0].tenant_name
  inv.inviterName = rows[0].inviter_name
  return inv
}

/**
 * Accept an invitation and add the user to the tenant.
 * Performs atomical check-and-update.
 */
export async function acceptTenantInvitation(token, accountId, accountEmail) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  return await withTransaction(async (client) => {
    // 1. Lock the invitation row to prevent double-use
    const { rows: invRows } = await client.query(
      `SELECT * FROM tenant_invitations
       WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash]
    )
    
    if (invRows.length === 0) {
      throw new Error('Invitation not found or invalid token')
    }

    const inv = invRows[0]

    if (inv.status !== 'pending') {
      throw new Error(`Invitation is already ${inv.status}`)
    }
    
    if (new Date(inv.expires_at) < new Date()) {
      await client.query(`UPDATE tenant_invitations SET status = 'expired' WHERE id = $1`, [inv.id])
      throw new Error('Invitation has expired')
    }

    // Check email match (rudimentary safeguard, optionally strict)
    if (inv.email !== accountEmail.toLowerCase().trim()) {
      throw new Error(`This invitation was sent to ${inv.email}, but you are logged in as ${accountEmail}`)
    }

    // 2. Add membership
    const memberId = generateId('mbr')
    await client.query(
      `INSERT INTO tenant_members (id, tenant_id, account_id, roles, invited_by, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (tenant_id, account_id) DO UPDATE
         SET roles = (
               SELECT ARRAY(SELECT DISTINCT unnest(tenant_members.roles || $4))
             ),
             status = 'active',
             updated_at = NOW()`,
      [memberId, inv.tenant_id, accountId, inv.roles, inv.invited_by]
    )

    // 3. Mark invitation used
    await client.query(
      `UPDATE tenant_invitations SET status = 'accepted', used_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [inv.id]
    )

    return inv.tenant_id
  })
}

/**
 * Auto-accept all pending invitations for a given email address.
 * Called on login — silently creates memberships for any matching invitations.
 * @param {string} accountId
 * @param {string} email
 * @returns {string[]} tenant IDs that were joined
 */
export async function autoAcceptPendingInvitations(accountId, email) {
  const normalizedEmail = email.toLowerCase().trim()
  const { rows: pending } = await query(
    `SELECT * FROM tenant_invitations
     WHERE LOWER(email) = $1 AND status = 'pending' AND expires_at > NOW()`,
    [normalizedEmail]
  )

  const joinedTenantIds = []
  for (const inv of pending) {
    try {
      // Add membership (upsert — merge roles if already a member)
      const memberId = generateId('mbr')
      await query(
        `INSERT INTO tenant_members (id, tenant_id, account_id, roles, invited_by, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (tenant_id, account_id) DO UPDATE
           SET roles = (
                 SELECT ARRAY(SELECT DISTINCT unnest(tenant_members.roles || $4))
               ),
               status = 'active',
               updated_at = NOW()`,
        [memberId, inv.tenant_id, accountId, inv.roles, inv.invited_by]
      )

      // Mark invitation as accepted
      await query(
        `UPDATE tenant_invitations SET status = 'accepted', used_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [inv.id]
      )

      joinedTenantIds.push(inv.tenant_id)
    } catch { /* skip individual failures — don't block login */ }
  }

  return joinedTenantIds
}

/**
 * List pending invitations for a tenant.
 */
export async function listPendingInvitations(tenantId) {
  const { rows } = await query(
    `SELECT ti.*, a.name as inviter_name
     FROM tenant_invitations ti
     JOIN accounts a ON a.id = ti.invited_by
     WHERE ti.tenant_id = $1 AND ti.status = 'pending' AND ti.expires_at > NOW()
     ORDER BY ti.created_at DESC`,
    [tenantId]
  )
  return rows.map(r => ({
    ...rowToInvitation(r),
    inviterName: r.inviter_name,
  }))
}

/**
 * Revoke a pending invitation.
 */
export async function revokeTenantInvitation(tenantId, invitationId) {
  const { rows } = await query(
    `UPDATE tenant_invitations 
     SET status = 'revoked', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
     RETURNING id`,
    [invitationId, tenantId]
  )
  return rows.length > 0
}
