import ScoringForm from './ScoringForm'
import ShooterPicker from './ShooterPicker'
import fi from '../i18n'
import { SCORE_ZONES, ZONE_POINTS, isSeriesScored } from '../lib/scoring-helpers'

export function MobileSeriesOverview({
  selectedMatch,
  selectedSquad,
  activeSeries,
  setActiveSeries,
  doubleSeries,
  allScores,
  isGroupScored,
  groupPoints,
  handleDoubleSeriesToggle,
  handleSelectShooter,
  selectedShooterId,
  onBackToSquad,
}) {
  const shooters = selectedSquad.shooters
  const activeSeriesLabel = doubleSeries
    ? `${activeSeries + 1}+${activeSeries + 2}`
    : `${activeSeries + 1}`

  const activeGroupScored = shooters.filter(s => isGroupScored(s.id)).length
  const activeSeriesComplete = activeGroupScored === shooters.length

  const shootersWithStatus = shooters.map(s => ({
    ...s,
    scored: isGroupScored(s.id),
    seriesPoints: groupPoints(s.id),
  }))

  const seriesSteps = doubleSeries ? [0, 2, 4] : [0, 1, 2, 3, 4, 5]

  const handleSeriesTab = (i) => {
    if (i === activeSeries) return
    if (!activeSeriesComplete) return
    setActiveSeries(i)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white">
        <button
          onClick={onBackToSquad}
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

export function MobileShooterScoringView({
  shooter,
  activeSeries,
  pairedSeries,
  doubleSeries,
  allScores,
  selectedShooterId,
  effectiveMaxHits,
  updateScore,
  error,
  setError,
  saving,
  handleSaveAndNext,
  onBackToSeries,
}) {
  const seriesScores = allScores[selectedShooterId][activeSeries]
  const combinedScores = doubleSeries
    ? Object.fromEntries(SCORE_ZONES.map(z => [
        z,
        seriesScores[z] + (allScores[selectedShooterId][pairedSeries]?.[z] || 0),
      ]))
    : seriesScores
  const totalShots = SCORE_ZONES.reduce((sum, z) => sum + combinedScores[z], 0)
  const pts = SCORE_ZONES.reduce((sum, z) => sum + combinedScores[z] * ZONE_POINTS[z], 0)
  const isOver = totalShots > effectiveMaxHits

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white">
        <button
          onClick={onBackToSeries}
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

      {error && (
        <div className="mx-3 mt-2 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 text-xs underline mt-1">{fi.dismiss}</button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            onClick={onBackToSeries}
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
