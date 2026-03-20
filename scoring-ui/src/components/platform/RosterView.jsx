// ============================================================
// RosterView — Event staffing platform
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { getUpcomingStaffingApi, getMyStaffingAssignmentsApi, signupForEventStaffingApi, withdrawFromEventStaffingApi, backfillStaffingNeedsApi, updateEventStaffingNeedsApi, listTemplates } from '../../platform-api'
import { usePlatformT } from '../../platform-i18n.jsx'

// Filter tab definitions (labels resolved via i18n at render time)
const FILTER_KEYS = ['all', 'needStaff', 'staffed', 'myEvents']
const FILTER_LABEL_KEYS = {
  all: 'filterAll',
  needStaff: 'filterNeedStaff',
  staffed: 'filterStaffed',
  myEvents: 'filterMyEvents',
}

export default function RosterView({ tenantId, account, focusEventId, onFocusHandled }) {
  const { t } = usePlatformT()
  const [upcoming, setUpcoming] = useState([])
  const [myAssignments, setMyAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null) // ID of need or signup being processed
  const [backfillResult, setBackfillResult] = useState(null)
  const [signupModal, setSignupModal] = useState(null) // { eventId, eventName, roles[] } for role selection dialog
  const [templatePicker, setTemplatePicker] = useState(null) // { templates[], skippedCount } for unmatched events
  const [filter, setFilter] = useState(focusEventId ? 'needStaff' : 'all') // 'all' | 'needStaff' | 'staffed' | 'myEvents'
  const focusRef = useRef(null) // ref for the focused event card
  const pendingFocus = useRef(focusEventId || null)

  useEffect(() => {
    if (!tenantId) return
    loadData()
  }, [tenantId])

  // When focusEventId changes from parent (e.g. dashboard click), update filter + pending focus
  useEffect(() => {
    if (focusEventId) {
      setFilter('needStaff')
      pendingFocus.current = focusEventId
    }
  }, [focusEventId])

  // Scroll to focused event after data loads and DOM renders
  useEffect(() => {
    if (!loading && pendingFocus.current && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Clear after a brief highlight period
      const timer = setTimeout(() => {
        pendingFocus.current = null
        if (onFocusHandled) onFocusHandled()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [loading, filter])

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
      setError(err.message || t('loadingStaffing'))
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
      alert(`${t('signupFailed')}: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleWithdraw(eventId, signupId) {
    if (!window.confirm(t('withdrawConfirm'))) return
    
    try {
      setActionLoading(signupId)
      await withdrawFromEventStaffingApi(tenantId, eventId, signupId)
      await loadData() // Refresh everything
    } catch (err) {
      alert(`${t('withdrawalFailed')}: ${err.message}`)
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
  async function handleBackfill(defaultTemplateId) {
    if (!defaultTemplateId && !window.confirm(t('populateFromTemplatesTitle') + '?')) return
    try {
      setActionLoading('backfill')
      setTemplatePicker(null)
      const result = await backfillStaffingNeedsApi(tenantId, { defaultTemplateId })
      setBackfillResult(result)
      // If events were skipped and no default template was used, offer template picker
      if (result.skippedCount > 0 && !defaultTemplateId) {
        try {
          const resp = await listTemplates(tenantId)
          const templates = resp.templates || resp
          const withRoles = templates.filter(t => t.staffingRules?.roles?.length > 0)
          if (withRoles.length > 0) {
            setTemplatePicker({ templates: withRoles, skippedCount: result.skippedCount })
          }
        } catch (_) { /* ignore template fetch errors */ }
      }
      await loadData() // Refresh
    } catch (err) {
      if (err.message?.includes('403') || err.message?.includes('Forbidden')) {
        alert(t('backfillPermissionDenied'))
      } else {
        alert(`${t('backfillFailed')}: ${err.message}`)
      }
    } finally {
      setActionLoading(null)
    }
  }

  // Filter out events that don't have staffing needs configured
  const eventsWithNeeds = upcoming.filter(e => e.needs && e.needs.length > 0)

  // Build a set of event IDs where the current user has signed up
  const myEventIds = new Set(myAssignments.map(a => a.event?.id).filter(Boolean))

  // Apply filter to events list
  const filteredEvents = eventsWithNeeds.filter(({ event, isUnderstaffed }) => {
    if (filter === 'needStaff') return isUnderstaffed
    if (filter === 'staffed') return !isUnderstaffed
    if (filter === 'myEvents') return myEventIds.has(event.id)
    return true
  })

  // Count badges for each filter
  const filterCounts = {
    all: eventsWithNeeds.length,
    needStaff: eventsWithNeeds.filter(e => e.isUnderstaffed).length,
    staffed: eventsWithNeeds.filter(e => !e.isUnderstaffed).length,
    myEvents: eventsWithNeeds.filter(e => myEventIds.has(e.event.id)).length,
  }

  if (loading) {
    return <div className="text-gray-500 p-8 text-center animate-pulse">{t('loadingStaffing')}</div>
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
    <div className="space-y-6">
      {/* Header + Backfill action */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('eventStaffing')}</h1>
          <p className="text-sm text-gray-500">
            {t('eventStaffingDesc')}
          </p>
        </div>
        <button
          onClick={() => handleBackfill()}
          disabled={actionLoading === 'backfill'}
          className="flex-shrink-0 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded font-medium disabled:opacity-50 transition-colors"
          title={t('populateFromTemplatesTitle')}
        >
          {actionLoading === 'backfill' ? t('running') : t('populateFromTemplates')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      {eventsWithNeeds.length > 0 && (
        <div className="flex gap-1 border-b border-gray-200">
          {FILTER_KEYS.map(fKey => {
            const count = filterCounts[fKey]
            const active = filter === fKey
            return (
              <button
                key={fKey}
                onClick={() => setFilter(fKey)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t(FILTER_LABEL_KEYS[fKey])}
                {count > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Unified events list */}
      <div>

        {backfillResult && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-800 rounded-md text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {t('backfillComplete')}: {backfillResult.backfilledCount} {t('populated').toLowerCase()}{backfillResult.skippedCount > 0 ? `, ${backfillResult.skippedCount} ${t('skipped').toLowerCase()}` : ''}
                {backfillResult.errors?.length > 0 && <span className="text-red-600 ml-2">({backfillResult.errors.length} errors)</span>}
              </span>
              <button onClick={() => { setBackfillResult(null); setTemplatePicker(null) }} className="text-blue-600 underline text-xs">{t('dismiss')}</button>
            </div>
            {backfillResult.populated?.length > 0 && (
              <div className="text-xs">
                <span className="font-medium text-green-700">{t('populated')}:</span>
                {backfillResult.populated.map((e, i) => (
                  <span key={i} className="ml-1 inline-block bg-green-100 text-green-800 px-1.5 py-0.5 rounded mr-1 mb-0.5">
                    {e.name} ({e.date}) — {e.roles} roles via {e.template}
                  </span>
                ))}
              </div>
            )}
            {backfillResult.skipped?.length > 0 && (
              <div className="text-xs">
                <span className="font-medium text-amber-700">{t('skipped')}:</span>
                {backfillResult.skipped.map((e, i) => (
                  <span key={i} className="ml-1 inline-block bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded mr-1 mb-0.5">
                    {e.name} ({e.date}) — {e.reason}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Template picker for unmatched events */}
        {templatePicker && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm font-medium text-amber-800 mb-2">
              {t('unmatchedEventsPrompt', templatePicker.skippedCount)}
            </p>
            <div className="flex flex-wrap gap-2">
              {templatePicker.templates.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => handleBackfill(tpl.id)}
                  disabled={actionLoading === 'backfill'}
                  className="px-3 py-1.5 bg-white border border-amber-300 rounded text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                >
                  {tpl.name} ({tpl.staffingRules.roles.length} roles)
                </button>
              ))}
            </div>
            <button onClick={() => setTemplatePicker(null)} className="mt-2 text-xs text-amber-600 underline">{t('dismiss')}</button>
          </div>
        )}
        
        {eventsWithNeeds.length === 0 ? (
          <div className="bg-white rounded-lg border shadow-sm p-8 text-center">
            <p className="text-sm text-gray-500">{t('noStaffingNeeds')}</p>
            <p className="text-xs text-gray-400 mt-2">{t('noStaffingNeedsHint')}</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white rounded-lg border shadow-sm p-8 text-center">
            <p className="text-sm text-gray-500">{t('noEventsMatchFilter')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEvents.map(({ event, needs, isUnderstaffed }) => {
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

              const isFocused = pendingFocus.current === event.id

              return (
                <div
                  key={event.id}
                  ref={isFocused ? focusRef : undefined}
                  className={`bg-white rounded-lg shadow-sm border overflow-hidden transition-all duration-700 ${isUnderstaffed ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-green-400'} ${isFocused ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
                >
                  {/* Event header */}
                  <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-base text-gray-900">{event.eventName}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                          <span>{formatDate(event.eventDate)}</span>
                          {event.disciplineName && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span>{event.disciplineName}</span>
                            </>
                          )}
                          {event.matchCount && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span>{event.matchCount} {event.matchCount === 1 ? t('match') : t('matches')}</span>
                            </>
                          )}
                        </div>
                        {event.venue && (
                          <div className="text-xs text-gray-400 mt-1">{event.venue}</div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        {isUnderstaffed ? (
                          <span className="inline-flex items-center bg-orange-50 text-orange-600 text-xs font-medium px-2 py-0.5 rounded border border-orange-200">
                            {t('needsStaff')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center bg-green-50 text-green-700 text-xs font-medium px-2 py-0.5 rounded border border-green-200">
                            {t('staffed')}
                          </span>
                        )}
                        <div className="text-xs text-gray-400 mt-1">
                          {t('staff')}: {summary.filled}/{summary.min}
                        </div>
                      </div>
                    </div>
                    {event.createdBy && (
                      <div className="text-[11px] text-gray-400 mt-1">{t('scheduledBy')} {event.createdBy}</div>
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
                                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">{t('you').replace(/[()]/g, '')}</span>
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
                                  ({need.minCount - assignedCount} {t('needed')})
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
                              <span className="text-xs text-green-600 font-medium">{t('signedUp')}</span>
                            )}
                            {!isAssigned && isFull && (
                              <span className="text-xs text-gray-400 italic">{t('full')}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Sign Up / Withdraw footer */}
                  <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-t">
                    <div className="text-xs text-gray-400">
                      {daysUntil <= 0 ? t('today') : daysUntil === 1 ? t('tomorrow') : t('inDays', daysUntil)}
                    </div>
                    <div className="flex items-center gap-3">
                      {mySignupIds.length > 0 && (() => {
                        // Find the user's signup to enable withdraw
                        const mySignup = myAssignments.find(a => a.event?.id === event.id)
                        return mySignup ? (
                          <button
                            onClick={() => handleWithdraw(event.id, mySignup.signup.id)}
                            disabled={actionLoading === mySignup.signup.id}
                            className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                          >
                            {actionLoading === mySignup.signup.id ? t('withdrawing') : t('withdraw')}
                          </button>
                        ) : (
                          <span className="text-xs text-green-600 font-medium">{t('signedUp')}</span>
                        )
                      })()}
                      {availableRoles.length > 0 ? (
                        <button
                          onClick={() => setSignupModal({ eventId: event.id, eventName: event.eventName, roles: availableRoles })}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 shadow-sm transition-colors"
                        >
                          {t('signUp')}
                        </button>
                      ) : mySignupIds.length === 0 ? (
                        <span className="text-xs text-gray-400 italic">{t('allRolesFilled')}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* My role summary (shown in 'My Events' filter when user has assignments) */}
      {filter === 'myEvents' && myAssignments.length > 0 && (
        <div className="text-xs text-gray-400 text-center pt-2">
          {t('signedUpForEvents', myAssignments.length)}
        </div>
      )}

      {/* Role Selection Modal */}
      {signupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSignupModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b">
              <h3 className="text-lg font-bold text-gray-900">{t('chooseRole')}</h3>
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
                      <div className="text-xs text-gray-500 mt-0.5">{filled}/{role.maxCount} {t('positionsFilled')}</div>
                    </div>
                    <div className="text-blue-600 text-sm font-medium">{t('select')}</div>
                  </button>
                )
              })}
            </div>
            <div className="p-4 border-t">
              <button
                onClick={() => setSignupModal(null)}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
