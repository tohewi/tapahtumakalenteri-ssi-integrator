import { useState, useCallback, useEffect } from 'react'
import { useRememberMe } from './hooks/useRememberMe'
import MatchPicker from './components/MatchPicker'
import SquadPicker from './components/SquadPicker'
import LoginScreen from './components/LoginScreen'
import CupSearch from './components/CupSearch'
import TabletScoringView from './components/TabletScoringView'
import * as api from './api'
import t from './i18n'

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

// ============================================================
// TabletApp — views: login → cup → match → squad → tablet scoring
// ============================================================

const LS_KEYS = {
  CUP: 'ssi_last_cup',
  SCORES: 'ssi_tablet_scores',
  NAV: 'ssi_tablet_nav_state',
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

function TabletApp() {
  const { savedCreds, handleRememberMe } = useRememberMe('ssi_credentials_tablet')
  
  const [view, setView] = useState('login') // 'login' | 'cup' | 'match' | 'squad' | 'scoring'
  const [selectedCup, setSelectedCup] = useState(null)
  const [matches, setMatches] = useState([])
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [selectedSquad, setSelectedSquad] = useState(null)
  const [allScores, setAllScores] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)

  // --- Helper to handle session expiry ---
  const handleSessionExpired = useCallback(() => {
    setSessionExpiredMessage('Session expired. Please login again.')
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
        throw err
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
    })
  }, [view, selectedCup, selectedMatch, selectedSquad])

  // --- Login ---
  const handleLogin = async (email, password, apiKey, rememberMe) => {
    setSessionExpiredMessage(null)
    await api.login(email, password, apiKey, 'scoring')
    await handleRememberMe(email, password, apiKey, rememberMe)
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

    // Restore deeper state: match → squad → scoring
    if (nav.matchId && ['squad', 'scoring'].includes(nav.view)) {
      try {
        const fullMatch = await api.getMatch(nav.matchId)
        const transformed = api.transformMatch(fullMatch)
        setSelectedMatch(transformed)

        if (nav.squadId && nav.view === 'scoring') {
          const squad = transformed.squads.find(s => s.id === nav.squadId)
          if (squad) {
            setSelectedSquad(squad)
            const scoreKey = `${nav.matchId}_${nav.squadId}`
            const savedScores = lsGet(LS_KEYS.SCORES)
            const restored = savedScores?.[scoreKey]
            const scores = {}
            for (const s of squad.shooters) {
              scores[s.id] = restored?.[s.id] || api.buildScoresFromSSI(s, SERIES_COUNT)
            }
            setAllScores(scores)
            setView('scoring')
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
    await api.logout()
    lsRemove(LS_KEYS.NAV)
    lsRemove(LS_KEYS.SCORES)
    setView('login')
    setSelectedCup(null)
    setMatches([])
    setSelectedMatch(null)
    setSelectedSquad(null)
    setAllScores({})
  }

  const handleCupSelected = async (cup) => {
    setError(null)
    setLoading(true)
    try {
      const cupData = await withSessionCheck(() => api.getCup(cup.id))
      setSelectedCup(cupData)
      lsSet(LS_KEYS.CUP, cupData)
      setMatches((cupData.matches || []).map(api.transformMatchListItem))
      setView('match')
    } catch (err) {
      if (!(err instanceof api.SessionExpiredError) && !(err instanceof api.ScopeMismatchError)) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleMatchSelected = async (match) => {
    setError(null)
    setLoading(true)
    try {
      const fullMatch = await withSessionCheck(() => api.getMatch(match.id))
      const transformed = api.transformMatch(fullMatch)
      setSelectedMatch(transformed)
      setView('squad')
    } catch (err) {
      if (!(err instanceof api.SessionExpiredError) && !(err instanceof api.ScopeMismatchError)) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSquadSelected = async (squad) => {
    setError(null)
    setLoading(true)
    try {
      setSelectedSquad(squad)
      // Load saved scores or build from SSI
      const scoreKey = `${selectedMatch.id}_${squad.id}`
      const savedScores = lsGet(LS_KEYS.SCORES)
      const restored = savedScores?.[scoreKey]
      const scores = {}
      for (const s of squad.shooters) {
        scores[s.id] = restored?.[s.id] || api.buildScoresFromSSI(s, SERIES_COUNT)
      }
      setAllScores(scores)
      setView('scoring')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleScoresUpdate = (shooterId, newScores) => {
    setAllScores(prev => ({
      ...prev,
      [shooterId]: newScores,
    }))
    // Save to localStorage
    const scoreKey = `${selectedMatch.id}_${selectedSquad.id}`
    const allSaved = lsGet(LS_KEYS.SCORES) || {}
    allSaved[scoreKey] = {
      ...allSaved[scoreKey],
      [shooterId]: newScores,
    }
    lsSet(LS_KEYS.SCORES, allSaved)
  }

  const handleShootersReorder = (reorderedShooters) => {
    setSelectedSquad(prev => ({
      ...prev,
      shooters: reorderedShooters,
    }))
  }

  // Render appropriate view
  if (view === 'login') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        savedCreds={savedCreds}
        sessionExpiredMessage={sessionExpiredMessage}
      />
    )
  }

  if (view === 'cup') {
    return (
      <CupSearch
        onCupSelected={handleCupSelected}
        onLogout={handleLogout}
        loading={loading}
        error={error}
      />
    )
  }

  if (view === 'match') {
    return (
      <MatchPicker
        cup={selectedCup}
        matches={matches}
        onMatchSelected={handleMatchSelected}
        onBack={() => setView('cup')}
        onLogout={handleLogout}
        loading={loading}
        error={error}
      />
    )
  }

  if (view === 'squad') {
    return (
      <SquadPicker
        match={selectedMatch}
        onSquadSelected={handleSquadSelected}
        onBack={() => setView('match')}
        onLogout={handleLogout}
        loading={loading}
        error={error}
      />
    )
  }

  if (view === 'scoring') {
    return (
      <TabletScoringView
        match={selectedMatch}
        squad={selectedSquad}
        allScores={allScores}
        onScoresUpdate={handleScoresUpdate}
        onShootersReorder={handleShootersReorder}
        onBack={() => setView('squad')}
        onLogout={handleLogout}
        withSessionCheck={withSessionCheck}
      />
    )
  }

  return null
}

export default TabletApp
