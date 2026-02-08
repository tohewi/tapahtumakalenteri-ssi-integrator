import ScoreZoneButton from './ScoreZoneButton'
import fi from '../i18n'

export default function ScoringForm({
  seriesIndex,
  scores,
  scoreZones,
  maxHits,
  totalHits,
  totalPoints,
  onUpdate,
  onNext,
  isLast,
}) {
  const isFull = totalHits >= maxHits
  const isOver = totalHits > maxHits

  // Group zones for mobile layout: high scores top, low scores bottom
  const highZones = scoreZones.slice(0, 6)  // X, 10, 9, 8, 7, 6
  const lowZones = scoreZones.slice(6)       // 5, 4, 3, 2, 1, M

  return (
    <div className="px-3 pt-4 pb-28 max-w-lg mx-auto">
      {/* Series summary */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">{fi.series} {seriesIndex + 1}</h2>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium px-2 py-1 rounded-full ${
            isOver ? 'bg-red-100 text-red-700' : isFull ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {totalHits} / {maxHits} {fi.hits}
          </span>
          <span className="text-lg font-bold text-gray-800">{totalPoints} {fi.pts}</span>
        </div>
      </div>

      {/* Over-max warning */}
      {isOver && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 mb-3 text-center">
          <p className="text-red-700 font-semibold">{fi.tooManyShots} ({totalHits}/{maxHits})</p>
          <p className="text-red-500 text-sm">{fi.removeHitsBeforeSaving}</p>
        </div>
      )}

      {/* High score zones (X, 10, 9, 8, 7, 6) */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {highZones.map(zone => (
          <ScoreZoneButton
            key={zone}
            zone={zone}
            count={scores[zone]}
            onIncrement={() => onUpdate(seriesIndex, zone, 1)}
            onDecrement={() => onUpdate(seriesIndex, zone, -1)}
            variant="high"
            incrementDisabled={isFull}
          />
        ))}
      </div>

      {/* Low score zones (5, 4, 3, 2, 1, M) */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {lowZones.map(zone => (
          <ScoreZoneButton
            key={zone}
            zone={zone}
            count={scores[zone]}
            onIncrement={() => onUpdate(seriesIndex, zone, 1)}
            onDecrement={() => onUpdate(seriesIndex, zone, -1)}
            variant={zone === 'M' ? 'miss' : 'low'}
            incrementDisabled={isFull}
          />
        ))}
      </div>

      {/* Next series button */}
      {!isLast && (
        <button
          onClick={onNext}
          className={`w-full py-3 rounded-xl font-semibold text-lg transition-colors ${
            isFull
              ? 'bg-green-600 text-white active:bg-green-700'
              : 'bg-gray-200 text-gray-600 active:bg-gray-300'
          }`}
        >
          {isFull ? `${fi.nextSeries} → ${fi.series} ${seriesIndex + 2}` : `${fi.skipToSeries} → ${fi.series} ${seriesIndex + 2}`}
        </button>
      )}
    </div>
  )
}
