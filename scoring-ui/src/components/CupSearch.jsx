import { useState, useCallback } from 'react'
import { formatDateShort, isToday, isFuture } from './shared'
import fi from '../i18n'

export default function CupSearch({ onSelectCup, loading, onLogout }) {
  const [search, setSearch] = useState('')
  const [cups, setCups] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = useCallback(async (e) => {
    e.preventDefault()
    if (search.length < 2) return
    setSearching(true)
    setError(null)
    setSearched(false)
    try {
      const { searchCups } = await import('../api.js')
      const results = await searchCups(search)
      setCups(results)
      setSearched(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }, [search])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{fi.appTitle}</h1>
          {onLogout && (
            <button onClick={onLogout} className="text-blue-200 text-sm active:text-white">
              {fi.logout}
            </button>
          )}
        </div>
        <p className="text-blue-200 text-sm mt-1">{fi.searchCupSubtitle}</p>
      </div>

      <form onSubmit={handleSearch} className="p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={fi.searchCupPlaceholder}
            className="flex-1 px-3 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
          <button
            type="submit"
            disabled={searching || search.length < 2}
            className="px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
          >
            {searching ? '...' : fi.search}
          </button>
        </div>
      </form>

      {error && (
        <div className="mx-3 bg-red-50 border border-red-200 rounded-xl p-3 text-center mb-3">
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="px-3">
        {searched && cups.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <p className="text-amber-700 font-medium">{fi.noCupsFound}</p>
            <p className="text-amber-500 text-sm mt-1">{fi.tryDifferentSearch}</p>
          </div>
        )}

        {cups.map(cup => {
          const today = isToday(cup.starts)
          const future = isFuture(cup.starts)
          return (
            <button
              key={cup.id}
              onClick={() => onSelectCup(cup)}
              disabled={loading}
              className={`w-full flex items-center gap-3 p-4 mb-2 rounded-xl border transition-colors text-left ${
                today
                  ? 'border-green-300 bg-white active:bg-green-50'
                  : 'border-gray-200 bg-white active:bg-blue-50'
              } disabled:opacity-50`}
            >
              {/* Date badge */}
              <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 ${
                today ? 'bg-green-100 text-green-700' : future ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                <span className="text-xs font-medium leading-none">
                  {new Date(cup.starts).toLocaleDateString('fi-FI', { weekday: 'short' })}
                </span>
                <span className="text-lg font-bold leading-tight">
                  {new Date(cup.starts).getDate()}
                </span>
              </div>

              {/* Cup info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 truncate">{cup.name}</div>
                <div className="text-xs text-gray-400">
                  {formatDateShort(cup.starts)} · {cup.status === 'on' ? fi.active : cup.status}
                </div>
              </div>

              {/* Today badge or arrow */}
              {today ? (
                <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full shrink-0">{fi.today}</span>
              ) : (
                <div className="text-gray-300 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
