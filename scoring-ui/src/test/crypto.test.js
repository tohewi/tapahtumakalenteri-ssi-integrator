import { describe, it, expect, beforeEach } from 'vitest'
import { encryptData, decryptData } from '../crypto'

// ============================================================
// Encryption/Decryption tests
// ============================================================

beforeEach(() => {
  localStorage.clear()
})

describe('encryptData and decryptData', () => {
  it('round-trip encrypts and decrypts simple object', async () => {
    const original = { email: 'test@example.com', password: 'secret123' }
    const encrypted = await encryptData(original)
    const decrypted = await decryptData(encrypted)
    expect(decrypted).toEqual(original)
  })

  it('round-trip encrypts and decrypts complex object', async () => {
    const original = {
      email: 'test@example.com',
      password: 'p@ssw0rd!',
      apiKey: 'abc123xyz789',
      nested: {
        value: 42,
        array: [1, 2, 3],
      },
    }
    const encrypted = await encryptData(original)
    const decrypted = await decryptData(encrypted)
    expect(decrypted).toEqual(original)
  })

  it('round-trip encrypts and decrypts empty object', async () => {
    const original = {}
    const encrypted = await encryptData(original)
    const decrypted = await decryptData(encrypted)
    expect(decrypted).toEqual(original)
  })

  it('round-trip encrypts and decrypts object with special characters', async () => {
    const original = {
      text: 'Special: äöå ÅÄÖ 日本語 emoji: 🎯🏹',
      unicode: '\u0000\u00FF',
    }
    const encrypted = await encryptData(original)
    const decrypted = await decryptData(encrypted)
    expect(decrypted).toEqual(original)
  })

  it('produces different ciphertext for same input due to random IV', async () => {
    const data = { test: 'value' }
    const encrypted1 = await encryptData(data)
    const encrypted2 = await encryptData(data)
    expect(encrypted1).not.toBe(encrypted2)
  })

  it('uses same device key for multiple encryptions', async () => {
    const data1 = { test: 'first' }
    const data2 = { test: 'second' }
    
    const encrypted1 = await encryptData(data1)
    const decrypted1 = await decryptData(encrypted1)
    
    const encrypted2 = await encryptData(data2)
    const decrypted2 = await decryptData(encrypted2)
    
    expect(decrypted1).toEqual(data1)
    expect(decrypted2).toEqual(data2)
  })
})

describe('decryptData failure modes', () => {
  it('returns null for invalid JSON', async () => {
    const result = await decryptData('not valid json')
    expect(result).toBeNull()
  })

  it('returns null for null input', async () => {
    const result = await decryptData(null)
    expect(result).toBeNull()
  })

  it('returns null for undefined input', async () => {
    const result = await decryptData(undefined)
    expect(result).toBeNull()
  })

  it('returns null for empty string', async () => {
    const result = await decryptData('')
    expect(result).toBeNull()
  })

  it('returns null for corrupted payload - missing iv', async () => {
    const corrupted = JSON.stringify({ data: 'base64data' })
    const result = await decryptData(corrupted)
    expect(result).toBeNull()
  })

  it('returns null for corrupted payload - missing data', async () => {
    const corrupted = JSON.stringify({ iv: 'base64iv' })
    const result = await decryptData(corrupted)
    expect(result).toBeNull()
  })

  it('returns null for corrupted payload - invalid base64 in iv', async () => {
    const corrupted = JSON.stringify({ iv: 'not!!base64!!', data: 'dmFsaWQ=' })
    const result = await decryptData(corrupted)
    expect(result).toBeNull()
  })

  it('returns null for corrupted payload - invalid base64 in data', async () => {
    const corrupted = JSON.stringify({ iv: 'dmFsaWQ=', data: 'not!!base64!!' })
    const result = await decryptData(corrupted)
    expect(result).toBeNull()
  })

  it('returns null for tampered ciphertext', async () => {
    const original = { test: 'value' }
    const encrypted = await encryptData(original)
    const parsed = JSON.parse(encrypted)
    
    // Tamper with the data
    const tampered = JSON.stringify({
      iv: parsed.iv,
      data: 'YWJjZGVmZ2hpams=', // different valid base64
    })
    
    const result = await decryptData(tampered)
    expect(result).toBeNull()
  })

  it('returns null for valid structure but wrong key', async () => {
    const original = { test: 'value' }
    const encrypted = await encryptData(original)
    
    // Clear device key to force generation of a new one
    localStorage.clear()
    
    const result = await decryptData(encrypted)
    expect(result).toBeNull()
  })

  it('returns null for malformed JSON inside encrypted payload', async () => {
    // Create a valid encrypted structure but with non-JSON plaintext
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode('not json at all')
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
    
    const malformed = JSON.stringify({
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    })
    
    const result = await decryptData(malformed)
    expect(result).toBeNull()
  })
})

describe('encryption produces valid structure', () => {
  it('produces JSON string with iv and data fields', async () => {
    const data = { test: 'value' }
    const encrypted = await encryptData(data)
    const parsed = JSON.parse(encrypted)
    
    expect(parsed).toHaveProperty('iv')
    expect(parsed).toHaveProperty('data')
    expect(typeof parsed.iv).toBe('string')
    expect(typeof parsed.data).toBe('string')
  })

  it('produces base64-encoded iv and data', async () => {
    const data = { test: 'value' }
    const encrypted = await encryptData(data)
    const parsed = JSON.parse(encrypted)
    
    // Valid base64 should decode without error
    expect(() => atob(parsed.iv)).not.toThrow()
    expect(() => atob(parsed.data)).not.toThrow()
  })

  it('produces 12-byte IV', async () => {
    const data = { test: 'value' }
    const encrypted = await encryptData(data)
    const parsed = JSON.parse(encrypted)
    const ivBytes = Uint8Array.from(atob(parsed.iv), c => c.charCodeAt(0))
    
    expect(ivBytes.length).toBe(12)
  })
})
