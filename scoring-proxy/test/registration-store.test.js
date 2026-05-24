import { describe, it, expect, vi } from 'vitest'
import {
  initializeRegistrationSchema,
  normalizeRegistrationForStore,
  upsertRegistration,
  countActiveRegistrations,
  listRegistrationsForCup,
  updateRegistrationStatus,
  recordSyncAttempt,
} from '../lib/db/registration-store.js'

function createMockDb({ existingRows = [], insertedRow = null, updatedRow = null, count = 0, listRows = [], insertError = null } = {}) {
  const calls = []
  let selectCount = 0
  let insertCount = 0
  const client = {
    query: vi.fn(async (sql, params = []) => {
      calls.push({ sql, params })
      if (sql.includes('SELECT * FROM public_registrations') && sql.includes('FOR UPDATE')) {
        selectCount += 1
        return { rows: selectCount === 1 ? existingRows : (updatedRow ? [updatedRow] : existingRows) }
      }
      if (sql.includes('INSERT INTO public_registrations')) {
        insertCount += 1
        if (insertError && insertCount === 1) throw insertError
        return { rows: [insertedRow || rowFromParams(params)] }
      }
      if (sql.includes('UPDATE public_registrations')) {
        return { rows: [updatedRow || { ...existingRows[0], selected_squad_number: params[3], sync_status: params[10] }] }
      }
      if (sql.includes('SELECT COUNT')) return { rows: [{ count }] }
      if (sql.includes('ORDER BY selected_squad_number')) return { rows: listRows }
      if (sql.includes('INSERT INTO public_registration_sync_attempts')) {
        return { rows: [{ id: params[0], registration_id: params[1], attempt_number: params[2], trigger: params[3], status: params[4] }] }
      }
      return { rows: [] }
    }),
  }
  return {
    calls,
    query: client.query,
    withTransaction: vi.fn(async (callback) => callback(client)),
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

const validInput = {
  cupId: '150',
  cupName: 'Kupittaa Cup 30.05.2026',
  cupStarts: '2026-05-30T09:00:00+03:00',
  squadNumber: 1,
  squadLabel: 'Laina-ase',
  name: 'Example Shooter',
  email: ' SHOOTER@example.invalid ',
  phone: '+000 000 0000',
  hasSsiAccount: 'yes',
  ssiEmail: 'ssi@example.invalid',
}

describe('registration-store', () => {
  it('normalizes registration input for local-first storage', () => {
    const normalized = normalizeRegistrationForStore(validInput, () => 'reg-1')

    expect(normalized).toMatchObject({
      id: 'reg-1',
      ssiCupId: '150',
      cupNameSnapshot: 'Kupittaa Cup 30.05.2026',
      selectedSquadNumber: 1,
      selectedSquadLabel: 'Laina-ase',
      shooterName: 'Example Shooter',
      email: 'shooter@example.invalid',
      hasSsiAccount: 'yes',
      ssiEmail: 'ssi@example.invalid',
      status: 'confirmed',
      syncStatus: 'pending',
    })
  })

  it('requires contact email for all registrations', () => {
    expect(() => normalizeRegistrationForStore({ ...validInput, email: '' })).toThrow('contact email')
  })

  it('uses manual_needed sync status when shooter has no SSI account', () => {
    const normalized = normalizeRegistrationForStore({ ...validInput, hasSsiAccount: 'no', ssiEmail: '' }, () => 'reg-1')
    expect(normalized.syncStatus).toBe('manual_needed')
    expect(normalized.ssiEmail).toBeNull()
  })

  it('initializes registration schema idempotently', async () => {
    const db = createMockDb()
    await initializeRegistrationSchema(db)
    expect(db.query).toHaveBeenCalledTimes(1)
    expect(db.calls[0].sql).toContain('CREATE TABLE IF NOT EXISTS public_registrations')
    expect(db.calls[0].sql).toContain('CREATE TABLE IF NOT EXISTS public_registration_sync_attempts')
  })

  it('inserts a new local registration before SSI sync', async () => {
    const db = createMockDb()
    const result = await upsertRegistration(db, validInput, { idFactory: () => 'reg-1' })

    expect(result.created).toBe(true)
    expect(result.registration).toMatchObject({ id: 'reg-1', email: 'shooter@example.invalid', syncStatus: 'pending' })
    expect(db.withTransaction).toHaveBeenCalledTimes(1)
    expect(db.calls.some(call => call.sql.includes('INSERT INTO public_registrations'))).toBe(true)
  })

  it('updates an existing active registration instead of creating a duplicate', async () => {
    const existing = rowFromParams([
      'reg-1', '150', 'Old Cup', null, 1, 'Laina-ase', 'Example Shooter', 'shooter@example.invalid', null, 'yes', 'ssi@example.invalid', 'confirmed', 'synced', null, null,
    ])
    const updated = { ...existing, selected_squad_number: 2, selected_squad_label: 'Oma ase 1', sync_status: 'pending' }
    const db = createMockDb({ existingRows: [existing], updatedRow: updated })

    const result = await upsertRegistration(db, { ...validInput, squadNumber: 2, squadLabel: 'Oma ase 1' })

    expect(result.created).toBe(false)
    expect(result.registration.selectedSquadNumber).toBe(2)
    expect(db.calls.some(call => call.sql.includes('UPDATE public_registrations'))).toBe(true)
  })

  it('retries as update when first insert loses a unique race', async () => {
    const uniqueViolation = new Error('duplicate key value violates unique constraint')
    uniqueViolation.code = '23505'
    const raced = rowFromParams([
      'reg-1', '150', 'Cup', null, 1, 'Laina-ase', 'Example Shooter', 'shooter@example.invalid', null, 'yes', 'ssi@example.invalid', 'confirmed', 'pending', null, null,
    ])
    const updated = { ...raced, selected_squad_number: 2, selected_squad_label: 'Oma ase 1' }
    const db = createMockDb({ existingRows: [], updatedRow: updated, insertError: uniqueViolation })

    const result = await upsertRegistration(db, { ...validInput, squadNumber: 2, squadLabel: 'Oma ase 1' })

    expect(result.created).toBe(false)
    expect(result.registration.selectedSquadNumber).toBe(2)
    expect(db.calls.filter(call => call.sql.includes('SELECT * FROM public_registrations')).length).toBe(2)
    expect(db.calls.some(call => call.sql.includes('UPDATE public_registrations'))).toBe(true)
  })

  it('counts active registrations for a cup', async () => {
    const db = createMockDb({ count: 7 })
    const count = await countActiveRegistrations(db, { cupId: '150' })

    expect(count).toBe(7)
    expect(db.calls[0].params).toEqual(['150', ['confirmed', 'manual_handled']])
  })

  it('counts active registrations for a cup and squad', async () => {
    const db = createMockDb({ count: 3 })
    const count = await countActiveRegistrations(db, { cupId: '150', squadNumber: 1 })

    expect(count).toBe(3)
    expect(db.calls[0].sql).toContain('selected_squad_number = $3')
    expect(db.calls[0].params).toEqual(['150', ['confirmed', 'manual_handled'], 1])
  })

  it('lists registrations for organizer views', async () => {
    const db = createMockDb({ listRows: [rowFromParams(['reg-1', '150', 'Cup', null, 1, 'Laina-ase', 'Example Shooter', 'shooter@example.invalid', null, 'no', null, 'confirmed', 'manual_needed', null, null])] })
    const rows = await listRegistrationsForCup(db, '150')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'reg-1', selectedSquadNumber: 1, syncStatus: 'manual_needed' })
  })

  it('updates registration and sync status', async () => {
    const row = rowFromParams(['reg-1', '150', 'Cup', null, 1, 'Laina-ase', 'Example Shooter', 'shooter@example.invalid', null, 'yes', 'ssi@example.invalid', 'confirmed', 'failed', 'SSI_DOWN', 'SSI unavailable'])
    const db = createMockDb({ updatedRow: row })

    const updated = await updateRegistrationStatus(db, 'reg-1', {
      status: 'confirmed',
      syncStatus: 'failed',
      syncErrorCode: 'SSI_DOWN',
      syncErrorMessage: 'SSI unavailable',
    })

    expect(updated).toMatchObject({ id: 'reg-1', syncStatus: 'failed', syncErrorCode: 'SSI_DOWN' })
  })

  it('records SSI sync attempts with the design status set', async () => {
    const db = createMockDb()
    const attempt = await recordSyncAttempt(db, {
      registrationId: 'reg-1',
      attemptNumber: 1,
      trigger: 'manual_retry',
      status: 'failed',
      errorCode: 'SSI_USER_NOT_FOUND',
      errorMessage: 'User not found in SSI',
      details: { operation: 'CupRegistration' },
    }, () => 'attempt-1')

    expect(attempt).toMatchObject({ id: 'attempt-1', registration_id: 'reg-1', status: 'failed' })
    expect(db.calls[0].params[7]).toBe(JSON.stringify({ operation: 'CupRegistration' }))
  })

  it('rejects sync attempt statuses outside success partial failed', async () => {
    const db = createMockDb()
    await expect(recordSyncAttempt(db, {
      registrationId: 'reg-1',
      attemptNumber: 1,
      trigger: 'manual_retry',
      status: 'manual_needed',
    })).rejects.toThrow('Invalid sync attempt status')
  })
})
