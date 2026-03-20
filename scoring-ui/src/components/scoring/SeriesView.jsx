// ============================================================
// SeriesView — Series overview + shooter list for active series
//
// Pure presenter — all computed values come from App.jsx.
// ============================================================

import ShooterPicker from '../ShooterPicker'
import { isSeriesScored } from '../../lib/scoring-constants'
import fi from '../../i18n'

export default function SeriesView({
  selectedMatch,
  selectedSquad,
  allScores,
  activeSeries,
  doubleSeries,
  seriesSteps,
  activeSeriesComplete,
  activeGroupScored,
  shootersWithStatus,
  selectedShooterId,
  onSelectShooter,
  onSeriesTabChange,
  onDoubleSeriesToggle,
  onBack,
}) {
  const shooters = selectedSquad.shooters
  const activeSeriesLabel = doubleSeries
    ? `${activeSeries + 1}+${activeSeries + 2}`
    : `${activeSeries + 1}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white">
        <button
          onClick={onBack}
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
                  onClick={() => onSeriesTabChange(i)}
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
              onChange={(e) => onDoubleSeriesToggle(e.target.checked)}
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
          onSelect={onSelectShooter}
          currentShooterId={selectedShooterId}
        />
      </div>
    </div>
  )
}
