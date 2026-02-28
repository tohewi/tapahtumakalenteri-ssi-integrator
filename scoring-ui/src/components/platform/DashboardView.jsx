import { useState, useEffect } from 'react'
import { listEvents } from '../../platform-api.js'

function getStatusBadge(status) {
  switch (status) {
    case 'ssi_created':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Ready</span>
    case 'planned':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Planned</span>
    case 'failed':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Failed</span>
    default:
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">{status}</span>
  }
}

export default function DashboardView({ tenantId, onNavigate }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const eventsData = await listEvents(tenantId)
        setEvents(eventsData.events || [])
      } catch (err) {
        console.error('Failed to load dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [tenantId])

  // Calculate stats
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  
  const upcomingEvents = events.filter(e => {
    const d = new Date(e.eventDate)
    return d >= now && d <= thirtyDaysFromNow
  }).sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))

  // Group active templates from events
  const activeTemplateIds = new Set(events.map(e => e.templateId))
  
  // Fake staffing gaps for mockup until staffing module is ready
  const staffingGaps = Math.max(0, Math.floor(upcomingEvents.length / 3))

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border p-4 shadow-sm">
          <div className="text-sm text-gray-500">Upcoming Events</div>
          <div className="text-3xl font-bold text-sky-700 mt-1">{loading ? '...' : upcomingEvents.length}</div>
          <div className="text-xs text-gray-400 mt-1">Next 30 days</div>
        </div>
        <div className="bg-white rounded-lg border p-4 shadow-sm">
          <div className="text-sm text-gray-500">Staffing Gaps</div>
          <div className="text-3xl font-bold text-amber-600 mt-1">{loading ? '...' : staffingGaps}</div>
          <div className="text-xs text-gray-400 mt-1">Events need instructors</div>
        </div>
        <div className="bg-white rounded-lg border p-4 shadow-sm">
          <div className="text-sm text-gray-500">Active Templates</div>
          <div className="text-3xl font-bold text-gray-700 mt-1">{loading ? '...' : activeTemplateIds.size}</div>
          <div className="text-xs text-gray-400 mt-1">In use by events</div>
        </div>
        <div className="bg-white rounded-lg border p-4 shadow-sm">
          <div className="text-sm text-gray-500">Instructors</div>
          <div className="text-3xl font-bold text-gray-700 mt-1">—</div>
          <div className="text-xs text-gray-400 mt-1">Active roster</div>
        </div>
      </div>

      {/* Upcoming Events List */}
      <div className="bg-white rounded-lg border mb-6 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50/50">
          <h2 className="font-semibold text-gray-800">Upcoming Events</h2>
          <button onClick={() => onNavigate('schedule')} className="text-sm text-sky-600 hover:text-sky-800">View all</button>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading events...</div>
        ) : upcomingEvents.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 mb-2">No upcoming events scheduled in the next 30 days.</p>
            <button onClick={() => onNavigate('schedule')} className="text-sm text-sky-600 font-medium hover:underline">Go to Schedule to create some</button>
          </div>
        ) : (
          <div className="divide-y">
            {upcomingEvents.slice(0, 5).map(evt => {
              const d = new Date(evt.eventDate)
              const month = d.toLocaleString('en-US', { month: 'short' })
              const day = d.getDate()
              const weekday = d.toLocaleString('fi-FI', { weekday: 'short' }).substring(0, 2)
              
              // Match count: from executed events (matches array) or imported metadata
              const matchCount = evt.ssiReferences?.matches?.length
                || evt.ssiReferences?.componentMatchCount
                || (evt.ssiReferences?.matches ? 0 : null)
                || 1

              return (
                <div key={evt.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => onNavigate('schedule')}>
                  <div className="w-14 flex-shrink-0 text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wide">{month}</div>
                    <div className="text-xl font-bold text-gray-800 leading-tight">{day}</div>
                    <div className="text-xs text-gray-400 capitalize">{weekday}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{evt.eventName || evt.ssiReferences?.name || 'Unnamed Event'}</div>
                    <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
                      <span>{matchCount} match{matchCount > 1 ? 'es' : ''}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {getStatusBadge(evt.status)}
                    <span className="text-xs text-gray-400 font-mono">{evt.ssiReferences?.cupId ? `#${evt.ssiReferences.cupId}` : evt.ssiReferences?.ssiEventId ? `#${evt.ssiReferences.ssiEventId}` : 'No SSI ID'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4 text-left cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all" onClick={() => onNavigate('templates')}>
          <div className="text-sky-600 font-semibold">+ New Template</div>
          <div className="text-sm text-gray-500 mt-1">Import from SSI seed event</div>
        </div>
        <div className="bg-white rounded-lg border p-4 text-left cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all" onClick={() => onNavigate('schedule')}>
          <div className="text-sky-600 font-semibold">+ Schedule Events</div>
          <div className="text-sm text-gray-500 mt-1">Batch create from template</div>
        </div>
        <div className="bg-white rounded-lg border p-4 text-left cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all" onClick={() => onNavigate('roster')}>
          <div className="text-sky-600 font-semibold">Instructor Roster</div>
          <div className="text-sm text-gray-500 mt-1">Manage instructors</div>
        </div>
      </div>
    </div>
  )
}
