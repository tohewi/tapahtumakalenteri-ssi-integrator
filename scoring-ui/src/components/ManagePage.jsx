import { useState, useEffect, useCallback } from 'react'
import * as api from '../api'
// register-api no longer needed — cups loaded from /api/manage/cups
import { useAuthenticatedPage } from '../hooks/useAuthenticatedPage'
import LoginScreen from './LoginScreen'
import { ErrorBanner, Spinner, CupList } from './shared'
import { SquaddingOverview } from './manage'
import DeviceTokens from './DeviceTokens'
import ManageSessionGate from './manage/ManageSessionGate'
import fi from '../i18n'

const LS_MANAGE_STATE = 'ssi_manage_state'

export default function ManagePage() {
  return (
    <ManageSessionGate>
      {authenticated => <ManagePageContent initialAuthenticated={authenticated} />}
    </ManageSessionGate>
  )
}

function ManagePageContent({ initialAuthenticated }) {
  // Cup selection
  const [cups, setCups] = useState([])
  const [selectedCup, setSelectedCup] = useState(null)

  // Management data
  const [data, setData] = useState(null)

  const clearPageState = useCallback(() => {
    setCups([])
    setSelectedCup(null)
    setData(null)
    // Clear saved navigation so next login starts with cup list
    localStorage.removeItem(LS_MANAGE_STATE)
  }, [])

  const {
    authed, view, setView, loading, setLoading, error, setError,
    sessionExpiredMessage, savedCreds,
    handleLogin, handleLogout, withSessionCheck,
  } = useAuthenticatedPage({
    scope: 'manage',
    initialAuthenticated,
    credsKey: 'ssi_credentials_manage',
    stateKey: LS_MANAGE_STATE,
    defaultView: 'cups',
    restoreState: (state) => {
      if (state.cupId && state.view === 'overview') {
        // Restore cup identity so the cup list can highlight it, but go to
        // the cups view — the overview data was wiped on session expiry and
        // must be reloaded. The user can re-select the same cup from the list.
        setSelectedCup({ id: state.cupId, name: state.cupName })
        return 'cups'
      }
      return 'cups'
    },
    onLogout: clearPageState,
    onSessionExpired: clearPageState,
  })

  // --- Save navigation state on changes ---
  useEffect(() => {
    if (!authed || view === 'login') return
    localStorage.setItem(LS_MANAGE_STATE, JSON.stringify({
      view,
      cupId: selectedCup?.id,
      cupName: selectedCup?.name,
    }))
  }, [authed, view, selectedCup])

  // If somehow we end up in overview view without data (e.g. stale state), fall back to cups list.
  useEffect(() => {
    if (view === 'overview' && !data && !loading && authed) {
      setView('cups')
    }
  }, [view, data, loading, authed, setView])

  // Load cups from management API (shows cups until end date, regardless of registration status).
  // Always reloads when entering cups view — ensures fresh data after re-login or back-navigation.
  // Cleanup flag prevents stale in-flight responses from overwriting state after session expiry.
  useEffect(() => {
    if (view !== 'cups' || !authed) return
    let isActive = true
    const loadCups = async () => {
      setLoading(true)
      try {
        await withSessionCheck(async () => {
          const resp = await fetch('/api/manage/cups', { credentials: 'include' })
          if (resp.status === 401) {
            const data = await resp.json()
            if (data.sessionExpired) throw new api.SessionExpiredError(data.error)
          }
          if (resp.status === 403) {
            const data = await resp.json()
            if (data.scopeMismatch) {
              throw new api.ScopeMismatchError(data.error, data.requiredScope, data.currentScope)
            }
          }
          if (!resp.ok) throw new Error('Failed to load cups')
          const data = await resp.json()
          if (isActive) setCups(data.cups || [])
        })
      } catch (err) {
        if (!(err instanceof api.SessionExpiredError)) {
          if (isActive) setError(err.message)
        }
      }
      if (isActive) setLoading(false)
    }
    loadCups()
    return () => { isActive = false }
  }, [view, authed, withSessionCheck]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load management data for selected cup
  const handleSelectCup = useCallback(async (cup) => {
    setSelectedCup(cup)
    setLoading(true)
    setError(null)
    try {
      await withSessionCheck(async () => {
        const resp = await fetch(`/api/manage/cup/${cup.id}`, { credentials: 'include' })
        if (resp.status === 401) {
          const data = await resp.json()
          if (data.sessionExpired) {
            throw new api.SessionExpiredError(data.error)
          }
        }
        if (!resp.ok) throw new Error('Failed to load management data')
        const d = await resp.json()
        setData(d)
        setView('overview')
      })
    } catch (err) {
      if (!(err instanceof api.SessionExpiredError)) {
        setError(err.message)
      }
    }
    setLoading(false)
  }, [withSessionCheck, setError, setLoading, setView])

  // Patch CUP shooter status in local state so CUP2/CUP3 can update UI
  // without forcing a full overview reload.
  const patchShooterStatus = useCallback((cupParticipantId, patch) => {
    if (!cupParticipantId) return
    setData(prev => {
      if (!prev) return prev

      const targetId = String(cupParticipantId)
      const applyPatch = (list = []) => list.map((shooter) => {
        if (String(shooter?.cupParticipantId || '') !== targetId) return shooter
        const nextPatch = typeof patch === 'function' ? patch(shooter) : patch
        return { ...shooter, ...nextPatch }
      })

      return {
        ...prev,
        shooters: applyPatch(prev.shooters || []),
        cupOnly: applyPatch(prev.cupOnly || []),
        pendingShooters: applyPatch(prev.pendingShooters || []),
      }
    })
  }, [])

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold">SSI apurit — Hallinta</h1>
              <p className="text-blue-200 text-sm mt-1">Kirjaudu SSI-tunnuksilla</p>
            </div>
            <a href="#/" className="text-blue-200 text-sm active:text-white">
              {fi.home}
            </a>
          </div>
        </div>
        {sessionExpiredMessage && (
          <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
            <p className="text-yellow-800 text-sm font-medium">{sessionExpiredMessage}</p>
          </div>
        )}
        <LoginScreen 
          onLogin={handleLogin} 
          initialEmail={savedCreds?.email}
          initialPassword={savedCreds?.password}
          initialApiKey={savedCreds?.apiKey}
          hideHeader 
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-xl font-bold">SSI apurit — Hallinta</h1>
            <p className="text-blue-200 text-sm mt-1">
              {view === 'overview' && selectedCup ? selectedCup.name : 'Valitse cup hallintaa varten'}
            </p>
          </div>
          <button onClick={handleLogout} className="text-blue-200 text-sm active:text-white">
            {fi.logout}
          </button>
        </div>
        {view === 'overview' && (
          <button
            onClick={() => setView('cups')}
            className="flex items-center gap-1 mt-2 text-blue-200 text-sm active:text-white"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Cupit
          </button>
        )}
      </div>

      <ErrorBanner error={error} />
      {loading && <Spinner />}

      {/* Cup picker — primary purpose of the manage page */}
      {view === 'cups' && !loading && (
        <div className="p-3">
          <CupList
            cups={cups}
            onSelect={handleSelectCup}
            loading={loading}
            openLabel="Hallitse"
            emptyLabel="Ei cupeja"
            allClickable
          />
        </div>
      )}

      {/* Device Tokens — QR Code Login (R7.7), below cup list */}
      {view === 'cups' && !loading && (
        <div className="p-3">
          <DeviceTokens />
        </div>
      )}

      {/* Squadding overview */}
      {view === 'overview' && data && !loading && (
        <SquaddingOverview
          data={data}
          cupId={selectedCup.id}
          onRefresh={() => handleSelectCup(selectedCup)}
          onPatchShooterStatus={patchShooterStatus}
        />
      )}
    </div>
  )
}

// ============================================================
