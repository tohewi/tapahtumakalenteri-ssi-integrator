/**
 * Encrypt/decrypt credentials in localStorage using AES-GCM.
 * 
 * A device-specific key is derived from a fixed salt + random key stored
 * alongside the data. This prevents plain-text credentials in localStorage.
 * The key is generated once per device and stored in localStorage itself.
 * 
 * This is NOT a substitute for a secure keychain, but it ensures credentials
 * are not trivially readable as plain JSON in localStorage / DevTools.
 */

const ALGO = 'AES-GCM'
const KEY_STORAGE = 'ssi_device_key'

/**
 * Convert Uint8Array to base64 string without spreading (avoids stack overflow).
 * Chunks the array to prevent hitting call stack limits on large payloads.
 * @param {Uint8Array} uint8Array - The Uint8Array to convert
 * @returns {string} Base64 encoded string
 */
function uint8ToBase64(uint8Array) {
  const CHUNK_SIZE = 8192
  let binary = ''
  for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
    const chunk = uint8Array.subarray(i, i + CHUNK_SIZE)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function getOrCreateDeviceKey() {
  const stored = localStorage.getItem(KEY_STORAGE)
  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
    return crypto.subtle.importKey('raw', raw, ALGO, false, ['encrypt', 'decrypt'])
  }
  const key = await crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, ['encrypt', 'decrypt'])
  const exported = await crypto.subtle.exportKey('raw', key)
  localStorage.setItem(KEY_STORAGE, uint8ToBase64(new Uint8Array(exported)))
  return key
}

export async function encryptData(data) {
  const key = await getOrCreateDeviceKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(data))
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded)
  return JSON.stringify({
    iv: uint8ToBase64(iv),
    data: uint8ToBase64(new Uint8Array(ciphertext)),
  })
}

export async function decryptData(stored) {
  try {
    const key = await getOrCreateDeviceKey()
    const { iv, data } = JSON.parse(stored)
    const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0))
    const cipherBytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    const plaintext = await crypto.subtle.decrypt({ name: ALGO, iv: ivBytes }, key, cipherBytes)
    return JSON.parse(new TextDecoder().decode(plaintext))
  } catch {
    return null
  }
}
