import { useState, useCallback, useEffect } from 'react'
import { useAuthenticatedPage } from './hooks/useAuthenticatedPage'
import MatchPicker from './components/MatchPicker'
import SquadPicker from './components/SquadPicker'
import LoginScreen from './components/LoginScreen'
import CupSearch from './components/CupSearch'
import SeriesView from './components/scoring/SeriesView'
import ScoringView from './components/scoring/ScoringView'
import * as api from './api'
import fi from './i18n'
import { log } from './log.js'
import {
  SCORE_ZONES, SERIES_COUNT, MAX_HITS_PER_SERIES, ZONE_POINTS,
  createEmptySeriesScore, hitsInSeries, pointsInSeries,
  getScoreCardShots, isSeriesScored,
  selectInitialScoreCard as _selectInitialScoreCard,
  getDoubleSeriesPairShotSummary as _getDoubleSeriesPairShotSummary,
  applyScoreDeltaForShooter as _applyScoreDeltaForShooter,
} from './lib/scoring-constants'

// Re-export pure functions (used by tests and TabletScoringView)
export { _selectInitialScoreCard as selectInitialScoreCard }
export { _getDoubleSeriesPairShotSummary as getDoubleSeriesPairShotSummary }
export { _applyScoreDeltaForShooter as applyScoreDeltaForShooter }

// ============================================================
// App — views: login → cup → match → squad → series/shooters → scoring
// ============================================================
// Pure scoring functions moved to lib/scoring-constants.js

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

export function App() {
  const [view, setView] = useState('restoring') // 'restoring' | 'login' | 'cup' | 'match' | 'squad' | 'series' | 'scoring'
  const [selectedCup, setSelectedCup] = useState(null)
  const [matches, setMatches] = useState([])
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [selectedSquad, setSelectedSquad] = useState(null)
  const [activeSeries, setActiveSeries] = useState(0)
  const [selectedShooterId, setSelectedShooterId] = useState(null)
  const [allScores, setAllScores] = useState({})
  const [doubleSeries, setDoubleSeries] = useState(false)
  const [saving, setSaving] = useState(false)

  // Auth hook — provides session management infrastructure
  const {
    loading, setLoading,
    error, setError,
    sessionExpiredMessage, setSessionExpiredMessage,
    savedCreds,
    handleRememberMe,
    withSessionCheck,
  } = useAuthenticatedPage({
    scope: 'scoring',
    credsKey: 'ssi_credentials_scoring',
    onSessionExpired: () => setView('login'),
  })

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

  const restoreNavState = useCallback(async () => {
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
              scores[s.id] = _selectInitialScoreCard(restoredScores, ssiScores, inferMissingMisses)
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
  }, [])

  // On reload, keep users in scoring flow when session cookie is still valid.
  useEffect(() => {
    let isActive = true

    const bootstrapFromActiveSession = async () => {
      try {
        const status = await api.getAuthStatus()
        if (!isActive) return

        const canRestoreScoring = status?.authenticated && (!status.scope || status.scope === 'scoring')
        if (canRestoreScoring) {
          await restoreNavState()
          return
        }

        setView('login')
      } catch {
        // Ignore bootstrap errors and keep explicit login as the fallback.
        if (isActive) setView('login')
      }
    }

    bootstrapFromActiveSession()

    return () => {
      isActive = false
    }
  }, [restoreNavState])

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
      next[selectedShooterId] = _applyScoreDeltaForShooter(next[selectedShooterId], {
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
      const pairSummary = _getDoubleSeriesPairShotSummary(shooterScores, activeSeries, MAX_HITS_PER_SERIES)
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
  // VIEW: Restoring session state
  // ============================================================
  if (view === 'restoring') {
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
    const seriesSteps = doubleSeries ? [0, 2, 4] : [0, 1, 2, 3, 4, 5]
    const activeGroupScored = shooters.filter(s => isGroupScored(s.id)).length
    const activeSeriesComplete = activeGroupScored === shooters.length
    const shootersWithStatus = shooters.map(s => ({
      ...s,
      scored: isGroupScored(s.id),
      seriesPoints: groupPoints(s.id),
    }))

    const handleSeriesTab = (i) => {
      if (i === activeSeries) return
      if (!activeSeriesComplete) return
      setActiveSeries(i)
    }

    return (
      <SeriesView
        selectedMatch={selectedMatch}
        selectedSquad={selectedSquad}
        allScores={allScores}
        activeSeries={activeSeries}
        doubleSeries={doubleSeries}
        seriesSteps={seriesSteps}
        activeSeriesComplete={activeSeriesComplete}
        activeGroupScored={activeGroupScored}
        shootersWithStatus={shootersWithStatus}
        selectedShooterId={selectedShooterId}
        onSelectShooter={handleSelectShooter}
        onSeriesTabChange={handleSeriesTab}
        onDoubleSeriesToggle={handleDoubleSeriesToggle}
        onBack={() => setView('squad')}
      />
    )
  }

  // ============================================================
  // VIEW: Scoring one shooter, one series
  // ============================================================
  const shooter = selectedSquad.shooters.find(s => s.id === selectedShooterId)
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
    <ScoringView
      shooter={shooter}
      activeSeries={activeSeries}
      doubleSeries={doubleSeries}
      combinedScores={combinedScores}
      effectiveMaxHits={effectiveMaxHits}
      totalShots={totalShots}
      pts={pts}
      isOver={isOver}
      error={error}
      saving={saving}
      updateScore={updateScore}
      onSaveAndNext={handleSaveAndNext}
      onBack={() => setView('series')}
      onDismissError={() => setError(null)}
    />
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
