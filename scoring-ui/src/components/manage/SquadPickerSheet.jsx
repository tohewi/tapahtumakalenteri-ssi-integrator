// ── Bottom sheet squad picker (mobile-friendly) ──
export default function SquadPickerSheet({ shooter, squads, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white rounded-t-2xl shadow-xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <h3 className="font-semibold text-gray-800">Valitse squad</h3>
          <p className="text-sm text-gray-800 mt-0.5">{shooter.name}</p>
          {shooter.email ? (
            <p className="text-xs text-gray-500 truncate">{shooter.email}</p>
          ) : (
            <p className="text-xs text-red-600 font-medium">🚨 Sähköposti puuttuu</p>
          )}
        </div>
        <div className="px-4 pb-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {squads.map(sq => (
            <button
              key={sq.number}
              onClick={() => onSelect(sq.number)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 active:bg-blue-50 active:border-blue-300 transition-colors"
            >
              <div>
                <div className="font-medium text-gray-800 text-sm">{sq.name}</div>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                sq.count >= sq.max && sq.max > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {sq.count}/{sq.max}
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 text-center text-gray-500 font-medium text-sm rounded-xl bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Peruuta
          </button>
        </div>
      </div>
    </div>
  )
}
