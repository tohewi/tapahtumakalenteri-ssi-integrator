import { useState } from 'react'
import t from '../i18n'
import { staffFinalize } from '../staffing-api'

export default function StaffStatusBoard({ event, isAdmin, onUpdate }) {
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState(null)

  const signups = event.staffSignups || []
  const roles = event.roleAssignments || {}

  async function handleFinalize() {
    if (!confirm(t.finalize + '?')) return
    try {
      setFinalizing(true)
      setError(null)
      await staffFinalize(event.eventId)
      onUpdate()
    } catch (err) {
      setError(err.message)
    } finally {
      setFinalizing(false)
    }
  }

  const statusColors = {
    confirmed: 'bg-green-100 text-green-700',
    queued: 'bg-yellow-100 text-yellow-700',
    overflow: 'bg-orange-100 text-orange-700',
  }

  const statusLabels = {
    confirmed: t.staffConfirmed,
    queued: t.staffQueued,
    overflow: t.staffOverflow,
  }

  const roleLabels = {
    leadInstructor: t.leadInstructor,
    equipmentManager: t.equipmentManager,
    staff: t.instructor,
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{t.staffList}</h3>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{signups.length}/{event.staffPositions}</span>
          {isAdmin && event.status === 'open' && (
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="text-xs bg-blue-500 text-white px-3 py-1 rounded-full active:bg-blue-600 disabled:opacity-50"
            >
              {finalizing ? '...' : t.finalize}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">{error}</div>
      )}

      {/* Role assignments (shown after finalization) */}
      {event.status === 'finalized' && Object.keys(roles).length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-1">
          {Object.entries(roles).map(([roleKey, ra]) => (
            <div key={roleKey} className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                {roleLabels[roleKey] || roleKey}
              </span>
              <span className="text-gray-700">
                {ra.userName || '—'}
              </span>
              {ra.method && (
                <span className="text-xs text-gray-400">({ra.method})</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Staff list */}
      {signups.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-400 text-sm">{t.noStaffSignups}</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {signups.map((s, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              {/* Queue position */}
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500 shrink-0">
                {s.queuePosition}
              </div>

              {/* Name + role */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">
                  {s.userName}
                </div>
                {s.assignedRole && s.assignedRole !== 'staff' && (
                  <div className="text-xs text-purple-600">
                    {roleLabels[s.assignedRole] || s.assignedRole}
                  </div>
                )}
                {s.rolePreference && !s.assignedRole && (
                  <div className="text-xs text-gray-400">
                    {t.rolePreference}: {roleLabels[s.rolePreference] || s.rolePreference}
                  </div>
                )}
              </div>

              {/* Status badge */}
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusColors[s.status] || 'bg-gray-100 text-gray-500'}`}>
                {statusLabels[s.status] || s.status}
              </span>

              {/* Overflow squad info */}
              {s.status === 'overflow' && s.assignedSquad && (
                <span className="text-xs text-gray-400">
                  → Squad {s.assignedSquad}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Event info footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-500">
        <span>{t.shooterCount}: {event.shooterCount}</span>
        <span>{t.activeSquads}: {event.activeSquadCount}</span>
        <span>
          {event.status === 'open'
            ? `${t.registrationClosesIn.replace('{time}', new Date(event.registrationClose).toLocaleString('fi-FI'))}`
            : event.status === 'finalized'
            ? t.eventFinalized
            : t.registrationClosed}
        </span>
      </div>
    </div>
  )
}
