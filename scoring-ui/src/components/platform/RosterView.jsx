// ============================================================
// RosterView — Event staffing platform
// ============================================================
import { useState, useEffect } from 'react'
import { getUpcomingStaffingApi, getMyStaffingAssignmentsApi, signupForEventStaffingApi, withdrawFromEventStaffingApi, backfillStaffingNeedsApi, updateEventStaffingNeedsApi } from '../../platform-api'

export default function RosterView({ tenantId, account }) {
  const [upcoming, setUpcoming] = useState([])
  const [myAssignments, setMyAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null) // ID of need or signup being processed
  const [backfillResult, setBackfillResult] = useState(null)
  const [editingEvent, setEditingEvent] = useState(null) // { eventId, needs[] } for inline editor

  useEffect(() => {
    if (!tenantId) return
    loadData()
  }, [tenantId])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const [upcomingData, assignmentsData] = await Promise.all([
        getUpcomingStaffingApi(tenantId),
        getMyStaffingAssignmentsApi(tenantId)
      ])
      setUpcoming(upcomingData)
      setMyAssignments(assignmentsData)
    } catch (err) {
      setError(err.message || 'Failed to load staffing data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignup(eventId, needId) {
    try {
      setActionLoading(needId)
      await signupForEventStaffingApi(tenantId, eventId, needId)
      await loadData() // Refresh everything
    } catch (err) {
      alert(`Signup failed: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleWithdraw(eventId, signupId) {
    if (!window.confirm('Are you sure you want to withdraw from this event?')) return
    
    try {
      setActionLoading(signupId)
      await withdrawFromEventStaffingApi(tenantId, eventId, signupId)
      await loadData() // Refresh everything
    } catch (err) {
      alert(`Withdrawal failed: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  // Helper to format dates
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString(undefined, { 
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
    })
  }

  // Backfill staffing needs from templates (admin action)
  async function handleBackfill() {
    if (!window.confirm('Populate staffing needs for all upcoming events from their templates? This only affects events that don\'t already have staffing needs.')) return
    try {
      setActionLoading('backfill')
      const result = await backfillStaffingNeedsApi(tenantId)
      setBackfillResult(result)
      await loadData() // Refresh
    } catch (err) {
      if (err.message?.includes('403') || err.message?.includes('Forbidden')) {
        alert('Only owners and tenant admins can run backfill.')
      } else {
        alert(`Backfill failed: ${err.message}`)
      }
    } finally {
      setActionLoading(null)
    }
  }

  // Save edited staffing needs for a specific event
  async function handleSaveNeeds(eventId, needs) {
    try {
      setActionLoading('save-needs')
      await updateEventStaffingNeedsApi(tenantId, eventId, needs)
      setEditingEvent(null)
      await loadData()
    } catch (err) {
      alert(`Failed to update staffing needs: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  // Filter out events that don't have staffing needs configured
  const eventsWithNeeds = upcoming.filter(e => e.needs && e.needs.length > 0)

  if (loading) {
    return <div className="text-gray-500 p-8 text-center animate-pulse">Loading staffing data...</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Staffing</h1>
        <p className="text-sm text-gray-500">
          Sign up to staff upcoming events. Members with the instructor role are encouraged to volunteer.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* My Assignments Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <span className="mr-2">📅</span> My Commitments
          <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            {myAssignments.length}
          </span>
        </h2>
        
        {myAssignments.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">You haven't signed up for any upcoming events.</p>
        ) : (
          <div className="divide-y">
            {myAssignments.map(({ signup, event }) => {
              // Calculate days until event
              const daysUntil = Math.ceil((new Date(event.eventDate) - new Date()) / (1000 * 60 * 60 * 24))
              const isUrgent = daysUntil <= 3
              
              return (
                <div key={signup.id} className="py-4 flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-gray-900">{event.eventName}</h3>
                    <div className="text-sm text-gray-500 flex gap-4 mt-1">
                      <span>{formatDate(event.eventDate)}</span>
                      <span className={`font-medium ${isUrgent ? 'text-orange-600' : ''}`}>
                        In {daysUntil} days
                      </span>
                    </div>
                    <div className="mt-2 text-sm">
                      Role: <span className="font-semibold text-blue-700">{signup.roleLabel}</span>
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => handleWithdraw(event.id, signup.id)}
                      disabled={actionLoading === signup.id}
                      className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                    >
                      {actionLoading === signup.id ? 'Withdrawing...' : 'Withdraw'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upcoming Events Needing Staff */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Events Needing Staff</h2>
          <button
            onClick={handleBackfill}
            disabled={actionLoading === 'backfill'}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded font-medium disabled:opacity-50 transition-colors"
            title="Populate staffing needs for events from their templates"
          >
            {actionLoading === 'backfill' ? 'Running...' : 'Populate from Templates'}
          </button>
        </div>

        {backfillResult && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-800 rounded-md text-sm">
            Backfill complete: {backfillResult.backfilledCount} events populated, {backfillResult.skippedCount} skipped (no template rules).
            {backfillResult.errors?.length > 0 && <span className="text-red-600 ml-2">{backfillResult.errors.length} errors</span>}
            <button onClick={() => setBackfillResult(null)} className="ml-2 text-blue-600 underline text-xs">Dismiss</button>
          </div>
        )}
        
        {eventsWithNeeds.length === 0 ? (
          <div className="bg-white rounded-lg border shadow-sm p-8 text-center">
            <p className="text-sm text-gray-500">No upcoming events have staffing needs configured.</p>
            <p className="text-xs text-gray-400 mt-2">Click "Populate from Templates" above to add staffing needs to existing events, or create new events from templates with staffing rules.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {eventsWithNeeds.map(({ event, disciplineName, needs, isUnderstaffed }) => {
              // Collect all signups from all needs into a flat list for this event
              const allSignups = needs.flatMap(n => (n.signups || []).map(s => ({ ...s, needId: n.id })))
              // Does this user have any active signups for this event?
              const mySignupIds = allSignups.filter(s => s.accountId === account?.id).map(s => s.needId)
              
              return (
                <div key={event.id} className={`bg-white rounded-lg shadow-sm border p-6 ${isUnderstaffed ? 'border-orange-200' : ''}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900">{event.eventName}</h3>
                      <p className="text-sm text-gray-500">{formatDate(event.eventDate)}</p>
                    </div>
                    {disciplineName && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {disciplineName}
                      </span>
                    )}
                  </div>

                  {isUnderstaffed && (
                    <div className="text-xs text-orange-600 font-medium mb-4 flex items-center bg-orange-50 px-2 py-1 rounded w-fit">
                      <span className="mr-1">⚠️</span> Needs more staff to run
                    </div>
                  )}

                  <div className="space-y-4">
                    {needs.map(need => {
                      const assignedCount = (need.signups || []).length
                      const isFull = assignedCount >= need.maxCount
                      const isAssigned = mySignupIds.includes(need.id)
                      const needsMore = assignedCount < need.minCount
                      
                      return (
                        <div key={need.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="mb-2 sm:mb-0">
                            <div className="font-medium text-sm text-gray-900">
                              {need.roleLabel}
                              {isAssigned && <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">You're assigned</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {assignedCount} / {need.minCount === need.maxCount ? need.minCount : `${need.minCount}-${need.maxCount}`} filled
                              {needsMore && <span className="ml-1 text-orange-600">(Needs {need.minCount - assignedCount} more)</span>}
                            </div>
                            {/* Progress bar */}
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2 overflow-hidden">
                              <div 
                                className={`h-1.5 rounded-full ${needsMore ? 'bg-orange-400' : 'bg-green-500'}`} 
                                style={{ width: `${Math.min(100, (assignedCount / need.maxCount) * 100)}%` }}
                              ></div>
                            </div>
                          </div>
                          
                          <div className="flex-shrink-0">
                            {!isAssigned && !isFull && (
                              <button
                                onClick={() => handleSignup(event.id, need.id)}
                                disabled={actionLoading === need.id}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                              >
                                {actionLoading === need.id ? 'Signing up...' : 'Sign Up'}
                              </button>
                            )}
                            {!isAssigned && isFull && (
                              <span className="text-xs text-gray-500 italic bg-gray-100 px-2 py-1 rounded">Full</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
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
