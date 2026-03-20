#!/usr/bin/env node
// ============================================================
// Key Rotation Script
// ============================================================
// Re-encrypts all SSI credentials and MFA secrets with a new key.
// Usage:
//   node scripts/rotate-credentials-key.mjs \
//     --old-key <current-64-hex-key> \
//     --new-key <new-64-hex-key> \
//     --database-url <postgresql://...>
//
// The script runs in a single transaction — if any row fails,
// all changes are rolled back.
// ============================================================

import crypto from 'node:crypto'
import pg from 'pg'

// ── Parse CLI args ──

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '')
    opts[key] = args[i + 1]
  }
  if (!opts['old-key'] || !opts['new-key'] || !opts['database-url']) {
    console.error('Usage: node rotate-credentials-key.mjs --old-key <hex> --new-key <hex> --database-url <url>')
    process.exit(1)
  }
  return opts
}

// ── Crypto helpers (same as platform-store/utils.js) ──

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

function validateKey(hexKey, label) {
  const buf = Buffer.from(hexKey, 'hex')
  if (buf.length !== 32) {
    console.error(`${label} must be exactly 64 hex characters (32 bytes). Got ${hexKey.length} chars → ${buf.length} bytes.`)
    process.exit(1)
  }
  return buf
}

function decryptEnvelope(envelope, key) {
  const iv = Buffer.from(envelope.iv, 'hex')
  const tag = Buffer.from(envelope.tag, 'hex')
  const data = Buffer.from(envelope.data, 'hex')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

function encryptPayload(payload, key) {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv: iv.toString('hex'), tag: tag.toString('hex'), data: encrypted.toString('hex') }
}

// ── Main ──

const opts = parseArgs()
const oldKey = validateKey(opts['old-key'], '--old-key')
const newKey = validateKey(opts['new-key'], '--new-key')

if (opts['old-key'] === opts['new-key']) {
  console.error('Old and new keys are identical. Nothing to rotate.')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: opts['database-url'],
  ssl: opts['database-url'].includes('render.com') ? { rejectUnauthorized: false } : undefined,
})

await client.connect()
console.log('Connected to database.')

try {
  await client.query('BEGIN')

  // ── Rotate tenant SSI credentials ──
  const { rows: tenants } = await client.query(
    "SELECT id, name, ssi_credentials FROM tenants WHERE ssi_credentials IS NOT NULL"
  )
  console.log(`\nFound ${tenants.length} tenant(s) with SSI credentials.`)

  let tenantOk = 0, tenantFail = 0
  for (const t of tenants) {
    try {
      const envelope = typeof t.ssi_credentials === 'string'
        ? JSON.parse(t.ssi_credentials)
        : t.ssi_credentials
      const plaintext = decryptEnvelope(envelope, oldKey)
      const reEncrypted = encryptPayload(plaintext, newKey)
      await client.query(
        'UPDATE tenants SET ssi_credentials = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(reEncrypted), t.id]
      )
      console.log(`  ✓ ${t.name} (${t.id})`)
      tenantOk++
    } catch (err) {
      console.error(`  ✗ ${t.name} (${t.id}): ${err.message}`)
      tenantFail++
    }
  }

  // ── Rotate account MFA secrets ──
  const { rows: accounts } = await client.query(
    "SELECT id, email, mfa_secret FROM accounts WHERE mfa_secret IS NOT NULL"
  )
  console.log(`\nFound ${accounts.length} account(s) with MFA secrets.`)

  let mfaOk = 0, mfaFail = 0
  for (const a of accounts) {
    try {
      const envelope = typeof a.mfa_secret === 'string'
        ? JSON.parse(a.mfa_secret)
        : a.mfa_secret
      const plaintext = decryptEnvelope(envelope, oldKey)
      const reEncrypted = encryptPayload(plaintext, newKey)
      await client.query(
        'UPDATE accounts SET mfa_secret = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(reEncrypted), a.id]
      )
      console.log(`  ✓ ${a.email} (${a.id})`)
      mfaOk++
    } catch (err) {
      console.error(`  ✗ ${a.email} (${a.id}): ${err.message}`)
      mfaFail++
    }
  }

  // ── Summary ──
  const totalFail = tenantFail + mfaFail
  console.log(`\n--- Summary ---`)
  console.log(`SSI credentials: ${tenantOk} rotated, ${tenantFail} failed`)
  console.log(`MFA secrets:     ${mfaOk} rotated, ${mfaFail} failed`)

  if (totalFail > 0) {
    await client.query('ROLLBACK')
    console.error(`\n⚠ ${totalFail} failure(s) — ROLLED BACK. No data changed.`)
    process.exit(1)
  }

  await client.query('COMMIT')
  console.log(`\n✓ All rows re-encrypted successfully. COMMITTED.`)
  console.log(`\nNext steps:`)
  console.log(`  1. Update PLATFORM_CREDENTIALS_KEY on all Render services to the new key`)
  console.log(`  2. Update GitHub repo secret PLATFORM_CREDENTIALS_KEY`)
  console.log(`  3. Save new key in your password manager`)
  console.log(`  4. Restart Render services to pick up the new key`)
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(`\nFatal error — ROLLED BACK:`, err.message)
  process.exit(1)
} finally {
  await client.end()
}
