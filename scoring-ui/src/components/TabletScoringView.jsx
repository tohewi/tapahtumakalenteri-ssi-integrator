import { useState, useEffect, useCallback, useRef } from 'react'
import { AppHeader } from './shared'
import * as api from '../api'
import t from '../i18n'
import { log } from '../log.js'

// ============================================================
// Constants
// ============================================================

const SCORE_ZONES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']
const ZONE_POINTS = { X: 10, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1, M: 0 }
const SERIES_COUNT = 6
const MAX_HITS_PER_SERIES = 5

// ============================================================
// Helper functions
// ============================================================

function hitsInSeries(seriesScores) {
  return SCORE_ZONES.reduce((sum, z) => sum + seriesScores[z], 0)
}

function pointsInSeries(seriesScores) {
  return SCORE_ZONES.reduce((sum, z) => sum + seriesScores[z] * ZONE_POINTS[z], 0)
}

function getTotalHits(allSeriesScores) {
  let total = 0
  for (let i = 0; i < SERIES_COUNT; i++) {
    total += hitsInSeries(allSeriesScores[i])
  }
  return total
}

function getTotalMisses(allSeriesScores) {
  let total = 0
  for (let i = 0; i < SERIES_COUNT; i++) {
    total += allSeriesScores[i].M || 0
  }
  return total
}

function getTotalPoints(allSeriesScores) {
  let total = 0
  for (let i = 0; i < SERIES_COUNT; i++) {
    total += pointsInSeries(allSeriesScores[i])
  }
  return total
}

function getXCount(allSeriesScores) {
  let total = 0
  for (let i = 0; i < SERIES_COUNT; i++) {
    total += allSeriesScores[i].X || 0
  }
  return total
}

// String color scheme (rotates between strings)
const STRING_COLORS = [
  'bg-blue-100',    // String 1
  'bg-green-100',   // String 2
  'bg-purple-100',  // String 3
  'bg-amber-100',   // String 4
  'bg-rose-100',    // String 5
  'bg-teal-100',    // String 6
]

// ============================================================
// TabletScoringView Component
// ============================================================

export default function TabletScoringView({
  cup,
  match,
  squad,
  allScores,
  userEmail,
  userName, // Add userName prop
  onScoresUpdate,
  onShootersReorder,
  onBack,
  onBackToCup,
  onBackToMatch,
  onLogout,
  withSessionCheck,
}) {
  const [selectedShooter, setSelectedShooter] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [lastSaveStatus, setLastSaveStatus] = useState(null) // aria-live announcements
  const [lastTapTime, setLastTapTime] = useState(null)
  const [lastTapTarget, setLastTapTarget] = useState(null)
  const DOUBLE_TAP_DELAY = 300 // ms
  
  const scoreTrackRef = useRef(null)

  // Check if match is completed (status: 'cp')
  const isMatchCompleted = match?.status === 'cp'
  const ssiParseOptions = {
    inferMissingMisses: isMatchCompleted,
    maxHitsPerSeries: MAX_HITS_PER_SERIES,
  }
  
  // Calculate total shots for the match
  const totalShotsInMatch = SERIES_COUNT * MAX_HITS_PER_SERIES

  // Save scores to SSI
  const handleSaveScores = useCallback(async () => {
    if (!selectedShooter || saving || isMatchCompleted) return

    setSaving(true)
    setSaveError(null)

    try {
      const shooterScores = allScores[selectedShooter.id]
      if (!shooterScores) {
        log.error('[tablet] No scores found for shooter:', selectedShooter.id)
        return
      }

      // Validate score counts per string before saving
      const validationErrors = []
      for (let i = 0; i < SERIES_COUNT; i++) {
        const hits = hitsInSeries(shooterScores[i])
        if (hits !== MAX_HITS_PER_SERIES && hits !== 0) {
          validationErrors.push(`String ${i + 1}: ${hits}/${MAX_HITS_PER_SERIES} scores`)
        }
      }

      if (validationErrors.length > 0) {
        const errorMsg = `Cannot save: Each string must have exactly ${MAX_HITS_PER_SERIES} scores or be empty.\n${validationErrors.join('\n')}`
        setSaveError(errorMsg)
        return
      }

      // The API expects scores in the same format as mobile UI:
      // { 0: { X: 0, '10': 5, ... }, 1: { ... }, ... }
      // NOT as pre-formatted strings like { s1: "0,5,0,0,..." }
      log.debug('[tablet] Saving scores for shooter:', selectedShooter.id, shooterScores)
      await withSessionCheck(() => api.submitScore(selectedShooter.id, shooterScores))
      log.debug('[tablet] Scores saved successfully')
      setLastSaveStatus(`${selectedShooter.name}: scores saved`)
    } catch (err) {
      log.error('[tablet] Save error:', err)
      if (!(err instanceof api.SessionExpiredError) && !(err instanceof api.ScopeMismatchError)) {
        // Parse SSI validation errors if available
        let errorMessage = 'Failed to save scores to SSI'
        if (err.message) {
          // Check for specific validation messages
          if (err.message.includes('validation') || err.message.includes('errorlist')) {
            errorMessage += ': ' + err.message
          } else {
            errorMessage += '. ' + err.message
          }
        }
        setSaveError(errorMessage)
      }
    } finally {
      setSaving(false)
    }
  }, [selectedShooter, saving, allScores, withSessionCheck, isMatchCompleted])

  // Select first shooter by default
  useEffect(() => {
    if (!selectedShooter && squad.shooters.length > 0) {
      // Keep restored local scores (e.g. after re-login) and avoid clobbering them with SSI.
      const shooterWithLocalScores = squad.shooters.find(shooter => {
        const shooterScores = allScores[shooter.id]
        return shooterScores && getTotalHits(shooterScores) > 0
      })

      if (shooterWithLocalScores) {
        setSelectedShooter(shooterWithLocalScores)
        setSaveError(null)
        log.debug('[tablet] Using restored local scores, keeping local state for shooter:', shooterWithLocalScores.id)
        return
      }

      // No local work in progress found — initialize from SSI.
      log.debug('[tablet] No local scores found: loading initial scores from SSI')
      const freshScores = {}
      
      squad.shooters.forEach(shooter => {
        // Load SSI scores for each shooter
        try {
          const ssiScores = api.buildScoresFromSSI(shooter, SERIES_COUNT, ssiParseOptions)
          freshScores[shooter.id] = ssiScores
        } catch (err) {
          log.error('[tablet] Error loading SSI scores for shooter:', shooter.id, err)
          // Initialize with empty scores if SSI load fails
          const emptyScores = {}
          for (let i = 0; i < SERIES_COUNT; i++) {
            emptyScores[i] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, X: 0, M: 0 }
          }
          freshScores[shooter.id] = emptyScores
        }
      })
      
      // Replace all local scores with SSI data
      Object.keys(freshScores).forEach(shooterId => {
        onScoresUpdate(shooterId, freshScores[shooterId])
      })
      
      const firstShooter = squad.shooters[0]
      setSelectedShooter(firstShooter)
      setSaveError(null)
      
      log.debug('[tablet] Loaded SSI scores for all shooters, starting with:', firstShooter.id)
    }
  }, [squad.shooters, selectedShooter, onScoresUpdate, allScores])

  // Handle shooter selection
  const handleShooterSelect = useCallback(async (shooter) => {
    if (selectedShooter?.id === shooter.id) return
    
    // Auto-save current shooter's scores before switching
    if (selectedShooter) {
      log.debug('[tablet] Auto-saving before switch from', selectedShooter.id, 'to', shooter.id)
      await handleSaveScores()
    }
    
    setSelectedShooter(shooter)
    setSaveError(null)

    // Load SSI scores from squad data (only if no local scores exist)
    const shooterScores = allScores[shooter.id]
    const hasLocalScores = shooterScores && getTotalHits(shooterScores) > 0
    
    if (!hasLocalScores) {
      // Load from SSI since no local data
      try {
        log.debug('[tablet] Loading SSI scores for shooter:', shooter.id)
        const ssiScores = api.buildScoresFromSSI(shooter, SERIES_COUNT, ssiParseOptions)
        
        if (getTotalHits(ssiScores) > 0) {
          log.debug('[tablet] Loaded SSI scores with', getTotalHits(ssiScores), 'hits')
          onScoresUpdate(shooter.id, ssiScores)
        } else {
          log.debug('[tablet] No SSI scores found (zero data is not an error)')
        }
      } catch (err) {
        log.error('[tablet] Error loading SSI scores:', err)
        if (!(err instanceof api.SessionExpiredError) && !(err instanceof api.ScopeMismatchError)) {
          setSaveError('Failed to load scores from SSI: ' + err.message)
        }
      }
    } else {
      log.debug('[tablet] Using local scores for shooter:', shooter.id)
    }
  }, [selectedShooter, allScores, onScoresUpdate, handleSaveScores, ssiParseOptions])

  // Add score to the first series with space
  const handleScoreAdd = (zone) => {
    if (!selectedShooter || isMatchCompleted) return

    const shooterScores = allScores[selectedShooter.id]
    if (!shooterScores) return

    // Find first series with space
    let targetSeries = 0
    for (let i = 0; i < SERIES_COUNT; i++) {
      const hits = hitsInSeries(shooterScores[i])
      if (hits < MAX_HITS_PER_SERIES) {
        targetSeries = i
        break
      }
    }

    // Check if we can add
    const currentHits = hitsInSeries(shooterScores[targetSeries])
    if (currentHits >= MAX_HITS_PER_SERIES) {
      // Show error - all series are full
      setSaveError(`Cannot add score: All strings are full (${MAX_HITS_PER_SERIES} scores each)`)
      setTimeout(() => setSaveError(null), 3000)
      return
    }

    // Add the score
    const newScores = { ...shooterScores }
    newScores[targetSeries] = {
      ...newScores[targetSeries],
      [zone]: newScores[targetSeries][zone] + 1,
    }

    onScoresUpdate(selectedShooter.id, newScores)
    
    // Auto-scroll to bottom of score track
    setTimeout(() => {
      if (scoreTrackRef.current) {
        scoreTrackRef.current.scrollTop = scoreTrackRef.current.scrollHeight
      }
    }, 50)
  }

  // Double-tap handler for score deletion
  const handleScoreTap = (seriesIdx, zone, hitIdx) => {
    if (isMatchCompleted) return
    
    const now = Date.now()
    const targetKey = `${seriesIdx}-${zone}-${hitIdx}`
    
    if (
      lastTapTime &&
      lastTapTarget === targetKey &&
      now - lastTapTime < DOUBLE_TAP_DELAY
    ) {
      // Double-tap detected — delete the score
      handleScoreDelete(seriesIdx, zone, hitIdx)
      setLastTapTime(null)
      setLastTapTarget(null)
    } else {
      // First tap — track for double-tap detection
      setLastTapTime(now)
      setLastTapTarget(targetKey)
    }
  }

  const handleScoreDelete = (seriesIdx, zone, hitIdx) => {
    if (!selectedShooter) return

    const shooterScores = allScores[selectedShooter.id]
    if (!shooterScores) return

    const currentCount = shooterScores[seriesIdx][zone] || 0
    if (currentCount <= 0) return

    const newScores = { ...shooterScores }
    newScores[seriesIdx] = {
      ...newScores[seriesIdx],
      [zone]: currentCount - 1,
    }

    onScoresUpdate(selectedShooter.id, newScores)
    
    log.debug(`[tablet] Deleted score: ${zone} from string ${seriesIdx + 1}`)
  }

  // Accessible reorder: move shooter up/down in list
  const handleMoveShooter = (shooter, direction) => {
    const idx = squad.shooters.findIndex(s => s.id === shooter.id)
    if (idx < 0) return
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= squad.shooters.length) return
    const newShooters = [...squad.shooters]
    newShooters.splice(idx, 1)
    newShooters.splice(targetIdx, 0, shooter)
    onShootersReorder(newShooters)
  }


  // Build score track data
  const scoreTrack = []
  if (selectedShooter && allScores[selectedShooter.id]) {
    const shooterScores = allScores[selectedShooter.id]
    for (let seriesIdx = 0; seriesIdx < SERIES_COUNT; seriesIdx++) {
      const seriesScores = shooterScores[seriesIdx]
      const hits = []
      
      // Convert zone counts to individual hits
      SCORE_ZONES.forEach(zone => {
        const count = seriesScores[zone] || 0
        for (let i = 0; i < count; i++) {
          hits.push(zone)
        }
      })
      
      scoreTrack.push({
        seriesIdx,
        hits,
        color: STRING_COLORS[seriesIdx],
      })
    }
  }

  const currentShooterScores = selectedShooter ? allScores[selectedShooter.id] : null
  const totalShots = currentShooterScores ? getTotalHits(currentShooterScores) : 0
  const totalMisses = currentShooterScores ? getTotalMisses(currentShooterScores) : 0
  const scoredHits = Math.max(0, totalShots - totalMisses)
  const totalPoints = currentShooterScores ? getTotalPoints(currentShooterScores) : 0
  const xCount = currentShooterScores ? getXCount(currentShooterScores) : 0

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Breadcrumb Navigation Header - Compact */}
      <div className="bg-blue-600 text-white px-3 py-2 shadow-md flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Breadcrumb Trail */}
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={onBackToCup}
              aria-label={`${t.back}: ${cup?.name || t.cups}`}
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-blue-600 rounded"
            >
              {cup?.name || t.cups}
            </button>
            <span className="opacity-70">›</span>
            <button
              onClick={onBackToMatch}
              aria-label={`${t.back}: ${match.name}`}
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-blue-600 rounded"
            >
              {match.name}
            </button>
            {isMatchCompleted && (
              <span className="ml-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded">
                {t.completed}
              </span>
            )}
            <span className="opacity-70">›</span>
            <button
              onClick={onBack}
              aria-label={`${t.back}: ${squad.name}`}
              className="hover:underline focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-blue-600 rounded font-semibold"
            >
              {squad.name}
            </button>
          </div>

          {/* User Info & Logout */}
          <div className="flex items-center gap-3 text-xs">
            {userEmail && (
              <div className="opacity-90">
                Kirjautunut: <span className="font-medium">{userName || userEmail.split('@')[0]}</span>
              </div>
            )}
            <button
              onClick={onLogout}
              className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs font-medium transition-colors"
            >
              {t.logout}
            </button>
          </div>
        </div>

        {/* Match Date */}
        <div className="mt-1 text-xs opacity-80">
          {match.date}
        </div>
      </div>

      {/* Top bar with scoring stats - Compact */}
      <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 text-xs">
          <div>
            <span className="text-gray-500">{t.shotsFired}: </span>
            <span className="font-bold text-blue-600">{scoredHits}</span>
            <span className="text-gray-400"> / {totalShotsInMatch}</span>
          </div>
          <div>
            <span className="text-gray-500">{t.total}: </span>
            <span className="font-bold text-green-600">{totalPoints} {t.pts}</span>
          </div>
          <div>
            <span className="text-gray-500">{t.xCount}: </span>
            <span className="font-bold text-purple-600">{xCount}</span>
          </div>
        </div>
      </div>

      {/* Main content area - 3 columns on desktop, stacked on mobile */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left: Shooter list */}
        <div className="w-full lg:w-56 xl:w-64 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 flex-shrink-0 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-gray-200 flex-shrink-0">
            <h3 className="font-semibold text-gray-700 text-xs">{squad.name}</h3>
            <p className="text-xs text-gray-500">{squad.shooters.length} {t.shooters}</p>
          </div>
          <div role="listbox" aria-label={t.selectShooter} className="divide-y divide-gray-100 overflow-y-auto flex-1">
            {squad.shooters.map((shooter, shooterIdx) => {
              const isSelected = selectedShooter?.id === shooter.id
              const shooterScores = allScores[shooter.id]
              const shooterShots = shooterScores ? getTotalHits(shooterScores) : 0
              const shooterMisses = shooterScores ? getTotalMisses(shooterScores) : 0
              const shooterHits = Math.max(0, shooterShots - shooterMisses)
              const shooterPoints = shooterScores ? getTotalPoints(shooterScores) : 0
              
              return (
                <div
                  key={shooter.id}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`${shooter.number}. ${shooter.name}, ${shooterPoints} ${t.pts}, ${shooterHits}/${totalShotsInMatch}`}
                  tabIndex={0}
                  onClick={() => handleShooterSelect(shooter)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleShooterSelect(shooter) } }}
                  className={`p-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-l-4 border-blue-600'
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        aria-label={`Move ${shooter.name} up`}
                        disabled={shooterIdx === 0}
                        onClick={(e) => { e.stopPropagation(); handleMoveShooter(shooter, -1) }}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs p-0.5"
                      >▲</button>
                      <button
                        aria-label={`Move ${shooter.name} down`}
                        disabled={shooterIdx === squad.shooters.length - 1}
                        onClick={(e) => { e.stopPropagation(); handleMoveShooter(shooter, 1) }}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs p-0.5"
                      >▼</button>
                    </div>
                    <div className="flex-1 min-w-0 ml-1">
                      <div className={`text-xs font-medium truncate ${
                        isSelected ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {shooter.number}. {shooter.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{shooter.division}</div>
                    </div>
                    <div className="ml-2 text-right">
                      <div className={`text-sm font-bold ${
                        isSelected ? 'text-blue-600' : 'text-gray-700'
                      }`}>
                        {shooterPoints}
                      </div>
                      <div className="text-xs text-gray-400">
                        {shooterHits}/{totalShotsInMatch}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Center: Score track */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 min-w-0">
          <div className="p-2 bg-white border-b border-gray-200 flex-shrink-0">
            <h3 className="font-semibold text-gray-700 text-xs">{t.scoreTrack}</h3>
          </div>
          
          {/* Save error message */}
          {saveError && (
            <div className="mx-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs flex-shrink-0">
              <p className="text-amber-700 font-medium">{t.saveFailed}</p>
              <p className="text-amber-600 mt-1">{saveError}</p>
              <button
                onClick={handleSaveScores}
                className="mt-1 font-medium text-amber-700 hover:text-amber-800"
              >
                {t.retryAction}
              </button>
            </div>
          )}

          {/* Score track */}
          <div ref={scoreTrackRef} className="flex-1 overflow-hidden p-2 min-h-0">
            {!selectedShooter ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                <p>{t.selectShooter}</p>
              </div>
            ) : scoreTrack.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                <p>{t.noShootersFound}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 h-full">
                {scoreTrack.map((track, idx) => (
                  <div key={idx} className={`rounded px-2 py-1 ${track.color} flex-1 flex flex-col min-h-0`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        {t.string} {idx + 1}
                      </span>
                      <span className="text-xs text-gray-600">
                        {track.hits.length} / {MAX_HITS_PER_SERIES}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 flex-1">
                      {Array.from({ length: MAX_HITS_PER_SERIES }, (_, hitIdx) => {
                        const zone = track.hits[hitIdx]
                        if (!zone) {
                          // Empty placeholder cell — keeps grid uniform
                          return <div key={hitIdx} className="rounded bg-black/5" />
                        }
                        return (
                          <button
                            key={hitIdx}
                            onClick={() => handleScoreTap(idx, zone, hitIdx)}
                            aria-label={`${t.string} ${idx + 1}, ${zone === 'M' ? 'Miss' : zone} ${t.pts}, double-tap to delete`}
                            className={`rounded font-bold text-base transition-all touch-manipulation ${
                              zone === 'X' || zone === '10'
                                ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                                : zone === 'M'
                                ? 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
                                : 'bg-gray-600 text-white hover:bg-gray-700 active:bg-gray-800'
                            }`}
                          >
                            {zone}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="p-2 bg-white border-t border-gray-200 flex-shrink-0">
            <button
              onClick={handleSaveScores}
              disabled={saving || !selectedShooter || isMatchCompleted}
              aria-label={saving ? t.saving : isMatchCompleted ? t.matchCompleted : `${t.saveToSSI}: ${selectedShooter?.name || ''}`}
              className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                saving || isMatchCompleted
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
              }`}
            >
              {saving ? t.saving : isMatchCompleted ? t.matchCompleted : t.saveScores}
            </button>
          </div>

          {/* Aria-live region for score update announcements */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {lastSaveStatus}
          </div>
        </div>

        {/* Right: Number pad */}
        <div className="w-full lg:w-64 xl:w-72 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex-shrink-0 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-gray-200 flex-shrink-0">
            <h3 className="font-semibold text-gray-700 text-xs">Score Pad</h3>
          </div>
          <div className="p-2 flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2">
              {SCORE_ZONES.map((zone) => {
                const variant = zone === 'X' || zone === '10' ? 'high' : zone === 'M' ? 'miss' : 'low'
                const colors = {
                  high: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white',
                  low: 'bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white',
                  miss: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white',
                }
                
                return (
                  <button
                    key={zone}
                    onClick={() => handleScoreAdd(zone)}
                    disabled={!selectedShooter || isMatchCompleted}
                    aria-label={`${zone === 'M' ? 'Miss' : `Score ${zone}`}`}
                    className={`h-16 lg:h-14 xl:h-16 rounded-lg font-bold text-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation ${colors[variant]}`}
                  >
                    {zone}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
