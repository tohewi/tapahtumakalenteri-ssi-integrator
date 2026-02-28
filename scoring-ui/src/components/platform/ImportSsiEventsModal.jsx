// ============================================================
// ImportSsiEventsModal — Search SSI events and import selected
//
// Provides:
//   - Search form with filters (name, sport, date range, region)
//   - Results table with checkboxes (select all / select some)
//   - Import button to create local scheduled_events
// ============================================================

import { useState } from 'react'
import { ssiSearchEventsApi, ssiImportEventsApi } from '../../platform-api.js'

// Known SSI sport/rule codes for the filter dropdown
const SPORT_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'rl', label: 'RESUL' },
  { value: 'ip', label: 'SRA / IPSC' },
  { value: 'nd', label: 'Nordic' },
  { value: 'pc', label: 'Precision' },
]

// Known SSI region codes
const REGION_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'FIN', label: 'Finland' },
  { value: 'SWE', label: 'Sweden' },
  { value: 'NOR', label: 'Norway' },
  { value: 'DNK', label: 'Denmark' },
  { value: 'EST', label: 'Estonia' },
]

function formatDate(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return isoStr
  return d.toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function sportLabel(rule) {
  const found = SPORT_OPTIONS.find(s => s.value === rule)
  return found ? found.label : rule || '—'
}

export default function ImportSsiEventsModal({ tenantId, onClose, onImported }) {
  // Search form state
  const [search, setSearch] = useState('')
  const [sport, setSport] = useState('')
  const [startsAfter, setStartsAfter] = useState('')
  const [startsBefore, setStartsBefore] = useState('')
  const [region, setRegion] = useState('')

  // Results state
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  // Selection state
  const [selected, setSelected] = useState(new Set())

  // Import state
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState(null)
  const [importError, setImportError] = useState(null)

  async function handleSearch(e) {
    e.preventDefault()
    if (!search || search.trim().length < 2) return

    setSearching(true)
    setSearchError(null)
    setImportError(null)
    setResults(null)
    setSelected(new Set())
    setImportResults(null)

    try {
      const data = await ssiSearchEventsApi(tenantId, {
        search: search.trim(),
        sport: sport || undefined,
        startsAfter: startsAfter || undefined,
        startsBefore: startsBefore || undefined,
        region: region || undefined,
      })
      setResults(data.events || [])
    } catch (err) {
      setSearchError(err.message)
    } finally {
      setSearching(false)
    }
  }

  function toggleSelect(ssiEventId) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(ssiEventId)) {
        next.delete(ssiEventId)
      } else {
        next.add(ssiEventId)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (!results) return
    if (selected.size === results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.map(e => e.ssiEventId)))
    }
  }

  async function handleImport() {
    if (selected.size === 0 || !results) return

    const eventsToImport = results.filter(e => selected.has(e.ssiEventId))
    setImporting(true)
    setImportResults(null)
    setImportError(null)

    try {
      const data = await ssiImportEventsApi(tenantId, eventsToImport)
      setImportResults(data)

      // If all imported successfully, notify parent to refresh
      if (data.imported > 0 && onImported) {
        onImported()
      }
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import from SSI</h2>
            <p className="text-xs text-gray-500">Search existing events on ShootNScoreIt and import them into your schedule.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="px-6 py-4 border-b bg-gray-50 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Name search */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Event name..."
                required
                minLength={2}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>

            {/* Sport filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sport</label>
              <select
                value={sport}
                onChange={e => setSport(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              >
                {SPORT_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Region filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Region</label>
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              >
                {REGION_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Starts after */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Starts after</label>
              <input
                type="date"
                value={startsAfter}
                onChange={e => setStartsAfter(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>

            {/* Starts before */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Starts before</label>
              <input
                type="date"
                value={startsBefore}
                onChange={e => setStartsBefore(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={searching || search.trim().length < 2}
              className="bg-sky-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
            {results !== null && (
              <span className="text-xs text-gray-500">{results.length} result{results.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </form>

        {/* Search Error */}
        {searchError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            Search failed: {searchError}
          </div>
        )}

        {/* Import Error */}
        {importError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            Import failed: {importError}
          </div>
        )}

        {/* Results Table */}
        {results !== null && results.length > 0 && (
          <div className="px-6 py-4">
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === results.length}
                        onChange={toggleSelectAll}
                        className="rounded text-sky-600"
                      />
                    </th>
                    <th className="px-3 py-2.5 font-medium text-gray-600">Name</th>
                    <th className="px-3 py-2.5 font-medium text-gray-600">Date</th>
                    <th className="px-3 py-2.5 font-medium text-gray-600">Sport</th>
                    <th className="px-3 py-2.5 font-medium text-gray-600">Region</th>
                    <th className="px-3 py-2.5 font-medium text-gray-600">Status</th>
                    <th className="px-3 py-2.5 font-medium text-gray-600">SSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map(evt => (
                    <tr
                      key={evt.ssiEventId}
                      onClick={() => toggleSelect(evt.ssiEventId)}
                      className={`cursor-pointer transition-colors ${selected.has(evt.ssiEventId) ? 'bg-sky-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(evt.ssiEventId)}
                          onChange={() => toggleSelect(evt.ssiEventId)}
                          onClick={e => e.stopPropagation()}
                          className="rounded text-sky-600"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">{evt.name}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(evt.starts)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{sportLabel(evt.rule)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{evt.region || '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          evt.status === 'on' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {evt.status === 'on' ? 'Active' : evt.status || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {evt.url && (
                          <a
                            href={evt.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-sky-500 hover:text-sky-700 text-xs"
                          >
                            Open
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Import Action */}
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-500">
                {selected.size} event{selected.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={handleImport}
                disabled={selected.size === 0 || importing}
                className="bg-sky-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {importing ? 'Importing...' : `Import ${selected.size} Event${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* Empty results */}
        {results !== null && results.length === 0 && !searching && (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            No events found matching your search criteria.
          </div>
        )}

        {/* Import Results */}
        {importResults && (
          <div className="px-6 py-4 border-t">
            <div className="text-sm font-medium text-gray-700 mb-2">
              Import Results: {importResults.imported}/{importResults.total} imported
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {importResults.results.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded ${
                  r.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  <span>{r.success ? '✓' : '✗'}</span>
                  <span>{r.name}</span>
                  {!r.success && <span className="text-xs ml-auto">— {r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-md border transition-colors"
          >
            {importResults ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
