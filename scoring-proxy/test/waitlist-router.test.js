import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../middleware/errorHandler.js'
import { closeRedis, initRedis } from '../lib/session/redis.js'
import { createWaitlistRouter } from '../routes/waitlist.js'

function buildApp({ emailExistsInSSI = vi.fn().mockResolvedValue(true), sendConfirmationEmail = vi.fn().mockResolvedValue({ success: true }) } = {}) {
  const app = express()
  const captchaChallenges = new Map()
  const passThrough = (req, res, next) => next()

  app.use('/api/v1/waitlist', createWaitlistRouter({
    captchaChallenges,
    CAPTCHA_TTL: 15 * 60 * 1000,
    captchaLimiter: passThrough,
    bodyLimit: express.json({ limit: '1kb' }),
    submitLimiter: passThrough,
    emailExistsInSSI,
    sendConfirmationEmail,
  }))
  app.use(errorHandler)

  return { app, emailExistsInSSI, sendConfirmationEmail }
}

describe('wait list router', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    await initRedis()
  })

  afterEach(async () => {
    await closeRedis()
  })

  it('creates a captcha challenge', async () => {
    const { app } = buildApp()
    const res = await request(app).get('/api/v1/waitlist/captcha')
    expect(res.status).toBe(200)
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.question).toMatch(/^\d+ \+ \d+ = \?$/)
  })

  it('submits a wait list registration through the service boundary', async () => {
    const { app } = buildApp()
    const captchaRes = await request(app).get('/api/v1/waitlist/captcha')
    const [a, b] = captchaRes.body.question.match(/(\d+) \+ (\d+)/).slice(1).map(Number)

    const res = await request(app)
      .post('/api/v1/waitlist/submit')
      .send({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        association: 'TurRes',
        equipmentChoice: 'need-club-22',
        preferredLanguage: 'en',
        captchaId: captchaRes.body.id,
        captchaAnswer: a + b,
      })

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.entry.status).toBe('waiting')
    expect(res.body.entry.preferredLanguage).toBe('en')
  })

  it('rejects invalid payloads before hitting dependencies', async () => {
    const { app, emailExistsInSSI, sendConfirmationEmail } = buildApp()
    const captchaRes = await request(app).get('/api/v1/waitlist/captcha')
    const [a, b] = captchaRes.body.question.match(/(\d+) \+ (\d+)/).slice(1).map(Number)

    const res = await request(app)
      .post('/api/v1/waitlist/submit')
      .send({
        firstName: '',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        association: 'TurRes',
        equipmentChoice: 'need-club-22',
        captchaId: captchaRes.body.id,
        captchaAnswer: a + b,
      })

    expect(res.status).toBe(400)
    expect(emailExistsInSSI).not.toHaveBeenCalled()
    expect(sendConfirmationEmail).not.toHaveBeenCalled()
  })

  it('returns 404 when SSI email validation fails', async () => {
    const { app } = buildApp({ emailExistsInSSI: vi.fn().mockResolvedValue(false) })
    const captchaRes = await request(app).get('/api/v1/waitlist/captcha')
    const [a, b] = captchaRes.body.question.match(/(\d+) \+ (\d+)/).slice(1).map(Number)

    const res = await request(app)
      .post('/api/v1/waitlist/submit')
      .send({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        association: 'TurRes',
        equipmentChoice: 'need-club-22',
        captchaId: captchaRes.body.id,
        captchaAnswer: a + b,
      })

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})