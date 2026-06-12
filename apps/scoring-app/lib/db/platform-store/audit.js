// ============================================================
// Platform Store — Audit Logging (SEC-H4)
// ============================================================

import { query } from '../postgres.js'
import { log } from '../../logger.js'
import { generateId } from './utils.js'

/**
 * Record a security-sensitive mutation in the audit log.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.accountId - The user performing the action
 * @param {string} params.action - e.g., 'member_remove', 'event_delete', 'ssi_creds_update'
 * @param {string} [params.targetType] - e.g., 'member', 'event'
 * @param {string} [params.targetId] - ID of the affected resource
 * @param {object} [params.metadata] - Extra context (JSON)
 * @param {string} [params.ipAddress] - IP address of the requester
 */
export async function createAuditLog({ tenantId, accountId, action, targetType, targetId, metadata, ipAddress }) {
  const logId = generateId('adt')
  try {
    await query(
      `INSERT INTO audit_log (id, tenant_id, account_id, action, target_type, target_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [logId, tenantId || null, accountId, action, targetType || null, targetId || null, metadata ? JSON.stringify(metadata) : null, ipAddress || null]
    )
    return logId
  } catch (err) {
    // Audit log failures shouldn't break the main flow, but must be logged
    log.error(`[audit] Failed to write audit log for ${action} by ${accountId}: ${err.message}`)
    return null
  }
}
