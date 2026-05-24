import { describe, it, expect } from 'vitest'
import {
  isBufferedRegistrationInputValid,
  publicValidationError,
  validateBufferedRegistrationInput,
} from '../lib/services/registration-validation.js'

const valid = {
  cupId: '150',
  squadNumber: 1,
  name: 'Matti Meikäläinen',
  email: 'matti@example.com',
  phone: '+358 40 123 4567',
  hasSsiAccount: 'yes',
  ssiEmail: 'matti.ssi@example.com',
  captchaId: '11111111-1111-4111-8111-111111111111',
  captchaAnswer: 4,
}

describe('registration-validation', () => {
  it('accepts a valid SSI-account registration input', () => {
    expect(validateBufferedRegistrationInput(valid)).toEqual([])
    expect(isBufferedRegistrationInputValid(valid)).toBe(true)
  })

  it('accepts non-SSI registration when contact email is present', () => {
    const errors = validateBufferedRegistrationInput({ ...valid, hasSsiAccount: 'no', ssiEmail: '' })
    expect(errors).toEqual([])
  })

  it('requires contact email for all registrations', () => {
    const errors = validateBufferedRegistrationInput({ ...valid, email: '' })
    expect(errors).toContain('email: required')
  })

  it('requires SSI email only when the shooter says they have an SSI account', () => {
    expect(validateBufferedRegistrationInput({ ...valid, hasSsiAccount: 'yes', ssiEmail: '' })).toContain('ssiEmail: required')
    expect(validateBufferedRegistrationInput({ ...valid, hasSsiAccount: 'unsure', ssiEmail: '' })).not.toContain('ssiEmail: required')
  })

  it('rejects invalid enum and numeric values', () => {
    const errors = validateBufferedRegistrationInput({ ...valid, cupId: 'abc', squadNumber: 0, hasSsiAccount: 'maybe' })
    expect(errors).toContain('cupId: invalid format')
    expect(errors).toContain('squadNumber: invalid')
    expect(errors).toContain('hasSsiAccount: invalid')
  })

  it('rejects overly long or malformed contact fields', () => {
    const errors = validateBufferedRegistrationInput({
      ...valid,
      name: 'x'.repeat(121),
      email: `${'a'.repeat(250)}@example.com`,
      phone: 'invalid phone #',
    })
    expect(errors).toContain('name: too long')
    expect(errors).toContain('email: too long')
    expect(errors).toContain('phone: invalid format')
  })

  it('validates captcha fields', () => {
    const errors = validateBufferedRegistrationInput({ ...valid, captchaId: 'not-a-uuid', captchaAnswer: 'abc' })
    expect(errors).toContain('captchaId: invalid format')
    expect(errors).toContain('captchaAnswer: invalid')
  })

  it('returns generic Finnish public validation error', () => {
    expect(publicValidationError()).toEqual({ error: 'Virheelliset tiedot.' })
  })
})
