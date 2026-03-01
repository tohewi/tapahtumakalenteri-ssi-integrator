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
  const [signupModal, setSignupModal] = useState(null) // { eventId, eventName, roles[] } for role selection dialog

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

  // Filter out events that don't have staffing needs configured
  const eventsWithNeeds = upcoming.filter(e => e.needs && e.needs.length > 0)

  if (loading) {
    return <div className="text-gray-500 p-8 text-center animate-pulse">Loading staffing data...</div>
  }

  // Total filled / total needed across all roles
  function getStaffingSummary(needs) {
    let filled = 0, min = 0, max = 0
    for (const n of needs) {
      filled += (n.signups || []).length
      min += n.minCount
      max += n.maxCount
    }
    return { filled, min, max }
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
          <div className="space-y-4">
            {eventsWithNeeds.map(({ event, needs, isUnderstaffed }) => {
              // Collect all signups from all needs for signup-status check
              const allSignups = needs.flatMap(n => (n.signups || []).map(s => ({ ...s, needId: n.id })))
              const mySignupIds = allSignups.filter(s => s.accountId === account?.id).map(s => s.needId)
              const summary = getStaffingSummary(needs)
              // Available roles (not full, not already signed up by me)
              const availableRoles = needs.filter(n => {
                const filled = (n.signups || []).length
                return filled < n.maxCount && !mySignupIds.includes(n.id)
              })
              const daysUntil = Math.ceil((new Date(event.eventDate) - new Date()) / (1000 * 60 * 60 * 24))

              return (
                <div key={event.id} className={`bg-white rounded-lg shadow-sm border overflow-hidden ${isUnderstaffed ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-green-400'}`}>
                  {/* Event header — dark banner like the reference UI */}
                  <div className="bg-gray-800 text-white px-5 py-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-base">{event.eventName}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-300 mt-1">
                          <span>{formatDate(event.eventDate)}</span>
                          {event.disciplineName && (
                            <>
                              <span className="text-gray-500">·</span>
                              <span>{event.disciplineName}</span>
                            </>
                          )}
                          {event.matchCount && (
                            <>
                              <span className="text-gray-500">·</span>
                              <span>{event.matchCount} {event.matchCount === 1 ? 'match' : 'matches'}</span>
                            </>
                          )}
                        </div>
                        {event.venue && (
                          <div className="text-xs text-gray-400 mt-1">{event.venue}</div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        {isUnderstaffed ? (
                          <span className="inline-flex items-center bg-orange-500/20 text-orange-300 text-xs font-medium px-2 py-0.5 rounded">
                            Needs staff
                          </span>
                        ) : (
                          <span className="inline-flex items-center bg-green-500/20 text-green-300 text-xs font-medium px-2 py-0.5 rounded">
                            Staffed
                          </span>
                        )}
                        <div className="text-xs text-gray-400 mt-1">
                          Staff: {summary.filled}/{summary.min}
                        </div>
                      </div>
                    </div>
                    {event.createdBy && (
                      <div className="text-[11px] text-gray-500 mt-1">Scheduled by {event.createdBy}</div>
                    )}
                  </div>

                  {/* Roles list */}
                  <div className="divide-y divide-gray-100">
                    {needs.map(need => {
                      const assignedCount = (need.signups || []).length
                      const isAssigned = mySignupIds.includes(need.id)
                      const needsMore = assignedCount < need.minCount
                      const isFull = assignedCount >= need.maxCount
                      
                      return (
                        <div key={need.id} className="px-5 py-3 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-gray-800">{need.roleLabel}</span>
                              {isAssigned && (
                                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">You</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {/* Compact progress bar */}
                              <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className={`h-1.5 rounded-full transition-all ${needsMore ? 'bg-orange-400' : 'bg-green-500'}`} 
                                  style={{ width: `${Math.min(100, (assignedCount / (need.maxCount || 1)) * 100)}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-500">
                                {assignedCount}/{need.maxCount}
                              </span>
                              {needsMore && (
                                <span className="text-xs text-orange-500 font-medium">
                                  ({need.minCount - assignedCount} needed)
                                </span>
                              )}
                            </div>
                            {/* Show who's signed up */}
                            {(need.signups || []).length > 0 && (
                              <div className="text-[11px] text-gray-400 mt-1">
                                {(need.signups || []).map(s => s.accountName).join(', ')}
                              </div>
                            )}
                          </div>

                          <div className="flex-shrink-0 ml-3">
                            {isAssigned && (
                              <span className="text-xs text-green-600 font-medium">Signed up</span>
                            )}
                            {!isAssigned && isFull && (
                              <span className="text-xs text-gray-400 italic">Full</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Sign Up / action footer */}
                  <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-t">
                    <div className="text-xs text-gray-400">
                      {daysUntil <= 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`}
                    </div>
                    {availableRoles.length > 0 ? (
                      <button
                        onClick={() => setSignupModal({ eventId: event.id, eventName: event.eventName, roles: availableRoles })}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 shadow-sm transition-colors"
                      >
                        Sign Up
                      </button>
                    ) : mySignupIds.length > 0 ? (
                      <span className="text-xs text-green-600 font-medium">You're signed up for this event</span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">All roles filled</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Role Selection Modal */}
      {signupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSignupModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b">
              <h3 className="text-lg font-bold text-gray-900">Choose a role</h3>
              <p className="text-sm text-gray-500 mt-0.5">{signupModal.eventName}</p>
            </div>
            <div className="divide-y">
              {signupModal.roles.map(role => {
                const filled = (role.signups || []).length
                return (
                  <button
                    key={role.id}
                    onClick={() => { handleSignup(signupModal.eventId, role.id); setSignupModal(null) }}
                    disabled={actionLoading === role.id}
                    className="w-full text-left px-5 py-4 hover:bg-blue-50 transition-colors flex items-center justify-between disabled:opacity-50"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{role.roleLabel}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{filled}/{role.maxCount} positions filled</div>
                    </div>
                    <div className="text-blue-600 text-sm font-medium">Select</div>
                  </button>
                )
              })}
            </div>
            <div className="p-4 border-t">
              <button
                onClick={() => setSignupModal(null)}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
