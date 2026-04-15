import crypto from 'node:crypto'
import express from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  cancelWaitlistEntry,
  completeInductionGroup,
  createInductionGroupSelection,
  listWaitlistAdminData,
  registerWaitlistEntry,
} from '../lib/services/waitlist-service.js'
import { findActiveEntryByEmail } from '../lib/waitlist/store.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateWaitlistInput({ firstName, lastName, email, association, equipmentChoice, preferredLanguage, captchaId, captchaAnswer }) {
  const errors = []

  if (typeof firstName !== 'string' || !firstName.trim() || firstName.length > 100) errors.push('firstName')
  if (typeof lastName !== 'string' || !lastName.trim() || lastName.length > 100) errors.push('lastName')
  if (typeof association !== 'string' || !association.trim() || association.length > 150) errors.push('association')
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) errors.push('email')
  if (!['need-club-22', 'own-pistol'].includes(equipmentChoice)) errors.push('equipmentChoice')
  if (preferredLanguage != null && !['fi', 'en'].includes(preferredLanguage)) errors.push('preferredLanguage')
  if (typeof captchaId !== 'string' || !UUID_RE.test(captchaId)) errors.push('captchaId')
  if (captchaAnswer == null || !Number.isInteger(Number(captchaAnswer)) || Math.abs(Number(captchaAnswer)) > 999) errors.push('captchaAnswer')

  return errors
}

export function createWaitlistRouter({
  captchaChallenges,
  CAPTCHA_TTL,
  captchaLimiter,
  bodyLimit,
  submitLimiter,
  requireAuth,
  emailExistsInSSI,
  sendConfirmationEmail,
  sendStatusChangeEmail,
}) {
  const router = express.Router()

  router.get('/captcha', captchaLimiter, (req, res) => {
    const a = Math.floor(Math.random() * 20) + 1
    const b = Math.floor(Math.random() * 20) + 1
    const id = crypto.randomUUID()
    captchaChallenges.set(id, { answer: a + b, created: Date.now() })
    res.json({ id, question: `${a} + ${b} = ?` })
  })

  router.post('/verify-captcha', bodyLimit, captchaLimiter, (req, res) => {
    const { captchaId, captchaAnswer } = req.body || {}
    const challenge = captchaChallenges.get(captchaId)

    if (!challenge) {
      return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
    }
    if (Date.now() - challenge.created > CAPTCHA_TTL) {
      captchaChallenges.delete(captchaId)
      return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
    }
    if (Number(captchaAnswer) !== challenge.answer) {
      return res.status(400).json({ error: 'Väärä vastaus. Tarkista ja yritä uudelleen.' })
    }

    challenge.verified = true
    res.json({ ok: true })
  })

  router.post('/submit', bodyLimit, submitLimiter, asyncHandler(async (req, res) => {
    const validationErrors = validateWaitlistInput(req.body || {})
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Virheelliset tiedot.' })
    }

    const { captchaId, captchaAnswer } = req.body
    const challenge = captchaChallenges.get(captchaId)
    if (!challenge) {
      return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
    }

    captchaChallenges.delete(captchaId)
    if (Date.now() - challenge.created > CAPTCHA_TTL) {
      return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
    }
    if (Number(captchaAnswer) !== challenge.answer) {
      return res.status(400).json({ error: 'Väärä vastaus. Yritä uudelleen.' })
    }

    const entry = await registerWaitlistEntry(req.body, { emailExistsInSSI, sendConfirmationEmail })
    res.status(201).json({
      ok: true,
      entry: {
        id: entry.id,
        firstName: entry.firstName,
        lastName: entry.lastName,
        email: entry.email,
        association: entry.association,
        equipmentChoice: entry.equipmentChoice,
        preferredLanguage: entry.preferredLanguage,
        status: entry.status,
      },
    })
  }))

  router.post('/cancel', bodyLimit, submitLimiter, asyncHandler(async (req, res) => {
    const { email } = req.body || {}
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Virheelliset tiedot.' })
    }

    const entry = await findActiveEntryByEmail(email.trim())
    if (!entry) {
      return res.status(404).json({ error: 'Wait list entry not found.' })
    }

    const updated = await cancelWaitlistEntry({
      entryId: entry.id,
      actorEmail: entry.email,
      sendStatusChangeEmail,
    })

    res.json({ ok: true, entry: updated })
  }))

  router.get('/admin/data', requireAuth ? requireAuth('waitlist') : (req, res, next) => next(), asyncHandler(async (req, res) => {
    const data = await listWaitlistAdminData()
    res.json(data)
  }))

  router.post('/admin/groups', requireAuth ? requireAuth('waitlist') : (req, res, next) => next(), bodyLimit, asyncHandler(async (req, res) => {
    const { participantIds, label, plannedDate } = req.body || {}
    const actorEmail = req.ssiSession?._userId || req.ssiSession?.userId || 'unknown'
    const group = await createInductionGroupSelection({
      participantIds,
      label,
      plannedDate,
      actorEmail,
    })

    if (sendStatusChangeEmail) {
      const { entries } = await listWaitlistAdminData()
      await Promise.all(entries
        .filter(entry => participantIds.includes(entry.id))
        .map(entry => sendStatusChangeEmail(entry, {
          status: 'selected',
          groupLabel: group.label,
          plannedDate: group.plannedDate,
        })))
    }

    res.status(201).json({ ok: true, group })
  }))

  router.post('/admin/groups/:id/complete', requireAuth ? requireAuth('waitlist') : (req, res, next) => next(), asyncHandler(async (req, res) => {
    const actorEmail = req.ssiSession?._userId || req.ssiSession?.userId || 'unknown'
    const group = await completeInductionGroup({
      groupId: req.params.id,
      actorEmail,
      sendStatusChangeEmail,
    })

    res.json({ ok: true, group })
  }))

  router.post('/admin/entries/:id/cancel', requireAuth ? requireAuth('waitlist') : (req, res, next) => next(), asyncHandler(async (req, res) => {
    const actorEmail = req.ssiSession?._userId || req.ssiSession?.userId || 'unknown'
    const entry = await cancelWaitlistEntry({
      entryId: req.params.id,
      actorEmail,
      sendStatusChangeEmail,
    })

    res.json({ ok: true, entry })
  }))

  return router
}