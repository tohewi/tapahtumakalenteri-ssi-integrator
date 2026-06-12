// ============================================================
// Platform Store — Shared Private Utilities
//
// These helpers are used internally across domain modules.
// They are NOT part of the public API surface.
// ============================================================

import crypto from 'node:crypto'

export const BCRYPT_ROUNDS = 12

// ---- ID Generation ----

export function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

export function platformSessionKey(id) { return `platform:session:${id}` }

// ---- SSI Credential Encryption (AES-256-GCM) ----
//
// SSI credentials (email, password, API key) are encrypted with AES-256-GCM
// before being written to the DB and decrypted transparently when read.
// PLATFORM_CREDENTIALS_KEY env var must be 64 hex chars (32 bytes).

const CRED_ALGO = 'aes-256-gcm'
const CRED_IV_BYTES = 12 // 96-bit IV recommended for GCM

export function getCredentialKey() {
  const keyHex = process.env.PLATFORM_CREDENTIALS_KEY
  if (!keyHex) {
    throw new Error(
      'PLATFORM_CREDENTIALS_KEY environment variable is required for SSI credential encryption'
    )
  }
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) {
    throw new Error(
      'PLATFORM_CREDENTIALS_KEY must be exactly 64 hex characters (32 bytes)'
    )
  }
  return key
}

export function encryptCredentials(credentials) {
  if (credentials === null || credentials === undefined || typeof credentials !== 'object') {
    throw new Error('encryptCredentials: credentials must be a non-null object')
  }
  const key = getCredentialKey()
  const iv = crypto.randomBytes(CRED_IV_BYTES)
  const cipher = crypto.createCipheriv(CRED_ALGO, key, iv)
  const plaintext = JSON.stringify(credentials)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: encrypted.toString('hex'),
  }
}

export function decryptCredentials(envelope) {
  if (!envelope || typeof envelope.iv !== 'string' ||
      typeof envelope.tag !== 'string' || typeof envelope.data !== 'string') {
    throw new Error('decryptCredentials: malformed envelope — expected { iv, tag, data } strings')
  }
  const key = getCredentialKey()
  const iv = Buffer.from(envelope.iv, 'hex')
  const tag = Buffer.from(envelope.tag, 'hex')
  const data = Buffer.from(envelope.data, 'hex')
  const decipher = crypto.createDecipheriv(CRED_ALGO, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

export function encrypt(plaintext) {
  const envelope = encryptCredentials({ value: plaintext })
  return JSON.stringify(envelope)
}

export function decrypt(stored) {
  const envelope = typeof stored === 'string' ? JSON.parse(stored) : stored
  const decrypted = decryptCredentials(envelope)
  return decrypted.value
}
