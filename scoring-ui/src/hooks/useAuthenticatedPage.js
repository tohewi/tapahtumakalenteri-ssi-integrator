import { useState, useCallback } from 'react'
import * as api from '../api'
import { useRememberMe } from './useRememberMe'

/**
 * Custom hook that encapsulates the shared authentication pattern
 * used across all authenticated page components.
 *
 * Provides: auth state, session expiry handling, login/logout,
 * withSessionCheck wrapper, and remember-me integration.
 *
 * @param {Object} options
 * @param {string} options.scope - API scope for login (e.g. 'manage', 'reporting', 'scoring')
 * @param {string} options.credsKey - localStorage key for remember-me credentials
 * @param {string} options.stateKey - localStorage key for saved navigation state
 * @param {string} options.defaultView - View to show after login if no saved state (default: 'search')
 * @param {Function} [options.onLogout] - Extra cleanup callback on logout (clear page-specific state)
 * @param {Function} [options.onSessionExpired] - Extra cleanup callback on session expiry
 * @param {Function} [options.restoreState] - Custom state restore function, receives parsed saved state.
 *   Should return the view string to navigate to, or null to use defaultView.
 * @returns {Object} Auth state and handlers
 */
export function useAuthenticatedPage({
  scope,
  credsKey,
  stateKey,
  defaultView = 'search',
  onLogout,
  onSessionExpired,
  restoreState,
}) {
  const { savedCreds, handleRememberMe } = useRememberMe(credsKey)

  const [authed, setAuthed] = useState(false)
  const [view, setView] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)

  // --- Helper to handle session expiry ---
  const handleSessionExpired = useCallback(() => {
    setSessionExpiredMessage('Session expired. Please login again.')
    setAuthed(false)
    setView('login')
    setError(null)
    if (onSessionExpired) onSessionExpired()
  }, [onSessionExpired])

  // --- Helper to handle scope mismatch ---
  const handleScopeMismatch = useCallback(() => {
    setSessionExpiredMessage('Please login to access this feature.')
    setAuthed(false)
    setView('login')
    setError(null)
    if (onSessionExpired) onSessionExpired()
  }, [onSessionExpired])

  // --- Wrapper to catch SessionExpiredError and ScopeMismatchError ---
  const withSessionCheck = useCallback(async (fn) => {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof api.SessionExpiredError) {
        handleSessionExpired()
        throw err
      }
      if (err instanceof api.ScopeMismatchError) {
        handleScopeMismatch()
        throw err
      }
      throw err
    }
  }, [handleSessionExpired, handleScopeMismatch])

  // --- Login handler ---
  const handleLogin = async (email, password, apiKey, rememberMe) => {
    setSessionExpiredMessage(null)
    await api.login(email, password, apiKey, scope)
    await handleRememberMe(email, password, apiKey, rememberMe)
    setAuthed(true)

    // Restore previous state if available
    const savedState = localStorage.getItem(stateKey)
    if (savedState) {
      try {
        const state = JSON.parse(savedState)
        if (restoreState) {
          const restoredView = restoreState(state)
          setView(restoredView || defaultView)
        } else {
          setView(state.view || defaultView)
        }
      } catch {
        setView(defaultView)
      }
    } else {
      setView(defaultView)
    }
  }

  // --- Logout handler ---
  const handleLogout = async () => {
    try { await api.logout() } catch { /* ignore */ }
    setAuthed(false)
    setView('login')
    setError(null)
    if (onLogout) onLogout()
  }

  return {
    // State
    authed,
    view,
    setView,
    loading,
    setLoading,
    error,
    setError,
    sessionExpiredMessage,
    savedCreds,

    // Handlers
    handleLogin,
    handleLogout,
    withSessionCheck,
  }
}
