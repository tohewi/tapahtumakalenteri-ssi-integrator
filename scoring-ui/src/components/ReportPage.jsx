import { useState, useEffect, useCallback } from 'react'
import * as api from '../api'
import { encryptData, decryptData } from '../crypto'
import LoginScreen from './LoginScreen'
import { AppHeader, ErrorBanner, Spinner, formatDateShort } from './shared'

const LS_CREDS = 'ssi_credentials'

export default function ReportPage() {
  const [authed, setAuthed] = useState(false)
  const [view, setView] = useState('login') // login | search | report
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)

  // Search
  const [searchText, setSearchText] = useState('')
  const [allResults, setAllResults] = useState([]) // raw results from API
  const [searched, setSearched] = useState(false)

  // Client-side filters
  const [filterType, setFilterType] = useState('all') // 'all' | 'cup' | 'match'
  const [filterSport, setFilterSport] = useState('all') // 'all' | specific rule string
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // Selection — always stores match IDs (for cups, the component match IDs)
  const [selected, setSelected] = useState(new Set())

  // Report data
  const [reportRows, setReportRows] = useState([])

  // --- Helper to handle session expiry ---
  const handleSessionExpired = useCallback(() => {
    setSessionExpiredMessage('Session expired. Please login again.')
    setAuthed(false)
    setView('login')
  }, [])

  // --- Helper to handle scope mismatch ---
  const handleScopeMismatch = useCallback(() => {
    setSessionExpiredMessage('Please login to access this feature.')
    setAuthed(false)
    setView('login')
  }, [])

  // --- Wrapper to catch SessionExpiredError and ScopeMismatchError ---
  const withSessionCheck = useCallback(async (fn) => {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof api.SessionExpiredError) {
        handleSessionExpired()
        throw err
      }
      if (err instanceof api.ScopeMismatchError) {
        handleScopeMismatch()
        throw err
      }
      throw err
    }
  }, [handleSessionExpired, handleScopeMismatch])

  // Load saved credentials for pre-fill (no auto-login)
  useEffect(() => {
    const loadSavedCreds = async () => {
      const raw = localStorage.getItem(LS_CREDS)
      if (!raw) return
      const creds = await decryptData(raw)
      // Just load for potential pre-fill, don't auto-login
    }
    loadSavedCreds()
  }, [])

  // Login handler
  const handleLogin = async (email, password, apiKey, rememberMe) => {
    setSessionExpiredMessage(null)
    await api.login(email, password, apiKey, 'reporting')
    if (rememberMe) {
      const encrypted = await encryptData({ email, password, apiKey })
      localStorage.setItem(LS_CREDS, encrypted)
    }
    setAuthed(true)
    setView('search')
  }

  // Search — fetches all results, filtering is client-side
  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault()
    if (!searchText.trim() || searchText.length < 2) return
    setLoading(true)
    setError(null)
    setSearched(false)
    try {
      await withSessionCheck(async () => {
        const data = await api.searchMatches(searchText)
        setAllResults(data)
        setSearched(true)
        setSelected(new Set())
        setFilterType('all')
        setFilterSport('all')
        setFilterDateFrom('')
        setFilterDateTo('')
      })
    } catch (err) {
      if (!(err instanceof api.SessionExpiredError)) {
        setError(err.message)
      }
    }
    setLoading(false)
  }, [searchText, withSessionCheck]) // withSessionCheck is stable, but included for clarity

  // Collect unique sport values from results for the filter dropdown
  const sportOptions = [...new Set(
    allResults.map(r => r.rule).filter(Boolean)
  )].sort()

  // Determine if an item is a cup (has component matches) or a standalone match
  const isCup = (item) => item.componentMatches && item.componentMatches.length > 0

  // Build matchId → contentType map from results
  // For standalone matches: use item.contentType
  // For component matches inside cups: use 91 (Nordic match, since cups are NordicSerieNode)
  const matchContentTypeMap = new Map()
  for (const item of allResults) {
    if (isCup(item)) {
      for (const cm of item.componentMatches) {
        matchContentTypeMap.set(cm.id, 91)
      }
    } else {
      matchContentTypeMap.set(item.id, item.contentType)
    }
  }

  // Apply client-side filters
  const filteredResults = allResults.filter(item => {
    if (filterType === 'cup' && !isCup(item)) return false
    if (filterType === 'match' && isCup(item)) return false
    if (filterSport !== 'all' && item.rule !== filterSport) return false
    if (filterDateFrom && item.starts < filterDateFrom) return false
    if (filterDateTo && item.starts > filterDateTo + 'T23:59:59') return false
    return true
  })

  // Get all selectable match IDs for an item
  // For cups: use componentMatch IDs; for matches: use the event ID directly
  const getMatchIdsForItem = (item) => {
    if (item.componentMatches && item.componentMatches.length > 0) {
      return item.componentMatches.map(m => m.id)
    }
    return [item.id]
  }

  const getAllFilteredMatchIds = useCallback(() => {
    return filteredResults.flatMap(item => getMatchIdsForItem(item))
  }, [filteredResults])

  // Toggle a single item
  const toggleItem = (item) => {
    setSelected(prev => {
      const next = new Set(prev)
      const ids = getMatchIdsForItem(item)
      const allSelected = ids.every(id => next.has(id))
      if (allSelected) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }

  // Select all / deselect all (operates on filtered results only)
  const toggleAll = () => {
    const allIds = getAllFilteredMatchIds()
    if (allIds.length > 0 && allIds.every(id => selected.has(id))) {
      // Deselect only the filtered ones
      setSelected(prev => {
        const next = new Set(prev)
        allIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelected(prev => new Set([...prev, ...allIds]))
    }
  }

  // Check if an item is fully selected
  const isItemSelected = (item) => {
    const ids = getMatchIdsForItem(item)
    return ids.length > 0 && ids.every(id => selected.has(id))
  }

  // Run report
  const handleRunReport = async () => {
    if (selected.size === 0) return
    setLoading(true)
    setError(null)
    try {
      await withSessionCheck(async () => {
        const matchesForReport = [...selected].map(id => ({
          id,
          contentType: matchContentTypeMap.get(id) || 91,
        }))
        const rows = await api.getReportData(matchesForReport)
        setReportRows(rows)
        setView('report')
      })
    } catch (err) {
      if (!(err instanceof api.SessionExpiredError)) {
        setError(err.message)
      }
    }
    setLoading(false)
  }

  // Export to CSV
  const handleExportCSV = () => {
    if (reportRows.length === 0) return
    const headers = ['Match', 'Date', 'Squad', 'Name', 'Admin']
    const csvRows = [
      headers.join(';'),
      ...reportRows.map(r => [r.match, r.date, r.squad, r.name, r.isAdmin].join(';'))
    ]
    const csv = csvRows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="SSI Report" subtitle="Login with SSI credentials" />
        {sessionExpiredMessage && (
          <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
            <p className="text-yellow-800 text-sm font-medium">{sessionExpiredMessage}</p>
          </div>
        )}
        <LoginScreen onLogin={handleLogin} hideHeader />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title="SSI Report"
        subtitle={view === 'report' ? `${reportRows.length} rows` : undefined}
        backLabel={view === 'report' ? 'Search' : undefined}
        onBack={view === 'report' ? () => setView('search') : undefined}
      />

      <ErrorBanner error={error} onClose={() => setError(null)} />
      {loading && <Spinner />}

      {/* Search view */}
      {view === 'search' && !loading && (
        <div className="p-3">
          {/* Search form */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Name, e.g. Kupittaa"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={searchText.length < 2}
              className="px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              Search
            </button>
          </form>

          {/* Filters — shown after search */}
          {searched && allResults.length > 0 && (
            <>
              <div className="flex gap-2 mb-2">
                {/* Type filter */}
                <div className="flex gap-1 flex-1 bg-gray-100 rounded-xl p-1">
                  {['all', 'cup', 'match'].map(t => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        filterType === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      {t === 'all' ? 'All' : t === 'cup' ? 'Cups' : 'Matches'}
                    </button>
                  ))}
                </div>
                {/* Sport filter */}
                {sportOptions.length > 0 && (
                  <select
                    value={filterSport}
                    onChange={e => setFilterSport(e.target.value)}
                    className="border border-gray-300 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All sports</option>
                    {sportOptions.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2 items-center mb-3">
                <label className="text-xs text-gray-500 shrink-0">From</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="text-xs text-gray-500 shrink-0">To</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {/* No results */}
          {searched && allResults.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-amber-700 font-medium">No events found</p>
              <p className="text-amber-500 text-sm mt-1">Try a different search term</p>
            </div>
          )}

          {/* Filtered but empty */}
          {searched && allResults.length > 0 && filteredResults.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-amber-700 font-medium">No events match current filters</p>
              <p className="text-amber-500 text-sm mt-1">{allResults.length} results hidden by filters</p>
            </div>
          )}

          {/* Result list with checkboxes */}
          {filteredResults.length > 0 && (
            <>
              {/* Select all */}
              <label className="flex items-center gap-3 px-4 py-3 mb-2 bg-gray-100 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={getAllFilteredMatchIds().length > 0 && getAllFilteredMatchIds().every(id => selected.has(id))}
                  onChange={toggleAll}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-gray-600">
                  Select all ({filteredResults.length})
                </span>
              </label>

              {filteredResults.map(item => {
                const checked = isItemSelected(item)
                return (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 p-4 mb-2 rounded-xl border cursor-pointer select-none transition-colors ${
                      checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(item)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{item.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formatDateShort(item.starts)}
                        {isCup(item) ? ' · Cup' : ''}
                        {item.componentMatches ? ` · ${item.componentMatches.length} matches` : ''}
                        {item.rule ? ` · ${item.rule}` : ''}
                      </div>
                    </div>
                  </label>
                )
              })}

              {/* Run Report button */}
              <button
                onClick={handleRunReport}
                disabled={selected.size === 0}
                className="w-full mt-3 py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
              >
                Run Report ({selected.size} match{selected.size !== 1 ? 'es' : ''})
              </button>
            </>
          )}
        </div>
      )}

      {/* Report view */}
      {view === 'report' && !loading && (
        <div className="p-3">
          {reportRows.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-amber-700 font-medium">No approved shooters found</p>
              <p className="text-amber-500 text-sm mt-1">Selected matches have no approved competitors</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="flex gap-2 flex-wrap mb-3">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {reportRows.length} rows
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  {new Set(reportRows.map(r => r.name)).size} unique shooters
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                  {new Set(reportRows.map(r => r.match)).size} matches
                </span>
              </div>

              {/* Export button */}
              <button
                onClick={handleExportCSV}
                className="mb-3 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium active:bg-green-700 transition-colors"
              >
                Export CSV
              </button>

              {/* Report table */}
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-500">Match</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Squad</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Name</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-500">Admin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportRows.map((row, idx) => (
                        <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800">{row.match}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.date}</td>
                          <td className="px-3 py-2 text-gray-600">{row.squad}</td>
                          <td className="px-3 py-2 text-gray-800 font-medium">{row.name}</td>
                          <td className="px-3 py-2 text-center">
                            {row.isAdmin === 'Y' ? (
                              <span className="text-green-600 font-bold">Y</span>
                            ) : (
                              <span className="text-gray-400">N</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
