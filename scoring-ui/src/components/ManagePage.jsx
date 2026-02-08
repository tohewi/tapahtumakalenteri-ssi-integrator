import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as api from '../api'
import * as regApi from '../register-api'
import { encryptData, decryptData } from '../crypto'
import LoginScreen from './LoginScreen'
import { AppHeader, ErrorBanner, Spinner, CupList } from './shared'
import fi from '../i18n'

const LS_CREDS = 'ssi_credentials'

export default function ManagePage() {
  const [authed, setAuthed] = useState(false)
  const [view, setView] = useState('login') // login | cups | overview
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Cup selection
  const [cups, setCups] = useState([])
  const [selectedCup, setSelectedCup] = useState(null)

  // Management data
  const [data, setData] = useState(null)

  // Auto-login on mount
  useEffect(() => {
    const tryAutoLogin = async () => {
      const raw = localStorage.getItem(LS_CREDS)
      if (!raw) return
      const creds = await decryptData(raw)
      if (!creds) return
      try {
        await api.login(creds.email, creds.password, creds.apiKey)
        setAuthed(true)
        setView('cups')
      } catch { /* show login */ }
    }
    tryAutoLogin()
  }, [])

  // Login handler
  const handleLogin = async (email, password, apiKey, rememberMe) => {
    await api.login(email, password, apiKey)
    if (rememberMe) {
      const encrypted = await encryptData({ email, password, apiKey })
      localStorage.setItem(LS_CREDS, encrypted)
    }
    setAuthed(true)
    setView('cups')
  }

  // Logout handler
  const handleLogout = async () => {
    try { await api.logout() } catch { /* ignore */ }
    setAuthed(false)
    setView('login')
    setSelectedCup(null)
    setData(null)
    setError(null)
  }

  // Load cups from registration API (same data as Register page)
  useEffect(() => {
    if (view !== 'cups' || cups.length > 0) return
    const loadCups = async () => {
      setLoading(true)
      try {
        const cupList = await regApi.getCups()
        setCups(cupList)
      } catch (err) {
        setError(err.message)
      }
      setLoading(false)
    }
    loadCups()
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load management data for selected cup
  const handleSelectCup = useCallback(async (cup) => {
    setSelectedCup(cup)
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/manage/cup/${cup.id}`, { credentials: 'include' })
      if (!resp.ok) throw new Error('Failed to load management data')
      const d = await resp.json()
      setData(d)
      setView('overview')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold">Kupittaa Cup — Hallinta</h1>
              <p className="text-blue-200 text-sm mt-1">Kirjaudu SSI-tunnuksilla</p>
            </div>
            <a href="#/" className="text-blue-200 text-sm active:text-white">
              {fi.home}
            </a>
          </div>
        </div>
        <LoginScreen onLogin={handleLogin} hideHeader />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-xl font-bold">Kupittaa Cup — Hallinta</h1>
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

      {/* Cup picker — same as Registration */}
      {view === 'cups' && !loading && (
        <div className="p-3">
          <CupList
            cups={cups}
            onSelect={handleSelectCup}
            loading={loading}
            openLabel="Hallitse"
            emptyLabel="Ei cupeja"
          />
        </div>
      )}

      {/* Squadding overview */}
      {view === 'overview' && data && !loading && (
        <SquaddingOverview data={data} cupId={selectedCup.id} onRefresh={() => handleSelectCup(selectedCup)} />
      )}
    </div>
  )
}

// ============================================================
// Squadding Overview — Mobile-first management UI
// ============================================================

function SquaddingOverview({ data, cupId, onRefresh }) {
  const { matches, shooters, cupOnly, matchOnly } = data
  const matchIds = matches.map(m => m.id)
  const totalMatches = matches.length

  // Section refs for scroll-to
  const unsquaddedRef = useRef(null)
  const inconsistentRef = useRef(null)
  const notInCupRef = useRef(null)
  const squadsRef = useRef(null)

  // Action state
  const [actionLoading, setActionLoading] = useState(null) // shooterName being acted on
  const [actionError, setActionError] = useState(null)
  const [squadPicker, setSquadPicker] = useState(null) // { shooterName, type: 'assign'|'assignCupOnly' }

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

  const totalIssues = classified.unsquadded.length + classified.inconsistent.length + cupOnly.length + matchOnly.length
  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // ── Action handlers ──
  const runAction = async (actionFn, shooterName) => {
    setActionLoading(shooterName)
    setActionError(null)
    try {
      await actionFn()
      await onRefresh()
    } catch (err) {
      setActionError(`${shooterName}: ${err.message}`)
    }
    setActionLoading(null)
  }

  const handleAssignSquad = (shooterName, squadNumber) => {
    setSquadPicker(null)
    runAction(() => api.manageAssignSquad(cupId, shooterName, squadNumber), shooterName)
  }

  const handleFixSquad = (shooterName, targetSquad) => {
    runAction(() => api.manageFixSquad(cupId, shooterName, targetSquad), shooterName)
  }

  const handleAddToCup = (shooterName) => {
    runAction(() => api.manageAddToCup(cupId, shooterName), shooterName)
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
                <div key={i} className="bg-white rounded-xl border border-red-200 p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800 text-sm">{s.name}</div>
                    <div className="text-xs text-red-500 mt-0.5">Osakilpailuissa mutta ei squadissa</div>
                  </div>
                  <ActionButton
                    label="→ S?"
                    loading={actionLoading === s.name}
                    onClick={() => setSquadPicker({ shooterName: s.name, type: 'assign' })}
                    color="blue"
                  />
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
                <div key={i} className="bg-white rounded-xl border border-amber-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-gray-800 text-sm">{s.name}</div>
                    <ActionButton
                      label={`Korjaa → S${s.suggestedSquad}`}
                      loading={actionLoading === s.name}
                      onClick={() => handleFixSquad(s.name, s.suggestedSquad)}
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
                  {cupOnly.map((name, i) => (
                    <div key={i} className="bg-white rounded-xl border border-red-200 p-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-800 text-sm">{name}</div>
                        <div className="text-xs text-red-500 mt-0.5">Ilmoittautunut cupiin, ei osakilpailuissa</div>
                      </div>
                      <ActionButton
                        label="→ S?"
                        loading={actionLoading === name}
                        onClick={() => setSquadPicker({ shooterName: name, type: 'assignCupOnly' })}
                        color="blue"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {matchOnly.length > 0 && (
              <>
                <SectionHeader icon="+" title="Ei cupissa" count={matchOnly.length} color="purple" />
                <div className="space-y-2">
                  {matchOnly.map((name, i) => (
                    <div key={i} className="bg-white rounded-xl border border-purple-200 p-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-800 text-sm">{name}</div>
                        <div className="text-xs text-purple-500 mt-0.5">Osakilpailuissa mutta ei cupissa</div>
                      </div>
                      <ActionButton
                        label="Lisää"
                        loading={actionLoading === name}
                        onClick={() => handleAddToCup(name)}
                        color="purple"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Section: Squad overview ── */}
        <div ref={squadsRef} className="scroll-mt-16">
          <SectionHeader icon="👥" title="Squadit" count={squadGroups.length} color="blue" />
          {squadGroups.map(group => (
            <SquadCard key={group.number} group={group} matchLabels={matchLabels} />
          ))}
        </div>
      </div>

      {/* ── Bottom Sheet: Squad Picker ── */}
      {squadPicker && (
        <SquadPickerSheet
          shooterName={squadPicker.shooterName}
          squads={squadOptions}
          onSelect={(sqNum) => handleAssignSquad(squadPicker.shooterName, sqNum)}
          onClose={() => setSquadPicker(null)}
        />
      )}
    </div>
  )
}

// ── Action button with loading spinner ──
function ActionButton({ label, loading, onClick, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-700 active:bg-blue-200',
    amber: 'bg-amber-100 text-amber-700 active:bg-amber-200',
    purple: 'bg-purple-100 text-purple-700 active:bg-purple-200',
  }
  if (loading) {
    return (
      <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-400 flex items-center gap-1">
        <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 ${colorClasses[color] || colorClasses.blue}`}
    >
      {label}
    </button>
  )
}

// ── Bottom sheet squad picker (mobile-friendly) ──
function SquadPickerSheet({ shooterName, squads, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white rounded-t-2xl shadow-xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <h3 className="font-semibold text-gray-800">Valitse squad</h3>
          <p className="text-sm text-gray-500 mt-0.5">{shooterName}</p>
        </div>
        <div className="px-4 pb-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {squads.map(sq => (
            <button
              key={sq.number}
              onClick={() => onSelect(sq.number)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 active:bg-blue-50 active:border-blue-300 transition-colors"
            >
              <div>
                <div className="font-medium text-gray-800 text-sm">{sq.name}</div>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                sq.count >= sq.max && sq.max > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {sq.count}/{sq.max}
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 text-center text-gray-500 font-medium text-sm rounded-xl bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Peruuta
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Section header ──
function SectionHeader({ icon, title, count, color }) {
  const colors = {
    red: 'text-red-700',
    amber: 'text-amber-700',
    purple: 'text-purple-700',
    blue: 'text-blue-700',
    green: 'text-green-700',
  }
  return (
    <h2 className={`text-sm font-semibold uppercase tracking-wide mb-2 px-1 flex items-center gap-2 ${colors[color] || 'text-gray-700'}`}>
      <span>{icon}</span>
      <span>{title}</span>
      <span className="text-xs font-normal opacity-70">({count})</span>
    </h2>
  )
}

// ── Squad card with expandable shooter list ──
function SquadCard({ group, matchLabels }) {
  const [expanded, setExpanded] = useState(false)
  const shooterCount = group.total
  const hasIssues = group.issueShooters.length > 0

  return (
    <div className={`bg-white rounded-xl border mb-2 overflow-hidden ${hasIssues ? 'border-amber-200' : 'border-gray-200'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between active:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="font-semibold text-gray-800 text-sm">{group.name}</h3>
          {hasIssues && <span className="text-amber-500 text-xs">⚠</span>}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          shooterCount >= group.max && group.max > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {shooterCount}/{group.max}
        </span>
      </button>

      {expanded && (
        <div className="border-t">
          {shooterCount === 0 ? (
            <p className="px-4 py-3 text-gray-400 text-sm">Ei ampujia</p>
          ) : (
            <div className="divide-y">
              {group.okShooters.map((s, i) => (
                <div key={`ok-${i}`} className="px-4 py-2.5 flex items-center gap-2">
                  <span className="text-green-500 text-sm shrink-0">✓</span>
                  <span className="text-sm text-gray-800 flex-1 truncate">{s.name}</span>
                </div>
              ))}
              {group.issueShooters.map((s, i) => (
                <div key={`issue-${i}`} className="px-4 py-2.5 bg-amber-50">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500 text-sm shrink-0">⚠</span>
                    <span className="text-sm text-gray-800 flex-1 truncate">{s.name}</span>
                  </div>
                  <div className="flex gap-1 mt-1 ml-6">
                    {s.assignments.map((sq, mi) => (
                      <span key={mi} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        sq === null ? 'bg-red-100 text-red-600'
                          : sq === s.suggestedSquad ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {matchLabels[mi]}: {sq === null ? '✗' : `S${sq}`}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
