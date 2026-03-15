// ============================================================
// Integration Adapter Registry (INT-1 Phase 1)
//
// Factory functions that resolve the correct adapter for a tenant
// based on its integration configuration. Currently hardcoded to
// SSI + WordPress; Phase 4 will move to DB-backed catalog.
//
// Usage:
//   import { getEventAdapter, getCalendarAdapter } from './registry.js'
//   const eventAdapter = getEventAdapter(tenant)
//   const calendarAdapter = getCalendarAdapter(tenant)
// ============================================================

import { SsiEventAdapter } from './ssi-adapter.js'
import { NullEventAdapter, NullCalendarAdapter } from './null-adapters.js'
import { log } from '../logger.js'

// ---- Event System Registry ----

const EVENT_SYSTEM_TYPES = {
  ssi: {
    name: 'ShootNScoreIt',
    createAdapter: (credentials) => new SsiEventAdapter(credentials),
  },
}

// ---- Calendar System Registry ----
// Phase 2 will add WpCalendarAdapter here

const CALENDAR_SYSTEM_TYPES = {
  // wordpress: {
  //   name: 'WordPress / Tapahtumakalenteri',
  //   createAdapter: (config) => new WpCalendarSystemAdapter(config),
  // },
}

// ---- Factory Functions ----

/**
 * Resolve the event system adapter for a tenant.
 * Currently uses legacy ssiCredentials field. Phase 3 will
 * switch to tenant.integrations.eventSystem.
 *
 * @param {object} tenant - Tenant object with ssiCredentials
 * @returns {EventSystemAdapter} SSI adapter or NullEventAdapter
 */
export function getEventAdapter(tenant) {
  // Phase 3 will check: tenant.integrations?.eventSystem?.type
  // For now, use legacy ssiCredentials presence as the signal
  const creds = tenant?.ssiCredentials
  if (creds?.email && creds?.password) {
    log.debug?.(`[registry] Event adapter: ssi for tenant ${tenant.id}`)
    return new SsiEventAdapter(creds)
  }

  log.debug?.(`[registry] Event adapter: null (no SSI credentials) for tenant ${tenant?.id}`)
  return new NullEventAdapter()
}

/**
 * Resolve the calendar system adapter for a tenant.
 * Currently returns NullCalendarAdapter — Phase 2 will add
 * WordPress adapter resolution from calendarConfig.
 *
 * @param {object} tenant - Tenant object with calendarConfig
 * @returns {CalendarSystemAdapter} Calendar adapter or NullCalendarAdapter
 */
export function getCalendarAdapter(tenant) {
  // Phase 2 will resolve WpCalendarAdapter from calendarConfig
  // For now, always return null adapter (calendar operations are
  // still called directly by routes/platform/events.js)
  return new NullCalendarAdapter()
}

/**
 * List available event system types.
 * Phase 4 will read from integration_types DB table.
 * @returns {Array<{ type: string, name: string }>}
 */
export function listEventSystemTypes() {
  return [
    ...Object.entries(EVENT_SYSTEM_TYPES).map(([type, config]) => ({ type, name: config.name })),
    { type: 'none', name: 'No event system' },
  ]
}

/**
 * List available calendar system types.
 * Phase 4 will read from integration_types DB table.
 * @returns {Array<{ type: string, name: string }>}
 */
export function listCalendarSystemTypes() {
  return [
    ...Object.entries(CALENDAR_SYSTEM_TYPES).map(([type, config]) => ({ type, name: config.name })),
    { type: 'none', name: 'No calendar integration' },
  ]
}
