import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ssiSearchAndAddParticipant,
  ssiSetParticipantSquad,
  ssiSetMatchParticipantStatus,
  ssiRegisterToTrainerSquad,
} from '../lib/ssi-core/participants.js'

const formHtml = readFileSync(new URL('./fixtures/ssi-html/participant-csrf-form.html', import.meta.url), 'utf8')
const searchHtml = '<table><tr><td>Test Shooter</td><td><a href="/event/136/999/register-participant/42/">Register</a></td></tr></table>'
const sessionCookies = { sessionid: 'test-session', csrftoken: 'login-token' }

function response(status, html = '', setCookies = []) {
  return {
    status,
    ok: status === 200,
    text: async () => html,
    headers: { getSetCookie: () => setCookies, get: () => null },
  }
}

function expectCsrf(options, token) {
  expect(options.headers['X-CSRFToken']).toBe(token)
  expect(options.headers.Cookie).toContain(`csrftoken=${token}`)
  expect(options.headers.Cookie).toContain('sessionid=test-session')
  expect(options.headers.Origin).toBe('https://shootnscoreit.com')
  expect(options.redirect).toBe('manual')
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SSI participant CSRF compatibility', () => {
  it.each([136, 91])('sends the login CSRF cookie as a header for content type %s', async contentType => {
    const fetchMock = vi.fn(async (url, options) => {
      if (options.headers['X-CSRFToken'] !== 'login-token') return response(403)
      return response(200, 'gave no results')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(ssiSearchAndAddParticipant(contentType, 999, 'test@example.com', sessionCookies))
      .resolves.toEqual({ success: false, message: 'user_not_found' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain(`/event/${contentType}/999/participant-search-and-add/`)
    expectCsrf(options, 'login-token')
    expect(new URLSearchParams(options.body).get('email')).toBe('test@example.com')
  })

  it('gets a CSRF cookie for older sessions before searching without mutating shared cookies', async () => {
    const cookies = { sessionid: 'test-session' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, formHtml, ['csrftoken=fresh-token; Path=/']))
      .mockResolvedValueOnce(response(200, 'gave no results'))
    vi.stubGlobal('fetch', fetchMock)

    await ssiSearchAndAddParticipant(136, 999, 'test@example.com', cookies)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1].method || 'GET').toBe('GET')
    expectCsrf(fetchMock.mock.calls[1][1], 'fresh-token')
    expect(cookies).toEqual({ sessionid: 'test-session' })
  })

  it('retains compatibility when SSI does not issue CSRF cookies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, '<form method="post"></form>'))
      .mockResolvedValueOnce(response(200, 'gave no results'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ssiSearchAndAddParticipant(136, 999, 'test@example.com', { sessionid: 'test-session' }))
      .resolves.toEqual({ success: false, message: 'user_not_found' })
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('X-CSRFToken')
  })

  it('does not POST after the search form redirects to login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(302))
    vi.stubGlobal('fetch', fetchMock)
    await expect(ssiSearchAndAddParticipant(136, 999, 'test@example.com', { sessionid: 'test-session' }))
      .rejects.toThrow('Participant search page HTTP 302')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves upstream 403 errors without retrying registration', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(403))
    vi.stubGlobal('fetch', fetchMock)
    await expect(ssiSearchAndAddParticipant(136, 999, 'test@example.com', sessionCookies))
      .rejects.toThrow('Search-and-add failed HTTP 403')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['registration', 'trainer'])('uses rotated cookies for %s confirmation and retains form fields', async flow => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, searchHtml, ['csrftoken=search-token; Path=/']))
      .mockResolvedValueOnce(response(200, formHtml, ['csrftoken=form-token; Path=/']))
      .mockResolvedValueOnce(response(302))
    vi.stubGlobal('fetch', fetchMock)
    const cookies = { ...sessionCookies }
    const result = flow === 'registration'
      ? ssiSearchAndAddParticipant(136, 999, 'test@example.com', cookies)
      : ssiRegisterToTrainerSquad(136, 999, 'test@example.com', 'Trainers', cookies)
    const assertion = expect(result).resolves.toMatchObject({ success: true })
    await vi.runAllTimersAsync()
    await assertion

    expectCsrf(fetchMock.mock.calls[0][1], 'login-token')
    expect(fetchMock.mock.calls[1][1].headers.Cookie).toContain('csrftoken=search-token')
    const confirm = fetchMock.mock.calls[2][1]
    expectCsrf(confirm, 'form-token')
    const body = new URLSearchParams(confirm.body)
    expect(body.get('csrfmiddlewaretoken')).toBe('masked-form-token')
    expect(body.get('shooter')).toBe('42')
    expect(body.get('form_loaded_at')).toBe('test-timestamp')
    expect(body.get('has_accepted_event_data_policy')).toBe('on')
    if (flow === 'trainer') {
      expect(body.get('squad')).toBe('502')
      expect(body.get('status')).toBe('a')
    }
    expect(cookies).toEqual(sessionCookies)
  })

  it.each(['squad', 'status'])('refreshes CSRF cookies before %s edits', async flow => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, formHtml, ['csrftoken=edit-token; Path=/']))
      .mockResolvedValueOnce(response(302))
    vi.stubGlobal('fetch', fetchMock)
    const cookies = { ...sessionCookies }
    const result = flow === 'squad'
      ? await ssiSetParticipantSquad(42, 2, cookies)
      : await ssiSetMatchParticipantStatus(42, 'd', cookies)

    expect(result).toEqual({ success: true })
    const edit = fetchMock.mock.calls[1][1]
    expectCsrf(edit, 'edit-token')
    const body = new URLSearchParams(edit.body)
    expect(body.get('csrfmiddlewaretoken')).toBe('masked-form-token')
    expect(body.get('status')).toBe(flow === 'squad' ? 'a' : 'd')
    expect(body.get('squad')).toBe(flow === 'squad' ? '502' : '501')
    expect(cookies).toEqual(sessionCookies)
  })
})
