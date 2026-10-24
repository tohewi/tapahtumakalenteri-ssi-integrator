// ============================================================
// Session Reliability, Security & Latency Benchmark Tests
// (R76-TEST1, R76-TEST2, R76-TEST3, R76-TEST4, R76-TEST5)
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initRedis, closeRedis, getRedisClient } from '../../lib/session/redis.js'
import {
  createSession,
  getSession,
  touchSession,
  deleteSession,
  getUserSessions,
  revokeAllUserSessions,
  getImpersonationContext,
  getActiveSessionCount,
} from '../../lib/session/store.js'
import { createMockSessionInput, createExpiredUserSSI } from '../fixtures/sessions.js'

beforeEach(async () => {
  delete process.env.REDIS_URL
  await initRedis()
})

afterEach(async () => {
  await closeRedis()
})

describe('Session Reliability & Fallback Recovery (R76-TEST4)', () => {
  it('falls back cleanly to in-memory store when Redis is unconfigured', async () => {
    expect(getRedisClient()?.constructor?.name).toBe('MemoryStore')
    const { sessionId } = await createSession(createMockSessionInput({ userId: 'fallback@example.com' }))
    const session = await getSession(sessionId)
    expect(session).not.toBeNull()
    expect(session.userId).toBe('fallback@example.com')
  })

  it('isolates and revokes concurrent sessions across devices per user (R76-TEST2)', async () => {
    const s1 = await createSession(createMockSessionInput({
      userId: 'multi@example.com',
      scope: 'scoring',
      metadata: { deviceLabel: 'Tablet 1' },
    }))
    const s2 = await createSession(createMockSessionInput({
      userId: 'multi@example.com',
      scope: 'manage',
      metadata: { deviceLabel: 'Laptop' },
    }))
    const sOther = await createSession(createMockSessionInput({
      userId: 'other@example.com',
      scope: 'scoring',
    }))

    const userSessions = await getUserSessions('multi@example.com')
    expect(userSessions).toHaveLength(2)
    expect(await getActiveSessionCount()).toBeGreaterThanOrEqual(3)

    const revokedCount = await revokeAllUserSessions('multi@example.com')
    expect(revokedCount).toBe(2)
    expect(await getSession(s1.sessionId)).toBeNull()
    expect(await getSession(s2.sessionId)).toBeNull()
    expect(await getSession(sOther.sessionId)).not.toBeNull()
  })
})

describe('Session Security & Impersonation Hardening (R76-TEST3)', () => {
  it('prevents cookie replay after explicit logout and blocks impersonation when user token expires', async () => {
    const { sessionId } = await createSession(createMockSessionInput({ userId: 'sec@example.com' }))
    await deleteSession(sessionId)
    expect(await getSession(sessionId)).toBeNull()
    expect(await touchSession(sessionId, { scope: 'manage' })).toBeNull()

    const expiredInput = createMockSessionInput({
      userId: 'expired@example.com',
      userSSI: createExpiredUserSSI(),
    })
    const { session } = await createSession(expiredInput)
    expect(getImpersonationContext(session)).toBeNull()
  })
})

describe('Session Performance Benchmark (R76-TEST5)', () => {
  it('maintains <50ms p95 session lookup latency across 100 concurrent sessions', async () => {
    const sessionIds = []
    for (let i = 0; i < 100; i++) {
      const { sessionId } = await createSession(
        createMockSessionInput({ userId: `perf-${i}@example.com`, scope: 'scoring' })
      )
      sessionIds.push(sessionId)
    }

    const latencies = []
    await Promise.all(
      sessionIds.map(async (sid) => {
        const start = performance.now()
        const sess = await getSession(sid)
        const elapsed = performance.now() - start
        expect(sess).not.toBeNull()
        latencies.push(elapsed)
      })
    )

    latencies.sort((a, b) => a - b)
    const p95Index = Math.floor(latencies.length * 0.95) - 1
    const p95Ms = latencies[Math.max(0, p95Index)]
    expect(p95Ms).toBeLessThan(50)
  })
})
