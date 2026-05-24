import { ConflictError } from '../errors/AppError.js'
import {
  countActiveRegistrations,
  countActiveRegistrationsInClient,
  lockRegistrationCup,
  normalizeRegistrationForStore,
  upsertRegistrationInClient,
  updateRegistrationStatus,
  recordSyncAttempt,
} from '../db/registration-store.js'
import { syncAttemptStatusFromResult } from './registration-constants.js'
import { registrationMessage } from './registration-messages.js'

export function registrationSuccessMessage(syncStatus) {
  if (syncStatus === 'synced') return registrationMessage('registrationSynced')
  if (syncStatus === 'manual_needed' || syncStatus === 'not_applicable') return registrationMessage('registrationManualNeeded')
  if (syncStatus === 'partial') return registrationMessage('registrationPartial')
  if (syncStatus === 'failed') return registrationMessage('registrationSyncFailed')
  return registrationMessage('registrationReceived')
}

export function buildPublicRegistrationResult({ registration, created }) {
  return {
    success: true,
    created,
    registrationStatus: registration.status,
    syncStatus: registration.syncStatus,
    message: registrationSuccessMessage(registration.syncStatus),
    registration: {
      id: registration.id,
      cupName: registration.cupNameSnapshot,
      cupStarts: registration.cupStartsSnapshot,
      squadNumber: registration.selectedSquadNumber,
      squadLabel: registration.selectedSquadLabel,
      email: registration.email,
    },
  }
}

export async function assertLocalCapacity(db, { cupId, squadNumber, cupMaxCompetitors, squadMaxCompetitors }) {
  const [cupCount, squadCount] = await Promise.all([
    countActiveRegistrations(db, { cupId }),
    countActiveRegistrations(db, { cupId, squadNumber }),
  ])

  assertCapacityCounts({ cupCount, squadCount, cupMaxCompetitors, squadMaxCompetitors })
  return { cupCount, squadCount }
}

async function assertLocalCapacityInClient(client, { cupId, squadNumber, cupMaxCompetitors, squadMaxCompetitors }) {
  const [cupCount, squadCount] = await Promise.all([
    countActiveRegistrationsInClient(client, { cupId }),
    countActiveRegistrationsInClient(client, { cupId, squadNumber }),
  ])

  assertCapacityCounts({ cupCount, squadCount, cupMaxCompetitors, squadMaxCompetitors })
  return { cupCount, squadCount }
}

function assertCapacityCounts({ cupCount, squadCount, cupMaxCompetitors, squadMaxCompetitors }) {
  if (cupMaxCompetitors != null && cupCount >= Number(cupMaxCompetitors)) {
    const err = new ConflictError(registrationMessage('cupFull'))
    err.code = 'CUP_FULL'
    throw err
  }

  if (squadMaxCompetitors != null && squadCount >= Number(squadMaxCompetitors)) {
    const err = new ConflictError(registrationMessage('squadFull'))
    err.code = 'SQUAD_FULL'
    throw err
  }
}

export function initialSyncStatusForRegistration({ hasSsiAccount }) {
  return hasSsiAccount === 'yes' ? 'pending' : 'manual_needed'
}

export async function createBufferedRegistration(db, input, options = {}) {
  const syncStatus = input.syncStatus || initialSyncStatusForRegistration({ hasSsiAccount: input.hasSsiAccount })
  const normalized = normalizeRegistrationForStore({ ...input, syncStatus }, options.idFactory)

  const result = await db.withTransaction(async (client) => {
    await lockRegistrationCup(client, normalized.ssiCupId)
    await assertLocalCapacityInClient(client, {
      cupId: normalized.ssiCupId,
      squadNumber: normalized.selectedSquadNumber,
      cupMaxCompetitors: options.cupMaxCompetitors,
      squadMaxCompetitors: options.squadMaxCompetitors,
    })
    return upsertRegistrationInClient(client, normalized)
  })

  return buildPublicRegistrationResult(result)
}

export async function markRegistrationSyncResult(db, registrationId, syncResult, options = {}) {
  const syncStatus = syncResult.success
    ? 'synced'
    : (syncResult.partial ? 'partial' : (syncResult.manualNeeded ? 'manual_needed' : 'failed'))
  const attemptStatus = syncAttemptStatusFromResult(syncResult)

  const registration = await updateRegistrationStatus(db, registrationId, {
    status: options.status,
    syncStatus,
    syncErrorCode: syncResult.errorCode || null,
    syncErrorMessage: syncResult.errorMessage || null,
  })

  await recordSyncAttempt(db, {
    registrationId,
    attemptNumber: syncResult.attemptNumber || 1,
    trigger: syncResult.trigger || 'submit',
    status: attemptStatus,
    errorCode: syncResult.errorCode || null,
    errorMessage: syncResult.errorMessage || null,
    details: syncResult.details || {},
  }, options.idFactory)

  return registration
}
