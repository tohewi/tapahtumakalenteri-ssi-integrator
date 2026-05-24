export const REGISTRATION_ACTIVE_STATUSES = ['confirmed', 'manual_handled']
export const REGISTRATION_STATUS_VALUES = ['confirmed', 'waitlisted', 'cancelled', 'manual_handled']
export const SYNC_STATUS_VALUES = ['not_applicable', 'pending', 'syncing', 'synced', 'partial', 'failed', 'manual_needed']
export const SYNC_ATTEMPT_STATUS_VALUES = ['success', 'partial', 'failed']
export const SSI_ACCOUNT_VALUES = ['yes', 'no', 'unsure']

export function syncAttemptStatusFromResult(syncResult = {}) {
  if (syncResult.success) return 'success'
  if (syncResult.partial) return 'partial'
  return 'failed'
}
