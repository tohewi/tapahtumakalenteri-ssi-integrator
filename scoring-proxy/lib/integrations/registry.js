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
import { WpCalendarSystemAdapter } from './wp-calendar-adapter.js'
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
  wordpress: {
    name: 'WordPress / Tapahtumakalenteri',
    createAdapter: (config) => new WpCalendarSystemAdapter(config),
  },
}

// ---- Factory Functions ----

/**
 * Resolve the event system adapter for a tenant.
 * Checks tenant.integrations.eventSystem first (new model),
 * falls back to legacy ssiCredentials field.
 *
 * @param {object} tenant - Tenant object
 * @returns {EventSystemAdapter} SSI adapter or NullEventAdapter
 */
export function getEventAdapter(tenant) {
  // New model: tenant.integrations.eventSystem
  const integ = tenant?.integrations?.eventSystem
  if (integ?.type === 'ssi' && integ?.credentials?.email && integ?.credentials?.password) {
    log.debug?.(`[registry] Event adapter: ssi (integrations) for tenant ${tenant.id}`)
    return new SsiEventAdapter(integ.credentials)
  }

  // Legacy fallback: ssiCredentials
  const creds = tenant?.ssiCredentials
  if (creds?.email && creds?.password) {
    log.debug?.(`[registry] Event adapter: ssi (legacy) for tenant ${tenant.id}`)
    return new SsiEventAdapter(creds)
  }

  log.debug?.(`[registry] Event adapter: null for tenant ${tenant?.id}`)
  return new NullEventAdapter()
}

/**
 * Resolve the calendar system adapter for a tenant.
 * Checks tenant.integrations.calendarSystem first (new model),
 * falls back to legacy calendarConfig field.
 *
 * @param {object} tenant - Tenant object
 * @returns {CalendarSystemAdapter} WordPress adapter or NullCalendarAdapter
 */
export function getCalendarAdapter(tenant) {
  // New model: tenant.integrations.calendarSystem
  const integ = tenant?.integrations?.calendarSystem
  if (integ?.type === 'wordpress' && integ?.credentials?.wpBaseUrl) {
    log.debug?.(`[registry] Calendar adapter: wordpress (integrations) for tenant ${tenant.id}`)
    return new WpCalendarSystemAdapter(integ.credentials)
  }

  // Legacy fallback: calendarConfig
  const cfg = tenant?.calendarConfig
  if (cfg?.wpBaseUrl && cfg?.wpUsername && cfg?.wpPassword) {
    log.debug?.(`[registry] Calendar adapter: wordpress (legacy) for tenant ${tenant.id}`)
    return new WpCalendarSystemAdapter(cfg)
  }

  log.debug?.(`[registry] Calendar adapter: null for tenant ${tenant?.id}`)
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
