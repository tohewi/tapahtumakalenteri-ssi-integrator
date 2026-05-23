import { describe, it, expect, vi } from 'vitest'
import {
  assertLocalCapacity,
  buildPublicRegistrationResult,
  createBufferedRegistration,
  initialSyncStatusForRegistration,
  markRegistrationSyncResult,
  registrationSuccessMessage,
} from '../lib/services/registration-buffer-service.js'

function createDb({ cupCount = 0, squadCount = 0, existingRows = [] } = {}) {
  const calls = []
  return {
    calls,
    withTransaction: vi.fn(async (callback) => callback({
      query: vi.fn(async (sql, params = []) => {
        calls.push({ sql, params })
        if (sql.includes('SELECT * FROM public_registrations') && sql.includes('FOR UPDATE')) return { rows: existingRows }
        if (sql.includes('INSERT INTO public_registrations')) return { rows: [rowFromParams(params)] }
        if (sql.includes('UPDATE public_registrations')) return { rows: [{ ...rowFromParams(['reg-1', '150', 'Cup', null, 1, 'Laina-ase', 'Matti', 'matti@example.com', null, 'yes', 'matti@example.com', 'confirmed', params[2] || 'synced', params[3], params[4]]) }] }
        return { rows: [] }
      }),
    })),
    query: vi.fn(async (sql, params = []) => {
      calls.push({ sql, params })
      if (sql.includes('SELECT COUNT') && params.length === 2) return { rows: [{ count: cupCount }] }
      if (sql.includes('SELECT COUNT') && params.length === 3) return { rows: [{ count: squadCount }] }
      if (sql.includes('UPDATE public_registrations')) return { rows: [{ ...rowFromParams(['reg-1', '150', 'Cup', null, 1, 'Laina-ase', 'Matti', 'matti@example.com', null, 'yes', 'matti@example.com', 'confirmed', params[2] || 'synced', params[3], params[4]]) }] }
      if (sql.includes('INSERT INTO public_registration_sync_attempts')) return { rows: [{ id: params[0], registration_id: params[1], status: params[4] }] }
      return { rows: [] }
    }),
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

const input = {
  cupId: '150',
  cupName: 'Kupittaa Cup',
  cupStarts: '2026-05-30T09:00:00+03:00',
  squadNumber: 1,
  squadLabel: 'Laina-ase',
  name: 'Matti',
  email: 'matti@example.com',
  hasSsiAccount: 'no',
}

describe('registration-buffer-service', () => {
  it('selects pending sync for SSI account registrations', () => {
    expect(initialSyncStatusForRegistration({ hasSsiAccount: 'yes' })).toBe('pending')
  })

  it('selects manual_needed sync for non-SSI registrations', () => {
    expect(initialSyncStatusForRegistration({ hasSsiAccount: 'no' })).toBe('manual_needed')
    expect(initialSyncStatusForRegistration({ hasSsiAccount: 'unsure' })).toBe('manual_needed')
  })

  it('returns Finnish success messages by sync state', () => {
    expect(registrationSuccessMessage('synced')).toContain('SSI-squadiin')
    expect(registrationSuccessMessage('manual_needed')).toContain('Järjestäjä näkee')
    expect(registrationSuccessMessage('failed')).toContain('SSI-käsittely epäonnistui')
  })

  it('builds public-safe registration result', () => {
    const result = buildPublicRegistrationResult({
      created: true,
      registration: {
        id: 'reg-1',
        status: 'confirmed',
        syncStatus: 'manual_needed',
        cupNameSnapshot: 'Kupittaa Cup',
        cupStartsSnapshot: '2026-05-30T09:00:00+03:00',
        selectedSquadNumber: 1,
        selectedSquadLabel: 'Laina-ase',
        email: 'matti@example.com',
        syncErrorMessage: 'internal error must not leak',
      },
    })

    expect(result.success).toBe(true)
    expect(result.registration).toEqual({
      id: 'reg-1',
      cupName: 'Kupittaa Cup',
      cupStarts: '2026-05-30T09:00:00+03:00',
      squadNumber: 1,
      squadLabel: 'Laina-ase',
      email: 'matti@example.com',
    })
    expect(JSON.stringify(result)).not.toContain('internal error must not leak')
  })

  it('allows capacity when cup and squad have room', async () => {
    const db = createDb({ cupCount: 10, squadCount: 3 })
    const counts = await assertLocalCapacity(db, { cupId: '150', squadNumber: 1, cupMaxCompetitors: 25, squadMaxCompetitors: 7 })
    expect(counts).toEqual({ cupCount: 10, squadCount: 3 })
  })

  it('rejects a full cup before storing registration', async () => {
    const db = createDb({ cupCount: 25, squadCount: 3 })
    await expect(assertLocalCapacity(db, { cupId: '150', squadNumber: 1, cupMaxCompetitors: 25, squadMaxCompetitors: 7 }))
      .rejects.toMatchObject({ code: 'CUP_FULL', publicMessage: 'Tapahtuma on täynnä.' })
  })

  it('rejects a full squad before storing registration', async () => {
    const db = createDb({ cupCount: 10, squadCount: 7 })
    await expect(assertLocalCapacity(db, { cupId: '150', squadNumber: 1, cupMaxCompetitors: 25, squadMaxCompetitors: 7 }))
      .rejects.toMatchObject({ code: 'SQUAD_FULL', publicMessage: 'Valittu squad on täynnä.' })
  })

  it('creates a local buffered registration with manual_needed sync for non-SSI participants', async () => {
    const db = createDb({ cupCount: 1, squadCount: 1 })
    const result = await createBufferedRegistration(db, input, {
      cupMaxCompetitors: 25,
      squadMaxCompetitors: 7,
      idFactory: () => 'reg-1',
    })

    expect(result).toMatchObject({ success: true, created: true, syncStatus: 'manual_needed' })
    expect(db.calls.some(call => call.sql.includes('INSERT INTO public_registrations'))).toBe(true)
  })

  it('marks sync result and records sync attempt', async () => {
    const db = createDb()
    const registration = await markRegistrationSyncResult(db, 'reg-1', {
      success: false,
      manualNeeded: true,
      errorCode: 'SSI_USER_NOT_FOUND',
      errorMessage: 'User not found',
      details: { operation: 'register' },
    }, { idFactory: () => 'attempt-1' })

    expect(registration).toMatchObject({ id: 'reg-1', syncStatus: 'manual_needed', syncErrorCode: 'SSI_USER_NOT_FOUND' })
    expect(db.calls.some(call => call.sql.includes('INSERT INTO public_registration_sync_attempts'))).toBe(true)
  })
})
