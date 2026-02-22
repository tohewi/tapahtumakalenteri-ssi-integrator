import { useState, useCallback, useEffect } from 'react'
import { useRememberMe } from './hooks/useRememberMe'
import MatchPicker from './components/MatchPicker'
import SquadPicker from './components/SquadPicker'
import ScoringForm from './components/ScoringForm'
import ShooterPicker from './components/ShooterPicker'
import LoginScreen from './components/LoginScreen'
import CupSearch from './components/CupSearch'
import * as api from './api'
import fi from './i18n'
import { log } from './log.js'

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

function getScoreCardShots(scoreCard) {
  if (!scoreCard) return 0
  let total = 0
  for (let i = 0; i < SERIES_COUNT; i++) {
    total += hitsInSeries(scoreCard[i] || createEmptySeriesScore())
  }
  return total
}

function isSeriesScored(seriesScores) {
  return hitsInSeries(seriesScores) > 0
}

export function selectInitialScoreCard(restoredScoreCard, ssiScoreCard, inferMissingMisses) {
  if (!restoredScoreCard || inferMissingMisses) return ssiScoreCard

  const restoredShots = getScoreCardShots(restoredScoreCard)
  const ssiShots = getScoreCardShots(ssiScoreCard)

  // Keep local in-progress work, but avoid stale-empty cache masking fresh SSI scores.
  if (restoredShots > 0 || ssiShots === 0) {
    return restoredScoreCard
  }

  return ssiScoreCard
}

export function getDoubleSeriesPairShotSummary(scoreCard, seriesIdx, maxHitsPerSeries = MAX_HITS_PER_SERIES) {
  const pairStart = Math.max(0, Math.min(seriesIdx - (seriesIdx % 2), SERIES_COUNT - 2))
  const pairEnd = pairStart + 1

  const firstShots = hitsInSeries(scoreCard?.[pairStart] || createEmptySeriesScore())
  const secondShots = hitsInSeries(scoreCard?.[pairEnd] || createEmptySeriesScore())
  const requiredShots = maxHitsPerSeries * 2
  const totalShots = firstShots + secondShots

  return {
    firstSeriesIndex: pairStart,
    secondSeriesIndex: pairEnd,
    firstShots,
    secondShots,
    totalShots,
    requiredShots,
    isStarted: totalShots > 0,
    isComplete: firstShots === maxHitsPerSeries && secondShots === maxHitsPerSeries,
  }
}

export function applyScoreDeltaForShooter(shooterScores, {
  seriesIdx,
  zone,
  delta,
  doubleSeries,
  maxHitsPerSeries = MAX_HITS_PER_SERIES,
}) {
  const next = { ...shooterScores }

  if (!doubleSeries) {
    if (!next[seriesIdx]) next[seriesIdx] = createEmptySeriesScore()
    next[seriesIdx] = { ...next[seriesIdx] }
    next[seriesIdx][zone] = Math.max(0, (next[seriesIdx][zone] || 0) + delta)
    return next
  }

  const s1Idx = seriesIdx
  const s2Idx = seriesIdx + 1

  if (!next[s1Idx]) next[s1Idx] = createEmptySeriesScore()
  if (!next[s2Idx]) next[s2Idx] = createEmptySeriesScore()

  next[s1Idx] = { ...next[s1Idx] }
  next[s2Idx] = { ...next[s2Idx] }

  const s1Shots = hitsInSeries(next[s1Idx])
  const s2Shots = hitsInSeries(next[s2Idx])

  if (delta > 0) {
    if (s1Shots < maxHitsPerSeries) {
      next[s1Idx][zone] = (next[s1Idx][zone] || 0) + 1
    } else if (s2Shots < maxHitsPerSeries) {
      next[s2Idx][zone] = (next[s2Idx][zone] || 0) + 1
    }
    return next
  }

  if (delta < 0) {
    if ((next[s2Idx][zone] || 0) > 0) {
      next[s2Idx][zone] -= 1
    } else if ((next[s1Idx][zone] || 0) > 0) {
      next[s1Idx][zone] -= 1
    }
  }

  return next
}

// ============================================================
// App — views: login → cup → match → squad → series/shooters → scoring
// ============================================================

// --- localStorage helpers ---
const LS_KEYS = {
  CUP: 'ssi_last_cup',
  SCORES: 'ssi_scores',
  NAV: 'ssi_nav_state',
  DOUBLE_SERIES_BY_MATCH: 'ssi_double_series_by_match',
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

function getMatchDoubleSeriesEnabled(matchId) {
  if (!matchId) return false
  const byMatch = lsGet(LS_KEYS.DOUBLE_SERIES_BY_MATCH) || {}
  return Boolean(byMatch[matchId])
}

function setMatchDoubleSeriesEnabled(matchId, enabled) {
  if (!matchId) return
  const byMatch = lsGet(LS_KEYS.DOUBLE_SERIES_BY_MATCH) || {}
  byMatch[matchId] = Boolean(enabled)
  lsSet(LS_KEYS.DOUBLE_SERIES_BY_MATCH, byMatch)
}

function App() {
  const { savedCreds, handleRememberMe } = useRememberMe('ssi_credentials_scoring')
  
  const [view, setView] = useState('login') // 'login' | 'cup' | 'match' | 'squad' | 'series' | 'scoring'
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
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)

  // --- Helper to handle session expiry ---
  const handleSessionExpired = useCallback(() => {
    setSessionExpiredMessage('Session expired. Please login again.')
    // Navigation state is already saved in localStorage via useEffect
    // It will be restored after successful re-login via restoreNavState()
    setView('login')
  }, [])

  // --- Helper to handle scope mismatch ---
  const handleScopeMismatch = useCallback(() => {
    setSessionExpiredMessage('Please login to access this feature.')
    setView('login')
  }, [])

  // --- Wrapper to catch SessionExpiredError and ScopeMismatchError ---
  const withSessionCheck = useCallback(async (fn) => {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof api.SessionExpiredError) {
        handleSessionExpired()
        throw err // Re-throw so caller knows it failed
      }
      if (err instanceof api.ScopeMismatchError) {
        handleScopeMismatch()
        throw err
      }
      throw err
    }
  }, [handleSessionExpired, handleScopeMismatch])

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

  // --- Login ---

  const handleLogin = async (email, password, apiKey, rememberMe) => {
    // Clear session expired message
    setSessionExpiredMessage(null)
    // This throws on failure — LoginScreen catches and shows the error
    await api.login(email, password, apiKey, 'scoring')
    // Save encrypted credentials if "Remember me" is checked
    await handleRememberMe(email, password, apiKey, rememberMe)
    // Login succeeded — restore previous navigation state if available
    await restoreNavState()
  }

  const restoreNavState = async () => {
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
        setDoubleSeries(getMatchDoubleSeriesEnabled(transformed.id))

        if (nav.squadId && ['series', 'scoring'].includes(nav.view)) {
          const squad = transformed.squads.find(s => s.id === nav.squadId)
          if (squad) {
            setSelectedSquad(squad)
            setActiveSeries(nav.activeSeries || 0)
            const scoreKey = `${nav.matchId}_${nav.squadId}`
            const savedScores = lsGet(LS_KEYS.SCORES)
            const restored = savedScores?.[scoreKey]
            const inferMissingMisses = transformed.status === 'cp'
            const ssiParseOptions = {
              inferMissingMisses,
              maxHitsPerSeries: MAX_HITS_PER_SERIES,
            }
            const scores = {}
            for (const s of squad.shooters) {
              const restoredScores = restored?.[s.id]
              const ssiScores = api.buildScoresFromSSI(s, SERIES_COUNT, ssiParseOptions)
              scores[s.id] = selectInitialScoreCard(restoredScores, ssiScores, inferMissingMisses)
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

  const handleLogout = async () => {
    try { await api.logout() } catch { /* ignore */ }
    // Keep LS_KEYS.CREDS — remember-me credentials persist across logouts
    lsRemove(LS_KEYS.CUP)
    lsRemove(LS_KEYS.SCORES)
    lsRemove(LS_KEYS.NAV)
    setView('login')
    setSelectedCup(null)
    setMatches([])
    setSelectedMatch(null)
    setSelectedSquad(null)
    setDoubleSeries(false)
    setAllScores({})
    setError(null)
  }

  // --- Cup selection ---

  const handleSelectCup = async (cup) => {
    setLoading(true)
    setError(null)
    try {
      await withSessionCheck(async () => {
        const cupData = await api.getCup(cup.id)
        setSelectedCup(cupData)
        lsSet(LS_KEYS.CUP, { id: cupData.id, name: cupData.name })
        setMatches((cupData.matches || []).map(api.transformMatchListItem))
        setView('match')
      })
    } catch (err) {
      if (!(err instanceof api.SessionExpiredError) && !(err instanceof api.ScopeMismatchError)) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  // --- Navigation handlers ---

  const handleSelectMatch = async (match) => {
    setLoading(true)
    setError(null)
    try {
      await withSessionCheck(async () => {
        const fullMatch = await api.getMatch(match.id)
        const transformed = api.transformMatch(fullMatch)
        setSelectedMatch(transformed)
        setDoubleSeries(getMatchDoubleSeriesEnabled(transformed.id))
        setView('squad')
      })
    } catch (err) {
      if (!(err instanceof api.SessionExpiredError) && !(err instanceof api.ScopeMismatchError)) {
        setError(err.message)
      }
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
    const inferMissingMisses = selectedMatch?.status === 'cp'
    const ssiParseOptions = {
      inferMissingMisses,
      maxHitsPerSeries: MAX_HITS_PER_SERIES,
    }
    setAllScores(prev => {
      const next = { ...prev }
      for (const s of squad.shooters) {
        const restoredScores = restored?.[s.id]
        const ssiScores = api.buildScoresFromSSI(s, SERIES_COUNT, ssiParseOptions)
        const preferredScores = selectInitialScoreCard(restoredScores, ssiScores, inferMissingMisses)
        if (!next[s.id] || inferMissingMisses || getScoreCardShots(next[s.id]) === 0) {
          next[s.id] = preferredScores
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

  const handleDoubleSeriesToggle = (enabled) => {
    setDoubleSeries(enabled)
    setMatchDoubleSeriesEnabled(selectedMatch?.id, enabled)

    // Snap to valid pair start when enabling 2x mode from an odd series index.
    if (enabled && activeSeries % 2 !== 0) {
      setActiveSeries(activeSeries - 1)
    }
  }

  // --- Score update ---

  const updateScore = useCallback((seriesIdx, zone, delta) => {
    setAllScores(prev => {
      const next = { ...prev }
      next[selectedShooterId] = applyScoreDeltaForShooter(next[selectedShooterId], {
        seriesIdx,
        zone,
        delta,
        doubleSeries,
        maxHitsPerSeries: MAX_HITS_PER_SERIES,
      })

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
    const shooterScores = allScores[selectedShooterId]

    if (doubleSeries) {
      const pairSummary = getDoubleSeriesPairShotSummary(shooterScores, activeSeries, MAX_HITS_PER_SERIES)
      if (pairSummary.isStarted && !pairSummary.isComplete) {
        const pairError = fi.doubleSeriesPairIncompleteError(
          pairSummary.firstSeriesIndex + 1,
          pairSummary.secondSeriesIndex + 1,
          pairSummary.totalShots,
          pairSummary.requiredShots,
          pairSummary.firstShots,
          pairSummary.secondShots
        )
        setError(pairError)
        window.alert(pairError)
        return
      }
    }

    const validation = api.validateSeriesShotCounts(shooterScores, {
      seriesCount: SERIES_COUNT,
      shotsPerSeries: MAX_HITS_PER_SERIES,
    })

    if (!validation.isValid) {
      const validationMessage = api.buildIncompleteSeriesValidationMessage(validation, {
        headerFormatter: fi.incompleteSeriesSaveErrorHeader,
        lineFormatter: fi.incompleteSeriesSaveErrorLine,
      })
      setError(validationMessage)
      window.alert(validationMessage)
      return
    }

    // Submit scores for current shooter to SSI
    setSaving(true)
    setError(null)
    try {
      await withSessionCheck(async () => {
        const result = await api.submitScore(selectedShooterId, shooterScores)
        log.debug('[scoring] Score saved:', result)
      })
    } catch (err) {
      if (!(err instanceof api.SessionExpiredError) && !(err instanceof api.ScopeMismatchError)) {
        setError(err.message)
      }
      setSaving(false)
      return
    }
    setSaving(false)

    // Return to shooter list so user picks who to score next
    setSelectedShooterId(null)
    setView('series')
  }

  // ============================================================
  // VIEW: Login
  // ============================================================
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold">{fi.appTitle}</h1>
              <p className="text-blue-200 text-sm mt-0.5">{fi.loginSubtitle}</p>
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
        <LoginScreen onLogin={handleLogin} initialEmail={savedCreds?.email} initialPassword={savedCreds?.password} initialApiKey={savedCreds?.apiKey} hideHeader />
      </div>
    )
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
          <p className="text-gray-500 text-sm">{fi.loading}</p>
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
    const activeSeriesLabel = doubleSeries
      ? `${activeSeries + 1}+${activeSeries + 2}`
      : `${activeSeries + 1}`

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
            {fi.squads}
          </button>
          <div className="px-4 py-3">
            <h1 className="text-lg font-bold">{selectedMatch.name}</h1>
            <p className="text-blue-200 text-sm">{selectedSquad.name} · {shooters.length} {fi.shooters}</p>
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
                onChange={(e) => handleDoubleSeriesToggle(e.target.checked)}
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
              {fi.scoreAllShootersWarning} {doubleSeries ? fi.pairLowerCase : fi.seriesLowerCase}
            </p>
            <p className="text-amber-500 text-xs mt-0.5">
              {shooters.length - activeGroupScored} {fi.remaining}
            </p>
          </div>
        )}

        {/* Shooter list */}
        <div className="p-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
            {fi.series} {activeSeriesLabel} — {fi.pickShooter}
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
  const totalShots = SCORE_ZONES.reduce((sum, z) => sum + combinedScores[z], 0)
  const pts = SCORE_ZONES.reduce((sum, z) => sum + combinedScores[z] * ZONE_POINTS[z], 0)
  const isOver = totalShots > effectiveMaxHits

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
          {fi.squad}
        </button>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{shooter.number}. {shooter.name}</h1>
            <p className="text-blue-200 text-sm">{shooter.division}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-300">
              {doubleSeries ? `${fi.series} ${activeSeries + 1}+${activeSeries + 2}` : `${fi.series} ${activeSeries + 1}`}
            </div>
            <div className="text-3xl font-bold leading-tight">{pts}<span className="ml-1 text-sm font-semibold align-middle">{fi.pts}</span></div>
            <div className="text-blue-200 text-xs">{totalShots}/{effectiveMaxHits} {fi.hits}</div>
          </div>
        </div>
      </div>

      <ScoringForm
        seriesIndex={activeSeries}
        scores={combinedScores}
        scoreZones={SCORE_ZONES}
        maxHits={effectiveMaxHits}
        totalShots={totalShots}
        onUpdate={updateScore}
      />

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-2 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 text-xs underline mt-1">{fi.dismiss}</button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            onClick={() => setView('series')}
            disabled={saving}
            className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold text-base active:bg-gray-300 disabled:opacity-50"
          >
            ← {fi.back}
          </button>
          <button
            onClick={handleSaveAndNext}
            disabled={isOver || saving}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
          >
            {saving ? fi.saving : isOver ? `${fi.tooManyShotsInButton} (${totalShots}/${effectiveMaxHits})` : fi.saveAndNext}
          </button>
        </div>
      </div>
    </div>
  )
}

function BuildBadge() {
  return (
    <div className="text-center text-[9px] text-gray-400 select-none leading-tight py-px bg-gray-50">
      v{__APP_VERSION__} · {__BUILD_TIME__}
    </div>
  )
}

function AppWithBadge() {
  return (
    <div className="flex flex-col min-h-screen">
      <BuildBadge />
      <div className="flex-1">
        <App />
      </div>
    </div>
  )
}

export default AppWithBadge
