// ============================================================
// Platform Store — Tenant Logo CRUD (MP9 Branding)
//
// Stores tenant logos as bytea in tenant_logos table.
// The tenants.has_logo flag is toggled on upload/delete for
// fast inclusion in tenant list responses without a JOIN.
// ============================================================

import { query, withTransaction } from '../postgres.js'

// ---- Constants ----

export const LOGO_MAX_SIZE = 2 * 1024 * 1024 // 2 MB
export const LOGO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// ---- CRUD ----

/**
 * Upload (upsert) a tenant logo.
 * @param {string} tenantId
 * @param {Buffer} imageData - raw image bytes
 * @param {string} contentType - MIME type (image/jpeg, image/png, image/webp)
 * @returns {{ contentType, fileSize, uploadedAt }}
 */
export async function uploadTenantLogo(tenantId, imageData, contentType) {
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO tenant_logos (tenant_id, content_type, image_data, file_size)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id) DO UPDATE
       SET content_type = $2, image_data = $3, file_size = $4, uploaded_at = NOW()`,
      [tenantId, contentType, imageData, imageData.length]
    )

    await client.query(
      `UPDATE tenants SET has_logo = TRUE, updated_at = NOW() WHERE id = $1`,
      [tenantId]
    )

    return { contentType, fileSize: imageData.length, uploadedAt: new Date() }
  })
}

/**
 * Get tenant logo data for serving.
 * @param {string} tenantId
 * @returns {{ contentType, imageData: Buffer, fileSize, uploadedAt } | null}
 */
export async function getTenantLogo(tenantId) {
  const { rows } = await query(
    'SELECT content_type, image_data, file_size, uploaded_at FROM tenant_logos WHERE tenant_id = $1',
    [tenantId]
  )
  if (rows.length === 0) return null
  return {
    contentType: rows[0].content_type,
    imageData: rows[0].image_data,
    fileSize: rows[0].file_size,
    uploadedAt: rows[0].uploaded_at,
  }
}

/**
 * Delete tenant logo.
 * @param {string} tenantId
 * @returns {boolean} true if a logo was deleted
 */
export async function deleteTenantLogo(tenantId) {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      'DELETE FROM tenant_logos WHERE tenant_id = $1',
      [tenantId]
    )

    await client.query(
      `UPDATE tenants SET has_logo = FALSE, updated_at = NOW() WHERE id = $1`,
      [tenantId]
    )

    return rowCount > 0
  })
}
