// ============================================================
// SSI Core Client Tests
// ============================================================

import { describe, it, expect, afterEach, vi } from 'vitest'
import { ssiFindCompetitorInMatch } from '../lib/ssi-core/client.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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
