// ============================================================
// TabletScoreTrack — Center column: score track + save button
// ============================================================

import { MAX_HITS_PER_SERIES } from '../../lib/scoring-constants'
import t from '../../i18n'

export default function TabletScoreTrack({
  scoreTrack,
  selectedShooter,
  saving,
  saveError,
  isMatchCompleted,
  onSaveScores,
  onScoreTap,
  lastSaveStatus,
  scoreTrackRef,
}) {
  return (
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
            onClick={onSaveScores}
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
                      return <div key={hitIdx} className="rounded bg-black/5" />
                    }
                    return (
                      <button
                        key={hitIdx}
                        onClick={() => onScoreTap(idx, zone, hitIdx)}
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
          onClick={onSaveScores}
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
  )
}
