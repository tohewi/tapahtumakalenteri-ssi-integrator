import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../middleware/errorHandler.js'
import { closeRedis, initRedis } from '../lib/session/redis.js'
import { createWaitlistRouter } from '../routes/waitlist.js'

function allowAuth(userId = 'admin@example.com') {
  return () => (req, res, next) => {
    req.ssiSession = { _userId: userId, scope: 'waitlist' }
    next()
  }
}

function denyAuth() {
  return () => (req, res) => {
    res.status(401).json({ error: 'Authentication required.' })
  }
}

function buildApp(requireAuth = allowAuth()) {
  const app = express()
  const captchaChallenges = new Map()
  const passThrough = (req, res, next) => next()

  app.use('/api/v1/waitlist', createWaitlistRouter({
    captchaChallenges,
    CAPTCHA_TTL: 15 * 60 * 1000,
    captchaLimiter: passThrough,
    bodyLimit: express.json({ limit: '1kb' }),
    submitLimiter: passThrough,
    requireAuth,
    emailExistsInSSI: vi.fn().mockResolvedValue(true),
    sendConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
    sendStatusChangeEmail: vi.fn().mockResolvedValue({ success: true }),
  }))
  app.use(errorHandler)

  return app
}

async function seedWaitlistEntry(app, email) {
  const captchaRes = await request(app).get('/api/v1/waitlist/captcha')
  const [a, b] = captchaRes.body.question.match(/(\d+) \+ (\d+)/).slice(1).map(Number)

  const res = await request(app)
    .post('/api/v1/waitlist/submit')
    .send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      association: 'TurRes',
      equipmentChoice: 'need-club-22',
      preferredLanguage: 'fi',
      captchaId: captchaRes.body.id,
      captchaAnswer: a + b,
    })

  return res.body.entry
}

describe('wait list admin router', () => {
  beforeEach(async () => {
    delete process.env.REDIS_URL
    await initRedis()
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    await closeRedis()
  })

  it('requires waitlist authentication for admin data', async () => {
    const app = buildApp(denyAuth())
    const res = await request(app).get('/api/v1/waitlist/admin/data')
    expect(res.status).toBe(401)
  })

  it('lists admin data for authenticated waitlist admin', async () => {
    const app = buildApp()
    await seedWaitlistEntry(app, 'ada@example.com')

    const res = await request(app).get('/api/v1/waitlist/admin/data')
    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(1)
    expect(res.body.groups).toHaveLength(0)
  })

  it('creates and completes induction groups for authenticated waitlist admin', async () => {
    const app = buildApp()
    const first = await seedWaitlistEntry(app, 'ada@example.com')
    const second = await seedWaitlistEntry(app, 'grace@example.com')

    const createRes = await request(app)
      .post('/api/v1/waitlist/admin/groups')
      .send({
        participantIds: [first.id, second.id],
        label: 'May 2026',
        plannedDate: '2026-05-03',
      })

    expect(createRes.status).toBe(201)
    expect(createRes.body.group.status).toBe('planned')

    const completeRes = await request(app)
      .post(`/api/v1/waitlist/admin/groups/${createRes.body.group.id}/complete`)
      .send({})

    expect(completeRes.status).toBe(200)
    expect(completeRes.body.group.status).toBe('completed')

    const dataRes = await request(app).get('/api/v1/waitlist/admin/data')
    expect(dataRes.body.entries.every(entry => entry.status === 'completed')).toBe(true)
    expect(dataRes.body.groups[0].status).toBe('completed')
  })

  it('supports self-cancel and admin cancel endpoints', async () => {
    const app = buildApp()
    const first = await seedWaitlistEntry(app, 'ada@example.com')
    const second = await seedWaitlistEntry(app, 'grace@example.com')

    const selfCancelRes = await request(app)
      .post('/api/v1/waitlist/cancel')
      .send({ email: first.email })

    expect(selfCancelRes.status).toBe(200)
    expect(selfCancelRes.body.entry.status).toBe('withdrawn')

    const adminCancelRes = await request(app)
      .post(`/api/v1/waitlist/admin/entries/${second.id}/cancel`)
      .send({})

    expect(adminCancelRes.status).toBe(200)
    expect(adminCancelRes.body.entry.status).toBe('withdrawn')
  })
})