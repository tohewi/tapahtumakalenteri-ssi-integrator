// ============================================================
// SSI Core Client Tests
// ============================================================

import { describe, it, expect, afterEach, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ssiGraphQL } from '../lib/ssi-core/graphql.js'
import { ssiFindCompetitorInMatch } from '../lib/ssi-core/participants.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

afterEach(() => {
  delete process.env.SSI_GRAPHQL_MAX_RETRIES
  delete process.env.SSI_ADMIN_API_KEY
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function makeHeaders(values = {}) {
  return {
    get: (name) => values[name.toLowerCase()] || null,
  }
}

describe('ssiGraphQL hardening', () => {
  it('retries once on transient 502 and succeeds', async () => {
    process.env.SSI_GRAPHQL_MAX_RETRIES = '2'
    process.env.SSI_ADMIN_API_KEY = 'test-api-key'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => '<html>bad gateway</html>',
        headers: makeHeaders({ 'content-type': 'text/html' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { ok: true } }),
      })

    vi.stubGlobal('fetch', fetchMock)

    const data = await ssiGraphQL('jwt-token', 'query { ok }')

    expect(data).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('maps fetch-failed upstream errors to UPSTREAM_UNAVAILABLE', async () => {
    process.env.SSI_GRAPHQL_MAX_RETRIES = '0'
    process.env.SSI_ADMIN_API_KEY = 'test-api-key'

    const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ssiGraphQL('jwt-token', 'query { ok }')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      statusCode: 503,
      isUpstreamTransient: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never uses deprecated EventInterface/CompetitorInterface scorecards or scorecards_count fields in scoring-proxy (R91-SSI4)', () => {
    const dirs = [
      path.resolve(__dirname, '../routes'),
      path.resolve(__dirname, '../lib/services'),
      path.resolve(__dirname, '../lib/ssi-core'),
    ]
    for (const dir of dirs) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue
        const content = readFileSync(path.join(dir, entry.name), 'utf8')
        expect(content).not.toMatch(/\bscorecards_count\b/)
        expect(content).not.toMatch(/stages\s*\{\s*scorecards\b/)
      }
    }
  })
})

describe('ssiFindCompetitorInMatch', () => {
  it('uses email to disambiguate duplicate name matches', async () => {
    const html = `
      <table>
        <tr>
          <td><a href="/event/participant/93/111/">John Doe</a></td>
          <td>john.one@example.com</td>
        </tr>
        <tr>
          <td><a href="/event/participant/93/222/">John Doe</a></td>
          <td>john.two@example.com</td>
        </tr>
      </table>
    `

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    })
    vi.stubGlobal('fetch', fetchMock)

    const participantId = await ssiFindCompetitorInMatch(
      '12345',
      'John Doe',
      { sessionid: 'mock-session' },
      'john.two@example.com'
    )

    expect(participantId).toBe('222')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null when shooter is not found', async () => {
    const html = `
      <table>
        <tr>
          <td><a href="/event/participant/93/111/">Jane Doe</a></td>
          <td>jane@example.com</td>
        </tr>
      </table>
    `

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    }))

    const participantId = await ssiFindCompetitorInMatch(
      '12345',
      'John Doe',
      { sessionid: 'mock-session' },
      'john@example.com'
    )

    expect(participantId).toBeNull()
  })
})
