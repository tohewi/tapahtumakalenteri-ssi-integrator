import { describe, it, expect, vi } from 'vitest'
import {
  handleBufferedSubmit,
  mapBufferedSubmitToRegistrationInput,
  verifyCaptchaForBufferedSubmit,
} from '../lib/services/registration-submit-contract.js'

function createDb({ cupCount = 0, squadCount = 0 } = {}) {
  const calls = []
  const query = vi.fn(async (sql, params = []) => {
    calls.push({ sql, params })
    if (sql.includes('SELECT pg_advisory_xact_lock')) return { rows: [] }
    if (sql.includes('SELECT COUNT') && params.length === 2) return { rows: [{ count: cupCount }] }
    if (sql.includes('SELECT COUNT') && params.length === 3) return { rows: [{ count: squadCount }] }
    if (sql.includes('SELECT * FROM public_registrations') && sql.includes('FOR UPDATE')) return { rows: [] }
    if (sql.includes('INSERT INTO public_registrations')) return { rows: [rowFromParams(params)] }
    return { rows: [] }
  })

  return {
    calls,
    query,
    withTransaction: vi.fn(async (callback) => callback({ query })),
  }
}

function rowFromParams(params) {
  return {
    id: params[0],
    ssi_cup_id: params[1],
    cup_name_snapshot: params[2],
    cup_starts_snapshot: params[3],
    selected_squad_number: params[4],
    selected_squad_label: params[5],
    shooter_name: params[6],
    email: params[7],
    phone: params[8],
    has_ssi_account: params[9],
    ssi_email: params[10],
    status: params[11],
    sync_status: params[12],
    sync_error_code: params[13],
    sync_error_message: params[14],
  }
}

const validBody = {
  cupId: '150',
  squadNumber: 1,
  name: 'Example Shooter',
  email: 'shooter@example.invalid',
  phone: '+000 000 0000',
  hasSsiAccount: 'no',
  ssiEmail: '',
  captchaId: '11111111-1111-4111-8111-111111111111',
  captchaAnswer: 7,
}

describe('registration-submit-contract', () => {
  it('verifies and consumes valid captcha', () => {
    const captchaChallenges = new Map([
      ['cap-1', { answer: 7, created: 1000 }],
    ])

    const result = verifyCaptchaForBufferedSubmit({
      captchaChallenges,
      captchaId: 'cap-1',
      captchaAnswer: 7,
      captchaTtlMs: 1000,
      now: 1200,
    })

    expect(result).toEqual({ ok: true })
    expect(captchaChallenges.has('cap-1')).toBe(false)
  })

  it('rejects missing or expired captcha', () => {
    const captchaChallenges = new Map([
      ['cap-1', { answer: 7, created: 1000 }],
    ])

    expect(verifyCaptchaForBufferedSubmit({ captchaChallenges, captchaId: 'missing', captchaAnswer: 7, captchaTtlMs: 1000, now: 1200 }))
      .toMatchObject({ ok: false, status: 400, body: { error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' } })

    expect(verifyCaptchaForBufferedSubmit({ captchaChallenges, captchaId: 'cap-1', captchaAnswer: 7, captchaTtlMs: 1000, now: 2501 }))
      .toMatchObject({ ok: false, status: 400, body: { error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' } })
    expect(captchaChallenges.has('cap-1')).toBe(false)
  })

  it('rejects wrong captcha and consumes it', () => {
    const captchaChallenges = new Map([
      ['cap-1', { answer: 7, created: 1000 }],
    ])

    const result = verifyCaptchaForBufferedSubmit({
      captchaChallenges,
      captchaId: 'cap-1',
      captchaAnswer: 8,
      captchaTtlMs: 1000,
      now: 1200,
    })

    expect(result).toMatchObject({ ok: false, status: 400, body: { error: 'Väärä vastaus. Yritä uudelleen.' } })
    expect(captchaChallenges.has('cap-1')).toBe(false)
  })

  it('maps public submit body to local registration input with cup and squad snapshots', () => {
    const mapped = mapBufferedSubmitToRegistrationInput(validBody, { name: 'Cup Snapshot', starts: '2026-05-30T09:00:00+03:00' }, { name: 'Laina-ase' })

    expect(mapped).toMatchObject({
      cupId: '150',
      cupName: 'Cup Snapshot',
      cupStarts: '2026-05-30T09:00:00+03:00',
      squadNumber: 1,
      squadLabel: 'Laina-ase',
      email: 'shooter@example.invalid',
      hasSsiAccount: 'no',
    })
  })

  it('returns generic validation error before captcha handling', async () => {
    const captchaChallenges = new Map([
      [validBody.captchaId, { answer: 7, created: 1000 }],
    ])

    const result = await handleBufferedSubmit({
      db: createDb(),
      body: { ...validBody, email: '' },
      captchaChallenges,
      captchaTtlMs: 1000,
      now: 1200,
    })

    expect(result).toMatchObject({ ok: false, status: 400, body: { error: 'Virheelliset tiedot.' } })
    expect(captchaChallenges.has(validBody.captchaId)).toBe(true)
  })

  it('creates local registration and returns public-safe response', async () => {
    const captchaChallenges = new Map([
      [validBody.captchaId, { answer: 7, created: 1000 }],
    ])

    const result = await handleBufferedSubmit({
      db: createDb({ cupCount: 1, squadCount: 1 }),
      body: validBody,
      captchaChallenges,
      captchaTtlMs: 1000,
      now: 1200,
      cupSnapshot: { name: 'Kupittaa Cup', starts: '2026-05-30T09:00:00+03:00' },
      squadSnapshot: { name: 'Laina-ase' },
      capacity: { cupMaxCompetitors: 25, squadMaxCompetitors: 7 },
      idFactory: () => 'reg-1',
    })

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ success: true, syncStatus: 'manual_needed' })
    expect(result.body.registration).toMatchObject({ id: 'reg-1', email: 'shooter@example.invalid', squadLabel: 'Laina-ase' })
  })

  it('returns conflict when local squad capacity is full', async () => {
    const captchaChallenges = new Map([
      [validBody.captchaId, { answer: 7, created: 1000 }],
    ])

    const result = await handleBufferedSubmit({
      db: createDb({ cupCount: 1, squadCount: 7 }),
      body: validBody,
      captchaChallenges,
      captchaTtlMs: 1000,
      now: 1200,
      cupSnapshot: { name: 'Kupittaa Cup' },
      squadSnapshot: { name: 'Laina-ase' },
      capacity: { cupMaxCompetitors: 25, squadMaxCompetitors: 7 },
    })

    expect(result).toMatchObject({ ok: false, status: 409, body: { error: 'Valittu squad on täynnä.' } })
  })
})
