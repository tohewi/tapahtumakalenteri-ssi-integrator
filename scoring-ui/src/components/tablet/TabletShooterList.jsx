// ============================================================
// TabletShooterList — Left column: shooter selector + reorder
// ============================================================

import { getTotalHits, getTotalPoints } from '../../lib/scoring-constants'
import t from '../../i18n'

export default function TabletShooterList({
  squad,
  selectedShooter,
  allScores,
  totalShotsInMatch,
  onShooterSelect,
  onMoveShooter,
}) {
  return (
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
          const shooterPoints = shooterScores ? getTotalPoints(shooterScores) : 0

          return (
            <div
              key={shooter.id}
              role="option"
              aria-selected={isSelected}
              aria-label={`${shooter.number}. ${shooter.name}, ${shooterPoints} ${t.pts}, ${shooterShots}/${totalShotsInMatch}`}
              tabIndex={0}
              onClick={() => onShooterSelect(shooter)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShooterSelect(shooter) } }}
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
                    onClick={(e) => { e.stopPropagation(); onMoveShooter(shooter, -1) }}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs p-0.5"
                  >▲</button>
                  <button
                    aria-label={`Move ${shooter.name} down`}
                    disabled={shooterIdx === squad.shooters.length - 1}
                    onClick={(e) => { e.stopPropagation(); onMoveShooter(shooter, 1) }}
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
                    {shooterShots}/{totalShotsInMatch}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
