import { useState, useEffect } from 'react'
import { AppHeader } from './shared'
import t from '../i18n'
import { fetchStaffingEvents } from '../staffing-api'
import StaffSignupPanel from './StaffSignupPanel'
import StaffStatusBoard from './StaffStatusBoard'

export default function StaffingPage() {
  const [events, setEvents] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)

  async function loadEvents() {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchStaffingEvents()
      setEvents(data.events || [])
      setIsAdmin(data.isAdmin || false)
    } catch (err) {
      if (err.sessionExpired) {
        window.location.hash = '#/'
        return
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadEvents() }, [])

  const selectedEvent = events.find(e => e.eventId === selectedEventId)

  if (selectedEvent) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader
          title={selectedEvent.eventName}
          subtitle={selectedEvent.trainingTypeLabel?.fi || selectedEvent.trainingType}
          onBack={() => setSelectedEventId(null)}
        />
        <div className="p-4 space-y-4">
          <StaffSignupPanel
            event={selectedEvent}
            isAdmin={isAdmin}
            onUpdate={loadEvents}
          />
          <StaffStatusBoard
            event={selectedEvent}
            isAdmin={isAdmin}
            onUpdate={loadEvents}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={t.staffingTitle}
        subtitle="Temppelivuori SRA"
        onBack={() => { window.location.hash = '#/' }}
      />

      <div className="p-4 space-y-3">
        {loading && (
          <div className="text-center py-8 text-gray-500">{t.loading}</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="text-center py-8 text-gray-400">{t.noUpcomingEvents}</div>
        )}

        {events.map(evt => (
          <EventCard
            key={evt.eventId}
            event={evt}
            isAdmin={isAdmin}
            onSelect={() => setSelectedEventId(evt.eventId)}
          />
        ))}
      </div>
    </div>
  )
}

function EventCard({ event, isAdmin, onSelect }) {
  const date = new Date(event.eventDate)
  const dateStr = date.toLocaleDateString('fi-FI', {
    weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric'
  })
  const signupCount = event.staffSignups?.length || 0

  const statusColors = {
    open: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700' },
    closed: { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700' },
    finalized: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  }
  const colors = statusColors[event.status] || statusColors.open

  const statusLabel = event.status === 'open' ? t.staffSignup
    : event.status === 'finalized' ? t.eventFinalized
    : t.registrationClosed

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border ${colors.border} ${colors.bg} active:opacity-80 transition-opacity`}
    >
      <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-white border border-orange-200 text-orange-600">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-800">{event.eventName}</div>
        <div className="text-sm text-gray-500 mt-0.5">{dateStr}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>{statusLabel}</span>
          <span className="text-xs text-gray-400">
            {t.shooterCount}: {event.shooterCount} · {t.staffList}: {signupCount}/{event.staffPositions}
          </span>
        </div>
      </div>
      <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
