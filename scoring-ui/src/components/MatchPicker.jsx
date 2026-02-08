import fi from '../i18n'
import { AppHeader } from './shared'

export default function MatchPicker({ matches, onSelect, cupName, onBack }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const today = `${year}-${month}-${day}`
  const todayMatches = matches.filter(m => m.date === today)
  const otherMatches = matches.filter(m => m.date !== today)

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={cupName || fi.appTitle}
        subtitle={fi.selectMatchSubtitle}
        backLabel={onBack ? fi.cups : undefined}
        onBack={onBack}
      />

      <div className="p-3">
        {/* Today's matches - highlighted */}
        {todayMatches.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-2 px-1 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
              {fi.todayLabel} — {today}
            </h2>
            {todayMatches.map(match => (
              <MatchCard key={match.id} match={match} onSelect={onSelect} highlight={true} />
            ))}
          </>
        )}

        {todayMatches.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-center">
            <p className="text-amber-700 font-medium">{fi.noMatchesToday}</p>
            <p className="text-amber-500 text-sm mt-1">{fi.selectFromOtherMatches}</p>
          </div>
        )}

        {/* Other matches */}
        {otherMatches.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4 px-1">
              {fi.otherMatches}
            </h2>
            {otherMatches.map(match => (
              <MatchCard key={match.id} match={match} onSelect={onSelect} highlight={false} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function MatchCard({ match, onSelect, highlight }) {
  return (
    <button
      onClick={() => onSelect(match)}
      className={`w-full flex items-center gap-3 p-4 mb-2 rounded-xl border transition-colors text-left ${
        highlight
          ? 'border-green-300 bg-white active:bg-green-50'
          : 'border-gray-200 bg-white active:bg-blue-50'
      }`}
    >
      {/* Date badge */}
      <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 ${
        highlight ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      }`}>
        <span className="text-xs font-medium leading-none">
          {new Date(match.date + 'T00:00:00').toLocaleDateString('fi-FI', { weekday: 'short' })}
        </span>
        <span className="text-lg font-bold leading-tight">
          {new Date(match.date + 'T00:00:00').getDate()}
        </span>
      </div>

      {/* Match info */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-800 truncate">{match.name}</div>
        <div className="text-xs text-gray-400">{match.status === 'on' ? fi.active : match.status} · {match.type}</div>
      </div>

      {/* Arrow */}
      <div className="text-gray-300 shrink-0">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}
