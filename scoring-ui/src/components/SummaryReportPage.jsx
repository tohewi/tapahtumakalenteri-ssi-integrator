import { useState, useEffect, useCallback } from 'react'
import * as api from '../api'
import { useAuthenticatedPage } from '../hooks/useAuthenticatedPage'
import LoginScreen from './LoginScreen'
import { AppHeader, ErrorBanner, Spinner, formatDateShort } from './shared'
import fi from '../i18n'

const LS_SUMMARY_STATE = 'ssi_summary_state'

export default function SummaryReportPage() {
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
  const [expandedSquads, setExpandedSquads] = useState(new Set())

  const {
    authed, view, setView, loading, setLoading, error, setError,
    sessionExpiredMessage, savedCreds,
    handleLogin, handleLogout, withSessionCheck,
  } = useAuthenticatedPage({
    scope: 'reporting',
    credsKey: 'ssi_credentials_summary',
    stateKey: LS_SUMMARY_STATE,
    defaultView: 'search',
    restoreState: (state) => {
      if (state.searchText) setSearchText(state.searchText)
      return state.view || 'search'
    },
    onLogout: () => {
      setSearchText('')
      setAllResults([])
      setSearched(false)
      setSelected(new Set())
      setReportRows([])
    },
  })

  // --- Save navigation state on changes ---
  useEffect(() => {
    if (!authed || view === 'login') return
    localStorage.setItem(LS_SUMMARY_STATE, JSON.stringify({
      view,
      searchText: view === 'search' || view === 'report' ? searchText : '',
    }))
  }, [authed, view, searchText])

  // Search
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
      await withSessionCheck(async () => {
        const matchesForReport = [...selected].map(id => ({
          id,
          contentType: matchContentTypeMap.get(id) || 91,
        }))
        const rows = await api.getSummaryReport(matchesForReport)
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
    const headers = ['Kilpailu', 'Pvm', 'Squadeja', 'Squad', 'Ampujia', 'Vetäjiä', 'Yht. ampujia', 'Yht. vetäjiä']
    const csvRows = [headers.join(';')]
    for (const r of reportRows) {
      for (const sq of (r.squads || [])) {
        csvRows.push([
          r.match,
          r.date,
          r.squadCount,
          sq.label,
          sq.shooters,
          sq.admins,
          r.uniqueShooters,
          r.uniqueAdmins,
        ].join(';'))
      }
    }
    const csv = csvRows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `summary-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Totals across all matches
  const totalShooters = reportRows.reduce((sum, r) => sum + r.uniqueShooters, 0)
  const totalAdmins = reportRows.reduce((sum, r) => sum + r.uniqueAdmins, 0)

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold">Yhteenveto</h1>
              <p className="text-blue-200 text-sm mt-1">Kirjaudu SSI-tunnuksilla</p>
            </div>
            <a href="#/" className="text-blue-200 text-sm active:text-white">
              {fi.home}
            </a>
          </div>
        </div>
        <LoginScreen 
          onLogin={handleLogin} 
          initialEmail={savedCreds?.email}
          initialPassword={savedCreds?.password}
          initialApiKey={savedCreds?.apiKey}
          hideHeader 
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 text-white px-4 py-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-xl font-bold">Yhteenveto</h1>
            <p className="text-blue-200 text-sm mt-1">
              {view === 'report' ? `${reportRows.length} kilpailua` : 'Hae kilpailut yhteenvedon luomiseen'}
            </p>
          </div>
          <button onClick={handleLogout} className="text-blue-200 text-sm active:text-white">
            {fi.logout}
          </button>
        </div>
        {view === 'report' && (
          <button
            onClick={() => setView('search')}
            className="flex items-center gap-1 mt-2 text-blue-200 text-sm active:text-white"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Haku
          </button>
        )}
      </div>

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
                  {totalAdmins} vetäjää yht.
                </span>
              </div>

              {/* Export button */}
              <button
                onClick={handleExportCSV}
                className="mb-3 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium active:bg-green-700 transition-colors"
              >
                Vie CSV
              </button>

              {/* Summary cards */}
              <div className="space-y-3">
                {reportRows.map((row, idx) => (
                  <div key={idx} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="font-semibold text-gray-800 mb-1">{row.match}</div>
                    <div className="text-sm text-gray-500 mb-3">{row.date}</div>

                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      Squadit ({row.squadCount})
                    </div>
                    <div className="bg-gray-50 rounded-lg overflow-hidden mb-3">
                      {(row.squads || []).map((sq, si) => {
                        const sqKey = `${idx}-${si}`
                        const isOpen = expandedSquads.has(sqKey)
                        const toggleSq = () => setExpandedSquads(prev => {
                          const next = new Set(prev)
                          if (next.has(sqKey)) next.delete(sqKey); else next.add(sqKey)
                          return next
                        })
                        return (
                          <div key={si} className={si > 0 ? 'border-t border-gray-200' : ''}>
                            <button
                              onClick={toggleSq}
                              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 transition-colors text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-gray-700 font-medium">{sq.label}</span>
                                {sq.description && sq.description !== sq.label && (
                                  <span className="text-gray-400 ml-1 text-xs">({sq.description})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-gray-800 font-medium">{sq.shooters}</span>
                                <span className="text-purple-600 font-medium">{sq.admins || '–'}</span>
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </button>
                            {isOpen && (
                              <div className="px-3 pb-2">
                                <div className="text-xs text-gray-500 space-y-0.5">
                                  {(sq.names || []).map((name, ni) => {
                                    const isAdmin = (sq.adminNames || []).includes(name)
                                    return (
                                      <div key={ni} className="flex items-center gap-1">
                                        <span className={isAdmin ? 'text-purple-600 font-medium' : 'text-gray-600'}>{name}</span>
                                        {isAdmin && <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded">vetäjä</span>}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Column headers for squad counts */}
                    <div className="flex items-center justify-end gap-3 text-[10px] text-gray-400 px-3 -mt-1 mb-1">
                      <span>ampujia</span>
                      <span>vetäjiä</span>
                    </div>

                    <div className="flex gap-3 text-sm">
                      <span className="text-gray-500">Yhteensä:</span>
                      <span className="font-medium text-gray-800">{row.uniqueShooters} ampujaa</span>
                      <span className="font-medium text-purple-600">{row.uniqueAdmins} vetäjää</span>
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
