import { useState, useCallback, useEffect } from 'react'
import { encryptData, decryptData } from './crypto'
import MatchPicker from './components/MatchPicker'
import SquadPicker from './components/SquadPicker'
import ScoringForm from './components/ScoringForm'
import ShooterPicker from './components/ShooterPicker'
import LoginScreen from './components/LoginScreen'
import CupSearch from './components/CupSearch'
import * as api from './api'

// ============================================================
// Scoring constants
// ============================================================

const SCORE_ZONES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']
const SERIES_COUNT = 6
const MAX_HITS_PER_SERIES = 5
const ZONE_POINTS = { X: 10, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1, M: 0 }

function createEmptySeriesScore() {
  return Object.fromEntries(SCORE_ZONES.map(z => [z, 0]))
}

function createEmptyAllScores(shooters) {
  const all = {}
  for (const s of shooters) {
    all[s.id] = {}
    for (let i = 0; i < SERIES_COUNT; i++) {
      all[s.id][i] = createEmptySeriesScore()
    }
  }
  return all
}

function hitsInSeries(seriesScores) {
  return SCORE_ZONES.reduce((sum, z) => sum + seriesScores[z], 0)
}

function pointsInSeries(seriesScores) {
  return SCORE_ZONES.reduce((sum, z) => sum + seriesScores[z] * ZONE_POINTS[z], 0)
}

function isSeriesScored(seriesScores) {
  return hitsInSeries(seriesScores) > 0
}

// ============================================================
// App — views: login → cup → match → squad → series/shooters → scoring
// ============================================================

// --- localStorage helpers ---
const LS_KEYS = {
  CREDS: 'ssi_credentials',
  CUP: 'ssi_last_cup',
  SCORES: 'ssi_scores',
  NAV: 'ssi_nav_state',
}

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ }
}
function lsRemove(key) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

function App() {
  const hasSavedCreds = !!localStorage.getItem(LS_KEYS.CREDS)
  const [view, setView] = useState(hasSavedCreds ? 'restoring' : 'login') // 'login' | 'restoring' | 'cup' | 'match' | 'squad' | 'series' | 'scoring'
  const [selectedCup, setSelectedCup] = useState(null)
  const [matches, setMatches] = useState([])
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [selectedSquad, setSelectedSquad] = useState(null)
  const [activeSeries, setActiveSeries] = useState(0)
  const [selectedShooterId, setSelectedShooterId] = useState(null)
  const [allScores, setAllScores] = useState({})
  const [doubleSeries, setDoubleSeries] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // --- Save navigation state on changes ---
  useEffect(() => {
    if (view === 'login' || view === 'restoring') return
    lsSet(LS_KEYS.NAV, {
      view,
      cupId: selectedCup?.id,
      matchId: selectedMatch?.id,
      squadId: selectedSquad?.id,
      shooterId: selectedShooterId,
      activeSeries,
    })
  }, [view, selectedCup, selectedMatch, selectedSquad, selectedShooterId, activeSeries])

  // --- Auto-login and restore full state on mount ---
  useEffect(() => {
    const tryRestore = async () => {
      const raw = localStorage.getItem(LS_KEYS.CREDS)
      if (!raw) return
      const creds = await decryptData(raw)
      if (!creds) { lsRemove(LS_KEYS.CREDS); setView('login'); return }

      try {
        await api.login(creds.email, creds.password, creds.apiKey)
      } catch {
        lsRemove(LS_KEYS.CREDS)
        setView('login')
        return
      }

      const nav = lsGet(LS_KEYS.NAV)
      const savedCup = lsGet(LS_KEYS.CUP)

      // Restore cup + matches
      let cupData = null
      if (savedCup) {
        try {
          cupData = await api.getCup(savedCup.id)
          setSelectedCup(cupData)
          setMatches((cupData.matches || []).map(api.transformMatchListItem))
        } catch { /* cup load failed */ }
      }

      if (!nav || !cupData) {
        setView(cupData ? 'match' : 'cup')
        return
      }

      // Restore deeper state: match → squad → series/scoring
      if (nav.matchId && ['squad', 'series', 'scoring'].includes(nav.view)) {
        try {
          const fullMatch = await api.getMatch(nav.matchId)
          const transformed = api.transformMatch(fullMatch)
          setSelectedMatch(transformed)

          if (nav.squadId && ['series', 'scoring'].includes(nav.view)) {
            const squad = transformed.squads.find(s => s.id === nav.squadId)
            if (squad) {
              setSelectedSquad(squad)
              setActiveSeries(nav.activeSeries || 0)
              // Restore scores
              const scoreKey = `${nav.matchId}_${nav.squadId}`
              const savedScores = lsGet(LS_KEYS.SCORES)
              const restored = savedScores?.[scoreKey]
              const scores = {}
              for (const s of squad.shooters) {
                scores[s.id] = restored?.[s.id] || api.buildScoresFromSSI(s, SERIES_COUNT)
              }
              setAllScores(scores)

              if (nav.shooterId && nav.view === 'scoring') {
                setSelectedShooterId(nav.shooterId)
                setView('scoring')
              } else {
                setView('series')
              }
              return
            }
          }
          setView('squad')
          return
        } catch { /* match load failed, fall back */ }
      }

      setView(nav.view === 'cup' ? 'cup' : 'match')
    }
    tryRestore()
  }, [])

  // --- Login ---

  const handleLogin = async (email, password, apiKey, rememberMe) => {
    // This throws on failure — LoginScreen catches and shows the error
    await api.login(email, password, apiKey)
    // Save encrypted credentials if "Remember me" is checked
    if (rememberMe) {
      const encrypted = await encryptData({ email, password, apiKey })
      localStorage.setItem(LS_KEYS.CREDS, encrypted)
    } else {
      lsRemove(LS_KEYS.CREDS)
    }
    // Login succeeded — go to cup search
    setView('cup')
  }

  const handleLogout = () => {
    lsRemove(LS_KEYS.CREDS)
    lsRemove(LS_KEYS.CUP)
    lsRemove(LS_KEYS.SCORES)
    lsRemove(LS_KEYS.NAV)
    setView('login')
    setSelectedCup(null)
    setMatches([])
    setSelectedMatch(null)
    setSelectedSquad(null)
    setAllScores({})
    setError(null)
  }

  // --- Cup selection ---

  const handleSelectCup = async (cup) => {
    setLoading(true)
    setError(null)
    try {
      const cupData = await api.getCup(cup.id)
      setSelectedCup(cupData)
      lsSet(LS_KEYS.CUP, { id: cupData.id, name: cupData.name })
      setMatches((cupData.matches || []).map(api.transformMatchListItem))
      setView('match')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- Navigation handlers ---

  const handleSelectMatch = async (match) => {
    setLoading(true)
    setError(null)
    try {
      const fullMatch = await api.getMatch(match.id)
      const transformed = api.transformMatch(fullMatch)
      setSelectedMatch(transformed)
      setView('squad')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectSquad = (squad) => {
    setSelectedSquad(squad)
    setActiveSeries(0)
    // Try to restore scores from localStorage, otherwise init from SSI data
    const scoreKey = `${selectedMatch?.id}_${squad.id}`
    const savedScores = lsGet(LS_KEYS.SCORES)
    const restored = savedScores?.[scoreKey]
    setAllScores(prev => {
      const next = { ...prev }
      for (const s of squad.shooters) {
        if (restored?.[s.id]) {
          next[s.id] = restored[s.id]
        } else if (!next[s.id]) {
          next[s.id] = api.buildScoresFromSSI(s, SERIES_COUNT)
        }
      }
      return next
    })
    setView('series')
  }

  // --- Persist scores to localStorage on change ---
  useEffect(() => {
    if (!selectedMatch || !selectedSquad || Object.keys(allScores).length === 0) return
    const scoreKey = `${selectedMatch.id}_${selectedSquad.id}`
    const saved = lsGet(LS_KEYS.SCORES) || {}
    saved[scoreKey] = allScores
    lsSet(LS_KEYS.SCORES, saved)
  }, [allScores, selectedMatch, selectedSquad])

  const handleSelectShooter = (shooter) => {
    setSelectedShooterId(shooter.id)
    setView('scoring')
  }

  // --- Score update ---

  const updateScore = useCallback((seriesIdx, zone, delta) => {
    setAllScores(prev => {
      const next = { ...prev }
      next[selectedShooterId] = { ...next[selectedShooterId] }

      if (doubleSeries) {
        // In double mode, scores fill first series then overflow to second
        const s1Idx = seriesIdx // activeSeries (the even one)
        const s2Idx = seriesIdx + 1
        next[selectedShooterId][s1Idx] = { ...next[selectedShooterId][s1Idx] }
        next[selectedShooterId][s2Idx] = { ...next[selectedShooterId][s2Idx] }

        const s1Val = next[selectedShooterId][s1Idx][zone]
        const s2Val = next[selectedShooterId][s2Idx][zone]
        const combined = s1Val + s2Val

        if (delta > 0) {
          // Increment: fill s1 first, then s2
          if (s1Val < MAX_HITS_PER_SERIES) {
            next[selectedShooterId][s1Idx][zone] = s1Val + 1
          } else {
            next[selectedShooterId][s2Idx][zone] = s2Val + 1
          }
        } else {
          // Decrement: remove from s2 first, then s1
          if (s2Val > 0) {
            next[selectedShooterId][s2Idx][zone] = s2Val - 1
          } else if (s1Val > 0) {
            next[selectedShooterId][s1Idx][zone] = s1Val - 1
          }
        }
      } else {
        next[selectedShooterId][seriesIdx] = { ...next[selectedShooterId][seriesIdx] }
        const newVal = Math.max(0, next[selectedShooterId][seriesIdx][zone] + delta)
        next[selectedShooterId][seriesIdx][zone] = newVal
      }

      return next
    })
  }, [selectedShooterId, doubleSeries])

  // In double mode, the "active pair" is activeSeries and activeSeries+1
  const pairedSeries = doubleSeries ? activeSeries + 1 : null
  const effectiveMaxHits = doubleSeries ? MAX_HITS_PER_SERIES * 2 : MAX_HITS_PER_SERIES

  // Check if a shooter is scored for the active group (single or double)
  const isGroupScored = (shooterId) => {
    if (!allScores[shooterId]) return false
    const s1 = isSeriesScored(allScores[shooterId][activeSeries])
    if (!doubleSeries) return s1
    return s1 && isSeriesScored(allScores[shooterId][pairedSeries])
  }

  // Combined hits for active group
  const groupHits = (shooterId) => {
    if (!allScores[shooterId]) return 0
    let h = hitsInSeries(allScores[shooterId][activeSeries])
    if (doubleSeries && allScores[shooterId][pairedSeries]) {
      h += hitsInSeries(allScores[shooterId][pairedSeries])
    }
    return h
  }

  // Combined points for active group
  const groupPoints = (shooterId) => {
    if (!allScores[shooterId]) return 0
    let p = pointsInSeries(allScores[shooterId][activeSeries])
    if (doubleSeries && allScores[shooterId][pairedSeries]) {
      p += pointsInSeries(allScores[shooterId][pairedSeries])
    }
    return p
  }

  const handleSaveAndNext = async () => {
    // Submit scores for current shooter to SSI
    setSaving(true)
    setError(null)
    try {
      const shooterScores = allScores[selectedShooterId]
      const result = await api.submitScore(selectedShooterId, shooterScores)
      console.log('Score saved:', result)
    } catch (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    setSaving(false)

    // Move to next unscored shooter
    const shooters = selectedSquad.shooters
    const currentIdx = shooters.findIndex(s => s.id === selectedShooterId)
    let nextShooter = null
    for (let offset = 1; offset < shooters.length; offset++) {
      const idx = (currentIdx + offset) % shooters.length
      const s = shooters[idx]
      if (!isGroupScored(s.id)) {
        nextShooter = s
        break
      }
    }
    if (nextShooter) {
      setSelectedShooterId(nextShooter.id)
    } else {
      setView('series')
    }
  }

  // ============================================================
  // VIEW: Restoring session (auto-login in progress)
  // ============================================================
  if (view === 'restoring') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Restoring session...</p>
        </div>
      </div>
    )
  }

  // ============================================================
  // VIEW: Login
  // ============================================================
  if (view === 'login') {
    return <LoginScreen onLogin={handleLogin} />
  }

  // ============================================================
  // VIEW: Cup search
  // ============================================================
  if (view === 'cup') {
    return <CupSearch onSelectCup={handleSelectCup} loading={loading} onLogout={handleLogout} />
  }

  // ============================================================
  // Loading overlay
  // ============================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // ============================================================
  // VIEW: Match picker (shows matches in selected cup)
  // ============================================================
  if (view === 'match') {
    return (
      <MatchPicker
        matches={matches}
        onSelect={handleSelectMatch}
        cupName={selectedCup?.name}
        onBack={() => setView('cup')}
      />
    )
  }

  // ============================================================
  // VIEW: Squad picker
  // ============================================================
  if (view === 'squad') {
    return (
      <SquadPicker
        match={selectedMatch}
        onSelect={handleSelectSquad}
        onBack={() => setView('match')}
      />
    )
  }

  // ============================================================
  // VIEW: Series overview + shooter list
  // ============================================================
  if (view === 'series') {
    const shooters = selectedSquad.shooters

    const scoredCountForGroup = () =>
      shooters.filter(s => isGroupScored(s.id)).length

    const activeGroupScored = scoredCountForGroup()
    const activeSeriesComplete = activeGroupScored === shooters.length

    const shootersWithStatus = shooters.map(s => ({
      ...s,
      scored: isGroupScored(s.id),
      seriesPoints: groupPoints(s.id),
    }))

    // In double mode, valid start indices are 0, 2, 4
    const seriesSteps = doubleSeries
      ? [0, 2, 4]
      : [0, 1, 2, 3, 4, 5]

    const handleSeriesTab = (i) => {
      // Allow switching to current series always
      if (i === activeSeries) return
      // Block switching away if current series is incomplete
      if (!activeSeriesComplete) return
      setActiveSeries(i)
    }

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white">
          <button
            onClick={() => setView('squad')}
            className="flex items-center gap-1 px-4 pt-2 text-blue-200 text-sm active:text-white"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Squads
          </button>
          <div className="px-4 py-3">
            <h1 className="text-lg font-bold">{selectedMatch.name}</h1>
            <p className="text-blue-200 text-sm">{selectedSquad.name} · {shooters.length} shooters</p>
          </div>
        </div>

        {/* Series tabs + double toggle */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center">
            <div className="flex flex-1">
              {seriesSteps.map(i => {
                const isActive = i === activeSeries
                const label = doubleSeries ? `S${i + 1}+${i + 2}` : `S${i + 1}`
                // Count scored for this group
                const groupScoredCount = shooters.filter(s => {
                  if (!allScores[s.id]) return false
                  const s1 = isSeriesScored(allScores[s.id][i])
                  if (!doubleSeries) return s1
                  return s1 && isSeriesScored(allScores[s.id][i + 1])
                }).length
                const allDone = groupScoredCount === shooters.length
                const locked = !activeSeriesComplete && !isActive
                return (
                  <button
                    key={i}
                    onClick={() => handleSeriesTab(i)}
                    disabled={locked}
                    className={`flex-1 py-3 text-center font-semibold text-sm transition-colors
                      ${locked
                        ? 'text-gray-300 cursor-not-allowed'
                        : isActive
                          ? 'text-blue-600 border-b-3 border-blue-600 bg-blue-50'
                          : allDone
                            ? 'text-green-600 bg-green-50'
                            : groupScoredCount > 0
                              ? 'text-amber-600 bg-amber-50'
                              : 'text-gray-500'
                      }`}
                  >
                    {label}
                    <span className={`block text-xs font-normal ${
                      locked ? 'text-gray-300'
                      : allDone ? 'text-green-500' : groupScoredCount > 0 ? 'text-amber-500' : 'text-gray-400'
                    }`}>
                      {groupScoredCount}/{shooters.length}
                    </span>
                  </button>
                )
              })}
            </div>
            {/* Double series toggle */}
            <label className="flex flex-col items-center px-2 py-1 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={doubleSeries}
                onChange={(e) => {
                  setDoubleSeries(e.target.checked)
                  // Snap to valid pair start
                  if (e.target.checked && activeSeries % 2 !== 0) {
                    setActiveSeries(activeSeries - 1)
                  }
                }}
                className="w-5 h-5 rounded accent-blue-600"
              />
              <span className="text-[10px] text-gray-500 mt-0.5">2x</span>
            </label>
          </div>
        </div>

        {/* Incomplete warning */}
        {!activeSeriesComplete && activeGroupScored > 0 && (
          <div className="mx-3 mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <p className="text-amber-700 font-medium text-sm">
              Score all shooters before moving to next {doubleSeries ? 'pair' : 'series'}
            </p>
            <p className="text-amber-500 text-xs mt-0.5">
              {shooters.length - activeGroupScored} remaining
            </p>
          </div>
        )}

        {/* Shooter list */}
        <div className="p-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
            Series {activeSeries + 1} — Pick shooter
          </h2>
          <ShooterPicker
            shooters={shootersWithStatus}
            onSelect={handleSelectShooter}
            currentShooterId={selectedShooterId}
          />
        </div>
      </div>
    )
  }

  // ============================================================
  // VIEW: Scoring one shooter, one series
  // ============================================================
  const shooter = selectedSquad.shooters.find(s => s.id === selectedShooterId)
  // In double mode, combine scores from both series for display
  const seriesScores = allScores[selectedShooterId][activeSeries]
  const combinedScores = doubleSeries
    ? Object.fromEntries(SCORE_ZONES.map(z => [
        z,
        seriesScores[z] + (allScores[selectedShooterId][pairedSeries]?.[z] || 0)
      ]))
    : seriesScores
  const hits = SCORE_ZONES.reduce((sum, z) => sum + combinedScores[z], 0)
  const pts = SCORE_ZONES.reduce((sum, z) => sum + combinedScores[z] * ZONE_POINTS[z], 0)
  const isOver = hits > effectiveMaxHits

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white">
        <button
          onClick={() => setView('series')}
          className="flex items-center gap-1 px-4 pt-2 text-blue-200 text-sm active:text-white"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Squad
        </button>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{shooter.number}. {shooter.name}</h1>
            <p className="text-blue-200 text-sm">{shooter.division}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-300">
              {doubleSeries ? `Series ${activeSeries + 1}+${activeSeries + 2}` : `Series ${activeSeries + 1}`}
            </div>
            <div className="text-3xl font-bold">{pts}</div>
            <div className="text-blue-200 text-xs">{hits}/{effectiveMaxHits} hits</div>
          </div>
        </div>
      </div>

      <ScoringForm
        seriesIndex={activeSeries}
        scores={combinedScores}
        scoreZones={SCORE_ZONES}
        maxHits={effectiveMaxHits}
        totalHits={hits}
        totalPoints={pts}
        onUpdate={updateScore}
        onNext={null}
        isLast={true}
      />

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-2 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 text-xs underline mt-1">Dismiss</button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            onClick={() => setView('series')}
            disabled={saving}
            className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold text-base active:bg-gray-300 disabled:opacity-50"
          >
            ← Back
          </button>
          <button
            onClick={handleSaveAndNext}
            disabled={isOver || saving}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
          >
            {saving ? 'Saving...' : isOver ? `Too many shots (${hits}/${effectiveMaxHits})` : 'Save → Next Shooter'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
