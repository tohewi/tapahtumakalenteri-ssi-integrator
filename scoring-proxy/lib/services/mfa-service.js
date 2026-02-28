import * as OTPAuth from 'otpauth'
import qrcode from 'qrcode'
import crypto from 'crypto'
import bcrypt from 'bcrypt'

const ISSUER = 'SSI TurRes Tools'

/**
 * Generate a new MFA secret, provisioning URI, QR code, and recovery codes.
 * @param {string} accountEmail - Used as the label
 * @returns {Promise<{ secret: string, qrCodeDataUrl: string, recoveryCodes: string[] }>}
 */
export async function generateMfaSetup(accountEmail) {
  // Generate random secret (20 bytes = 160 bits)
  const secret = new OTPAuth.Secret({ size: 20 })
  const secretBase32 = secret.base32

  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  })

  const uri = totp.toString()
  const qrCodeDataUrl = await qrcode.toDataURL(uri)

  // Generate 10 random 8-character recovery codes (hex)
  const recoveryCodes = Array.from({ length: 10 }, () => 
    crypto.randomBytes(4).toString('hex')
  )

  return {
    secret: secretBase32,
    qrCodeDataUrl,
    recoveryCodes,
  }
}

/**
 * Verify a TOTP code against a base32 secret.
 * @param {string} secretBase32
 * @param {string} token
 * @returns {boolean}
 */
export function verifyTotpCode(secretBase32, token) {
  if (!secretBase32 || !token) return false
  
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  })

  // Validate with 1 period window (30s before/after)
  const delta = totp.validate({ token, window: 1 })
  return delta !== null
}

/**
 * Hash an array of recovery codes for storage.
 * @param {string[]} codes
 * @returns {Promise<string[]>}
 */
export async function hashRecoveryCodes(codes) {
  return Promise.all(codes.map(c => bcrypt.hash(c, 10)))
}

/**
 * Verify and consume a recovery code.
 * @param {string[]} hashedCodes - From DB
 * @param {string} plainCode - From user
 * @returns {Promise<{ valid: boolean, remainingCodes: string[] }>}
 */
export async function verifyRecoveryCode(hashedCodes, plainCode) {
  if (!hashedCodes || hashedCodes.length === 0) {
    return { valid: false, remainingCodes: [] }
  }
  
  for (let i = 0; i < hashedCodes.length; i++) {
    const valid = await bcrypt.compare(plainCode, hashedCodes[i])
    if (valid) {
      // Return true and the new list of codes (with the used one removed)
      const remainingCodes = [...hashedCodes]
      remainingCodes.splice(i, 1)
      return { valid: true, remainingCodes }
    }
  }
  return { valid: false, remainingCodes: hashedCodes }
}
