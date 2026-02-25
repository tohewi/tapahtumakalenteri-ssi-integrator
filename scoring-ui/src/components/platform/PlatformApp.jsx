// ============================================================
// PlatformApp — Main shell for the Match Management Platform
//
// Handles:
//   - Welcome / sign-up page (unauthenticated)
//   - Sign-in flow
//   - Dashboard with tenant list (authenticated)
//   - Tenant creation wizard
//
// Uses platform-api.js for backend communication.
// Platform auth is separate from SSI auth.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  platformRegister,
  platformLogin,
  platformLogout,
  platformStatus,
  createTenant,
} from '../../platform-api.js'

// ---- Sub-views ----

import WelcomePage from './WelcomePage.jsx'
import SignInPage from './SignInPage.jsx'
import DashboardPage from './DashboardPage.jsx'
import TenantCreatePage from './TenantCreatePage.jsx'

// ---- App states ----
const VIEW = {
  LOADING: 'loading',
  WELCOME: 'welcome',
  SIGN_IN: 'sign_in',
  DASHBOARD: 'dashboard',
  CREATE_TENANT: 'create_tenant',
}

export default function PlatformApp() {
  const [view, setView] = useState(VIEW.LOADING)
  const [account, setAccount] = useState(null)
  const [tenants, setTenants] = useState([])
  const [error, setError] = useState(null)

  // Check session on mount
  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const data = await platformStatus()
      if (data.authenticated) {
        setAccount(data.account)
        setTenants(data.tenants || [])
        setView(VIEW.DASHBOARD)
      } else {
        setView(VIEW.WELCOME)
      }
    } catch {
      setView(VIEW.WELCOME)
    }
  }

  // ---- Auth actions ----

  const handleRegister = useCallback(async (formData) => {
    setError(null)
    try {
      const data = await platformRegister(formData)
      setAccount(data.account)
      setTenants(data.tenant ? [data.tenant] : [])
      setView(VIEW.DASHBOARD)
    } catch (err) {
      setError(err.details ? err.details.join('. ') : err.message)
      throw err // re-throw so form can handle it
    }
  }, [])

  const handleLogin = useCallback(async ({ email, password }) => {
    setError(null)
    try {
      const data = await platformLogin({ email, password })
      setAccount(data.account)
      setTenants(data.tenants || [])
      setView(VIEW.DASHBOARD)
    } catch (err) {
      setError(err.message)
      throw err
    }
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await platformLogout()
    } catch {
      // ignore logout errors
    }
    setAccount(null)
    setTenants([])
    setView(VIEW.WELCOME)
  }, [])

  const handleCreateTenant = useCallback(async ({ name }) => {
    setError(null)
    try {
      const data = await createTenant({ name })
      setTenants(prev => [...prev, data.tenant])
      setView(VIEW.DASHBOARD)
    } catch (err) {
      setError(err.message)
      throw err
    }
  }, [])

  // ---- Render ----

  if (view === VIEW.LOADING) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (view === VIEW.WELCOME) {
    return (
      <WelcomePage
        error={error}
        onRegister={handleRegister}
        onSwitchToSignIn={() => { setError(null); setView(VIEW.SIGN_IN) }}
      />
    )
  }

  if (view === VIEW.SIGN_IN) {
    return (
      <SignInPage
        error={error}
        onLogin={handleLogin}
        onSwitchToSignUp={() => { setError(null); setView(VIEW.WELCOME) }}
      />
    )
  }

  if (view === VIEW.CREATE_TENANT) {
    return (
      <TenantCreatePage
        error={error}
        onCreateTenant={handleCreateTenant}
        onCancel={() => { setError(null); setView(VIEW.DASHBOARD) }}
      />
    )
  }

  // VIEW.DASHBOARD
  return (
    <DashboardPage
      account={account}
      tenants={tenants}
      onLogout={handleLogout}
      onCreateTenant={() => { setError(null); setView(VIEW.CREATE_TENANT) }}
    />
  )
}
