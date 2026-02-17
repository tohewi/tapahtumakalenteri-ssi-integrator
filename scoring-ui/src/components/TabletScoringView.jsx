import { useState, useEffect, useCallback, useRef } from 'react'
import { AppHeader } from './shared'
import * as api from '../api'
import t from '../i18n'

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
  const [selectedScoreIndex, setSelectedScoreIndex] = useState(null) // { seriesIdx, hitIdx }
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [draggedShooter, setDraggedShooter] = useState(null)
  const [longPressState, setLongPressState] = useState(null) // { seriesIdx, hitIdx, progress }
  
  const scoreTrackRef = useRef(null)
  const longPressTimerRef = useRef(null)

  // Check if match is completed (status: 'cp')
  const isMatchCompleted = match?.status === 'cp'
  
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
        console.error('No scores found for shooter:', selectedShooter.id)
        return
      }

      // The API expects scores in the same format as mobile UI:
      // { 0: { X: 0, '10': 5, ... }, 1: { ... }, ... }
      // NOT as pre-formatted strings like { s1: "0,5,0,0,..." }
      console.log('Saving scores for shooter:', selectedShooter.id, shooterScores)
      await withSessionCheck(() => api.submitScore(selectedShooter.id, shooterScores))
      console.log('Scores saved successfully')
    } catch (err) {
      console.error('Save error:', err)
      if (!(err instanceof api.SessionExpiredError) && !(err instanceof api.ScopeMismatchError)) {
        setSaveError('Failed to save scores to SSI: ' + err.message)
      }
    } finally {
      setSaving(false)
    }
  }, [selectedShooter, saving, allScores, withSessionCheck, isMatchCompleted])

  // Select first shooter by default
  useEffect(() => {
    if (!selectedShooter && squad.shooters.length > 0) {
      // Clear all local scores when starting fresh from first shooter
      console.log('Starting fresh: clearing all local scores and loading from SSI')
      const freshScores = {}
      
      squad.shooters.forEach(shooter => {
        // Load SSI scores for each shooter
        try {
          const ssiScores = api.buildScoresFromSSI(shooter, SERIES_COUNT)
          freshScores[shooter.id] = ssiScores
        } catch (err) {
          console.error('Error loading SSI scores for shooter:', shooter.id, err)
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
      setSelectedScoreIndex(null)
      setSaveError(null)
      
      console.log('Loaded SSI scores for all shooters, starting with:', firstShooter.id)
    }
  }, [squad.shooters, selectedShooter, onScoresUpdate])

  // Handle shooter selection
  const handleShooterSelect = useCallback(async (shooter) => {
    if (selectedShooter?.id === shooter.id) return
    
    // Auto-save current shooter's scores before switching
    if (selectedShooter) {
      console.log('Auto-saving before switch from', selectedShooter.id, 'to', shooter.id)
      await handleSaveScores()
    }
    
    setSelectedShooter(shooter)
    setSelectedScoreIndex(null)
    setSaveError(null)

    // Load SSI scores from squad data (only if no local scores exist)
    const shooterScores = allScores[shooter.id]
    const hasLocalScores = shooterScores && getTotalHits(shooterScores) > 0
    
    if (!hasLocalScores) {
      // Load from SSI since no local data
      try {
        console.log('Loading SSI scores for shooter:', shooter.id)
        const ssiScores = api.buildScoresFromSSI(shooter, SERIES_COUNT)
        
        if (getTotalHits(ssiScores) > 0) {
          console.log('Loaded SSI scores with', getTotalHits(ssiScores), 'hits')
          onScoresUpdate(shooter.id, ssiScores)
        } else {
          console.log('No SSI scores found (zero data is not an error)')
        }
      } catch (err) {
        console.error('Error loading SSI scores:', err)
        if (!(err instanceof api.SessionExpiredError) && !(err instanceof api.ScopeMismatchError)) {
          setSaveError('Failed to load scores from SSI: ' + err.message)
        }
      }
    } else {
      console.log('Using local scores for shooter:', shooter.id)
    }
  }, [selectedShooter, allScores, onScoresUpdate, handleSaveScores])

  // Add score to current series
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
      return // All series full
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

  // Remove selected score
  // Note: Scores are stored as counts per zone, not individual hits.
  // When a user clicks on a specific hit button, we decrement the count for that zone.
  // This is simpler than tracking individual hit IDs and matches the underlying data model.
  const handleScoreRemove = () => {
    if (!selectedShooter || !selectedScoreIndex) return

    const { seriesIdx, zone } = selectedScoreIndex
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
    setSelectedScoreIndex(null)
  }

  // Long-press handlers for touch-friendly deletion
  const handleLongPressStart = (seriesIdx, zone, hitIdx) => {
    if (isMatchCompleted) return // Don't allow deletion in completed matches
    // Clear any existing timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }

    // Set initial state
    setLongPressState({ seriesIdx, zone, hitIdx, progress: 0 })

    // Increment progress animation
    const startTime = Date.now()
    const duration = 750 // 750ms hold time

    const updateProgress = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      setLongPressState(prev => 
        prev?.seriesIdx === seriesIdx && prev?.hitIdx === hitIdx
          ? { ...prev, progress }
          : null
      )

      if (progress < 1) {
        longPressTimerRef.current = setTimeout(updateProgress, 16) // ~60fps
      } else {
        // Long press complete - delete the score
        handleScoreDelete(seriesIdx, zone, hitIdx)
      }
    }

    updateProgress()
  }

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
    setLongPressState(null)
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
    setLongPressState(null)
    
    // Could add toast notification here
    console.log(`Deleted score: ${zone} from string ${seriesIdx + 1}`)
  }

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  // Drag and drop handlers
  const handleDragStart = (e, shooter) => {
    setDraggedShooter(shooter)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, targetShooter) => {
    e.preventDefault()
    if (!draggedShooter || draggedShooter.id === targetShooter.id) return

    const currentIndex = squad.shooters.findIndex(s => s.id === draggedShooter.id)
    const targetIndex = squad.shooters.findIndex(s => s.id === targetShooter.id)

    const newShooters = [...squad.shooters]
    newShooters.splice(currentIndex, 1)
    newShooters.splice(targetIndex, 0, draggedShooter)

    onShootersReorder(newShooters)
    setDraggedShooter(null)
  }

  const handleDragEnd = () => {
    setDraggedShooter(null)
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
  const shotsFired = currentShooterScores ? getTotalHits(currentShooterScores) : 0
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
              className="hover:underline focus:outline-none focus:underline"
            >
              {cup?.name || t.cups}
            </button>
            <span className="opacity-70">›</span>
            <button
              onClick={onBackToMatch}
              className="hover:underline focus:outline-none focus:underline"
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
              className="hover:underline focus:outline-none focus:underline font-semibold"
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
            <span className="font-bold text-blue-600">{shotsFired}</span>
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
          <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
            {squad.shooters.map((shooter) => {
              const isSelected = selectedShooter?.id === shooter.id
              const shooterScores = allScores[shooter.id]
              const shooterHits = shooterScores ? getTotalHits(shooterScores) : 0
              const shooterPoints = shooterScores ? getTotalPoints(shooterScores) : 0
              
              return (
                <div
                  key={shooter.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, shooter)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, shooter)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleShooterSelect(shooter)}
                  className={`p-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-l-4 border-blue-600'
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
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
          <div ref={scoreTrackRef} className="flex-1 overflow-y-auto p-2 min-h-0">
            {!selectedShooter ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                <p>{t.selectShooter}</p>
              </div>
            ) : scoreTrack.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                <p>{t.noShootersFound}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                {scoreTrack.map((track, idx) => (
                  <div key={idx} className={`rounded p-2 ${track.color} min-h-[90px]`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        {t.string} {idx + 1}
                      </span>
                      <span className="text-xs text-gray-600">
                        {track.hits.length} / {MAX_HITS_PER_SERIES}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 min-h-[60px]">
                      {track.hits.map((zone, hitIdx) => {
                        const isSelected = 
                          selectedScoreIndex?.seriesIdx === idx &&
                          selectedScoreIndex?.zone === zone &&
                          selectedScoreIndex?.hitIdx === hitIdx
                        
                        const isLongPressing =
                          longPressState?.seriesIdx === idx &&
                          longPressState?.zone === zone &&
                          longPressState?.hitIdx === hitIdx
                        
                        return (
                          <button
                            key={hitIdx}
                            onClick={() => setSelectedScoreIndex({ seriesIdx: idx, zone, hitIdx })}
                            onTouchStart={(e) => {
                              e.preventDefault()
                              handleLongPressStart(idx, zone, hitIdx)
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault()
                              handleLongPressEnd()
                            }}
                            onTouchCancel={(e) => {
                              e.preventDefault()
                              handleLongPressEnd()
                            }}
                            onMouseDown={() => handleLongPressStart(idx, zone, hitIdx)}
                            onMouseUp={handleLongPressEnd}
                            onMouseLeave={handleLongPressEnd}
                            className={`relative w-12 h-12 rounded font-bold text-base transition-all touch-manipulation ${
                              isSelected
                                ? 'bg-white border-2 border-blue-600 text-blue-600 shadow-md scale-110'
                                : zone === 'X' || zone === '10'
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : zone === 'M'
                                ? 'bg-red-500 text-white hover:bg-red-600'
                                : 'bg-gray-600 text-white hover:bg-gray-700'
                            }`}
                          >
                            {zone}
                            {/* Long-press progress indicator */}
                            {isLongPressing && (
                              <div
                                className="absolute inset-0 rounded-lg border-4 border-red-500 pointer-events-none"
                                style={{
                                  clipPath: `inset(0 ${100 - longPressState.progress * 100}% 0 0)`,
                                  transition: 'clip-path 0.016s linear',
                                }}
                              />
                            )}
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
              className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                saving || isMatchCompleted
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
              }`}
            >
              {saving ? t.saving : isMatchCompleted ? t.matchCompleted : t.saveScores}
            </button>
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
