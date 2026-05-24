import { registrationMessage } from './registration-messages.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+()\-\s.]{0,40}$/

export const SSI_ACCOUNT_VALUES = ['yes', 'no', 'unsure']

export function validateBufferedRegistrationInput(input = {}) {
  const errors = []

  const cupId = input.cupId ?? input.ssiCupId
  if (typeof cupId !== 'string' && typeof cupId !== 'number') errors.push('cupId: required')
  else if (!/^\d{1,10}$/.test(String(cupId))) errors.push('cupId: invalid format')

  const squadNumber = input.squadNumber ?? input.selectedSquadNumber
  if (squadNumber == null) errors.push('squadNumber: required')
  else if (!Number.isInteger(Number(squadNumber)) || Number(squadNumber) < 1 || Number(squadNumber) > 99) errors.push('squadNumber: invalid')

  if (typeof input.name !== 'string' || input.name.trim().length === 0) errors.push('name: required')
  else if (input.name.trim().length > 120) errors.push('name: too long')

  if (typeof input.email !== 'string' || input.email.trim().length === 0) errors.push('email: required')
  else if (input.email.trim().length > 254) errors.push('email: too long')
  else if (!EMAIL_RE.test(input.email.trim())) errors.push('email: invalid format')

  if (input.phone != null && input.phone !== '') {
    const phone = String(input.phone).trim()
    if (phone.length > 40) errors.push('phone: too long')
    else if (!PHONE_RE.test(phone)) errors.push('phone: invalid format')
  }

  const hasSsiAccount = String(input.hasSsiAccount || '').trim().toLowerCase()
  if (!SSI_ACCOUNT_VALUES.includes(hasSsiAccount)) errors.push('hasSsiAccount: invalid')

  if (hasSsiAccount === 'yes') {
    if (typeof input.ssiEmail !== 'string' || input.ssiEmail.trim().length === 0) errors.push('ssiEmail: required')
    else if (input.ssiEmail.trim().length > 254) errors.push('ssiEmail: too long')
    else if (!EMAIL_RE.test(input.ssiEmail.trim())) errors.push('ssiEmail: invalid format')
  } else if (input.ssiEmail != null && input.ssiEmail !== '') {
    if (String(input.ssiEmail).trim().length > 254) errors.push('ssiEmail: too long')
    else if (!EMAIL_RE.test(String(input.ssiEmail).trim())) errors.push('ssiEmail: invalid format')
  }

  if (typeof input.captchaId !== 'string') errors.push('captchaId: required')
  else if (!UUID_RE.test(input.captchaId)) errors.push('captchaId: invalid format')

  if (input.captchaAnswer == null) errors.push('captchaAnswer: required')
  else if (!Number.isInteger(Number(input.captchaAnswer)) || Math.abs(Number(input.captchaAnswer)) > 999) errors.push('captchaAnswer: invalid')

  return errors
}

export function isBufferedRegistrationInputValid(input = {}) {
  return validateBufferedRegistrationInput(input).length === 0
}

export function publicValidationError() {
  return { error: registrationMessage('validationInvalid') }
}
