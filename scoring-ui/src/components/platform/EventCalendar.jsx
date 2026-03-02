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

import { useState, useMemo } from 'react'

// ---- Status badge colors (shared with SchedulePage) ----
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

// Day names for header (Monday-first, Finnish convention)
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Month names for navigation
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

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
    days.push({ date: d, dateKey: toDateKey(d.toISOString()), isCurrentMonth: false })
  }

  // Days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month, d)
    days.push({ date: dt, dateKey: toDateKey(dt.toISOString()), isCurrentMonth: true })
  }

  // Trailing days to fill the last week row
  const remainder = days.length % 7
  if (remainder > 0) {
    const fill = 7 - remainder
    for (let i = 1; i <= fill; i++) {
      const d = new Date(year, month + 1, i)
      days.push({ date: d, dateKey: toDateKey(d.toISOString()), isCurrentMonth: false })
    }
  }

  return days
}

export default function EventCalendar({ events, staffingStatus, tplMap, onExecute, onDelete, executingId }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState(null) // 'YYYY-MM-DD' or null

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

  // Today's date key for highlighting
  const todayKey = toDateKey(today.toISOString())

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
            {MONTH_NAMES[viewMonth]} {viewYear}
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
          Today
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DAY_NAMES.map(day => (
            <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dayEvents = eventsByDate[day.dateKey] || []
            const isToday = day.dateKey === todayKey
            const isSelected = day.dateKey === selectedDay
            const hasEvents = dayEvents.length > 0

            return (
              <div
                key={i}
                onClick={() => setSelectedDay(day.dateKey === selectedDay ? null : day.dateKey)}
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
                      else if (evt.status === 'ssi_created' && staffing?.isUnderstaffed) dotColor = 'bg-orange-500'
                      else if (evt.status === 'ssi_created') dotColor = 'bg-blue-500'
                      else if (evt.status === 'calendar_published') dotColor = 'bg-green-500'
                      else if (evt.status === 'planned') dotColor = 'bg-gray-400'

                      return (
                        <div key={evt.id} className="flex items-center gap-1 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                          <span className="text-[10px] text-gray-600 truncate leading-tight">
                            {tplMap?.[evt.templateId]?.name || evt.eventName || 'Event'}
                          </span>
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-gray-400">+{dayEvents.length - 3} more</div>
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
        </div>
      </div>

      {/* Selected day detail panel */}
      {selectedDay && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm text-gray-900">
              {new Date(selectedDay + 'T12:00:00Z').toLocaleDateString('fi-FI', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              })}
            </h4>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ×
            </button>
          </div>

          {selectedEvents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">No events on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map(evt => {
                const tpl = tplMap?.[evt.templateId]
                const staffing = staffingStatus?.[evt.id]

                return (
                  <div key={evt.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 truncate">
                          {evt.eventName || tpl?.name || 'Event'}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[evt.status] || 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABELS[evt.status] || evt.status}
                        </span>
                        {staffing?.hasNeeds && (
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${staffing.isUnderstaffed ? 'bg-orange-500' : 'bg-green-500'}`}
                            title={staffing.isUnderstaffed ? 'Needs more staff' : 'Fully staffed'} />
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {tpl?.name || evt.templateId || 'Imported'}
                        {(evt.ssiReferences?.cupUrl || evt.ssiReferences?.url) && (
                          <span> • <a href={evt.ssiReferences.cupUrl || evt.ssiReferences.url} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">SSI</a></span>
                        )}
                      </div>
                      {evt.status === 'failed' && evt.errorDetails && (
                        <div className="text-xs text-red-500 mt-1">{evt.errorDetails}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {evt.status === 'planned' && (
                        <button
                          onClick={() => onExecute(evt.id)}
                          disabled={executingId === evt.id}
                          className="text-xs text-sky-600 hover:text-sky-800 font-medium disabled:opacity-50"
                        >
                          {executingId === evt.id ? 'Creating...' : 'Create in SSI'}
                        </button>
                      )}
                      {evt.status === 'failed' && (
                        <button
                          onClick={() => onExecute(evt.id)}
                          disabled={executingId === evt.id}
                          className="text-xs text-sky-600 hover:text-sky-800 font-medium disabled:opacity-50"
                        >
                          {executingId === evt.id ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(evt)}
                        disabled={executingId === evt.id}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                      >
                        {executingId === evt.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
