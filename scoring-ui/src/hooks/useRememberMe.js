import { useState, useEffect } from 'react'
import { encryptData, decryptData } from '../crypto'

/**
 * Custom hook to manage "Remember me" functionality for login forms.
 * Handles loading, saving, and clearing encrypted credentials in localStorage.
 * 
 * @param {string} storageKey - Unique localStorage key for this login context
 * @returns {Object} - { savedCreds, handleRememberMe }
 *   - savedCreds: { email, password, apiKey } | null - Decrypted credentials for pre-fill
 *   - handleRememberMe: (email, password, apiKey, rememberMe) => Promise<void> - Save/clear handler
 */
export function useRememberMe(storageKey) {
  const [savedCreds, setSavedCreds] = useState(null)

  // Load saved credentials on mount
  useEffect(() => {
    const loadSavedCreds = async () => {
      try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return
        const creds = await decryptData(raw)
        if (creds) {
          setSavedCreds(creds) // pre-fill form only
        } else {
          localStorage.removeItem(storageKey) // corrupted data
        }
      } catch (err) {
        // Decryption failed - remove corrupted data
        localStorage.removeItem(storageKey)
      }
    }
    loadSavedCreds()
  }, [storageKey])

  // Handler to save or clear credentials based on rememberMe flag
  // Note: Throws on encryption failure - caller should handle errors
  const handleRememberMe = async (email, password, apiKey, rememberMe) => {
    if (rememberMe) {
      try {
        const encrypted = await encryptData({ email, password, apiKey })
        localStorage.setItem(storageKey, encrypted)
      } catch (err) {
        // Encryption failed - log but don't block login
        console.error('Failed to save credentials:', err)
      }
    } else {
      localStorage.removeItem(storageKey)
    }
  }

  return { savedCreds, handleRememberMe }
}
