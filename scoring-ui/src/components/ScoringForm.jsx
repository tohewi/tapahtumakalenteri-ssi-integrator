import ScoreZoneButton from './ScoreZoneButton'
import fi from '../i18n'

export default function ScoringForm({
  seriesIndex,
  scores,
  scoreZones,
  maxHits,
  totalShots,
  onUpdate,
}) {
  const isFull = totalShots >= maxHits
  const isOver = totalShots > maxHits

  // Group zones for mobile layout: high scores top, low scores bottom
  const highZones = scoreZones.slice(0, 6)  // X, 10, 9, 8, 7, 6
  const lowZones = scoreZones.slice(6)       // 5, 4, 3, 2, 1, M

  return (
    <div className="px-3 pt-2 pb-28 max-w-lg mx-auto">

      {/* Over-max warning */}
      {isOver && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 mb-3 text-center">
          <p className="text-red-700 font-semibold">{fi.tooManyShots} ({totalShots}/{maxHits})</p>
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

    </div>
  )
}
