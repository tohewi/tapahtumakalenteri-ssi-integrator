// ============================================================
// WordPress Calendar Adapter Tests (CAL-3 Cycle 1)
// ============================================================
// Tests for lib/calendar/wp-adapter.js — createEvent + publishEvent.
// Uses HTML fixture from test/fixtures/wp-new-event-form.html.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CookieJar } from 'tough-cookie'
import {
  extractFormTokens,
  extractAcfFieldValues,
  extractPostTitle,
  extractPostStatus,
  formatAcfDate,
  generateSlug,
  buildFormBody,
  ACF_FIELDS,
  WpCalendarAdapter,
} from '../lib/calendar/wp-adapter.js'

// ---- Fixtures ----

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')
const newEventFormHtml = readFileSync(join(FIXTURES_DIR, 'wp-new-event-form.html'), 'utf8')
const editEventHtml = readFileSync(join(FIXTURES_DIR, 'wp-edit-event.html'), 'utf8')

// ---- Helpers ----

function mockResponse(body, { status = 200, cookies = [], location = null } = {}) {
  const headers = new Headers()
  for (const c of cookies) headers.append('set-cookie', c)
  if (location) headers.set('location', location)
  return {
    status,
    headers,
    text: async () => body,
  }
}

function stubFetch(responses) {
  let callIndex = 0
  const calls = []
  global.fetch = vi.fn(async (url, options) => {
    calls.push({ url, options })
    const resp = responses[callIndex] || mockResponse('', { status: 500 })
    callIndex++
    return resp
  })
  return calls
}

function makeSession(baseUrl = 'https://example.com') {
  const jar = new CookieJar()
  jar.setCookieSync('wordpress_logged_in_abc=user; path=/', baseUrl)
  return {
    baseUrl,
    username: 'admin',
    cookieJar: jar,
    needs2fa: false,
    authenticated: true,
    _2fa: null,
  }
}

// ---- Pure function tests ----

describe('extractFormTokens', () => {
  it('extracts wpNonce, postId, and acfNonce from form HTML', () => {
    const tokens = extractFormTokens(newEventFormHtml)
    expect(tokens.wpNonce).toBe('wp_nonce_abc123')
    expect(tokens.postId).toBe('12345')
    expect(tokens.acfNonce).toBe('acf_nonce_xyz789')
  })

  it('returns nulls for empty/null input', () => {
    expect(extractFormTokens(null)).toEqual({ wpNonce: null, postId: null, acfNonce: null })
    expect(extractFormTokens('')).toEqual({ wpNonce: null, postId: null, acfNonce: null })
  })

  it('handles HTML with missing acfNonce', () => {
    const html = `<input type="hidden" id="_wpnonce" name="_wpnonce" value="abc" />
                  <input type="hidden" id="post_ID" name="post_ID" value="999" />`
    const tokens = extractFormTokens(html)
    expect(tokens.wpNonce).toBe('abc')
    expect(tokens.postId).toBe('999')
    expect(tokens.acfNonce).toBeNull()
  })
})

describe('formatAcfDate', () => {
  it('formats date as YYYYMMDD', () => {
    expect(formatAcfDate(new Date(2026, 0, 31))).toBe('20260131')
    expect(formatAcfDate(new Date(2026, 11, 5))).toBe('20261205')
  })

  it('pads single-digit month and day', () => {
    expect(formatAcfDate(new Date(2026, 2, 3))).toBe('20260303')
  })
})

describe('generateSlug', () => {
  it('generates slug without cup ID', () => {
    expect(generateSlug(new Date(2026, 0, 31))).toBe('kupittaan-ampumavuoro-31-01-2026')
  })

  it('generates slug with cup ID', () => {
    expect(generateSlug(new Date(2026, 1, 14), 141)).toBe('kupittaan-ampumavuoro-14-02-2026-cup141')
  })

  it('handles string cup ID', () => {
    expect(generateSlug(new Date(2026, 5, 1), '200')).toBe('kupittaan-ampumavuoro-01-06-2026-cup200')
  })

  it('omits cup suffix when cupId is 0 or falsy', () => {
    expect(generateSlug(new Date(2026, 0, 1), 0)).toBe('kupittaan-ampumavuoro-01-01-2026')
    expect(generateSlug(new Date(2026, 0, 1), null)).toBe('kupittaan-ampumavuoro-01-01-2026')
  })
})

describe('buildFormBody', () => {
  it('encodes fields as URL-encoded string', () => {
    const body = buildFormBody({ foo: 'bar', baz: 'hello world' })
    expect(body).toContain('foo=bar')
    expect(body).toContain('baz=hello%20world')
  })

  it('handles taxonomy IDs as repeated keys', () => {
    const body = buildFormBody({ title: 'test' }, [50, 52])
    expect(body).toContain('title=test')
    expect(body).toContain('tax_input%5Beventformat%5D%5B%5D=50')
    expect(body).toContain('tax_input%5Beventformat%5D%5B%5D=52')
  })

  it('handles empty taxonomy array', () => {
    const body = buildFormBody({ a: 'b' }, [])
    expect(body).toBe('a=b')
  })

  it('handles null values gracefully', () => {
    const body = buildFormBody({ key: null })
    expect(body).toBe('key=')
  })

  it('encodes ACF nested field keys correctly', () => {
    const body = buildFormBody({
      [`acf[${ACF_FIELDS.locationGroup}][${ACF_FIELDS.locationAddress}]`]: 'Test address',
    })
    // Should encode the brackets
    expect(body).toContain('acf%5B')
    expect(body).toContain('Test%20address')
  })
})

// ---- Integration tests (mocked fetch) ----

describe('WpCalendarAdapter', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('constructor', () => {
    it('throws if session is not authenticated', () => {
      expect(() => new WpCalendarAdapter({ authenticated: false }))
        .toThrow('Session must be authenticated')
    })

    it('throws if session is null', () => {
      expect(() => new WpCalendarAdapter(null))
        .toThrow('Session must be authenticated')
    })

    it('creates adapter with valid session', () => {
      const adapter = new WpCalendarAdapter(makeSession())
      expect(adapter.baseUrl).toBe('https://example.com')
    })
  })

  describe('createEvent', () => {
    it('creates a draft event and returns event info', async () => {
      const calls = stubFetch([
        // GET /wp-admin/post-new.php?post_type=event — form page
        mockResponse(newEventFormHtml),
        // POST /wp-admin/post.php — form submit, redirect to edit page
        mockResponse('', {
          status: 302,
          location: 'https://example.com/wp-admin/post.php?post=12345&action=edit&message=10',
        }),
        // GET follow redirect — edit page
        mockResponse('<div id="post-body">Event saved</div>'),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.createEvent({
        title: 'Kupittaan ampumavuoro 31.01.2026',
        date: new Date(2026, 0, 31),
        shortDescription: 'Test event',
        content: '<p>Test content</p>',
        ssiCupId: 141,
        taxonomyIds: [50, 52],
      })

      expect(result.eventId).toBe('12345')
      expect(result.status).toBe('draft')
      expect(result.title).toBe('Kupittaan ampumavuoro 31.01.2026')
      expect(result.editUrl).toContain('post=12345')
      expect(result.eventUrl).toContain('p=12345')

      // Verify POST body contains expected fields
      const postCall = calls.find(c => c.options?.method === 'POST')
      expect(postCall).toBeDefined()
      expect(postCall.options.body).toContain('post_title=Kupittaan')
      expect(postCall.options.body).toContain('post_status=draft')
      expect(postCall.options.body).toContain('_wpnonce=wp_nonce_abc123')
      expect(postCall.options.body).toContain('tax_input')
    })

    it('throws when title is missing', async () => {
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.createEvent({ date: new Date() }))
        .rejects.toThrow('title and date are required')
    })

    it('throws when date is missing', async () => {
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.createEvent({ title: 'Test' }))
        .rejects.toThrow('title and date are required')
    })

    it('throws when form tokens cannot be extracted', async () => {
      stubFetch([
        mockResponse('<html><body>Access denied</body></html>'),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.createEvent({
        title: 'Test',
        date: new Date(),
      })).rejects.toThrow('Could not extract form tokens')
    })

    it('uses default values for optional parameters', async () => {
      const calls = stubFetch([
        mockResponse(newEventFormHtml),
        mockResponse('', {
          status: 302,
          location: 'https://example.com/wp-admin/post.php?post=12345&action=edit&message=10',
        }),
        mockResponse('<div id="post-body">saved</div>'),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.createEvent({
        title: 'Test Event',
        date: new Date(2026, 5, 15),
      })

      expect(result.eventId).toBe('12345')

      // Verify defaults are used
      const postCall = calls.find(c => c.options?.method === 'POST')
      expect(postCall.options.body).toContain('Klo%2009.00-12.00')
      expect(postCall.options.body).toContain('Kupittaan%20urheiluhallin%20ampumarata')
    })
  })

  describe('publishEvent', () => {
    it('publishes a draft event successfully', async () => {
      const calls = stubFetch([
        // GET edit page for nonce
        mockResponse(newEventFormHtml),
        // POST publish
        mockResponse('', {
          status: 302,
          location: 'https://example.com/wp-admin/post.php?post=12345&action=edit&message=1',
        }),
        // GET follow redirect
        mockResponse('<div id="post-body">Published</div>'),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.publishEvent('12345')

      expect(result.eventId).toBe('12345')
      expect(result.status).toBe('publish')

      // Verify POST contains publish status
      const postCall = calls.find(c => c.options?.method === 'POST')
      expect(postCall.options.body).toContain('post_status=publish')
      expect(postCall.options.body).toContain('original_post_status=draft')
    })

    it('throws when eventId is missing', async () => {
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.publishEvent('')).rejects.toThrow('eventId is required')
    })

    it('throws when nonce cannot be extracted', async () => {
      stubFetch([
        mockResponse('<html><body>No nonce here</body></html>'),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.publishEvent('12345'))
        .rejects.toThrow('Could not extract nonce')
    })

    it('returns unknown status when publish response has no message code', async () => {
      stubFetch([
        mockResponse(newEventFormHtml),
        mockResponse('', {
          status: 302,
          location: 'https://example.com/wp-admin/post.php?post=12345&action=edit',
        }),
        mockResponse('<div>something</div>'),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.publishEvent('12345')
      expect(result.status).toBe('unknown')
    })
  })
})

describe('ACF_FIELDS', () => {
  it('contains all required field keys', () => {
    expect(ACF_FIELDS.shortDescription).toBe('field_5d3e9d9626a82')
    expect(ACF_FIELDS.content).toBe('field_5d3e9dc926a83')
    expect(ACF_FIELDS.startDate).toBe('field_5d3e9ddc26a84')
    expect(ACF_FIELDS.endDate).toBe('field_5d3e9e5f26a85')
    expect(ACF_FIELDS.time).toBe('field_62949bdcbb12e')
    expect(ACF_FIELDS.locationGroup).toBe('field_5d3e9efab663d')
    expect(ACF_FIELDS.locationAddress).toBe('field_5d3e9f0fb663e')
    expect(ACF_FIELDS.locationMapLink).toBe('field_5d3e9f28b663f')
    expect(ACF_FIELDS.shotsFired).toBe('field_4k2esk3rske32')
    expect(ACF_FIELDS.attendeeCount).toBe('field_6j3ak3kj2kjs2')
    expect(ACF_FIELDS.eventCount).toBe('field_4k3ak3sj2kj6b')
  })
})

// ---- Cycle 2: Pure function tests ----

describe('extractAcfFieldValues', () => {
  it('extracts input field values from edit page HTML', () => {
    const values = extractAcfFieldValues(editEventHtml)
    expect(values[ACF_FIELDS.startDate]).toBe('20260131')
    expect(values[ACF_FIELDS.endDate]).toBe('20260131')
    expect(values[ACF_FIELDS.time]).toBe('Klo 09.00-12.00')
    expect(values[ACF_FIELDS.shotsFired]).toBe('500')
    expect(values[ACF_FIELDS.attendeeCount]).toBe('5')
    expect(values[ACF_FIELDS.eventCount]).toBe('1')
  })

  it('extracts textarea field values', () => {
    const values = extractAcfFieldValues(editEventHtml)
    expect(values[ACF_FIELDS.shortDescription]).toBe('Kupittaa Cup lauantaina')
  })

  it('extracts nested group fields (location)', () => {
    const values = extractAcfFieldValues(editEventHtml)
    // Location group contains nested fields
    const locationGroup = values[ACF_FIELDS.locationGroup]
    expect(locationGroup).toBeDefined()
    expect(locationGroup[ACF_FIELDS.locationAddress]).toBe('Kupittaan urheiluhallin ampumarata')
    expect(locationGroup[ACF_FIELDS.locationMapLink]).toBe('https://maps.google.com/test')
  })

  it('returns empty object for null/empty input', () => {
    expect(extractAcfFieldValues(null)).toEqual({})
    expect(extractAcfFieldValues('')).toEqual({})
  })
})

describe('extractPostTitle', () => {
  it('extracts title from edit page', () => {
    expect(extractPostTitle(editEventHtml)).toBe('Kupittaan ampumavuoro 31.01.2026')
  })

  it('returns null for missing title', () => {
    expect(extractPostTitle('<html><body>no title</body></html>')).toBeNull()
    expect(extractPostTitle(null)).toBeNull()
  })
})

describe('extractPostStatus', () => {
  it('extracts status from edit page', () => {
    expect(extractPostStatus(editEventHtml)).toBe('publish')
  })

  it('returns null for missing status', () => {
    expect(extractPostStatus('<html><body>no status</body></html>')).toBeNull()
    expect(extractPostStatus(null)).toBeNull()
  })
})

// ---- Cycle 2: Integration tests (mocked fetch) ----

describe('WpCalendarAdapter — Cycle 2', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('updateEvent', () => {
    it('updates ACF statistics fields on an existing event', async () => {
      const calls = stubFetch([
        // GET edit page for nonce
        mockResponse(editEventHtml),
        // POST update
        mockResponse('', {
          status: 302,
          location: 'https://example.com/wp-admin/post.php?post=12345&action=edit&message=1',
        }),
        // GET follow redirect
        mockResponse('<div id="post-body">Updated</div>'),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.updateEvent('12345', {
        shotsFired: 1000,
        attendeeCount: 10,
        eventCount: 1,
      })

      expect(result.eventId).toBe('12345')
      expect(result.status).toBe('updated')

      // Verify POST body contains statistics ACF fields
      const postCall = calls.find(c => c.options?.method === 'POST')
      expect(postCall.options.body).toContain('acf%5Bfield_4k2esk3rske32%5D=1000')  // shotsFired
      expect(postCall.options.body).toContain('acf%5Bfield_6j3ak3kj2kjs2%5D=10')    // attendeeCount
      expect(postCall.options.body).toContain('acf%5Bfield_4k3ak3sj2kj6b%5D=1')     // eventCount
    })

    it('preserves current post status by default', async () => {
      const calls = stubFetch([
        mockResponse(editEventHtml),
        mockResponse('', {
          status: 302,
          location: 'https://example.com/wp-admin/post.php?post=12345&action=edit&message=1',
        }),
        mockResponse(''),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      await adapter.updateEvent('12345', { shotsFired: 500 })

      const postCall = calls.find(c => c.options?.method === 'POST')
      expect(postCall.options.body).toContain('post_status=publish')
    })

    it('allows overriding post status', async () => {
      const calls = stubFetch([
        mockResponse(editEventHtml),
        mockResponse('', {
          status: 302,
          location: 'https://example.com/wp-admin/post.php?post=12345&action=edit&message=1',
        }),
        mockResponse(''),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      await adapter.updateEvent('12345', { shotsFired: 500, postStatus: 'draft' })

      const postCall = calls.find(c => c.options?.method === 'POST')
      expect(postCall.options.body).toContain('post_status=draft')
    })

    it('throws when eventId is missing', async () => {
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.updateEvent('')).rejects.toThrow('eventId is required')
    })

    it('throws when nonce cannot be extracted', async () => {
      stubFetch([mockResponse('<html><body>Access denied</body></html>')])
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.updateEvent('12345', { shotsFired: 100 }))
        .rejects.toThrow('Could not extract nonce')
    })

    it('returns unknown status when update response has no message code', async () => {
      stubFetch([
        mockResponse(editEventHtml),
        mockResponse('', {
          status: 302,
          location: 'https://example.com/wp-admin/post.php?post=12345&action=edit',
        }),
        mockResponse(''),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.updateEvent('12345', { shotsFired: 500 })
      expect(result.status).toBe('unknown')
    })
  })

  describe('getEvent', () => {
    it('returns event details from edit page', async () => {
      stubFetch([mockResponse(editEventHtml)])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.getEvent('12345')

      expect(result.eventId).toBe('12345')
      expect(result.title).toBe('Kupittaan ampumavuoro 31.01.2026')
      expect(result.status).toBe('publish')
      expect(result.editUrl).toContain('post=12345')
      expect(result.acfFields[ACF_FIELDS.startDate]).toBe('20260131')
      expect(result.acfFields[ACF_FIELDS.shotsFired]).toBe('500')
      expect(result.acfFields[ACF_FIELDS.attendeeCount]).toBe('5')
    })

    it('throws when eventId is missing', async () => {
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.getEvent('')).rejects.toThrow('eventId is required')
    })

    it('throws when edit page cannot be loaded', async () => {
      stubFetch([mockResponse('<html><body>Not found</body></html>')])
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.getEvent('99999'))
        .rejects.toThrow('Could not load edit page')
    })
  })

  describe('deleteEvent', () => {
    it('trashes an event successfully', async () => {
      stubFetch([
        // GET edit page for trash nonce
        mockResponse(editEventHtml),
        // GET trash URL — redirect to list with trashed=1
        mockResponse('', {
          status: 302,
          location: 'https://example.com/wp-admin/edit.php?post_type=event&trashed=1&ids=12345',
        }),
        // GET follow redirect
        mockResponse('<div>1 post moved to the Trash.</div>'),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.deleteEvent('12345')

      expect(result.eventId).toBe('12345')
      expect(result.status).toBe('trashed')
    })

    it('throws when eventId is missing', async () => {
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.deleteEvent('')).rejects.toThrow('eventId is required')
    })

    it('throws when trash nonce cannot be extracted', async () => {
      stubFetch([mockResponse('<html><body>No trash link</body></html>')])
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.deleteEvent('12345'))
        .rejects.toThrow('Could not extract trash nonce')
    })

    it('returns unknown status when trash redirect missing', async () => {
      stubFetch([
        mockResponse(editEventHtml),
        mockResponse('<html><body>Something else happened</body></html>'),
      ])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.deleteEvent('12345')
      expect(result.status).toBe('unknown')
    })
  })

  describe('findEventBySlug', () => {
    it('finds event by slug in search results', async () => {
      const searchResultsHtml = `
        <table class="wp-list-table">
        <tr>
          <td><a href="https://example.com/wp-admin/post.php?post=12345&amp;action=edit">Kupittaan ampumavuoro</a></td>
        </tr>
        </table>`

      stubFetch([mockResponse(searchResultsHtml)])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.findEventBySlug('cup141')

      expect(result.eventId).toBe('12345')
      expect(result.editUrl).toContain('post=12345')
    })

    it('returns null when no event found', async () => {
      stubFetch([mockResponse('<table class="wp-list-table"><tbody></tbody></table>')])

      const adapter = new WpCalendarAdapter(makeSession())
      const result = await adapter.findEventBySlug('cup999')

      expect(result.eventId).toBeNull()
      expect(result.editUrl).toBeNull()
    })

    it('throws when slug is missing', async () => {
      const adapter = new WpCalendarAdapter(makeSession())
      await expect(adapter.findEventBySlug('')).rejects.toThrow('slug is required')
    })
  })
})
