// ============================================================
// Device Token Store (R7.7 — QR Code Login)
//
// Server-side device tokens for QR code scoring login.
// Stored in Redis with TTL. SSI credentials encrypted at rest.
//
// Usage:
//   import { createDeviceToken, validateDeviceToken, ... } from './device-tokens.js'
// ============================================================

import crypto from 'node:crypto'
import { getRedisClient } from './session/redis.js'
import { log } from './logger.js'

const PREFIX = 'device_token:'
const DEFAULT_TTL_DAYS = 5

// ---- Encryption (AES-256-GCM) ----
// Uses SESSION_SECRET as the key source (available on main branch)

function getEncryptionKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET required for device token encryption')
  // Derive a 32-byte key from SESSION_SECRET via SHA-256
  return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(plaintext) {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return { iv: iv.toString('hex'), tag, data: encrypted }
}

function decrypt(envelope) {
  const key = getEncryptionKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'))
  let decrypted = decipher.update(envelope.data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// ---- Token CRUD ----

/**
 * Create a device token for QR code login.
 * @param {object} params
 * @param {string} params.ssiEmail - SSI account email
 * @param {string} params.ssiPassword - SSI account password (will be encrypted)
 * @param {string} params.label - Device label (e.g., "Tablet 1")
 * @param {string} params.createdBy - Admin email who created the token
 * @param {number} [params.expiresInDays=5] - Token TTL in days
 * @returns {Promise<{ tokenId: string, token: string }>}
 */
export async function createDeviceToken({ ssiEmail, ssiPassword, label, createdBy, expiresInDays = DEFAULT_TTL_DAYS }) {
  const redis = getRedisClient()
  const tokenId = crypto.randomBytes(16).toString('hex')
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const ttlSeconds = expiresInDays * 24 * 60 * 60

  const record = {
    tokenId,
    tokenHash,
    tokenEncrypted: encrypt(token), // raw token encrypted for QR code regeneration
    ssiEmail,
    ssiCredentials: encrypt(JSON.stringify({ email: ssiEmail, password: ssiPassword })),
    scope: 'scoring',
    label: label || 'Device',
    createdBy,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlSeconds * 1000,
    lastUsedAt: null,
  }

  await redis.set(`${PREFIX}${tokenId}`, JSON.stringify(record), { EX: ttlSeconds })
  log.info(`[device-tokens] Created token ${tokenId} for ${ssiEmail} (label: ${label}) by ${createdBy}, TTL: ${expiresInDays}d`)

  return { tokenId, token }
}

/**
 * Validate a device token and return decrypted SSI credentials.
 * @param {string} token - The raw token string
 * @returns {Promise<{ ssiEmail: string, ssiPassword: string, scope: string, label: string, tokenId: string } | null>}
 */
export async function validateDeviceToken(token) {
  if (!token) return null
  const redis = getRedisClient()
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  // Scan all device tokens to find matching hash
  const keys = await redis.keys(`${PREFIX}*`)
  for (const key of keys) {
    const raw = await redis.get(key)
    if (!raw) continue
    try {
      const record = JSON.parse(raw)
      if (record.tokenHash === tokenHash) {
        // Decrypt credentials
        const creds = JSON.parse(decrypt(record.ssiCredentials))

        // Update lastUsedAt
        record.lastUsedAt = Date.now()
        const ttl = await redis.ttl(key)
        if (ttl > 0) {
          await redis.set(key, JSON.stringify(record), { EX: ttl })
        }

        return {
          tokenId: record.tokenId,
          ssiEmail: creds.email,
          ssiPassword: creds.password,
          scope: record.scope,
          label: record.label,
        }
      }
    } catch { /* skip corrupted entries */ }
  }
  return null
}

/**
 * List all device tokens (includes raw token for QR code generation).
 * Only call from manage-scoped sessions — the raw token enables login.
 * @returns {Promise<Array<{ tokenId, token, ssiEmail, label, scope, createdBy, createdAt, expiresAt, lastUsedAt }>>}
 */
export async function listDeviceTokens() {
  const redis = getRedisClient()
  const keys = await redis.keys(`${PREFIX}*`)
  const tokens = []

  for (const key of keys) {
    const raw = await redis.get(key)
    if (!raw) continue
    try {
      const record = JSON.parse(raw)
      // Decrypt raw token for QR code regeneration (only exposed to manage sessions)
      let rawToken = null
      if (record.tokenEncrypted) {
        try { rawToken = decrypt(record.tokenEncrypted) } catch { /* legacy token without encrypted raw */ }
      }
      tokens.push({
        tokenId: record.tokenId,
        token: rawToken,
        ssiEmail: record.ssiEmail,
        label: record.label,
        scope: record.scope,
        createdBy: record.createdBy,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        lastUsedAt: record.lastUsedAt,
      })
    } catch { /* skip corrupted */ }
  }

  return tokens.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Revoke (delete) a device token by ID.
 * @param {string} tokenId
 * @returns {Promise<boolean>} true if deleted
 */
export async function revokeDeviceToken(tokenId) {
  const redis = getRedisClient()
  const result = await redis.del(`${PREFIX}${tokenId}`)
  if (result > 0) {
    log.info(`[device-tokens] Revoked token ${tokenId}`)
  }
  return result > 0
}
