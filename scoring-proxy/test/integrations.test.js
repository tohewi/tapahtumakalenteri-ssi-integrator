// ============================================================
// Integration Adapter Tests (INT-1 Phase 1)
//
// Tests the adapter facade, null adapters, and registry.
// No external calls — all SSI functions are mocked.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Null Adapters ----

describe('NullEventAdapter', () => {
  let adapter

  beforeEach(async () => {
    const { NullEventAdapter } = await import('../lib/integrations/null-adapters.js')
    adapter = new NullEventAdapter()
  })

  it('has type "none"', () => {
    expect(adapter.type).toBe('none')
  })

  it('login throws INTEGRATION_NOT_CONFIGURED', async () => {
    await expect(adapter.login()).rejects.toThrow('No event system configured')
  })

  it('loginGraphQL throws INTEGRATION_NOT_CONFIGURED', async () => {
    await expect(adapter.loginGraphQL()).rejects.toThrow('No event system configured')
  })

  it('createEvent throws INTEGRATION_NOT_CONFIGURED', async () => {
    await expect(adapter.createEvent()).rejects.toThrow('cannot create events')
  })

  it('deleteEvent throws INTEGRATION_NOT_CONFIGURED', async () => {
    await expect(adapter.deleteEvent()).rejects.toThrow('cannot delete events')
  })

  it('completeEvent throws INTEGRATION_NOT_CONFIGURED', async () => {
    await expect(adapter.completeEvent()).rejects.toThrow('cannot complete events')
  })

  it('getEventStats returns null', async () => {
    expect(await adapter.getEventStats()).toBeNull()
  })

  it('searchEvents returns empty array', async () => {
    expect(await adapter.searchEvents()).toEqual([])
  })

  it('importEventStructure throws INTEGRATION_NOT_CONFIGURED', async () => {
    await expect(adapter.importEventStructure()).rejects.toThrow('cannot import')
  })

  it('getEventStatuses returns empty object', () => {
    expect(adapter.getEventStatuses()).toEqual({})
  })
})

describe('NullCalendarAdapter', () => {
  let adapter

  beforeEach(async () => {
    const { NullCalendarAdapter } = await import('../lib/integrations/null-adapters.js')
    adapter = new NullCalendarAdapter()
  })

  it('has type "none"', () => {
    expect(adapter.type).toBe('none')
  })

  it('publishEvent returns skipped', async () => {
    expect(await adapter.publishEvent()).toEqual({ skipped: true })
  })

  it('updateEvent returns skipped', async () => {
    expect(await adapter.updateEvent()).toEqual({ skipped: true })
  })

  it('deleteEvent returns skipped', async () => {
    expect(await adapter.deleteEvent()).toEqual({ skipped: true })
  })

  it('getEvent returns null', async () => {
    expect(await adapter.getEvent()).toBeNull()
  })

  it('updateStats returns skipped', async () => {
    expect(await adapter.updateStats()).toEqual({ skipped: true })
  })
})

// ---- Registry ----

describe('Integration Registry', () => {
  let getEventAdapter, getCalendarAdapter, listEventSystemTypes, listCalendarSystemTypes

  beforeEach(async () => {
    const registry = await import('../lib/integrations/registry.js')
    getEventAdapter = registry.getEventAdapter
    getCalendarAdapter = registry.getCalendarAdapter
    listEventSystemTypes = registry.listEventSystemTypes
    listCalendarSystemTypes = registry.listCalendarSystemTypes
  })

  it('getEventAdapter returns SsiEventAdapter when credentials present', () => {
    const tenant = { id: 'ten_test', ssiCredentials: { email: 'a@b.com', password: 'secret' } }
    const adapter = getEventAdapter(tenant)
    expect(adapter.type).toBe('ssi')
    expect(adapter.credentials.email).toBe('a@b.com')
  })

  it('getEventAdapter returns NullEventAdapter when no credentials', () => {
    const tenant = { id: 'ten_test', ssiCredentials: null }
    const adapter = getEventAdapter(tenant)
    expect(adapter.type).toBe('none')
  })

  it('getEventAdapter returns NullEventAdapter when credentials incomplete', () => {
    const tenant = { id: 'ten_test', ssiCredentials: { email: 'a@b.com' } }
    const adapter = getEventAdapter(tenant)
    expect(adapter.type).toBe('none')
  })

  it('getEventAdapter returns NullEventAdapter for null tenant', () => {
    const adapter = getEventAdapter(null)
    expect(adapter.type).toBe('none')
  })

  it('getCalendarAdapter returns WpCalendarSystemAdapter when WP config complete', () => {
    const tenant = {
      id: 'ten_test',
      calendarConfig: { wpBaseUrl: 'https://example.com', wpUsername: 'admin', wpPassword: 'secret' },
    }
    const adapter = getCalendarAdapter(tenant)
    expect(adapter.type).toBe('wordpress')
  })

  it('getCalendarAdapter returns NullCalendarAdapter when WP config incomplete', () => {
    const tenant = { id: 'ten_test', calendarConfig: { wpBaseUrl: 'https://example.com' } }
    const adapter = getCalendarAdapter(tenant)
    expect(adapter.type).toBe('none')
  })

  it('getCalendarAdapter returns NullCalendarAdapter when no config', () => {
    const tenant = { id: 'ten_test', calendarConfig: null }
    const adapter = getCalendarAdapter(tenant)
    expect(adapter.type).toBe('none')
  })

  // ---- New integrations field resolution ----

  it('getEventAdapter resolves SSI from tenant.integrations.eventSystem', () => {
    const tenant = {
      id: 'ten_new',
      integrations: { eventSystem: { type: 'ssi', credentials: { email: 'new@b.com', password: 'pw' } } },
      ssiCredentials: { email: 'old@b.com', password: 'oldpw' }, // legacy should be ignored
    }
    const adapter = getEventAdapter(tenant)
    expect(adapter.type).toBe('ssi')
    expect(adapter.credentials.email).toBe('new@b.com') // new model wins
  })

  it('getCalendarAdapter resolves WordPress from tenant.integrations.calendarSystem', () => {
    const tenant = {
      id: 'ten_new',
      integrations: { calendarSystem: { type: 'wordpress', credentials: { wpBaseUrl: 'https://new.fi', wpUsername: 'a', wpPassword: 'b' } } },
      calendarConfig: { wpBaseUrl: 'https://old.fi', wpUsername: 'x', wpPassword: 'y' }, // legacy should be ignored
    }
    const adapter = getCalendarAdapter(tenant)
    expect(adapter.type).toBe('wordpress')
    expect(adapter.calendarConfig.wpBaseUrl).toBe('https://new.fi') // new model wins
  })

  it('getEventAdapter falls back to legacy when integrations empty', () => {
    const tenant = { id: 'ten_legacy', integrations: {}, ssiCredentials: { email: 'a@b.com', password: 'pw' } }
    const adapter = getEventAdapter(tenant)
    expect(adapter.type).toBe('ssi')
    expect(adapter.credentials.email).toBe('a@b.com')
  })

  it('getCalendarAdapter falls back to legacy when integrations empty', () => {
    const tenant = { id: 'ten_legacy', integrations: {}, calendarConfig: { wpBaseUrl: 'https://x.fi', wpUsername: 'a', wpPassword: 'b' } }
    const adapter = getCalendarAdapter(tenant)
    expect(adapter.type).toBe('wordpress')
  })

  it('listEventSystemTypes includes ssi and none', () => {
    const types = listEventSystemTypes()
    expect(types.some(t => t.type === 'ssi')).toBe(true)
    expect(types.some(t => t.type === 'none')).toBe(true)
  })

  it('listCalendarSystemTypes includes wordpress and none', () => {
    const types = listCalendarSystemTypes()
    expect(types.some(t => t.type === 'wordpress')).toBe(true)
    expect(types.some(t => t.type === 'none')).toBe(true)
  })
})

// ---- WpCalendarSystemAdapter ----

describe('WpCalendarSystemAdapter', () => {
  let WpCalendarSystemAdapter

  beforeEach(async () => {
    const mod = await import('../lib/integrations/wp-calendar-adapter.js')
    WpCalendarSystemAdapter = mod.WpCalendarSystemAdapter
  })

  it('has type "wordpress"', () => {
    const adapter = new WpCalendarSystemAdapter({ wpBaseUrl: 'https://example.com', wpUsername: 'admin', wpPassword: 'secret' })
    expect(adapter.type).toBe('wordpress')
  })

  it('stores calendarConfig', () => {
    const cfg = { wpBaseUrl: 'https://example.com', wpUsername: 'admin', wpPassword: 'secret' }
    const adapter = new WpCalendarSystemAdapter(cfg)
    expect(adapter.calendarConfig).toBe(cfg)
  })

  it('validate() returns valid when all required fields present', () => {
    const adapter = new WpCalendarSystemAdapter({ wpBaseUrl: 'https://example.com', wpUsername: 'admin', wpPassword: 'secret' })
    const result = adapter.validate()
    expect(result.valid).toBe(true)
  })

  it('validate() returns invalid when fields missing', () => {
    const adapter = new WpCalendarSystemAdapter({ wpBaseUrl: 'https://example.com' })
    const result = adapter.validate()
    expect(result.valid).toBe(false)
    expect(result.missing.length).toBeGreaterThan(0)
  })

  it('validate() returns invalid for null config', () => {
    const adapter = new WpCalendarSystemAdapter(null)
    const result = adapter.validate()
    expect(result.valid).toBe(false)
  })
})

// ---- SsiEventAdapter ----

describe('SsiEventAdapter', () => {
  let SsiEventAdapter

  beforeEach(async () => {
    const mod = await import('../lib/integrations/ssi-adapter.js')
    SsiEventAdapter = mod.SsiEventAdapter
  })

  it('has type "ssi"', () => {
    const adapter = new SsiEventAdapter({ email: 'a@b.com', password: 'secret' })
    expect(adapter.type).toBe('ssi')
  })

  it('stores credentials', () => {
    const creds = { email: 'a@b.com', password: 'secret', apiKey: 'key123' }
    const adapter = new SsiEventAdapter(creds)
    expect(adapter.credentials).toBe(creds)
  })

  it('login throws when credentials missing', async () => {
    const adapter = new SsiEventAdapter({})
    await expect(adapter.login()).rejects.toThrow('SSI credentials required')
  })

  it('getEventStatuses returns SSI status constants', () => {
    const adapter = new SsiEventAdapter({ email: 'a@b.com', password: 'secret' })
    const statuses = adapter.getEventStatuses()
    expect(statuses).toBeDefined()
    expect(typeof statuses).toBe('object')
  })
})
