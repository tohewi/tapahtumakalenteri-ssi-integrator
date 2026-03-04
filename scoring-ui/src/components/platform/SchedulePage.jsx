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

import { useState, useEffect, useMemo } from 'react'
import { listTemplates, listEvents, createEventsApi, deleteEventApi, cancelEventApi, executeEventApi, getUpcomingStaffingApi } from '../../platform-api.js'
import ImportSsiEventsModal from './ImportSsiEventsModal.jsx'
import EventCalendar from './EventCalendar.jsx'

// ---- Status badge colors ----
const STATUS_COLORS = {
  planned: 'bg-gray-100 text-gray-600',
  ssi_created: 'bg-blue-100 text-blue-700',
  calendar_published: 'bg-green-100 text-green-700',
  staffed: 'bg-purple-100 text-purple-700',
  ready: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-gray-200 text-gray-500',
  cancelled: 'bg-orange-100 text-orange-600',
  failed: 'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  planned: 'Planned',
  ssi_created: 'SSI Created',
  calendar_published: 'Published',
  staffed: 'Staffed',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

// Which statuses allow cancellation (soft cancel keeps DB record)
const CANCELLABLE_STATUSES = new Set(['planned', 'ssi_created', 'calendar_published', 'staffed', 'ready'])

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

// ---- Cancel Confirmation Modal (MP7) ----
function CancelEventModal({ event, staffingStatus, tplMap, onConfirm, onClose }) {
  const [removeFromSsi, setRemoveFromSsi] = useState(event?.status === 'ssi_created')
  const [loading, setLoading] = useState(false)

  if (!event) return null

  const staffing = staffingStatus?.[event.id]
  const matchCount = event.ssiReferences?.matches?.length || 0
  const eventLabel = event.eventName || tplMap?.[event.templateId]?.name || 'Event'

  async function handleConfirm() {
    setLoading(true)
    await onConfirm(event, removeFromSsi)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Cancel Event?</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {eventLabel} &mdash; {formatEventDate(event.eventDate)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-4">×</button>
        </div>

        {/* Impact summary */}
        <div className="space-y-2">
          {event.status === 'ssi_created' && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>
                This event exists in SSI ({matchCount > 0 ? `Cup + ${matchCount} match${matchCount !== 1 ? 'es' : ''}` : 'event'}).
                {' '}Cancelling will keep the platform record but the SSI event will remain unless you check the option below.
              </span>
            </div>
          )}
          {staffing?.hasNeeds && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>This event has staff members signed up. They will not be automatically notified.</span>
            </div>
          )}
        </div>

        {/* SSI removal option */}
        {event.status === 'ssi_created' && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={removeFromSsi}
              onChange={e => setRemoveFromSsi(e.target.checked)}
              className="rounded border-gray-300 text-sky-600 focus:ring-sky-200"
            />
            <span className="text-sm text-gray-700">Also remove this event from SSI</span>
          </label>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Keep Event
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-md bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? 'Cancelling...' : 'Cancel Event'}
          </button>
        </div>
      </div>
    </div>
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
  const [staffingStatus, setStaffingStatus] = useState({}) // { eventId: { isUnderstaffed: boolean } }
  const [loading, setLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [dates, setDates] = useState([])
  const [creating, setCreating] = useState(false)
  const [batchResults, setBatchResults] = useState(null)
  const [status, setStatus] = useState(null)
  const [executingId, setExecutingId] = useState(null) // event ID being executed in SSI
  const [showImportModal, setShowImportModal] = useState(false)
  const [viewMode, setViewMode] = useState('calendar') // 'list' | 'calendar'
  const [timeFilter, setTimeFilter] = useState('upcoming') // 'all' | 'next7' | 'next30' | 'upcoming' | 'past'
  const [cancelTarget, setCancelTarget] = useState(null) // event being cancelled

  // Load templates, events, and staffing status
  useEffect(() => {
    async function load() {
      try {
        const [tplData, evtData, staffingData] = await Promise.all([
          listTemplates(tenantId),
          listEvents(tenantId),
          getUpcomingStaffingApi(tenantId).catch(() => []) // fail gracefully
        ])
        
        setTemplates(tplData.templates || [])
        setEvents(evtData.events || [])
        
        // Map staffing status by event ID
        if (Array.isArray(staffingData)) {
          const statusMap = {}
          for (const item of staffingData) {
            statusMap[item.event.id] = { isUnderstaffed: item.isUnderstaffed, hasNeeds: item.needs.length > 0 }
          }
          setStaffingStatus(statusMap)
        }
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
      
      // Also refresh staffing status if an event was created/deleted
      const staffingData = await getUpcomingStaffingApi(tenantId).catch(() => [])
      if (Array.isArray(staffingData)) {
        const statusMap = {}
        for (const item of staffingData) {
          statusMap[item.event.id] = { isUnderstaffed: item.isUnderstaffed, hasNeeds: item.needs.length > 0 }
        }
        setStaffingStatus(statusMap)
      }
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

  // Cancel an event (soft cancel — keeps DB record)
  async function handleCancel(evt, removeFromSsi) {
    try {
      setExecutingId(evt.id)
      const result = await cancelEventApi(tenantId, evt.id, { removeFromSsi })
      setCancelTarget(null)
      const parts = [`Event cancelled`]
      if (result.impact?.removedFromSsi) parts.push('removed from SSI')
      if (result.impact?.staffingSignups > 0) parts.push(`${result.impact.staffingSignups} signup(s) affected`)
      setStatus({ type: 'success', message: parts.join(' · ') })
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setExecutingId(null)
    }
  }

  // Delete an event (hard delete — removes from DB)
  async function handleDelete(evt) {
    let confirmMsg = 'Delete this event?'
    
    if (evt.status === 'ssi_created') {
      const matchCount = evt.ssiReferences?.matches?.length || 0
      confirmMsg = `This will delete the event from SSI (Cup + ${matchCount} matches) and remove it locally. Are you sure?`
    } else if (evt.status === 'calendar_published') {
      confirmMsg = 'This will delete the event from SSI and Tapahtumakalenteri, and remove it locally. Are you sure?'
    }

    if (!confirm(confirmMsg)) return

    try {
      // Set executing id so we can show loading state during delete
      setExecutingId(evt.id)
      await deleteEventApi(tenantId, evt.id)
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setExecutingId(null)
    }
  }

  // Template map for display
  const tplMap = Object.fromEntries(templates.map(t => [t.id, t]))

  // Status summary counts (MP6) — over all events, not filtered by template
  const statusCounts = useMemo(() => {
    const counts = {}
    for (const e of events) counts[e.status] = (counts[e.status] || 0) + 1
    return counts
  }, [events])

  // Filter events by selected template AND time range (MP6)
  const filteredEvents = useMemo(() => {
    let base = selectedTemplateId ? events.filter(e => e.templateId === selectedTemplateId) : events
    const today = new Date(); today.setHours(0, 0, 0, 0)
    if (timeFilter === 'next7') {
      const cutoff = new Date(today); cutoff.setDate(today.getDate() + 7)
      base = base.filter(e => { const d = new Date(e.eventDate); return d >= today && d <= cutoff })
    } else if (timeFilter === 'next30') {
      const cutoff = new Date(today); cutoff.setDate(today.getDate() + 30)
      base = base.filter(e => { const d = new Date(e.eventDate); return d >= today && d <= cutoff })
    } else if (timeFilter === 'upcoming') {
      base = base.filter(e => new Date(e.eventDate) >= today && e.status !== 'cancelled' && e.status !== 'completed')
    } else if (timeFilter === 'past') {
      base = base.filter(e => new Date(e.eventDate) < today || e.status === 'completed' || e.status === 'cancelled')
    }
    return base
  }, [events, selectedTemplateId, timeFilter])

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Event Schedule</h1>
            <p className="text-sm text-gray-400">Create and manage scheduled events</p>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="bg-white border border-sky-300 text-sky-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            Import from SSI
          </button>
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

        {/* MP6: Status summary bar */}
        {events.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(statusCounts).map(([st, count]) => (
              <span key={st} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[st] || 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABELS[st] || st}
                <span className="opacity-70">{count}</span>
              </span>
            ))}
          </div>
        )}

        {/* View toggle + Event heading */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">
            Scheduled Events
            <span className="text-sm font-normal text-gray-400 ml-2">({filteredEvents.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            {/* MP6: Time filter */}
            <div className="flex items-center bg-gray-100 rounded-md p-0.5 text-xs">
              {[['upcoming','Upcoming'],['next7','Next 7d'],['next30','Next 30d'],['past','Past'],['all','All']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTimeFilter(val)}
                  className={`px-2.5 py-1.5 font-medium rounded transition-colors ${
                    timeFilter === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Calendar / List toggle */}
            <div className="flex items-center bg-gray-100 rounded-md p-0.5">
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  viewMode === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                List
              </button>
            </div>
          </div>
        </div>

        {/* Calendar View */}
        {viewMode === 'calendar' ? (
          <EventCalendar
            events={filteredEvents}
            staffingStatus={staffingStatus}
            tplMap={tplMap}
            onExecute={handleExecute}
            onDelete={handleDelete}
            onCancel={setCancelTarget}
            executingId={executingId}
          />
        ) : (
          /* List View */
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {filteredEvents.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8">
                {timeFilter === 'upcoming'
                  ? 'No upcoming events. Change the filter or schedule new events above.'
                  : 'No events match the current filter.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEvents.map(evt => {
                  const tpl = tplMap[evt.templateId]
                  const staffing = staffingStatus[evt.id]
                  const isBusy = executingId === evt.id
                  
                  return (
                    <div key={evt.id} className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                      evt.status === 'cancelled' ? 'bg-orange-50 opacity-70' : 'bg-gray-50'
                    }`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium text-sm ${
                            evt.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-900'
                          }`}>
                            {formatEventDate(evt.eventDate)}
                          </span>
                          <StatusBadge status={evt.status} />
                          {/* Staffing indicator */}
                          {staffing?.hasNeeds && evt.status !== 'cancelled' && (
                            <span className="flex items-center ml-1" title={staffing.isUnderstaffed ? 'Needs more staff' : 'Fully staffed'}>
                              <span className={`w-2 h-2 rounded-full ${staffing.isUnderstaffed ? 'bg-orange-500' : 'bg-green-500'}`} />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {evt.eventName || tpl?.name || evt.templateId || 'Imported'}
                          {(evt.ssiReferences?.cupUrl || evt.ssiReferences?.url) && (
                            <span> • <a href={evt.ssiReferences.cupUrl || evt.ssiReferences.url} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">SSI</a></span>
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
                          <button
                            onClick={() => handleExecute(evt.id)}
                            disabled={isBusy}
                            className="text-xs text-sky-600 hover:text-sky-800 font-medium disabled:opacity-50"
                          >
                            {isBusy ? 'Creating...' : 'Create in SSI'}
                          </button>
                        )}
                        {evt.status === 'failed' && (
                          <button
                            onClick={() => handleExecute(evt.id)}
                            disabled={isBusy}
                            className="text-xs text-sky-600 hover:text-sky-800 font-medium disabled:opacity-50"
                          >
                            {isBusy ? 'Retrying...' : 'Retry'}
                          </button>
                        )}
                        {/* Cancel: soft cancel for active events (MP7) */}
                        {CANCELLABLE_STATUSES.has(evt.status) && (
                          <button
                            onClick={() => setCancelTarget(evt)}
                            disabled={isBusy}
                            className="text-xs text-orange-500 hover:text-orange-700 font-medium disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                        {/* Delete: hard delete — always available as escape hatch */}
                        <button
                          onClick={() => handleDelete(evt)}
                          disabled={isBusy}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                        >
                          {isBusy ? '...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {/* Import from SSI Modal */}
        {showImportModal && (
          <ImportSsiEventsModal
            tenantId={tenantId}
            onClose={() => setShowImportModal(false)}
            onImported={refreshEvents}
          />
        )}

        {/* MP7: Cancel Event Modal */}
        {cancelTarget && (
          <CancelEventModal
            event={cancelTarget}
            staffingStatus={staffingStatus}
            tplMap={tplMap}
            onConfirm={handleCancel}
            onClose={() => setCancelTarget(null)}
          />
        )}
    </div>
  )
}
