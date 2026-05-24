import { ConflictError } from '../errors/AppError.js'
import {
  countActiveRegistrations,
  upsertRegistration,
  updateRegistrationStatus,
  recordSyncAttempt,
} from '../db/registration-store.js'
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

  return { cupCount, squadCount }
}

export function initialSyncStatusForRegistration({ hasSsiAccount }) {
  return hasSsiAccount === 'yes' ? 'pending' : 'manual_needed'
}

export async function createBufferedRegistration(db, input, options = {}) {
  await assertLocalCapacity(db, {
    cupId: input.cupId ?? input.ssiCupId,
    squadNumber: input.squadNumber ?? input.selectedSquadNumber,
    cupMaxCompetitors: options.cupMaxCompetitors,
    squadMaxCompetitors: options.squadMaxCompetitors,
  })

  const syncStatus = input.syncStatus || initialSyncStatusForRegistration({ hasSsiAccount: input.hasSsiAccount })
  const result = await upsertRegistration(db, { ...input, syncStatus }, options)
  return buildPublicRegistrationResult(result)
}

export async function markRegistrationSyncResult(db, registrationId, syncResult, options = {}) {
  const syncStatus = syncResult.success
    ? 'synced'
    : (syncResult.partial ? 'partial' : (syncResult.manualNeeded ? 'manual_needed' : 'failed'))

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
    status: syncResult.success ? 'success' : syncStatus,
    errorCode: syncResult.errorCode || null,
    errorMessage: syncResult.errorMessage || null,
    details: syncResult.details || {},
  }, options.idFactory)

  return registration
}
