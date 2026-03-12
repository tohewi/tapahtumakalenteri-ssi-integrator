// ============================================================
// EventCalendar — Monthly calendar view for scheduled events
//
// Props:
//   events       - Array of event objects with eventDate, status, eventName, etc.
//   staffingStatus - Map of eventId → { isUnderstaffed, hasNeeds }
//   tplMap       - Map of templateId → template object
//   onExecute    - (eventId) => void
//   onDelete     - (event) => void
//   executingId  - Currently executing event ID (for loading state)
// ============================================================

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { usePlatformT } from '../../platform-i18n.jsx'

// ---- Status badge colors (shared with SchedulePage) ----
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

// Status label i18n key map
const STATUS_LABEL_KEYS = {
  planned: 'statusLabelPlanned',
  ssi_created: 'statusLabelSsiCreated',
  calendar_published: 'statusLabelCalendarPublished',
  staffed: 'statusLabelStaffed',
  ready: 'statusLabelReady',
  completed: 'statusLabelCompleted',
  cancelled: 'statusLabelCancelled',
  failed: 'statusLabelFailed',
}

// Which statuses allow cancellation
const CANCELLABLE_STATUSES = new Set(['planned', 'ssi_created', 'calendar_published', 'staffed', 'ready'])

// Day names and month names are now resolved via i18n at render time

/**
 * Format a local Date object as 'YYYY-MM-DD' using local (not UTC) components.
 * Used by the calendar grid to avoid timezone-shift off-by-one errors.
 */
function localDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Parse an event date string into a YYYY-MM-DD key for grouping.
 * Handles both 'YYYY-MM-DD' and ISO timestamp formats.
 */
function toDateKey(dateStr) {
  if (!dateStr) return null
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr
  }
  // ISO timestamp — extract date part in UTC
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

/**
 * Get all days for the calendar grid of a given month.
 * Returns array of { date: Date, dateKey: 'YYYY-MM-DD', isCurrentMonth: boolean }
 * Grid starts on Monday and includes leading/trailing days from adjacent months.
 */
function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday = 0, Sunday = 6 (convert from JS where Sunday = 0)
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6 // Sunday wraps to 6

  const days = []

  // Leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, dateKey: localDateKey(d), isCurrentMonth: false })
  }

  // Days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month, d)
    days.push({ date: dt, dateKey: localDateKey(dt), isCurrentMonth: true })
  }

  // Trailing days to fill the last week row
  const remainder = days.length % 7
  if (remainder > 0) {
    const fill = 7 - remainder
    for (let i = 1; i <= fill; i++) {
      const d = new Date(year, month + 1, i)
      days.push({ date: d, dateKey: localDateKey(d), isCurrentMonth: false })
    }
  }

  return days
}

export default function EventCalendar({ events, staffingStatus, tplMap, onExecute, onDelete, onCancel, onPublishCalendar, onUpdateCalendarStats, onCompleteSsiEvent, executingId }) {
  const { t } = usePlatformT()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState(null) // 'YYYY-MM-DD' or null
  const [popoverPos, setPopoverPos] = useState(null) // { top, left } for positioning
  const popoverRef = useRef(null)
  const gridRef = useRef(null)

  // Group events by date key
  const eventsByDate = useMemo(() => {
    const map = {}
    for (const evt of events) {
      const key = toDateKey(evt.eventDate)
      if (!key) continue
      if (!map[key]) map[key] = []
      map[key].push(evt)
    }
    return map
  }, [events])

  // Calendar grid for current view
  const calendarDays = useMemo(() => getCalendarDays(viewYear, viewMonth), [viewYear, viewMonth])

  // Today's date key for highlighting (use local date to avoid timezone shift)
  const todayKey = localDateKey(today)

  // Navigation handlers
  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
    setSelectedDay(null)
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
    setSelectedDay(null)
  }

  function goToToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelectedDay(null)
  }

  // Events for the selected day
  const selectedEvents = selectedDay ? (eventsByDate[selectedDay] || []) : []

  // Handle day cell click — compute popover position relative to the grid
  const handleDayClick = useCallback((dateKey, cellEl) => {
    if (dateKey === selectedDay) {
      setSelectedDay(null)
      setPopoverPos(null)
      return
    }
    setSelectedDay(dateKey)
    if (cellEl && gridRef.current) {
      const gridRect = gridRef.current.getBoundingClientRect()
      const cellRect = cellEl.getBoundingClientRect()
      // Position popover below the cell, centered horizontally
      let top = cellRect.bottom - gridRect.top + 8
      let left = cellRect.left - gridRect.left + cellRect.width / 2
      setPopoverPos({ top, left })
    }
  }, [selectedDay])

  // Close popover on outside click
  useEffect(() => {
    if (!selectedDay) return
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        // Check if click is on another day cell (let handleDayClick handle it)
        if (e.target.closest('[data-calendar-day]')) return
        setSelectedDay(null)
        setPopoverPos(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedDay])

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Previous month"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h3 className="text-lg font-semibold text-gray-900 min-w-[180px] text-center">
            {t('monthNames')[viewMonth]} {viewYear}
          </h3>
          <button
            onClick={goToNextMonth}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Next month"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <button
          onClick={goToToday}
          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-md font-medium transition-colors"
        >
          {t('today')}
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 rounded-t-lg overflow-hidden">
          {t('dayNamesShort').map(day => (
            <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div ref={gridRef} className="grid grid-cols-7 relative">
          {calendarDays.map((day, i) => {
            const dayEvents = eventsByDate[day.dateKey] || []
            const isToday = day.dateKey === todayKey
            const isSelected = day.dateKey === selectedDay
            const hasEvents = dayEvents.length > 0

            return (
              <div
                key={i}
                data-calendar-day={day.dateKey}
                onClick={(e) => handleDayClick(day.dateKey, e.currentTarget)}
                className={`
                  relative min-h-[72px] p-1.5 border-b border-r border-gray-100 cursor-pointer transition-colors
                  ${!day.isCurrentMonth ? 'bg-gray-50' : 'bg-white'}
                  ${isSelected ? 'ring-2 ring-inset ring-sky-400 bg-sky-50' : 'hover:bg-gray-50'}
                `}
              >
                {/* Day number */}
                <div className={`
                  text-xs font-medium mb-1
                  ${!day.isCurrentMonth ? 'text-gray-300' : isToday ? 'text-white' : 'text-gray-700'}
                `}>
                  <span className={`
                    inline-flex items-center justify-center w-6 h-6 rounded-full
                    ${isToday ? 'bg-sky-600' : ''}
                  `}>
                    {day.date.getDate()}
                  </span>
                </div>

                {/* Event dots / chips */}
                {hasEvents && day.isCurrentMonth && (
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map(evt => {
                      const staffing = staffingStatus?.[evt.id]
                      // Determine dot color: staffing takes priority for visual cue
                      let dotColor = 'bg-gray-400'
                      if (evt.status === 'failed') dotColor = 'bg-red-500'
                      else if (evt.status === 'cancelled') dotColor = 'bg-orange-300'
                      else if (evt.status === 'ssi_created' && staffing?.isUnderstaffed) dotColor = 'bg-orange-500'
                      else if (evt.status === 'ssi_created') dotColor = 'bg-blue-500'
                      else if (evt.status === 'calendar_published') dotColor = 'bg-green-500'
                      else if (evt.status === 'planned') dotColor = 'bg-gray-400'

                      return (
                        <div key={evt.id} className="flex items-center gap-1 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                          <span className="text-[10px] text-gray-600 truncate leading-tight">
                            {tplMap?.[evt.templateId]?.name || evt.eventName || t('event')}
                          </span>
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-gray-400">{t('moreEvents', dayEvents.length - 3)}</div>
                    )}
                  </div>
                )}

                {/* Event count badge for non-current month days */}
                {hasEvents && !day.isCurrentMonth && (
                  <div className="absolute bottom-1.5 right-1.5">
                    <span className="text-[10px] text-gray-400">{dayEvents.length}</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* Floating popover for selected day — inside the relative grid */}
          {selectedDay && popoverPos && (
            <div
              ref={popoverRef}
              className="absolute z-30 w-[340px] bg-white rounded-lg border border-gray-200 shadow-xl"
              style={{
                top: popoverPos.top,
                left: Math.max(8, Math.min(popoverPos.left - 170, (gridRef.current?.offsetWidth || 600) - 348)),
              }}
            >
              {/* Arrow */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-l border-t border-gray-200 rotate-45" />

              <div className="relative p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm text-gray-900">
                    {new Date(selectedDay + 'T12:00:00Z').toLocaleDateString('fi-FI', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    })}
                  </h4>
                  <button
                    onClick={() => { setSelectedDay(null); setPopoverPos(null) }}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>

                {selectedEvents.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">{t('noEventsOnDay')}</p>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {selectedEvents.map(evt => {
                      const tpl = tplMap?.[evt.templateId]
                      const staffing = staffingStatus?.[evt.id]

                      return (
                        <div key={evt.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-900">
                              {evt.eventName || tpl?.name || t('event')}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[evt.status] || 'bg-gray-100 text-gray-500'}`}>
                              {STATUS_LABEL_KEYS[evt.status] ? t(STATUS_LABEL_KEYS[evt.status]) : evt.status}
                            </span>
                            {staffing?.hasNeeds && (
                              <span className={`w-2 h-2 rounded-full shrink-0 ${staffing.isUnderstaffed ? 'bg-orange-500' : 'bg-green-500'}`}
                                title={staffing.isUnderstaffed ? t('needsMoreStaff') : t('fullyStaffed')} />
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {tpl?.name || evt.templateId || t('imported')}
                            {(evt.ssiReferences?.cupUrl || evt.ssiReferences?.url) && (
                              <span> • <a href={evt.ssiReferences.cupUrl || evt.ssiReferences.url} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline" onClick={e => e.stopPropagation()}>SSI</a></span>
                            )}
                            {evt.calendarReference?.eventUrl && (
                              <span> • <a href={evt.calendarReference.eventUrl} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline" onClick={e => e.stopPropagation()}>Calendar</a></span>
                            )}
                          </div>
                          {evt.calendarReference?.stats && (
                            <div className="text-xs text-gray-500 mt-1">
                              📊 {evt.calendarReference.stats.approvedCount} {t('participants')} · {evt.calendarReference.stats.shotsFired} {t('shots')}
                            </div>
                          )}
                          {evt.status === 'failed' && evt.errorDetails && (
                            <div className="text-xs text-red-500 mt-1">{evt.errorDetails}</div>
                          )}
                          {evt.calendarReference?.status === 'error' && (
                            <div className="text-xs text-amber-600 mt-1">Calendar: {evt.calendarReference.error || t('publishingFailed')}</div>
                          )}
                          {/* Actions */}
                          <div className="flex items-center gap-3 mt-2">
                            {evt.status === 'planned' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onExecute(evt.id) }}
                                disabled={executingId === evt.id}
                                className="text-xs text-sky-600 hover:text-sky-800 font-medium disabled:opacity-50"
                              >
                                {executingId === evt.id ? t('creatingSsi') : t('createInSsi')}
                              </button>
                            )}
                            {evt.status === 'failed' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onExecute(evt.id) }}
                                disabled={executingId === evt.id}
                                className="text-xs text-sky-600 hover:text-sky-800 font-medium disabled:opacity-50"
                              >
                                {executingId === evt.id ? t('retrying') : t('retry')}
                              </button>
                            )}
                            {evt.status === 'ssi_created' && !evt.calendarReference && onPublishCalendar && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onPublishCalendar(evt.id) }}
                                disabled={executingId === evt.id}
                                className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                              >
                                {executingId === evt.id ? t('publishing') : t('publishCalendar')}
                              </button>
                            )}
                            {evt.status === 'ssi_created' && evt.calendarReference?.status === 'error' && onPublishCalendar && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onPublishCalendar(evt.id) }}
                                disabled={executingId === evt.id}
                                className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                              >
                                {executingId === evt.id ? t('publishing') : t('retryCalendar')}
                              </button>
                            )}
                            {evt.status === 'calendar_published' && onPublishCalendar && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onPublishCalendar(evt.id, { force: true }) }}
                                disabled={executingId === evt.id}
                                className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                              >
                                {executingId === evt.id ? t('publishing') : t('republishCalendar')}
                              </button>
                            )}
                            {evt.status === 'calendar_published' && onUpdateCalendarStats && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onUpdateCalendarStats(evt.id) }}
                                disabled={executingId === evt.id}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                              >
                                {executingId === evt.id ? t('updating') : t('updateStats')}
                              </button>
                            )}
                            {(evt.status === 'ssi_created' || evt.status === 'calendar_published') && onCompleteSsiEvent && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onCompleteSsiEvent(evt.id) }}
                                disabled={executingId === evt.id}
                                className="text-xs text-purple-600 hover:text-purple-800 font-medium disabled:opacity-50"
                              >
                                {executingId === evt.id ? t('completing') : t('completeSsi')}
                              </button>
                            )}
                            {CANCELLABLE_STATUSES.has(evt.status) && onCancel && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onCancel(evt) }}
                                disabled={executingId === evt.id}
                                className="text-xs text-orange-500 hover:text-orange-700 font-medium disabled:opacity-50"
                              >
                                {t('cancelEvent')}
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); onDelete(evt) }}
                              disabled={executingId === evt.id}
                              className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                            >
                              {executingId === evt.id ? '...' : t('delete')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
