// ============================================================
// ScoringView — Score entry for one shooter / one series group
//
// Pure presenter — all computed values come from App.jsx.
// ============================================================

import ScoringForm from '../ScoringForm'
import { SCORE_ZONES } from '../../lib/scoring-constants'
import fi from '../../i18n'

export default function ScoringView({
  shooter,
  activeSeries,
  doubleSeries,
  combinedScores,
  effectiveMaxHits,
  totalShots,
  pts,
  isOver,
  error,
  saving,
  updateScore,
  onSaveAndNext,
  onBack,
  onDismissError,
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white">
        <button
          onClick={onBack}
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
          <button onClick={onDismissError} className="text-red-500 text-xs underline mt-1">{fi.dismiss}</button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            onClick={onBack}
            disabled={saving}
            className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold text-base active:bg-gray-300 disabled:opacity-50"
          >
            ← {fi.back}
          </button>
          <button
            onClick={onSaveAndNext}
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
