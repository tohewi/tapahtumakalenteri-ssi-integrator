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
    description: 'Competition management & scoring platform',
    createAdapter: (credentials) => new SsiEventAdapter(credentials),
    credentialSchema: [
      { key: 'email', label: 'SSI Email', labelFi: 'SSI-sähköposti', type: 'email', required: true },
      { key: 'password', label: 'SSI Password', labelFi: 'SSI-salasana', type: 'password', required: true, writeOnly: true },
      { key: 'apiKey', label: 'API Key', labelFi: 'API-avain', type: 'password', required: false, writeOnly: true, hint: 'Found in SSI under My Account → API Keys' },
    ],
  },
}

// ---- Calendar System Registry ----
// Phase 2 will add WpCalendarAdapter here

const CALENDAR_SYSTEM_TYPES = {
  wordpress: {
    name: 'WordPress / Tapahtumakalenteri',
    description: 'Event calendar publishing via WordPress admin',
    createAdapter: (config) => new WpCalendarSystemAdapter(config),
    credentialSchema: [
      { key: 'wpBaseUrl', label: 'WordPress URL', labelFi: 'WordPress-URL', type: 'url', required: true, hint: 'Base URL (no trailing slash)' },
      { key: 'wpUsername', label: 'Username', labelFi: 'Käyttäjänimi', type: 'text', required: true },
      { key: 'wpPassword', label: 'Password', labelFi: 'Salasana', type: 'password', required: true, writeOnly: true },
      { key: 'gmailAddress', label: 'Gmail Address', labelFi: 'Gmail-osoite', type: 'email', required: false, hint: 'For WordPress 2FA OTP' },
      { key: 'gmailAppPassword', label: 'Gmail App Password', labelFi: 'Gmail-sovellussalasana', type: 'password', required: false, writeOnly: true },
      { key: 'gmailSenderFilter', label: 'Sender Filter', labelFi: 'Lähettäjäsuodatin', type: 'text', required: false },
      { key: 'gmailSubjectFilter', label: 'Subject Filter', labelFi: 'Aihesuodatin', type: 'text', required: false },
    ],
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

/**
 * Get full integration type catalog for API responses.
 * Returns types with credential schemas for dynamic UI form rendering.
 * @param {string} [category] - 'event_system' or 'calendar_system' (optional filter)
 * @returns {Array<{ type, category, name, description, credentialSchema }>}
 */
export function getIntegrationTypes(category) {
  const types = []

  if (!category || category === 'event_system') {
    for (const [type, config] of Object.entries(EVENT_SYSTEM_TYPES)) {
      types.push({
        type,
        category: 'event_system',
        name: config.name,
        description: config.description || '',
        credentialSchema: config.credentialSchema || [],
      })
    }
    types.push({ type: 'none', category: 'event_system', name: 'No event system', description: '', credentialSchema: [] })
  }

  if (!category || category === 'calendar_system') {
    for (const [type, config] of Object.entries(CALENDAR_SYSTEM_TYPES)) {
      types.push({
        type,
        category: 'calendar_system',
        name: config.name,
        description: config.description || '',
        credentialSchema: config.credentialSchema || [],
      })
    }
    types.push({ type: 'none', category: 'calendar_system', name: 'No calendar integration', description: '', credentialSchema: [] })
  }

  return types
}
