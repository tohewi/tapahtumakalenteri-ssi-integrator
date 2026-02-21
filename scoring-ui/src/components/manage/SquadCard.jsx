import ActionButton from './ActionButton'
import ShooterActions from './ShooterActions'
import fi from '../../i18n'

// ── Squad card with expandable shooter list ──
export default function SquadCard({ group, matchLabels, actionLoading, onMoveSquad, onSetDns, onUndoDns, onTogglePaid, expanded, onToggleExpand }) {
  const shooterCount = group.total
  const hasIssues = group.issueShooters.length > 0

  return (
    <div className={`bg-white rounded-xl border mb-2 overflow-hidden ${hasIssues ? 'border-amber-200' : 'border-gray-200'}`}>
      <button
        onClick={onToggleExpand}
        className="w-full px-4 py-3 flex items-center justify-between active:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="font-semibold text-gray-800 text-sm">{group.name}</h3>
          {hasIssues && <span className="text-amber-500 text-xs">⚠</span>}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          shooterCount >= group.max && group.max > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {shooterCount}/{group.max}
        </span>
      </button>

      {expanded && (
        <div className="border-t">
          {shooterCount === 0 ? (
            <p className="px-4 py-3 text-gray-400 text-sm">Ei ampujia</p>
          ) : (
            <div className="divide-y">
              {group.okShooters.map((s, i) => (
                <div key={`ok-${i}`} className={`px-4 py-2.5 ${s.didNotShow ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-green-500 text-sm shrink-0">✓</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm text-gray-800 truncate ${s.didNotShow ? 'line-through' : ''}`}>{s.name}</div>
                      {s.email ? (
                        <div className="text-xs text-gray-500 truncate">{s.email}</div>
                      ) : (
                        <div className="text-xs text-red-600 font-medium">🚨 Sähköposti puuttuu</div>
                      )}
                      <ShooterActions shooter={s} actionLoading={actionLoading} onSetDns={onSetDns} onUndoDns={onUndoDns} onTogglePaid={onTogglePaid} />
                    </div>
                    <ActionButton
                      label={fi.moveSquad}
                      loading={actionLoading?.shooterName === s.name && actionLoading?.action === 'assign'}
                      onClick={() => onMoveSquad(s)}
                      color="blue"
                    />
                  </div>
                </div>
              ))}
              {group.issueShooters.map((s, i) => (
                <div key={`issue-${i}`} className={`px-4 py-2.5 bg-amber-50 ${s.didNotShow ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-amber-500 text-sm shrink-0">⚠</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm text-gray-800 truncate ${s.didNotShow ? 'line-through' : ''}`}>{s.name}</div>
                      {s.email ? (
                        <div className="text-xs text-gray-500 truncate">{s.email}</div>
                      ) : (
                        <div className="text-xs text-red-600 font-medium">🚨 Sähköposti puuttuu</div>
                      )}
                      <ShooterActions shooter={s} actionLoading={actionLoading} onSetDns={onSetDns} onUndoDns={onUndoDns} onTogglePaid={onTogglePaid} />
                    </div>
                  </div>
                  <div className="flex gap-1 mt-1 ml-6">
                    {s.assignments.map((sq, mi) => (
                      <span key={mi} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        sq === null ? 'bg-red-100 text-red-600'
                          : sq === s.suggestedSquad ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {matchLabels[mi]}: {sq === null ? '✗' : `S${sq}`}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
