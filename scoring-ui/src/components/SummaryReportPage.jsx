import { useState, useEffect, useCallback } from 'react'
import * as api from '../api'
import { encryptData, decryptData } from '../crypto'
import LoginScreen from './LoginScreen'
import { AppHeader, ErrorBanner, Spinner, formatDateShort } from './shared'

const LS_CREDS = 'ssi_credentials'

export default function SummaryReportPage() {
  const [authed, setAuthed] = useState(false)
  const [view, setView] = useState('login') // login | search | report
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Search
  const [searchText, setSearchText] = useState('')
  const [allResults, setAllResults] = useState([])
  const [searched, setSearched] = useState(false)

  // Client-side filters
  const [filterType, setFilterType] = useState('all')
  const [filterSport, setFilterSport] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // Selection — always stores match IDs (for cups, the component match IDs)
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

  // Search
  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault()
    if (!searchText.trim() || searchText.length < 2) return
    setLoading(true)
    setError(null)
    setSearched(false)
    try {
      const data = await api.searchMatches(searchText)
      setAllResults(data)
      setSearched(true)
      setSelected(new Set())
      setFilterType('all')
      setFilterSport('all')
      setFilterDateFrom('')
      setFilterDateTo('')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [searchText])

  // Sport filter options
  const sportOptions = [...new Set(
    allResults.map(r => r.rule).filter(Boolean)
  )].sort()

  const isCup = (item) => item.componentMatches && item.componentMatches.length > 0

  // Build matchId → contentType map
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

  const getMatchIdsForItem = (item) => {
    if (item.componentMatches && item.componentMatches.length > 0) {
      return item.componentMatches.map(m => m.id)
    }
    return [item.id]
  }

  const getAllFilteredMatchIds = useCallback(() => {
    return filteredResults.flatMap(item => getMatchIdsForItem(item))
  }, [filteredResults])

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

  const toggleAll = () => {
    const allIds = getAllFilteredMatchIds()
    if (allIds.length > 0 && allIds.every(id => selected.has(id))) {
      setSelected(prev => {
        const next = new Set(prev)
        allIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelected(prev => new Set([...prev, ...allIds]))
    }
  }

  const isItemSelected = (item) => {
    const ids = getMatchIdsForItem(item)
    return ids.length > 0 && ids.every(id => selected.has(id))
  }

  // Run summary report
  const handleRunReport = async () => {
    if (selected.size === 0) return
    setLoading(true)
    setError(null)
    try {
      const matchesForReport = [...selected].map(id => ({
        id,
        contentType: matchContentTypeMap.get(id) || 91,
      }))
      const rows = await api.getSummaryReport(matchesForReport)
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
    const headers = ['Kilpailu', 'Pvm', 'Ampujia', 'Squadeja', 'Ampujat/squad', 'Vetäjät', 'Vetäjien lkm']
    const csvRows = [
      headers.join(';'),
      ...reportRows.map(r => [
        r.match,
        r.date,
        r.shooterCount,
        r.squadCount,
        `"${r.shootersPerSquad}"`,
        `"${r.staff}"`,
        r.staffCount,
      ].join(';'))
    ]
    const csv = csvRows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `summary-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Totals
  const totalShooters = reportRows.reduce((sum, r) => sum + r.shooterCount, 0)
  const totalStaff = reportRows.reduce((sum, r) => sum + r.staffCount, 0)

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Yhteenveto" subtitle="Kirjaudu SSI-tunnuksilla" />
        <LoginScreen onLogin={handleLogin} hideHeader />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title="Yhteenveto"
        subtitle={view === 'report' ? `${reportRows.length} kilpailua` : undefined}
        backLabel={view === 'report' ? 'Haku' : undefined}
        onBack={view === 'report' ? () => setView('search') : undefined}
      />

      <ErrorBanner error={error} onClose={() => setError(null)} />
      {loading && <Spinner />}

      {/* Search view — identical to ReportPage */}
      {view === 'search' && !loading && (
        <div className="p-3">
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Hae kilpailun nimellä"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={searchText.length < 2}
              className="px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              Hae
            </button>
          </form>

          {/* Filters */}
          {searched && allResults.length > 0 && (
            <>
              <div className="flex gap-2 mb-2">
                <div className="flex gap-1 flex-1 bg-gray-100 rounded-xl p-1">
                  {['all', 'cup', 'match'].map(t => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        filterType === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      {t === 'all' ? 'Kaikki' : t === 'cup' ? 'Cupit' : 'Kilpailut'}
                    </button>
                  ))}
                </div>
                {sportOptions.length > 0 && (
                  <select
                    value={filterSport}
                    onChange={e => setFilterSport(e.target.value)}
                    className="border border-gray-300 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Kaikki lajit</option>
                    {sportOptions.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2 items-center mb-3">
                <label className="text-xs text-gray-500 shrink-0">Alku</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="text-xs text-gray-500 shrink-0">Loppu</label>
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
              <p className="text-amber-700 font-medium">Ei tuloksia</p>
              <p className="text-amber-500 text-sm mt-1">Kokeile eri hakusanaa</p>
            </div>
          )}

          {/* Filtered but empty */}
          {searched && allResults.length > 0 && filteredResults.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-amber-700 font-medium">Suodattimet piilottavat kaikki tulokset</p>
              <p className="text-amber-500 text-sm mt-1">{allResults.length} tulosta piilotettu</p>
            </div>
          )}

          {/* Result list */}
          {filteredResults.length > 0 && (
            <>
              <label className="flex items-center gap-3 px-4 py-3 mb-2 bg-gray-100 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={getAllFilteredMatchIds().length > 0 && getAllFilteredMatchIds().every(id => selected.has(id))}
                  onChange={toggleAll}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-gray-600">
                  Valitse kaikki ({filteredResults.length})
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
                        {item.componentMatches ? ` · ${item.componentMatches.length} kilpailua` : ''}
                        {item.rule ? ` · ${item.rule}` : ''}
                      </div>
                    </div>
                  </label>
                )
              })}

              <button
                onClick={handleRunReport}
                disabled={selected.size === 0}
                className="w-full mt-3 py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
              >
                Yhteenveto ({selected.size} kilpailua)
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
              <p className="text-amber-700 font-medium">Ei dataa</p>
              <p className="text-amber-500 text-sm mt-1">Valituissa kilpailuissa ei ole ampujia</p>
            </div>
          ) : (
            <>
              {/* Summary badges */}
              <div className="flex gap-2 flex-wrap mb-3">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {reportRows.length} kilpailua
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  {totalShooters} ampujaa yht.
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                  {totalStaff} vetäjää yht.
                </span>
              </div>

              {/* Export button */}
              <button
                onClick={handleExportCSV}
                className="mb-3 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium active:bg-green-700 transition-colors"
              >
                Vie CSV
              </button>

              {/* Summary table — card layout for mobile */}
              <div className="space-y-3">
                {reportRows.map((row, idx) => (
                  <div key={idx} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="font-semibold text-gray-800 mb-2">{row.match}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div className="text-gray-500">Pvm</div>
                      <div className="text-gray-800">{row.date}</div>

                      <div className="text-gray-500">Ampujia</div>
                      <div className="text-gray-800 font-medium">{row.shooterCount}</div>

                      <div className="text-gray-500">Squadeja</div>
                      <div className="text-gray-800">{row.squadCount}</div>

                      <div className="text-gray-500 col-span-2 mt-1 border-t border-gray-100 pt-1">Ampujat / squad</div>
                      <div className="text-gray-700 text-xs col-span-2">{row.shootersPerSquad || '–'}</div>

                      <div className="text-gray-500 col-span-2 mt-1 border-t border-gray-100 pt-1">
                        Vetäjät ({row.staffCount})
                      </div>
                      <div className="text-gray-700 text-xs col-span-2">{row.staff || '–'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
