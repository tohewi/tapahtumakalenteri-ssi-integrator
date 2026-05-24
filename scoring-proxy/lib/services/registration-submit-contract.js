import { createBufferedRegistration } from './registration-buffer-service.js'
import { registrationMessage } from './registration-messages.js'
import { publicValidationError, validateBufferedRegistrationInput } from './registration-validation.js'

export function verifyCaptchaForBufferedSubmit({ captchaChallenges, captchaId, captchaAnswer, captchaTtlMs, now = Date.now() }) {
  const challenge = captchaChallenges.get(captchaId)
  if (!challenge) {
    return { ok: false, status: 400, body: { error: registrationMessage('captchaExpired') } }
  }

  captchaChallenges.delete(captchaId)

  if (now - challenge.created > captchaTtlMs) {
    return { ok: false, status: 400, body: { error: registrationMessage('captchaExpired') } }
  }

  if (Number(captchaAnswer) !== challenge.answer) {
    return { ok: false, status: 400, body: { error: registrationMessage('captchaWrong') } }
  }

  return { ok: true }
}

export function mapBufferedSubmitToRegistrationInput(body, cupSnapshot = {}, squadSnapshot = {}) {
  return {
    cupId: body.cupId,
    cupName: cupSnapshot.name || body.cupName,
    cupStarts: cupSnapshot.starts || body.cupStarts,
    squadNumber: body.squadNumber,
    squadLabel: squadSnapshot.name || body.squadLabel,
    name: body.name,
    email: body.email,
    phone: body.phone,
    hasSsiAccount: body.hasSsiAccount,
    ssiEmail: body.ssiEmail,
  }
}

export async function handleBufferedSubmit({
  db,
  body,
  captchaChallenges,
  captchaTtlMs,
  cupSnapshot,
  squadSnapshot,
  capacity,
  idFactory,
  now,
}) {
  const validationErrors = validateBufferedRegistrationInput(body)
  if (validationErrors.length > 0) {
    return { ok: false, status: 400, body: publicValidationError(), validationErrors }
  }

  const captchaResult = verifyCaptchaForBufferedSubmit({
    captchaChallenges,
    captchaId: body.captchaId,
    captchaAnswer: body.captchaAnswer,
    captchaTtlMs,
    now,
  })
  if (!captchaResult.ok) return captchaResult

  try {
    const result = await createBufferedRegistration(
      db,
      mapBufferedSubmitToRegistrationInput(body, cupSnapshot, squadSnapshot),
      {
        cupMaxCompetitors: capacity?.cupMaxCompetitors,
        squadMaxCompetitors: capacity?.squadMaxCompetitors,
        idFactory,
      }
    )
    return { ok: true, status: 200, body: result }
  } catch (err) {
    if (err.code === 'CUP_FULL' || err.code === 'SQUAD_FULL') {
      return { ok: false, status: 409, body: { error: err.message || registrationMessage('capacityFull') } }
    }
    throw err
  }
}
