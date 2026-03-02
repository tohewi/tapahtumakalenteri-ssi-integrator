import { useState, useEffect } from 'react'
import { listEvents, getUpcomingStaffingApi, getStaffingLeaderboardApi } from '../../platform-api.js'

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
  const [staffingData, setStaffingData] = useState([]) // full understaffed event list
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [eventsData, rawStaffing, lbData] = await Promise.all([
          listEvents(tenantId),
          getUpcomingStaffingApi(tenantId).catch(() => []),
          getStaffingLeaderboardApi(tenantId, leaderboardPeriod).catch(() => [])
        ])
        
        setEvents(eventsData.events || [])
        
        // Store understaffed events with details
        if (Array.isArray(rawStaffing)) {
          setStaffingData(rawStaffing.filter(e => e.isUnderstaffed))
        }

        if (Array.isArray(lbData)) {
          setLeaderboard(lbData)
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [tenantId, leaderboardPeriod])

  // Calculate stats
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  
  const upcomingEvents = events.filter(e => {
    const d = new Date(e.eventDate)
    return d >= now && d <= thirtyDaysFromNow
  }).sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      
      {/* Staffing Gaps Summary */}
      <div className="bg-white rounded-lg border shadow-sm mb-8 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-800">Staffing Gaps</h2>
            {!loading && staffingData.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {staffingData.length} event{staffingData.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button onClick={() => onNavigate('roster')} className="text-sm text-sky-600 hover:text-sky-800">Go to Roster</button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">Loading staffing data...</div>
        ) : staffingData.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-green-600 font-medium">All events are fully staffed</p>
            <p className="text-xs text-gray-400 mt-1">No open roles for upcoming events.</p>
          </div>
        ) : (
          <div className="divide-y">
            {staffingData.map(({ event, needs }) => {
              // Summarize unfilled roles
              const gaps = needs
                .map(n => {
                  const filled = (n.signups || []).length
                  const remaining = n.minCount - filled
                  return remaining > 0 ? { role: n.roleLabel, remaining } : null
                })
                .filter(Boolean)
              const totalGaps = gaps.reduce((sum, g) => sum + g.remaining, 0)

              const d = new Date(event.eventDate)
              const dateStr = d.toLocaleDateString('fi-FI', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

              return (
                <div
                  key={event.id}
                  onClick={() => onNavigate('roster', { focusEventId: event.id })}
                  className="px-4 py-3 flex items-center justify-between hover:bg-amber-50/50 cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">
                      {event.eventName || 'Unnamed Event'}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{dateStr}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <div className="flex flex-wrap gap-1 justify-end">
                      {gaps.map(g => (
                        <span key={g.role} className="inline-flex items-center bg-amber-50 text-amber-700 text-[11px] font-medium px-2 py-0.5 rounded-full">
                          {g.role} <span className="ml-1 font-bold">×{g.remaining}</span>
                        </span>
                      ))}
                    </div>
                    <span className="text-amber-600 font-bold text-sm w-8 text-right">{totalGaps}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
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

      {/* Volunteer Activity Leaderboard */}
      <div className="bg-white rounded-lg border mb-6 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50/50">
          <h2 className="font-semibold text-gray-800">Volunteer Activity</h2>
          <select
            value={leaderboardPeriod}
            onChange={e => setLeaderboardPeriod(e.target.value)}
            className="text-sm border rounded px-2 py-1 text-gray-600 bg-white"
          >
            <option value="all">All time</option>
            <option value="12m">Last 12 months</option>
            <option value="6m">Last 6 months</option>
            <option value="3m">Last 3 months</option>
          </select>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
        ) : leaderboard.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500">No staffing activity yet.</p>
            <p className="text-xs text-gray-400 mt-1">Activity will appear here as members sign up for event roles.</p>
          </div>
        ) : (
          <div className="divide-y">
            {leaderboard.map((entry, idx) => {
              // Simple bar width based on max events staffed
              const maxEvents = leaderboard[0]?.eventsStaffed || 1
              const barPct = Math.round((entry.eventsStaffed / maxEvents) * 100)

              return (
                <div key={entry.accountId} className="px-4 py-3 flex items-center gap-3">
                  {/* Rank */}
                  <div className="w-8 text-center flex-shrink-0">
                    <span className={`text-sm font-bold ${idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-orange-400' : 'text-gray-300'}`}>
                      {idx + 1}
                    </span>
                  </div>
                  {/* Name + roles */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{entry.accountName}</div>
                    <div className="text-xs text-gray-400 truncate">{entry.roles.join(', ')}</div>
                  </div>
                  {/* Activity bar + count */}
                  <div className="w-32 flex-shrink-0 hidden sm:block">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 w-16">
                    <div className="text-sm font-bold text-gray-800">{entry.eventsStaffed}</div>
                    <div className="text-xs text-gray-400">events</div>
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
