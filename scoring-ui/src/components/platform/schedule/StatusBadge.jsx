// ============================================================
// StatusBadge — status chip + shared constants for SchedulePage
// ============================================================

import { usePlatformT } from '../../../platform-i18n.jsx'

export const STATUS_COLORS = {
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
export const STATUS_LABEL_KEYS = {
  planned: 'statusLabelPlanned',
  ssi_created: 'statusLabelSsiCreated',
  calendar_published: 'statusLabelCalendarPublished',
  staffed: 'statusLabelStaffed',
  ready: 'statusLabelReady',
  completed: 'statusLabelCompleted',
  cancelled: 'statusLabelCancelled',
  failed: 'statusLabelFailed',
}

// Keep static labels for non-React contexts (backward compat)
export const STATUS_LABELS = {
  planned: 'Planned',
  ssi_created: 'SSI Created',
  calendar_published: 'Published',
  staffed: 'Staffed',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

// Which statuses allow cancellation (soft cancel keeps DB record)
export const CANCELLABLE_STATUSES = new Set(['planned', 'ssi_created', 'calendar_published', 'staffed', 'ready'])

export function formatEventDate(dateStr) {
  if (!dateStr) return '—'
  // Handle both YYYY-MM-DD strings and ISO timestamps from API
  // PostgreSQL DATE serializes as '2026-03-04T00:00:00.000Z' in JSON
  let isoDate = dateStr
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    isoDate = dateStr + 'T12:00:00Z' // noon UTC to avoid DST edge
  }
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return 'Invalid Date'
  return d.toLocaleDateString('fi-FI', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function StatusBadge({ status }) {
  const { t } = usePlatformT()
  const labelKey = STATUS_LABEL_KEYS[status]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
      {labelKey ? t(labelKey) : status}
    </span>
  )
}
