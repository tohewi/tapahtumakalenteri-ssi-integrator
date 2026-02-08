import { AppHeader, BackButton } from './shared';

export default function SquadPicker({ match, onSelect, onBack }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader>
        <BackButton onClick={onBack}>Matches</BackButton>
        <div className="px-4 py-3">
          <h1 className="text-lg font-bold">{match.name}</h1>
          <p className="text-blue-200 text-sm">
            {match.date} · {match.type}
          </p>
        </div>
      </AppHeader>

      <div className="p-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
          Select squad
        </h2>
        {match.squads.map(squad => (
          <button
            key={squad.id}
            onClick={() => onSelect(squad)}
            className="w-full flex items-center gap-3 p-4 mb-2 rounded-xl border border-gray-200 bg-white active:bg-blue-50 transition-colors text-left"
          >
            {/* Squad icon */}
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>

            {/* Squad info */}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800">{squad.name}</div>
              {squad.comment && <div className="text-xs text-gray-500">{squad.comment}</div>}
              <div className="text-xs text-gray-400">{squad.shooters.length} shooters</div>
            </div>

            {/* Arrow */}
            <div className="text-gray-300 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
