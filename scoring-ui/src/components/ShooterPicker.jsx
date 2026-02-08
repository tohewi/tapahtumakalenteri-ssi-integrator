import fi from '../i18n'

export default function ShooterPicker({ shooters, onSelect, currentShooterId }) {
  // Show unscored first, then scored
  const sorted = [...shooters].sort((a, b) => (a.scored === b.scored ? 0 : a.scored ? 1 : -1))

  return (
    <div>
      {sorted.length === 0 && (
        <p className="text-center text-gray-400 py-8">{fi.noShootersFound}</p>
      )}
      {sorted.map(shooter => (
        <button
          key={shooter.id}
          onClick={() => onSelect(shooter)}
          className={`w-full flex items-center gap-3 p-3 mb-2 rounded-xl border transition-colors text-left ${
            shooter.id === currentShooterId
              ? 'border-blue-500 bg-blue-50'
              : shooter.scored
                ? 'border-green-200 bg-green-50'
                : 'border-gray-200 bg-white active:bg-blue-50'
          }`}
        >
          {/* Number badge */}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
            shooter.scored ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {shooter.number}
          </div>

          {/* Name + info */}
          <div className="flex-1 min-w-0">
            <div className={`font-semibold truncate ${shooter.scored ? 'text-gray-400' : 'text-gray-800'}`}>
              {shooter.name}
            </div>
            <div className="text-xs text-gray-400">{shooter.division}</div>
          </div>

          {/* Status: series points if scored, arrow if not */}
          {shooter.scored ? (
            <div className="text-right shrink-0">
              <div className="text-sm font-bold text-green-600">{shooter.seriesPoints} {fi.pts}</div>
              <div className="text-xs text-green-500">✓ {fi.scored}</div>
            </div>
          ) : (
            <div className="text-blue-400 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
