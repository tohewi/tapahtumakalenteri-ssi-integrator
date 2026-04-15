// ============================================================
// SSI Core — HTML Scraping/Parsing Tests
//
// Lightweight tests for functions that parse SSI HTML pages.
// Uses HTML fixture files to test parsing logic without
// hitting the real SSI server.
//
// NOTE: SSI is gradually moving to GraphQL, so web scraping
// will be phased out. These tests serve as regression guards
// during the migration — not deep coverage of every edge case.
// ============================================================

import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', 'ssi-html', name), 'utf-8')

// Import functions under test
import {
  ssiFindUserByEmail,
  ssiGetMatchGroupId,
  ssiGetMatchOfficials,
  ssiGetEventStaff,
} from '../lib/ssi-core/client.js'

import {
  ssiFindCompetitorInMatch,
  ssiFindParticipantInEvent,
  ssiGetCupParticipantStatuses,
  ssiSetDidNotShow,
  ssiUndoDidNotShow,
  ssiTogglePaid,
} from '../lib/ssi-core/client.js'

import {
  ssiGetScoringPage,
  ssiSubmitScore,
} from '../lib/ssi-core/client.js'

// Helper: mock fetch to return HTML fixture with 200 OK
function mockFetchOk(html) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => html,
    headers: { getSetCookie: () => [] },
  })
}

// Helper: mock fetch to return redirect (302)
function mockFetchRedirect(location = '/') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 302,
    headers: { getSetCookie: () => [], get: () => location },
  })
}

const cookies = { sessionid: 'test-session' }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ============================================================
// Management domain — staff page parsing
// ============================================================

describe('ssiGetMatchGroupId', () => {
  it('extracts group ID from staff page', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('staff-page.html')))
    const groupId = await ssiGetMatchGroupId(91, 5555, cookies)
    expect(groupId).toBe('26083')
  })

  it('throws when no group ID found', async () => {
    vi.stubGlobal('fetch', mockFetchOk('<html><body>No groups here</body></html>'))
    await expect(ssiGetMatchGroupId(91, 5555, cookies))
      .rejects.toThrow('Could not find management group ID')
  })

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    await expect(ssiGetMatchGroupId(91, 5555, cookies))
      .rejects.toThrow('Staff page HTTP 403')
  })
})

describe('ssiGetMatchOfficials', () => {
  it('parses staff table with roles and officials', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('staff-page.html')))
    const members = await ssiGetMatchOfficials(91, 5555, cookies)

    expect(members).toHaveLength(4)
    expect(members[0]).toEqual({ name: 'Alice Admin', officials: ['MD'], role: 'admin' })
    expect(members[1]).toEqual({ name: 'Bob Staff', officials: ['QM'], role: 'staff' })
    expect(members[2]).toEqual({ name: 'Carol Helper', officials: [], role: 'assistant' })
    expect(members[3]).toEqual({ name: 'Dave Multi', officials: ['MD', 'RO'], role: 'admin' })
  })

  it('returns empty array for page with no staff table', async () => {
    vi.stubGlobal('fetch', mockFetchOk('<html><body><p>No staff</p></body></html>'))
    const members = await ssiGetMatchOfficials(91, 5555, cookies)
    expect(members).toEqual([])
  })
})

describe('ssiGetEventStaff', () => {
  it('parses staff table for name and role', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('staff-page.html')))
    const staff = await ssiGetEventStaff(91, 5555, cookies)

    expect(staff).toHaveLength(4)
    expect(staff[0]).toEqual({ name: 'Alice Admin', role: 'admin' })
    expect(staff[1]).toEqual({ name: 'Bob Staff', role: 'staff' })
    expect(staff[2]).toEqual({ name: 'Carol Helper', role: 'assistant' })
  })
})

describe('ssiFindUserByEmail', () => {
  it('treats a search result row as found even without an add link', async () => {
    vi.stubGlobal('fetch', mockFetchOk(`
      <html><body>
        <table>
          <tr>
            <td>Ada Lovelace</td>
            <td>ada@example.com</td>
            <td><a href="/groups/25874/edit-user-role/12345/">Edit</a></td>
          </tr>
        </table>
      </body></html>
    `))

    const result = await ssiFindUserByEmail('25874', 'ada@example.com', cookies)
    expect(result).toEqual({ found: true, userId: '12345' })
  })

  it('returns not found when SSI explicitly reports no results', async () => {
    vi.stubGlobal('fetch', mockFetchOk('<ul class="list-unstyled text-danger"><li>Search gave no results</li></ul>'))

    const result = await ssiFindUserByEmail('25874', 'ghost@example.com', cookies)
    expect(result).toEqual({ found: false, userId: null })
  })

  it('treats a generic result table as found when SSI returns no explicit error', async () => {
    vi.stubGlobal('fetch', mockFetchOk(`
      <html><body>
        <table class="table">
          <tr>
            <th>Name</th>
            <th>Club</th>
          </tr>
          <tr>
            <td>Ada Lovelace</td>
            <td>TurRes</td>
          </tr>
        </table>
      </body></html>
    `))

    const result = await ssiFindUserByEmail('25874', 'ada@example.com', cookies)
    expect(result).toEqual({ found: true, userId: null })
  })
})

// ============================================================
// Participants domain — participant page parsing
// ============================================================

describe('ssiFindCompetitorInMatch', () => {
  // Existing tests cover: email disambiguation, not-found case
  // Add: single match, Finnish names, digit-in-name matching

  it('finds participant by name', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('match-participants.html')))
    const id = await ssiFindCompetitorInMatch('777', 'Matti Meikäläinen', cookies)
    expect(id).toBe('201')
  })

  it('distinguishes "Tuloskone 1" from "Tuloskone 2" by digit', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('match-participants.html')))
    const id1 = await ssiFindCompetitorInMatch('777', 'Tuloskone 1', cookies)
    const id2 = await ssiFindCompetitorInMatch('777', 'Tuloskone 2', cookies)
    expect(id1).toBe('203')
    expect(id2).toBe('204')
  })

  it('returns null for non-existent participant', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('match-participants.html')))
    const id = await ssiFindCompetitorInMatch('777', 'Nobody Here', cookies)
    expect(id).toBeNull()
  })
})

describe('ssiFindParticipantInEvent', () => {
  it('finds SRA participant with correct content type', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('event-participants.html')))
    const result = await ssiFindParticipantInEvent(22, 8888, 'Teppo Testaaja', cookies)
    expect(result).toEqual({ participantId: '301', participantCT: 23 })
  })

  it('finds Nordic participant with CT 93', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('event-participants.html')))
    const result = await ssiFindParticipantInEvent(22, 8888, 'Nordic Shooter', cookies)
    expect(result).toEqual({ participantId: '303', participantCT: 93 })
  })

  it('returns null when not found', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('event-participants.html')))
    const result = await ssiFindParticipantInEvent(22, 8888, 'Ghost Person', cookies)
    expect(result).toBeNull()
  })

  it('matches flexibly with word-based search', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('event-participants.html')))
    // "Liisa" alone should match "Liisa Laukoja"
    const result = await ssiFindParticipantInEvent(22, 8888, 'Liisa Laukoja', cookies)
    expect(result).toEqual({ participantId: '302', participantCT: 23 })
  })
})

describe('ssiGetCupParticipantStatuses', () => {
  it('parses paid and DNS status from cup participants page', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('cup-participants.html')))
    const statuses = await ssiGetCupParticipantStatuses('999', cookies)

    expect(statuses.size).toBe(4)
    expect(statuses.get('501')).toEqual({ paid: true, didNotShow: false })
    expect(statuses.get('502')).toEqual({ paid: false, didNotShow: false })
    expect(statuses.get('503')).toEqual({ paid: true, didNotShow: true })
    expect(statuses.get('504')).toEqual({ paid: false, didNotShow: false })
  })

  it('returns empty map for page with no participants', async () => {
    vi.stubGlobal('fetch', mockFetchOk('<html><body><p>No participants</p></body></html>'))
    const statuses = await ssiGetCupParticipantStatuses('999', cookies)
    expect(statuses.size).toBe(0)
  })
})

// ============================================================
// Simple redirect-based actions (GET → 302 = success)
// ============================================================

describe('ssiSetDidNotShow', () => {
  it('succeeds on 302 redirect', async () => {
    vi.stubGlobal('fetch', mockFetchRedirect())
    const result = await ssiSetDidNotShow(137, '501', cookies)
    expect(result).toEqual({ success: true, message: 'Did Not Show set' })
  })

  it('throws on non-redirect response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }))
    await expect(ssiSetDidNotShow(137, '501', cookies))
      .rejects.toThrow('Set Did Not Show failed HTTP 200')
  })
})

describe('ssiUndoDidNotShow', () => {
  it('succeeds on 302 redirect', async () => {
    vi.stubGlobal('fetch', mockFetchRedirect())
    const result = await ssiUndoDidNotShow(137, '501', cookies)
    expect(result).toEqual({ success: true, message: 'Did Not Show undone' })
  })
})

describe('ssiTogglePaid', () => {
  it('succeeds on 302 redirect', async () => {
    vi.stubGlobal('fetch', mockFetchRedirect())
    const result = await ssiTogglePaid(137, '501', cookies)
    expect(result).toEqual({ success: true, message: 'Paid status toggled' })
  })

  it('throws on non-redirect response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 500 }))
    await expect(ssiTogglePaid(137, '501', cookies))
      .rejects.toThrow('Toggle paid failed HTTP 500')
  })
})

// ============================================================
// Scoring domain — form extraction
// ============================================================

describe('ssiGetScoringPage', () => {
  it('extracts form action from scoring page', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('scoring-page.html')))
    const result = await ssiGetScoringPage('12345', cookies)
    expect(result.formAction).toBe('/nordic/competitor/12345/score-in-match/')
    expect(result.html).toContain('zone_1')
  })

  it('returns null csrfToken when page has no CSRF field', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fixture('scoring-page.html')))
    const result = await ssiGetScoringPage('12345', cookies)
    expect(result.csrfToken).toBeNull()
  })

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(ssiGetScoringPage('12345', cookies))
      .rejects.toThrow('Scoring page HTTP 404')
  })
})

describe('ssiSubmitScore', () => {
  it('returns success on 302 redirect', async () => {
    vi.stubGlobal('fetch', mockFetchRedirect())
    const formData = new URLSearchParams({ zone_1: 'A', time: '5.5' })
    const result = await ssiSubmitScore('12345', formData, cookies, null)
    expect(result).toEqual({ success: true, message: 'Score submitted successfully' })
  })

  it('returns error message from validation errors', async () => {
    const errorHtml = '<html><ul class="errorlist"><li>Time is required</li></ul></html>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      text: async () => errorHtml,
    }))
    const formData = new URLSearchParams({ zone_1: 'A' })
    const result = await ssiSubmitScore('12345', formData, cookies, null)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Time is required')
  })

  it('throws on unexpected HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 500 }))
    const formData = new URLSearchParams({ zone_1: 'A' })
    await expect(ssiSubmitScore('12345', formData, cookies, null))
      .rejects.toThrow('Score submission failed with HTTP 500')
  })
})
