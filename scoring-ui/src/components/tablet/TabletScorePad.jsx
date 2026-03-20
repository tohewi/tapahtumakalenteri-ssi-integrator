// ============================================================
// TabletScorePad — Right column: number pad for score entry
// ============================================================

import { SCORE_ZONES } from '../../lib/scoring-constants'

export default function TabletScorePad({ selectedShooter, isMatchCompleted, onScoreAdd }) {
  return (
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
                onClick={() => onScoreAdd(zone)}
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
  )
}
