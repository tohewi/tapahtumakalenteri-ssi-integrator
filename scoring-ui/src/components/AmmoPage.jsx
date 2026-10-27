import { useState, useEffect, useCallback } from 'react'
import { useAuthenticatedPage } from '../hooks/useAuthenticatedPage'
import LoginScreen from './LoginScreen'
import ManageSessionGate from './manage/ManageSessionGate'
import { LegalFooterLinks } from './LegalDocumentPage'
import AmmoInventorySection from './guns/AmmoInventorySection'
import { AppHeader, ErrorBanner, Spinner } from './shared'
import * as gunsApi from '../guns-api'

export default function AmmoPage() {
  return (
    <ManageSessionGate>
      {authenticated => <AmmoPageContent initialAuthenticated={authenticated} />}
    </ManageSessionGate>
  )
}

function AmmoPageContent({ initialAuthenticated }) {
  const [ammo, setAmmo] = useState([])
  const [config, setConfig] = useState(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const clearPageState = useCallback(() => {
    setAmmo([])
    setConfig(null)
    setAccessDenied(false)
  }, [])

  const {
    authed,
    loading,
    setLoading,
    error,
    setError,
    sessionExpiredMessage,
    savedCreds,
    withSessionCheck,
    handleLogin: baseLogin,
    handleLogout,
  } = useAuthenticatedPage({
    scope: 'manage',
    credsKey: 'ssi_credentials_manage',
    onLogout: clearPageState,
    onSessionExpired: clearPageState,
    initialAuthenticated,
  })

  const loadAmmo = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await withSessionCheck(async () => {
        const res = await gunsApi.getGuns()
        setAmmo(res.ammo || [])
        setConfig(res.config || null)
        setAccessDenied(false)
      })
    } catch (err) {
      if (err.status === 403) {
        setAccessDenied(true)
      }
      if (!err.sessionExpired && !err.scopeMismatch) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [setLoading, setError, withSessionCheck])

  useEffect(() => {
    if (!authed) return
    let active = true
    setLoading(true)
    setError(null)
    withSessionCheck(async () => {
      const res = await gunsApi.getGuns()
      if (!active) return
      setAmmo(res.ammo || [])
      setConfig(res.config || null)
      setAccessDenied(false)
    })
      .catch(err => {
        if (!active) return
        if (err.status === 403) {
          setAccessDenied(true)
        }
        if (!err.sessionExpired && !err.scopeMismatch) {
          setError(err.message)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [authed, setLoading, setError, withSessionCheck])

  if (!authed) {
    return (
      <div>
        {sessionExpiredMessage && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 text-center">
            <p className="text-yellow-800 text-sm font-medium">{sessionExpiredMessage}</p>
          </div>
        )}
        <LoginScreen
          onLogin={baseLogin}
          initialEmail={savedCreds?.email}
          initialPassword={savedCreds?.password}
          initialApiKey={savedCreds?.apiKey}
          title="Patruunavarasto"
          subtitle="Kirjaudu SSI-tunnuksilla (Ryhmä 25874 admin)"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <AppHeader
        title="Patruunavarasto"
        subtitle={config?.accessControl?.groupId ? `SSI Ryhmä ${config.accessControl.groupId} (admin)` : 'TurRes patruunavarasto'}
        backLabel="Alkuun"
        onBack={() => { window.location.hash = '#/' }}
        onLogout={handleLogout}
      />

      <ErrorBanner error={error} onClose={() => setError(null)} />
      {loading && <Spinner />}

      {!accessDenied && (
        <div className="p-3 max-w-2xl mx-auto space-y-3">
          <div className="flex items-center justify-end">
            <a
              href="#/guns"
              className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold"
            >
              Laina-aseet (#/guns) →
            </a>
          </div>
          <AmmoInventorySection
            ammo={ammo}
            onRefresh={loadAmmo}
            onError={(msg) => setError(msg)}
          />
        </div>
      )}
      <LegalFooterLinks />
    </div>
  )
}
