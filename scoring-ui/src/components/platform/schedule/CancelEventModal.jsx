// ============================================================
// CancelEventModal — Confirm soft-cancel with optional SSI removal (MP7)
// ============================================================

import { useState } from 'react'
import { formatEventDate } from './StatusBadge'

export default function CancelEventModal({ event, staffingStatus, tplMap, onConfirm, onClose }) {
  const [removeFromSsi, setRemoveFromSsi] = useState(event?.status === 'ssi_created')
  const [loading, setLoading] = useState(false)

  if (!event) return null

  const staffing = staffingStatus?.[event.id]
  const matchCount = event.ssiReferences?.matches?.length || 0
  const eventLabel = event.eventName || tplMap?.[event.templateId]?.name || 'Event'

  async function handleConfirm() {
    setLoading(true)
    await onConfirm(event, removeFromSsi)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Cancel Event?</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {eventLabel} &mdash; {formatEventDate(event.eventDate)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-4">×</button>
        </div>

        {/* Impact summary */}
        <div className="space-y-2">
          {event.status === 'ssi_created' && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>
                This event exists in SSI ({matchCount > 0 ? `Cup + ${matchCount} match${matchCount !== 1 ? 'es' : ''}` : 'event'}).
                {' '}Cancelling will keep the platform record but the SSI event will remain unless you check the option below.
              </span>
            </div>
          )}
          {staffing?.hasNeeds && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>This event has staff members signed up. They will not be automatically notified.</span>
            </div>
          )}
        </div>

        {/* SSI removal option */}
        {event.status === 'ssi_created' && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={removeFromSsi}
              onChange={e => setRemoveFromSsi(e.target.checked)}
              className="rounded border-gray-300 text-sky-600 focus:ring-sky-200"
            />
            <span className="text-sm text-gray-700">Also remove this event from SSI</span>
          </label>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Keep Event
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-md bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? 'Cancelling...' : 'Cancel Event'}
          </button>
        </div>
      </div>
    </div>
  )
}
