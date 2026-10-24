import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as api from '../api'
import t from '../i18n'
import { log } from '../log.js'
import {
  SCORE_ZONES,
  SERIES_COUNT,
  MAX_HITS_PER_SERIES,
  hitsInSeries,
  getTotalHits,
  getTotalPoints,
  getXCount,
} from '../lib/scoring-helpers'
import {
  TabletHeaderAndStats,
  TabletShooterSidebar,
  TabletNumberPad,
} from './TabletScoringPanels'

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
  const ssiParseOptions = useMemo(() => ({
    inferMissingMisses: isMatchCompleted,
    maxHitsPerSeries: MAX_HITS_PER_SERIES,
  }), [isMatchCompleted])
  
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

      const validation = api.validateSeriesShotCounts(shooterScores, {
        seriesCount: SERIES_COUNT,
        shotsPerSeries: MAX_HITS_PER_SERIES,
      })
      if (!validation.isValid) {
        const errorMsg = api.buildIncompleteSeriesValidationMessage(validation, {
          headerFormatter: t.incompleteSeriesSaveErrorHeader,
          lineFormatter: t.incompleteSeriesSaveErrorLine,
        })
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
  }, [squad.shooters, selectedShooter, onScoresUpdate, allScores, ssiParseOptions])

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

  const handleScoreDelete = (seriesIdx, zone, _hitIdx) => {
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
  const totalPoints = currentShooterScores ? getTotalPoints(currentShooterScores) : 0
  const xCount = currentShooterScores ? getXCount(currentShooterScores) : 0

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <TabletHeaderAndStats
        cup={cup}
        match={match}
        squad={squad}
        isMatchCompleted={isMatchCompleted}
        userEmail={userEmail}
        userName={userName}
        totalShots={totalShots}
        totalShotsInMatch={totalShotsInMatch}
        totalPoints={totalPoints}
        xCount={xCount}
        onBack={onBack}
        onBackToCup={onBackToCup}
        onBackToMatch={onBackToMatch}
        onLogout={onLogout}
      />

      {/* Main content area - 3 columns on desktop, stacked on mobile */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        <TabletShooterSidebar
          squad={squad}
          selectedShooter={selectedShooter}
          allScores={allScores}
          totalShotsInMatch={totalShotsInMatch}
          handleShooterSelect={handleShooterSelect}
          handleMoveShooter={handleMoveShooter}
        />

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

        <TabletNumberPad
          selectedShooter={selectedShooter}
          isMatchCompleted={isMatchCompleted}
          handleScoreAdd={handleScoreAdd}
        />
      </div>
    </div>
  )
}
