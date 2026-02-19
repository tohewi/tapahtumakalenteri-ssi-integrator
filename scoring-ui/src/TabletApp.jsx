import { useState, useCallback, useEffect } from 'react'
import { useRememberMe } from './hooks/useRememberMe'
import MatchPicker from './components/MatchPicker'
import SquadPicker from './components/SquadPicker'
import LoginScreen from './components/LoginScreen'
import CupSearch from './components/CupSearch'
import TabletScoringView from './components/TabletScoringView'
import * as api from './api'
import t from './i18n'
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

// ============================================================
// TabletApp — views: login → cup → match → squad → tablet scoring
// ============================================================

const LS_KEYS = {
  CUP: 'ssi_last_cup',
  SCORES: 'ssi_tablet_scores',
  NAV: 'ssi_tablet_nav_state',
  SHOOTER_ORDER: 'ssi_tablet_shooter_order', // { cupId: [name1, name2, ...] }
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
  const [userEmail, setUserEmail] = useState(null)
  const [userName, setUserName] = useState(null)

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
    setUserEmail(email) // Store the logged-in user's email
    
    // Set fallback username immediately (email prefix) so login doesn't block
    const emailPrefix = email.split('@')[0]
    setUserName(emailPrefix)
    
    // Fetch user info from SSI in background (non-blocking)
    api.getUserInfo()
      .then(userInfo => {
        log.debug('[TabletApp] User info received:', userInfo)
        const fullName = `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim()
        log.debug('[TabletApp] Full name constructed:', fullName)
        if (fullName) {
          log.debug('[TabletApp] Setting userName to:', fullName)
          setUserName(fullName) // Update with real name when available
        } else {
          log.warn('[TabletApp] User info has no name, keeping email prefix')
        }
      })
      .catch(err => {
        log.warn('[TabletApp] Could not fetch user info:', err)
        // Keep the email prefix fallback we already set
      })
    
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
            const orderedSquad = applyShooterOrder(squad, cupData.id)
            setSelectedSquad(orderedSquad)
            const scoreKey = `${nav.matchId}_${nav.squadId}`
            const savedScores = lsGet(LS_KEYS.SCORES)
            const restored = savedScores?.[scoreKey]
            const scores = {}
            for (const s of orderedSquad.shooters) {
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
    setUserEmail(null) // Clear user email on logout
    setUserName('') // Clear user name
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

  // Apply saved shooter order from cup-level localStorage
  // cupId param allows use during nav restoration before selectedCup state is committed
  const applyShooterOrder = (squad, cupId = selectedCup?.id) => {
    if (!cupId) return squad
    const allOrders = lsGet(LS_KEYS.SHOOTER_ORDER) || {}
    const savedOrder = allOrders[cupId]
    if (!savedOrder || savedOrder.length === 0) return squad

    // Sort shooters by their position in the saved order.
    // Shooters not in the saved order go to the end (preserving original relative order).
    const orderMap = new Map(savedOrder.map((name, idx) => [name, idx]))
    const sorted = [...squad.shooters].sort((a, b) => {
      const posA = orderMap.has(a.name) ? orderMap.get(a.name) : 9999
      const posB = orderMap.has(b.name) ? orderMap.get(b.name) : 9999
      return posA - posB
    })
    return { ...squad, shooters: sorted }
  }

  const handleSquadSelected = async (squad) => {
    setError(null)
    setLoading(true)
    try {
      const orderedSquad = applyShooterOrder(squad)
      setSelectedSquad(orderedSquad)
      // Load saved scores or build from SSI
      const scoreKey = `${selectedMatch.id}_${squad.id}`
      const savedScores = lsGet(LS_KEYS.SCORES)
      const restored = savedScores?.[scoreKey]
      const scores = {}
      for (const s of orderedSquad.shooters) {
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
    // Persist shooter order at cup level so it survives squad/match changes
    if (selectedCup) {
      const allOrders = lsGet(LS_KEYS.SHOOTER_ORDER) || {}
      allOrders[selectedCup.id] = reorderedShooters.map(s => s.name)
      lsSet(LS_KEYS.SHOOTER_ORDER, allOrders)
    }
  }

  // Navigation handlers for breadcrumbs
  const handleBackToCup = () => {
    setView('cup')
  }

  const handleBackToMatch = () => {
    setView('match')
  }

  const handleBackToSquad = () => {
    setView('squad')
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
        onSelectCup={handleCupSelected}
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
        onSelect={handleMatchSelected}
        cupName={selectedCup?.name}
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
        onSelect={handleSquadSelected}
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
        cup={selectedCup}
        match={selectedMatch}
        squad={selectedSquad}
        allScores={allScores}
        userEmail={userEmail}
        userName={userName} // Pass user name
        onScoresUpdate={handleScoresUpdate}
        onShootersReorder={handleShootersReorder}
        onBack={handleBackToSquad}
        onBackToCup={handleBackToCup}
        onBackToMatch={handleBackToMatch}
        onLogout={handleLogout}
        withSessionCheck={withSessionCheck}
      />
    )
  }

  return null
}

export default TabletApp
