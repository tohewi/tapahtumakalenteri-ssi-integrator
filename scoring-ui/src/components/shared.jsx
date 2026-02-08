// Shared UI components used across scoring, registration, and management features

/**
 * Parse a date string as local time to avoid UTC timezone issues.
 * Date-only strings (YYYY-MM-DD) are treated as UTC by default, which can cause
 * off-by-one-day bugs. This helper appends 'T00:00:00' to force local interpretation.
 */
export function parseDateLocal(isoDate) {
  if (!isoDate) return null
  return new Date(isoDate.includes('T') ? isoDate : isoDate + 'T00:00:00')
}

export function formatDate(isoDate) {
  if (!isoDate) return ''
  const d = parseDateLocal(isoDate)
  return d.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDateShort(isoDate) {
  if (!isoDate) return ''
  const d = parseDateLocal(isoDate)
  return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' })
}

export function isToday(isoDate) {
  if (!isoDate) return false
  const target = parseDateLocal(isoDate)
  const now = new Date()
  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
  )
}

export function isFuture(isoDate) {
  if (!isoDate) return false
  return parseDateLocal(isoDate) > new Date()
}

export function BackButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 px-4 pt-2 text-blue-200 text-sm active:text-white"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  )
}

export function AppHeader({ title, subtitle, backLabel, onBack, children }) {
  return (
    <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white">
      {backLabel && onBack && <BackButton label={backLabel} onClick={onBack} />}
      <div className="px-4 py-3">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-blue-200 text-sm mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function ErrorBanner({ error, onClose }) {
  if (!error) return null
  return (
    <div className="mx-3 mt-3">
      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
        <p className="text-red-700 text-sm font-medium">{error}</p>
        {onClose && <button type="button" onClick={onClose} className="text-red-500 text-xs underline mt-1">Sulje</button>}
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/**
 * CupList — renders open/closed cup sections from registration API data.
 * @param {Object} props
 * @param {Array} props.cups - cups from /api/register/cups
 * @param {Function} props.onSelect - called with cup when clicked
 * @param {boolean} props.loading - disables buttons
 * @param {string} props.openLabel - section header for open cups (default: "Ilmoittautuminen auki")
 * @param {string} props.emptyLabel - shown when no open cups (default: "Ei avoimia ilmoittautumisia")
 */
export function CupList({ cups, onSelect, loading, openLabel = 'Ilmoittautuminen auki', emptyLabel = 'Ei avoimia ilmoittautumisia' }) {
  // Sort ascending by proximity to today (closest first)
  const now = Date.now()
  const sorted = [...cups].sort((a, b) => {
    const da = Math.abs(parseDateLocal(a.starts).getTime() - now)
    const db = Math.abs(parseDateLocal(b.starts).getTime() - now)
    return da - db
  })

  const openCups = sorted.filter(c => c.registrationOpen)
  const closedCups = sorted.filter(c => !c.registrationOpen)

  return (
    <div>
      {openCups.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-2 px-1 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
            {openLabel}
          </h2>
          {openCups.map(cup => {
            const cupIsToday = isToday(cup.starts)
            return (
              <button
                key={cup.id}
                onClick={() => onSelect(cup)}
                disabled={loading}
                className={`w-full flex items-center gap-3 p-4 mb-2 rounded-xl border transition-colors text-left ${
                  cupIsToday
                    ? 'border-green-300 bg-white active:bg-green-50'
                    : 'bg-white border-gray-200 active:bg-blue-50'
                }`}
              >
                <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 ${
                  cupIsToday ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  <span className="text-xs font-medium leading-none">
                    {parseDateLocal(cup.starts).toLocaleDateString('fi-FI', { weekday: 'short' })}
                  </span>
                  <span className="text-lg font-bold leading-tight">
                    {parseDateLocal(cup.starts).getDate()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{cup.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{formatDateShort(cup.starts)}</div>
                </div>
                <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium shrink-0 bg-green-100 text-green-700">
                  {cup.registered}/{cup.maxCompetitors}
                </span>
                <div className="text-gray-300 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            )
          })}
        </>
      )}

      {openCups.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-center">
          <p className="text-amber-700 font-medium">{emptyLabel}</p>
          <p className="text-amber-500 text-sm mt-1">Ilmoittautuminen ei ole vielä alkanut tai on päättynyt</p>
        </div>
      )}

      {closedCups.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-4 px-1">
            Tulossa
          </h2>
          {closedCups.map(cup => (
            <div
              key={cup.id}
              className="w-full flex items-center gap-3 p-4 mb-2 rounded-xl border border-gray-200 bg-gray-50 opacity-60 text-left"
            >
              <div className="w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 bg-gray-100 text-gray-400">
                <span className="text-xs font-medium leading-none">
                  {parseDateLocal(cup.starts).toLocaleDateString('fi-FI', { weekday: 'short' })}
                </span>
                <span className="text-lg font-bold leading-tight">
                  {parseDateLocal(cup.starts).getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-500 truncate">{cup.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{formatDateShort(cup.starts)}</div>
              </div>
              <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium shrink-0 ${
                cup.full ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {cup.full ? 'TÄYNNÄ' : 'Ei auki'}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
