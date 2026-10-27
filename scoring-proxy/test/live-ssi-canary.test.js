import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyPreviewDeployment } from './e2e/verify-preview-deploy.js'
import { runLiveSsiCanary } from './e2e/live-ssi-canary.js'
import { auditLogin, auditMutation, serializeAuditLogJson } from '../lib/session/audit.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('R90-TEST9: Tier 2 Post-Deploy Preview Smoke Verifier', () => {
  it('succeeds when /api/v1/health returns ok and / serves SPA root', async () => {
    const mockFetch = vi.fn(async (url) => {
      if (String(url).endsWith('/api/v1/health')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
      }
      return { ok: true, status: 200, text: async () => '<html><body><div id="root"></div></body></html>' }
    })

    const res = await verifyPreviewDeployment({
      baseUrl: 'https://turres-ssi-tools-pr-172.onrender.com',
      maxAttempts: 2,
      delayMs: 0,
      fetchImpl: mockFetch,
    })
    expect(res.ok).toBe(true)
    expect(res.attempts).toBe(1)
  })

  it('retries and reports error when preview is unreachable', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
    const res = await verifyPreviewDeployment({
      baseUrl: 'https://turres-ssi-tools-pr-172.onrender.com',
      maxAttempts: 2,
      delayMs: 0,
      fetchImpl: mockFetch,
    })
    expect(res.ok).toBe(false)
    expect(res.attempts).toBe(2)
    expect(res.error).toContain('Connection refused')
  })
})

describe('R90-TEST10: Tier 3 Live-SSI Upstream Compatibility Canary', () => {
  it('verifies SSI web login, GraphQL me + NordicSquadNode, and Group 25874 admin scraping', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      const urlStr = String(url)
      if (urlStr.includes('/login/')) {
        if (opts.method === 'POST') {
          return {
            status: 302,
            headers: {
              getSetCookie: () => ['sessionid=live-sess-123; Path=/', 'csrftoken=csrf-123; Path=/'],
              get: (k) => (k.toLowerCase() === 'location' ? '/dashboard/' : null),
            },
          }
        }
        return {
          ok: true,
          status: 200,
          headers: { getSetCookie: () => ['csrftoken=csrf-123; Path=/'] },
          text: async () => '<input name="csrfmiddlewaretoken" value="csrf-123" />',
        }
      }
      if (urlStr.includes('/graphql/')) {
        const body = JSON.parse(opts.body || '{}')
        if (body.query.includes('token_auth')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: { token_auth: { token: { token: 'jwt-123' } } } }),
          }
        }
        if (body.query.includes('me {')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: { me: { email: 'bot@turres.fi', first_name: 'TurRes', last_name: 'Bot' } } }),
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { events: [{ id: '160', name: 'Kupittaa CUP' }] } }),
        }
      }
      if (urlStr.includes('/groups/25874/')) {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <table>
              <tr>
                <td><input type="checkbox" value="503" /></td>
                <td>Edit</td>
                <td>TurRes Bot</td>
                <td>- | -</td>
                <td>- | -</td>
                <td>admin</td>
              </tr>
            </table>
          `,
        }
      }
      throw new Error(`Unexpected URL: ${urlStr}`)
    }))

    const result = await runLiveSsiCanary({
      email: 'bot@turres.fi',
      password: 'secret',
      apiKey: 'api-key',
      groupId: '25874',
    })
    expect(result.ok).toBe(true)
    expect(result.groupAdminsCount).toBe(1)
  })
})

describe('R90-LOG2: Audit Log JSON Level & Omission of Null Error Keys', () => {
  it('sets level="info" and omits "error" and "errorCode" on successful LOGIN_SUCCESS and SSI_OPERATION logs', () => {
    const loginEntry = auditLogin('tohewi@live.com', '172.64.223.12', true)
    expect(loginEntry.level).toBe('info')
    expect('error' in loginEntry).toBe(false)

    const loginJson = serializeAuditLogJson(loginEntry)
    expect(loginJson).toContain('"level":"info"')
    expect(loginJson).not.toContain('"error"')

    const mutationEntry = auditMutation({
      endpoint: '/api/v1/guns',
      operation: 'create_gun',
      initiatingUserId: 'tohewi@live.com',
      executionIdentityUserId: 'tohewi@live.com',
      result: 'success',
    })
    const mutationJson = serializeAuditLogJson(mutationEntry)
    expect(mutationJson).toContain('"level":"info"')
    expect(mutationJson).not.toContain('"error"')
    expect(mutationJson).not.toContain('"errorCode"')
  })
})
