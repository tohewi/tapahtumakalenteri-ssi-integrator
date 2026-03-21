import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as api from '../api'
// register-api no longer needed — cups loaded from /api/manage/cups
import { useAuthenticatedPage } from '../hooks/useAuthenticatedPage'
import LoginScreen from './LoginScreen'
import { AppHeader, ErrorBanner, Spinner, CupList } from './shared'
import { ActionButton, ShooterActions, SquadPickerSheet, SectionHeader, SquadCard } from './manage'
import DeviceTokens from './DeviceTokens'
import fi from '../i18n'

const LS_MANAGE_STATE = 'ssi_manage_state'

export default function ManagePage() {
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
    credsKey: 'ssi_credentials_manage',
    stateKey: LS_MANAGE_STATE,
    defaultView: 'cups',
    restoreState: (state) => {
      if (state.cupId && state.view === 'overview') {
        // Try to restore to the overview page
        setSelectedCup({ id: state.cupId, name: state.cupName })
        return 'overview'
        // The data will be loaded by the useEffect that watches selectedCup
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
  }, [withSessionCheck]) // withSessionCheck is stable, but included for clarity

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
// Squadding Overview — Mobile-first management UI
// ============================================================

function SquaddingOverview({ data, cupId, onRefresh, onPatchShooterStatus }) {
  const { matches, shooters, cupOnly, matchOnly, pendingShooters = [] } = data
  const matchIds = matches.map(m => m.id)
  const totalMatches = matches.length

  // Section refs for scroll-to
  const unsquaddedRef = useRef(null)
  const inconsistentRef = useRef(null)
  const notInCupRef = useRef(null)
  const pendingRef = useRef(null)
  const squadsRef = useRef(null)

  // Action state
  const [actionLoading, setActionLoading] = useState(null) // { shooterName, action } being acted on
  const [actionError, setActionError] = useState(null)
  const [squadPicker, setSquadPicker] = useState(null) // { shooterName, type: 'assign'|'assignCupOnly' }
  const [expandedSquads, setExpandedSquads] = useState(new Set()) // persists across refreshes

  // Short match labels (last word: Tarkkuus, Pika, Kuvio)
  const matchLabels = matches.map(m => {
    const parts = m.name.split(' ')
    return parts[parts.length - 1]
  })

  // Available squads for picker
  const squadOptions = [...new Set(matches.flatMap(m => m.squads.map(s => s.number)))].sort((a, b) => a - b).map(n => {
    const info = matches[0]?.squads.find(s => s.number === n)
    const count = shooters.filter(s => Object.values(s.matches).includes(n)).length
    return { number: n, name: info?.name || `Squad ${n}`, max: info?.max || 0, count }
  })

  // Classify shooters
  const classified = useMemo(() => {
    const unsquadded = []
    const inconsistent = []
    const ok = []

    for (const s of shooters) {
      const assignedSquads = matchIds.map(id => s.matches[id] ?? null)
      const nonNull = assignedSquads.filter(a => a !== null)

      if (nonNull.length === 0) {
        unsquadded.push({ ...s, assignments: assignedSquads })
        continue
      }

      const allSame = nonNull.every(a => a === nonNull[0])
      const allPresent = nonNull.length === totalMatches

      if (allSame && allPresent) {
        ok.push({ ...s, assignments: assignedSquads, squad: nonNull[0] })
      } else {
        const counts = {}
        for (const sq of nonNull) { counts[sq] = (counts[sq] || 0) + 1 }
        const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
        inconsistent.push({
          ...s,
          assignments: assignedSquads,
          suggestedSquad: majority ? Number(majority[0]) : nonNull[0],
          missingCount: totalMatches - nonNull.length,
        })
      }
    }

    return {
      unsquadded: unsquadded.sort((a, b) => a.name.localeCompare(b.name, 'fi')),
      inconsistent: inconsistent.sort((a, b) => a.name.localeCompare(b.name, 'fi')),
      ok: ok.sort((a, b) => a.name.localeCompare(b.name, 'fi')),
    }
  }, [shooters, matchIds, totalMatches])

  // Squad groups for overview cards
  const squadNumbers = [...new Set(matches.flatMap(m => m.squads.map(s => s.number)))].sort((a, b) => a - b)
  const squadGroups = squadNumbers.map(sqNum => {
    const squadInfo = matches[0]?.squads.find(s => s.number === sqNum)
    const inSquad = classified.ok.filter(s => s.squad === sqNum)
    const issues = classified.inconsistent.filter(s => s.suggestedSquad === sqNum)
    return {
      number: sqNum,
      name: squadInfo?.name || `Squad ${sqNum}`,
      max: squadInfo?.max || 0,
      okShooters: inSquad,
      issueShooters: issues,
      total: inSquad.length + issues.length,
    }
  })

  const totalIssues = classified.unsquadded.length + classified.inconsistent.length + cupOnly.length + matchOnly.length + pendingShooters.length
  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // ── Action handlers ──
  const runAction = async (actionFn, shooterName, action, options = {}) => {
    const { refresh = true, afterSuccess } = options
    setActionLoading({ shooterName, action })
    setActionError(null)
    try {
      await actionFn()
      if (typeof afterSuccess === 'function') afterSuccess()
      if (refresh) await onRefresh()
    } catch (err) {
      setActionError(`${shooterName}: ${err.message}`)
    }
    setActionLoading(null)
  }

  // DNS confirmation dialog state
  const [dnsConfirm, setDnsConfirm] = useState(null) // { shooter, action: 'set'|'undo' }

  const handleAssignSquad = (shooter, squadNumber) => {
    setSquadPicker(null)
    runAction(() => api.manageAssignSquad(cupId, shooter.name, squadNumber, shooter.email), shooter.name, 'assign')
  }

  const handleFixSquad = (shooter, targetSquad) => {
    runAction(() => api.manageFixSquad(cupId, shooter.name, targetSquad, shooter.email), shooter.name, 'fix')
  }

  const handleAddToCup = (shooter) => {
    runAction(() => api.manageAddToCup(cupId, shooter.name, shooter.email), shooter.name, 'addToCup')
  }

  const handleApprovePending = (shooter) => {
    runAction(() => api.manageApprovePending(cupId, shooter.name, shooter.email, shooter.cupParticipantId), shooter.name, 'approve')
  }

  const handleRemovePending = (shooter) => {
    runAction(() => api.manageRemovePending(cupId, shooter.name, shooter.email, shooter.cupParticipantId, shooter.inMatches), shooter.name, 'remove')
  }

  // CUP2: DNS handlers
  const handleSetDns = (shooter) => {
    setDnsConfirm({ shooter, action: 'set' })
  }

  const handleUndoDns = (shooter) => {
    setDnsConfirm({ shooter, action: 'undo' })
  }

  const confirmDns = () => {
    if (!dnsConfirm) return
    const { shooter, action } = dnsConfirm
    setDnsConfirm(null)
    if (action === 'set') {
      runAction(
        () => api.manageSetDns(cupId, shooter.name, shooter.email, shooter.cupParticipantId),
        shooter.name,
        'dns',
        {
          refresh: false,
          afterSuccess: () => onPatchShooterStatus?.(shooter.cupParticipantId, { didNotShow: true }),
        }
      )
    } else {
      runAction(
        () => api.manageUndoDns(cupId, shooter.name, shooter.email, shooter.cupParticipantId),
        shooter.name,
        'undoDns',
        {
          refresh: false,
          afterSuccess: () => onPatchShooterStatus?.(shooter.cupParticipantId, { didNotShow: false }),
        }
      )
    }
  }

  // CUP3: Paid toggle handler
  const handleTogglePaid = (shooter) => {
    if (!shooter.cupParticipantId) return
    runAction(
      () => api.manageTogglePaid(cupId, shooter.name, shooter.cupParticipantId),
      shooter.name,
      'paid',
      {
        refresh: false,
        afterSuccess: () => onPatchShooterStatus?.(shooter.cupParticipantId, s => ({ paid: !s.paid })),
      }
    )
  }

  // CUP1: Move squad handler (for shooters already in a squad)
  const handleMoveSquad = (shooter) => {
    setSquadPicker({ shooter, type: 'move' })
  }

  return (
    <div className="pb-6">

      {/* ── Sticky Action Bar ── */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="flex gap-1 p-2">
          {classified.unsquadded.length > 0 && (
            <button
              onClick={() => scrollTo(unsquaddedRef)}
              className="flex-1 flex flex-col items-center py-2 px-1 rounded-lg bg-red-50 active:bg-red-100 transition-colors"
            >
              <span className="text-lg font-bold text-red-700">{classified.unsquadded.length}</span>
              <span className="text-[10px] font-medium text-red-600 leading-tight">Ei sq</span>
            </button>
          )}
          {classified.inconsistent.length > 0 && (
            <button
              onClick={() => scrollTo(inconsistentRef)}
              className="flex-1 flex flex-col items-center py-2 px-1 rounded-lg bg-amber-50 active:bg-amber-100 transition-colors"
            >
              <span className="text-lg font-bold text-amber-700">{classified.inconsistent.length}</span>
              <span className="text-[10px] font-medium text-amber-600 leading-tight">Eri sq</span>
            </button>
          )}
          {(cupOnly.length > 0 || matchOnly.length > 0) && (
            <button
              onClick={() => scrollTo(notInCupRef)}
              className="flex-1 flex flex-col items-center py-2 px-1 rounded-lg bg-purple-50 active:bg-purple-100 transition-colors"
            >
              <span className="text-lg font-bold text-purple-700">{cupOnly.length + matchOnly.length}</span>
              <span className="text-[10px] font-medium text-purple-600 leading-tight">Cup ≠</span>
            </button>
          )}
          {pendingShooters.length > 0 && (
            <button
              onClick={() => scrollTo(pendingRef)}
              className="flex-1 flex flex-col items-center py-2 px-1 rounded-lg bg-blue-50 active:bg-blue-100 transition-colors"
            >
              <span className="text-lg font-bold text-blue-700">{pendingShooters.length}</span>
              <span className="text-[10px] font-medium text-blue-600 leading-tight">Odottaa</span>
            </button>
          )}
          <button
            onClick={() => scrollTo(squadsRef)}
            className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg transition-colors ${
              totalIssues === 0 ? 'bg-green-50 active:bg-green-100' : 'bg-gray-50 active:bg-gray-100'
            }`}
          >
            <span className={`text-lg font-bold ${totalIssues === 0 ? 'text-green-700' : 'text-gray-700'}`}>
              {classified.ok.length}
            </span>
            <span className={`text-[10px] font-medium leading-tight ${totalIssues === 0 ? 'text-green-600' : 'text-gray-500'}`}>
              {totalIssues === 0 ? 'Kaikki ✓' : 'OK'}
            </span>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-4">

        {/* Action error */}
        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-red-700 text-sm font-medium">{actionError}</p>
            <button onClick={() => setActionError(null)} className="text-red-500 text-xs underline mt-1">Sulje</button>
          </div>
        )}

        {/* ── All OK banner ── */}
        {totalIssues === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-green-700 font-bold text-lg">✓ Kaikki kunnossa</p>
            <p className="text-green-600 text-xs mt-1">
              {shooters.length} ampujaa · {matches.length} osakilpailua · kaikki samassa squadissa
            </p>
          </div>
        )}

        {/* ── Section: Unsquadded ── */}
        {classified.unsquadded.length > 0 && (
          <div ref={unsquaddedRef} className="scroll-mt-16">
            <SectionHeader icon="⚠" title="Ei squadeissa" count={classified.unsquadded.length} color="red" />
            <div className="space-y-2">
              {classified.unsquadded.map((s, i) => (
                <div key={i} className={`bg-white rounded-xl border border-red-200 p-3 ${s.didNotShow ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-gray-800 text-sm ${s.didNotShow ? 'line-through' : ''}`}>{s.name}</div>
                      {s.email ? (
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{s.email}</div>
                      ) : (
                        <div className="text-xs text-red-600 mt-0.5 font-medium">🚨 Sähköposti puuttuu</div>
                      )}
                      <div className="text-xs text-red-500 mt-0.5">Osakilpailuissa mutta ei squadissa</div>
                      <ShooterActions shooter={s} actionLoading={actionLoading} onSetDns={handleSetDns} onUndoDns={handleUndoDns} onTogglePaid={handleTogglePaid} />
                    </div>
                    <ActionButton
                      label={fi.moveSquad}
                      loading={actionLoading?.shooterName === s.name && actionLoading?.action === 'assign'}
                      onClick={() => setSquadPicker({ shooter: s, type: 'assign' })}
                      color="blue"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Section: Inconsistent ── */}
        {classified.inconsistent.length > 0 && (
          <div ref={inconsistentRef} className="scroll-mt-16">
            <SectionHeader icon="↔" title="Eri squadissa" count={classified.inconsistent.length} color="amber" />
            <div className="space-y-2">
              {classified.inconsistent.map((s, i) => (
                <div key={i} className={`bg-white rounded-xl border border-amber-200 p-3 ${s.didNotShow ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-gray-800 text-sm ${s.didNotShow ? 'line-through' : ''}`}>{s.name}</div>
                      {s.email ? (
                        <div className="text-xs text-gray-500 truncate">{s.email}</div>
                      ) : (
                        <div className="text-xs text-red-600 font-medium">🚨 Sähköposti puuttuu</div>
                      )}
                      <ShooterActions shooter={s} actionLoading={actionLoading} onSetDns={handleSetDns} onUndoDns={handleUndoDns} onTogglePaid={handleTogglePaid} />
                    </div>
                    <ActionButton
                      label={`Korjaa → S${s.suggestedSquad}`}
                      loading={actionLoading?.shooterName === s.name && actionLoading?.action === 'fix'}
                      onClick={() => handleFixSquad(s, s.suggestedSquad)}
                      color="amber"
                    />
                  </div>
                  <div className="flex gap-1">
                    {s.assignments.map((sq, mi) => (
                      <span key={mi} className={`flex-1 text-center py-1 rounded text-xs font-medium ${
                        sq === null ? 'bg-red-100 text-red-600'
                          : sq === s.suggestedSquad ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        <span className="block text-[9px] text-gray-400 leading-none mb-0.5">{matchLabels[mi]}</span>
                        {sq === null ? '✗' : `S${sq}`}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Section: CUP / Match mismatch ── */}
        {(cupOnly.length > 0 || matchOnly.length > 0) && (
          <div ref={notInCupRef} className="scroll-mt-16">
            {cupOnly.length > 0 && (
              <>
                <SectionHeader icon="📋" title="Cupissa mutta ei osakilpailuissa" count={cupOnly.length} color="red" />
                <div className="space-y-2 mb-4">
                  {cupOnly.map((s, i) => (
                    <div key={i} className={`bg-white rounded-xl border border-red-200 p-3 ${s.didNotShow ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-gray-800 text-sm ${s.didNotShow ? 'line-through' : ''}`}>{s.name}</div>
                          {s.email ? (
                            <div className="text-xs text-gray-500 mt-0.5 truncate">{s.email}</div>
                          ) : (
                            <div className="text-xs text-red-600 mt-0.5 font-medium">🚨 Sähköposti puuttuu</div>
                          )}
                          <div className="text-xs text-red-500 mt-0.5">Ilmoittautunut cupiin, ei osakilpailuissa</div>
                          <ShooterActions shooter={s} actionLoading={actionLoading} onSetDns={handleSetDns} onUndoDns={handleUndoDns} onTogglePaid={handleTogglePaid} />
                        </div>
                        <ActionButton
                          label={fi.moveSquad}
                          loading={actionLoading?.shooterName === s.name && actionLoading?.action === 'assign'}
                          onClick={() => setSquadPicker({ shooter: s, type: 'assignCupOnly' })}
                          color="blue"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {matchOnly.length > 0 && (
              <>
                <SectionHeader icon="+" title="Ei cupissa" count={matchOnly.length} color="purple" />
                <div className="space-y-2">
                  {matchOnly.map((s, i) => (
                    <div key={i} className="bg-white rounded-xl border border-purple-200 p-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 text-sm">{s.name}</div>
                        {s.email ? (
                          <div className="text-xs text-gray-500 mt-0.5 truncate">{s.email}</div>
                        ) : (
                          <div className="text-xs text-red-600 mt-0.5 font-medium">🚨 Sähköposti puuttuu</div>
                        )}
                        <div className="text-xs text-purple-500 mt-0.5">Osakilpailuissa mutta ei cupissa</div>
                      </div>
                      <ActionButton
                        label="Lisää"
                        loading={actionLoading?.shooterName === s.name && actionLoading?.action === 'addToCup'}
                        onClick={() => handleAddToCup(s)}
                        color="purple"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Section: Pending shooters ── */}
        {pendingShooters.length > 0 && (
          <div ref={pendingRef} className="scroll-mt-16">
            <SectionHeader icon="⏳" title="Odottaa hyväksyntää" count={pendingShooters.length} color="blue" />
            <div className="space-y-2">
              {pendingShooters.map((s, i) => (
                <div key={i} className="bg-white rounded-xl border border-blue-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 text-sm">{s.name}</div>
                      {s.email ? (
                        <div className="text-xs text-gray-500 truncate">{s.email}</div>
                      ) : (
                        <div className="text-xs text-red-600 font-medium">🚨 Sähköposti puuttuu</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {s.inCup && (
                        <ActionButton
                          label="Hyväksy"
                          loading={actionLoading?.shooterName === s.name && actionLoading?.action === 'approve'}
                          onClick={() => handleApprovePending(s)}
                          color="blue"
                        />
                      )}
                      <ActionButton
                        label="Poista"
                        loading={actionLoading?.shooterName === s.name && actionLoading?.action === 'remove'}
                        onClick={() => handleRemovePending(s)}
                        color="red"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 space-y-0.5">
                    {s.inCup && <div>• Cupissa (pending)</div>}
                    {s.inMatches.length > 0 && (
                      <div>• Osakilpailuissa: {s.inMatches.map(m => `${m.componentNumber}. ${m.matchName}`).join(', ')}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Section: Squad overview ── */}
        <div ref={squadsRef} className="scroll-mt-16">
          <SectionHeader icon="👥" title="Squadit" count={squadGroups.length} color="blue" />
          {squadGroups.map(group => (
            <SquadCard
              key={group.number}
              group={group}
              matchLabels={matchLabels}
              actionLoading={actionLoading}
              onMoveSquad={handleMoveSquad}
              onSetDns={handleSetDns}
              onUndoDns={handleUndoDns}
              onTogglePaid={handleTogglePaid}
              expanded={expandedSquads.has(group.number)}
              onToggleExpand={() => setExpandedSquads(prev => {
                const next = new Set(prev)
                if (next.has(group.number)) next.delete(group.number)
                else next.add(group.number)
                return next
              })}
            />
          ))}
        </div>
      </div>

      {/* ── Bottom Sheet: Squad Picker ── */}
      {squadPicker && (
        <SquadPickerSheet
          shooter={squadPicker.shooter}
          squads={squadOptions}
          onSelect={(sqNum) => {
            if (squadPicker.type === 'move') {
              setSquadPicker(null)
              handleFixSquad(squadPicker.shooter, sqNum)
            } else {
              handleAssignSquad(squadPicker.shooter, sqNum)
            }
          }}
          onClose={() => setSquadPicker(null)}
        />
      )}

      {/* ── DNS Confirmation Dialog ── */}
      {dnsConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDnsConfirm(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 mx-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <p className="text-gray-800 font-medium text-center text-base mb-4">
              {dnsConfirm.action === 'set'
                ? fi.dnsConfirm(dnsConfirm.shooter.name)
                : fi.undoDnsConfirm(dnsConfirm.shooter.name)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDnsConfirm(null)}
                className="flex-1 py-2.5 text-center text-gray-500 font-medium text-sm rounded-xl bg-gray-100 active:bg-gray-200 transition-colors"
              >
                {fi.cancel}
              </button>
              <button
                onClick={confirmDns}
                className={`flex-1 py-2.5 text-center font-medium text-sm rounded-xl transition-colors ${
                  dnsConfirm.action === 'set'
                    ? 'bg-red-500 text-white active:bg-red-600'
                    : 'bg-green-500 text-white active:bg-green-600'
                }`}
              >
                {dnsConfirm.action === 'set' ? fi.setDns : fi.undoDns}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

