// ============================================================
// SchedulePage — Create and manage scheduled events from templates
//
// Features:
//   - Template selector
//   - Date picker with multi-select for batch creation
//   - Event list with status badges and SSI/calendar links
//   - Batch creation progress view
//   - Delete planned events
// ============================================================

import { useState, useEffect } from 'react'
import { listTemplates, listEvents, createEventsApi, deleteEventApi, executeEventApi } from '../../platform-api.js'

// ---- Status badge colors ----
const STATUS_COLORS = {
  planned: 'bg-gray-100 text-gray-600',
  ssi_created: 'bg-blue-100 text-blue-700',
  calendar_published: 'bg-green-100 text-green-700',
  staffed: 'bg-purple-100 text-purple-700',
  ready: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-gray-200 text-gray-500',
  failed: 'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  planned: 'Planned',
  ssi_created: 'SSI Created',
  calendar_published: 'Published',
  staffed: 'Staffed',
  ready: 'Ready',
  completed: 'Completed',
  failed: 'Failed',
}

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function formatEventDate(dateStr) {
  if (!dateStr) return '—'
  // Handle both YYYY-MM-DD strings and ISO timestamps from API
  // PostgreSQL DATE serializes as '2026-03-04T00:00:00.000Z' in JSON
  let isoDate = dateStr
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    isoDate = dateStr + 'T12:00:00Z' // noon UTC to avoid DST edge
  }
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return 'Invalid Date'
  return d.toLocaleDateString('fi-FI', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function SchedulePage({ tenantId, onBack }) {
  const [templates, setTemplates] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [dates, setDates] = useState([])
  const [creating, setCreating] = useState(false)
  const [batchResults, setBatchResults] = useState(null)
  const [status, setStatus] = useState(null)
  const [executingId, setExecutingId] = useState(null) // event ID being executed in SSI

  // Load templates and events
  useEffect(() => {
    async function load() {
      try {
        const [tplData, evtData] = await Promise.all([
          listTemplates(tenantId),
          listEvents(tenantId),
        ])
        setTemplates(tplData.templates || [])
        setEvents(evtData.events || [])
      } catch (err) {
        setStatus({ type: 'error', message: err.message })
      }
      setLoading(false)
    }
    load()
  }, [tenantId])

  // Refresh events after changes
  async function refreshEvents() {
    try {
      const data = await listEvents(tenantId)
      setEvents(data.events || [])
    } catch { /* ignore */ }
  }

  // Add a date to the batch list
  function addDate() {
    if (!dateInput) return
    if (dates.includes(dateInput)) return
    setDates(prev => [...prev, dateInput].sort())
    setDateInput('')
  }

  function removeDate(d) {
    setDates(prev => prev.filter(x => x !== d))
  }

  // Create events for all selected dates
  async function handleCreate() {
    if (!selectedTemplateId || dates.length === 0) return
    setCreating(true)
    setStatus(null)
    setBatchResults(null)
    try {
      const data = await createEventsApi(tenantId, {
        templateId: selectedTemplateId,
        dates,
      })

      if (data.results) {
        // Batch response
        setBatchResults(data.results)
        const successCount = data.results.filter(r => r.success).length
        setStatus({
          type: successCount === dates.length ? 'success' : 'warning',
          message: `${successCount}/${dates.length} events created successfully`,
        })
      } else if (data.event) {
        // Single event
        setBatchResults([{ success: true, date: dates[0], event: data.event }])
        setStatus({ type: 'success', message: 'Event created successfully' })
      }

      setDates([])
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setCreating(false)
    }
  }

  // Execute a planned event — create in SSI
  async function handleExecute(eventId) {
    if (!confirm('Create this event in SSI? This will create a real cup, matches, and squads on ShootNScoreIt.')) return
    setExecutingId(eventId)
    setStatus(null)
    try {
      const data = await executeEventApi(tenantId, eventId)
      setStatus({ type: 'success', message: `SSI event created: ${data.ssiReferences?.cupName || 'Cup'} — ${data.ssiReferences?.matches?.length || 0} matches` })
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
      await refreshEvents() // refresh to show failed status
    } finally {
      setExecutingId(null)
    }
  }

  // Delete a planned event
  async function handleDelete(eventId) {
    if (!confirm('Delete this planned event?')) return
    try {
      await deleteEventApi(tenantId, eventId)
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    }
  }

  // Template map for display
  const tplMap = Object.fromEntries(templates.map(t => [t.id, t]))

  // Filter events by selected template
  const filteredEvents = selectedTemplateId
    ? events.filter(e => e.templateId === selectedTemplateId)
    : events

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400 text-sm">Loading schedule...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Event Schedule</h1>
          <p className="text-sm text-gray-400">Create and manage scheduled events</p>
        </div>

        {/* Status message */}
        {status && (
          <div className={`rounded-md px-4 py-2 text-sm ${
            status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200'
              : status.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {status.message}
          </div>
        )}

        {/* Create Events Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Schedule New Events</h2>

          {/* Template selector */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Template</label>
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            >
              <option value="">Select template...</option>
              {templates.filter(t => t.ssiSeedSnapshot).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {templates.length > 0 && templates.filter(t => t.ssiSeedSnapshot).length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No templates have imported seed events yet. Import a seed first.</p>
            )}
          </div>

          {/* Date picker */}
          {selectedTemplateId && (
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Add Dates</label>
              <div className="flex gap-2">
                <input
                  type="date" value={dateInput}
                  onChange={e => setDateInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDate() } }}
                  min={new Date().toISOString().split('T')[0]}
                  className="flex-1 border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
                <button
                  onClick={addDate} disabled={!dateInput}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  + Add
                </button>
              </div>

              {/* Selected dates */}
              {dates.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-xs text-gray-500 font-medium">{dates.length} date{dates.length > 1 ? 's' : ''} selected:</div>
                  <div className="flex flex-wrap gap-2">
                    {dates.map(d => (
                      <span key={d} className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 px-3 py-1 rounded-full text-sm">
                        {formatEventDate(d)}
                        <button onClick={() => removeDate(d)} className="text-sky-400 hover:text-sky-600 ml-1">×</button>
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={handleCreate} disabled={creating}
                    className="mt-3 bg-sky-600 text-white px-6 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
                  >
                    {creating ? 'Creating...' : `Create ${dates.length} Event${dates.length > 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Batch results */}
          {batchResults && (
            <div className="mt-4 space-y-1 border-t pt-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Creation Results</div>
              {batchResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded ${
                  r.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  <span>{r.success ? '✓' : '✗'}</span>
                  <span>{formatEventDate(r.date)}</span>
                  {!r.success && <span className="text-xs">— {r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Event List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Scheduled Events
              <span className="text-sm font-normal text-gray-400 ml-2">({filteredEvents.length})</span>
            </h2>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-8">
              No events scheduled yet. Select a template and add dates above.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map(evt => {
                const tpl = tplMap[evt.templateId]
                return (
                  <div key={evt.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900">
                          {formatEventDate(evt.eventDate)}
                        </span>
                        <StatusBadge status={evt.status} />
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {tpl?.name || evt.templateId}
                        {evt.ssiReferences?.cupUrl && (
                          <span> • <a href={evt.ssiReferences.cupUrl} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">SSI</a></span>
                        )}
                        {evt.calendarReference?.calendarUrl && (
                          <span> • <a href={evt.calendarReference.calendarUrl} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">Calendar</a></span>
                        )}
                      </div>
                      {evt.status === 'failed' && evt.errorDetails && (
                        <div className="text-xs text-red-500 mt-1">{evt.errorDetails}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {evt.status === 'planned' && (
                        <>
                          <button
                            onClick={() => handleExecute(evt.id)}
                            disabled={executingId === evt.id}
                            className="text-xs bg-sky-600 text-white px-2.5 py-1 rounded font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
                          >
                            {executingId === evt.id ? 'Creating in SSI...' : 'Create in SSI'}
                          </button>
                          <button onClick={() => handleDelete(evt.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                        </>
                      )}
                      {evt.status === 'failed' && (
                        <>
                          <button
                            onClick={() => handleExecute(evt.id)}
                            disabled={executingId === evt.id}
                            className="text-xs text-sky-600 hover:text-sky-800 font-medium"
                          >
                            {executingId === evt.id ? 'Retrying...' : 'Retry'}
                          </button>
                          <button onClick={() => handleDelete(evt.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
    </div>
  )
}
