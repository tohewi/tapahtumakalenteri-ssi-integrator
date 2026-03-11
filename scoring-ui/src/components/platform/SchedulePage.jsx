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
import { listTemplates, listEvents, createEventsApi, deleteEventApi, cancelEventApi, executeEventApi, publishCalendarApi, updateCalendarStatsApi, completeSsiEventApi, integrityCheckApi, runPostEventApi, getUpcomingStaffingApi } from '../../platform-api.js'
import ImportSsiEventsModal from './ImportSsiEventsModal.jsx'
import EventCalendar from './EventCalendar.jsx'
import StatusBadge, { STATUS_COLORS, STATUS_LABELS, CANCELLABLE_STATUSES, formatEventDate } from './schedule/StatusBadge.jsx'
import CancelEventModal from './schedule/CancelEventModal.jsx'
import CreateEventsPanel from './schedule/CreateEventsPanel.jsx'

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
  const [integrityResult, setIntegrityResult] = useState(null) // CAL-6 integrity check result
  const [integrityRunning, setIntegrityRunning] = useState(false)

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
      const parts = [`SSI event created: ${data.ssiReferences?.cupName || 'Cup'} — ${data.ssiReferences?.matches?.length || 0} matches`]
      if (data.calendarResult?.success) {
        parts.push('Calendar event published')
      } else if (data.calendarResult && !data.calendarResult.success) {
        parts.push(`Calendar publishing failed (can retry): ${data.calendarResult.error}`)
      }
      setStatus({ type: data.calendarResult && !data.calendarResult.success ? 'warning' : 'success', message: parts.join(' · ') })
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
      await refreshEvents() // refresh to show failed status
    } finally {
      setExecutingId(null)
    }
  }

  // Publish or re-publish calendar event (force=true for already-published events)
  async function handlePublishCalendar(eventId, { force = false } = {}) {
    setExecutingId(eventId)
    setStatus(null)
    try {
      const data = await publishCalendarApi(tenantId, eventId, { force })
      setStatus({ type: 'success', message: `Calendar event published successfully` })
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: `Calendar publish failed: ${err.message}` })
      await refreshEvents()
    } finally {
      setExecutingId(null)
    }
  }

  // Update calendar statistics from SSI (CAL-5)
  async function handleUpdateCalendarStats(eventId) {
    setExecutingId(eventId)
    setStatus(null)
    try {
      const data = await updateCalendarStatsApi(tenantId, eventId)
      const stats = data.stats || {}
      setStatus({ type: 'success', message: `Statistics updated: ${stats.approvedCount} participants, ${stats.shotsFired} shots` })
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: `Statistics update failed: ${err.message}` })
      await refreshEvents()
    } finally {
      setExecutingId(null)
    }
  }

  // Complete SSI event — set status to 'cp' (CAL-7)
  async function handleCompleteSsiEvent(eventId) {
    setExecutingId(eventId)
    setStatus(null)
    try {
      const data = await completeSsiEventApi(tenantId, eventId)
      const matchCount = data.completion?.matchResults?.length || 0
      setStatus({ type: 'success', message: `SSI event completed${matchCount > 0 ? ` (${matchCount} matches)` : ''}` })
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: `SSI complete failed: ${err.message}` })
      await refreshEvents()
    } finally {
      setExecutingId(null)
    }
  }

  // Run calendar data integrity check (CAL-6)
  async function handleIntegrityCheck(liveCheck = false) {
    setIntegrityRunning(true)
    setIntegrityResult(null)
    setStatus(null)
    try {
      const result = await integrityCheckApi(tenantId, { liveCheck })
      setIntegrityResult(result)
      if (result.summary?.passed) {
        setStatus({ type: 'success', message: `Integrity check passed (${result.summary.totalEvents} events checked)` })
      } else {
        setStatus({ type: 'warning', message: `Integrity check: ${result.summary?.errorCount || 0} errors, ${result.summary?.warningCount || 0} warnings` })
      }
    } catch (err) {
      setStatus({ type: 'error', message: `Integrity check failed: ${err.message}` })
    } finally {
      setIntegrityRunning(false)
    }
  }

  // Run post-event workflows (PEW-1..4)
  async function handleRunPostEvent(eventId) {
    setExecutingId(eventId)
    setStatus(null)
    try {
      const result = await runPostEventApi(tenantId, eventId)
      const { summary } = result
      if (summary.totalSteps === 0) {
        setStatus({ type: 'warning', message: 'No post-event workflows configured for this template' })
      } else if (summary.failed === 0) {
        setStatus({ type: 'success', message: `Post-event workflows: ${summary.succeeded} succeeded, ${summary.skipped} skipped` })
      } else {
        setStatus({ type: 'warning', message: `Post-event workflows: ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.skipped} skipped` })
      }
      await refreshEvents()
    } catch (err) {
      setStatus({ type: 'error', message: `Post-event workflows failed: ${err.message}` })
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
        <CreateEventsPanel
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={setSelectedTemplateId}
          dateInput={dateInput}
          onDateInputChange={setDateInput}
          dates={dates}
          onAddDate={addDate}
          onRemoveDate={removeDate}
          creating={creating}
          onCreate={handleCreate}
          batchResults={batchResults}
        />

        {/* MP6: Status summary bar + CAL-6 integrity check */}
        {events.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(statusCounts).map(([st, count]) => (
              <span key={st} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[st] || 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABELS[st] || st}
                <span className="opacity-70">{count}</span>
              </span>
            ))}
            <span className="flex-1" />
            <button
              onClick={() => handleIntegrityCheck(false)}
              disabled={integrityRunning}
              className="text-[11px] text-teal-600 hover:text-teal-800 font-medium disabled:opacity-50"
            >
              {integrityRunning ? 'Checking...' : 'Integrity Check'}
            </button>
          </div>
        )}

        {/* CAL-6: Integrity check results */}
        {integrityResult && (
          <div className={`rounded-lg border p-4 text-sm ${
            integrityResult.summary?.passed
              ? 'bg-green-50 border-green-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-800">
                {integrityResult.summary?.passed ? '✅ Integrity Check Passed' : '⚠️ Integrity Issues Found'}
              </span>
              <button
                onClick={() => setIntegrityResult(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Dismiss
              </button>
            </div>
            <div className="text-xs text-gray-600 mb-2">
              {integrityResult.summary?.totalEvents} events checked
              {integrityResult.summary?.liveCheckPerformed && ' (incl. live WP verification)'}
              {integrityResult.wpAuthError && (
                <span className="text-amber-600"> · WP auth skipped: {integrityResult.wpAuthError}</span>
              )}
            </div>
            {integrityResult.issues?.length > 0 && (
              <div className="space-y-1 mt-2">
                {integrityResult.issues.map((issue, i) => (
                  <div key={i} className={`text-xs px-2 py-1 rounded ${
                    issue.severity === 'error' ? 'bg-red-100 text-red-700'
                      : issue.severity === 'warning' ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    <span className="font-medium">{issue.type}</span>: {issue.message}
                  </div>
                ))}
              </div>
            )}
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
            onPublishCalendar={handlePublishCalendar}
            onUpdateCalendarStats={handleUpdateCalendarStats}
            onCompleteSsiEvent={handleCompleteSsiEvent}
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
                          {evt.calendarReference?.eventUrl && (
                            <span> • <a href={evt.calendarReference.eventUrl} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">Calendar</a></span>
                          )}
                        </div>
                        {evt.status === 'failed' && evt.errorDetails && (
                          <div className="text-xs text-red-500 mt-1">{evt.errorDetails}</div>
                        )}
                        {evt.calendarReference?.status === 'error' && (
                          <div className="text-xs text-amber-600 mt-1">Calendar: {evt.calendarReference.error || 'Publishing failed'}</div>
                        )}
                        {evt.calendarReference?.stats && (
                          <div className="text-xs text-gray-500 mt-1">
                            📊 {evt.calendarReference.stats.approvedCount} participants · {evt.calendarReference.stats.shotsFired} shots
                          </div>
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
                        {/* Calendar publish/retry/re-publish */}
                        {evt.status === 'ssi_created' && !evt.calendarReference && (
                          <button
                            onClick={() => handlePublishCalendar(evt.id)}
                            disabled={isBusy}
                            className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                          >
                            {isBusy ? 'Publishing...' : 'Publish Calendar'}
                          </button>
                        )}
                        {evt.status === 'ssi_created' && evt.calendarReference?.status === 'error' && (
                          <button
                            onClick={() => handlePublishCalendar(evt.id)}
                            disabled={isBusy}
                            className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                          >
                            {isBusy ? 'Publishing...' : 'Retry Calendar'}
                          </button>
                        )}
                        {evt.status === 'calendar_published' && (
                          <button
                            onClick={() => handlePublishCalendar(evt.id, { force: true })}
                            disabled={isBusy}
                            className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                          >
                            {isBusy ? 'Publishing...' : 'Re-publish Calendar'}
                          </button>
                        )}
                        {evt.status === 'calendar_published' && (
                          <button
                            onClick={() => handleUpdateCalendarStats(evt.id)}
                            disabled={isBusy}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                          >
                            {isBusy ? 'Updating...' : 'Update Stats'}
                          </button>
                        )}
                        {(evt.status === 'ssi_created' || evt.status === 'calendar_published') && (
                          <button
                            onClick={() => handleCompleteSsiEvent(evt.id)}
                            disabled={isBusy}
                            className="text-xs text-purple-600 hover:text-purple-800 font-medium disabled:opacity-50"
                          >
                            {isBusy ? 'Completing...' : 'Complete SSI'}
                          </button>
                        )}
                        {/* Post-event workflows (PEW-1..4) */}
                        {(evt.status === 'calendar_published' || evt.status === 'completed') && evt.templateId && (
                          <button
                            onClick={() => handleRunPostEvent(evt.id)}
                            disabled={isBusy}
                            className="text-xs text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-50"
                          >
                            {isBusy ? 'Running...' : 'Run Workflows'}
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
