import { describe, it, expect, beforeEach } from 'vitest'
import { encryptData, decryptData } from '../crypto'

beforeEach(() => {
  localStorage.clear()
})

describe('Crypto module', () => {
  it('encrypts and decrypts small data', async () => {
    const data = { email: 'test@example.com', password: 'secret123' }
    const encrypted = await encryptData(data)
    const decrypted = await decryptData(encrypted)
    expect(decrypted).toEqual(data)
  })

  it('encrypts and decrypts large data', async () => {
    // Create a large payload (> 10KB) to test chunked base64 encoding
    const largeText = 'x'.repeat(20000)
    const data = { email: 'test@example.com', password: 'secret', notes: largeText }
    const encrypted = await encryptData(data)
    const decrypted = await decryptData(encrypted)
    expect(decrypted).toEqual(data)
    expect(decrypted.notes).toHaveLength(20000)
  })

  it('returns null for invalid encrypted data', async () => {
    const result = await decryptData('invalid-json')
    expect(result).toBeNull()
  })

  it('returns null for corrupted encrypted data', async () => {
    const data = { email: 'test@example.com', password: 'secret' }
    const encrypted = await encryptData(data)
    const parsed = JSON.parse(encrypted)
    parsed.data = 'corrupted-base64'
    const result = await decryptData(JSON.stringify(parsed))
    expect(result).toBeNull()
  })

  it('uses the same device key for multiple encryptions', async () => {
    const data1 = { email: 'user1@example.com', password: 'pass1' }
    const data2 = { email: 'user2@example.com', password: 'pass2' }
    
    const encrypted1 = await encryptData(data1)
    const encrypted2 = await encryptData(data2)
    
    // Both should decrypt correctly with the same device key
    const decrypted1 = await decryptData(encrypted1)
    const decrypted2 = await decryptData(encrypted2)
    
    expect(decrypted1).toEqual(data1)
    expect(decrypted2).toEqual(data2)
  })
})
