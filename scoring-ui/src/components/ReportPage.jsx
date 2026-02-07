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

  // Search
  const [searchText, setSearchText] = useState('')
  const [matches, setMatches] = useState([])
  const [searched, setSearched] = useState(false)

  // Selection
  const [selected, setSelected] = useState(new Set())

  // Report data
  const [reportRows, setReportRows] = useState([])

  // Auto-login on mount
  useEffect(() => {
    const tryAutoLogin = async () => {
      const raw = localStorage.getItem(LS_CREDS)
      if (!raw) return
      const creds = await decryptData(raw)
      if (!creds) return
      try {
        await api.login(creds.email, creds.password, creds.apiKey)
        setAuthed(true)
        setView('search')
      } catch { /* show login */ }
    }
    tryAutoLogin()
  }, [])

  // Login handler
  const handleLogin = async (email, password, apiKey, rememberMe) => {
    await api.login(email, password, apiKey)
    if (rememberMe) {
      const encrypted = await encryptData({ email, password, apiKey })
      localStorage.setItem(LS_CREDS, encrypted)
    }
    setAuthed(true)
    setView('search')
  }

  // Search matches
  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault()
    if (!searchText.trim() || searchText.length < 2) return
    setLoading(true)
    setError(null)
    setSearched(false)
    try {
      const results = await api.searchMatches(searchText)
      setMatches(results)
      setSearched(true)
      setSelected(new Set())
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [searchText])

  // Toggle single match selection
  const toggleMatch = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Select all / deselect all
  const toggleAll = () => {
    if (selected.size === matches.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(matches.map(m => m.id)))
    }
  }

  // Run report
  const handleRunReport = async () => {
    if (selected.size === 0) return
    setLoading(true)
    setError(null)
    try {
      const rows = await api.getReportData([...selected])
      setReportRows(rows)
      setView('report')
    } catch (err) {
      setError(err.message)
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
              placeholder="Match name, e.g. Kupittaa"
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

          {/* No results */}
          {searched && matches.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-amber-700 font-medium">No matches found</p>
              <p className="text-amber-500 text-sm mt-1">Try a different search term</p>
            </div>
          )}

          {/* Match list with checkboxes */}
          {matches.length > 0 && (
            <>
              {/* Select all */}
              <label className="flex items-center gap-3 px-4 py-3 mb-2 bg-gray-100 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selected.size === matches.length && matches.length > 0}
                  onChange={toggleAll}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-gray-600">
                  Select all ({matches.length})
                </span>
              </label>

              {matches.map(match => {
                const isSelected = selected.has(match.id)
                return (
                  <label
                    key={match.id}
                    className={`flex items-center gap-3 p-4 mb-2 rounded-xl border cursor-pointer select-none transition-colors ${
                      isSelected
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleMatch(match.id)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{match.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formatDateShort(match.starts)}{match.cupName ? ` · ${match.cupName}` : ''}
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
