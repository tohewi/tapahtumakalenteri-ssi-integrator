import {
  countActiveRegistrations,
  upsertRegistration,
  updateRegistrationStatus,
  recordSyncAttempt,
} from '../db/registration-store.js'

export function registrationSuccessMessage(syncStatus) {
  if (syncStatus === 'synced') {
    return 'Ilmoittautuminen onnistui ja SSI-squadiin asettelu onnistui.'
  }
  if (syncStatus === 'manual_needed' || syncStatus === 'not_applicable') {
    return 'Ilmoittautuminen vastaanotettu. Järjestäjä näkee ilmoittautumisesi osallistujalistalla.'
  }
  if (syncStatus === 'partial') {
    return 'Ilmoittautuminen vastaanotettu. SSI-käsittely onnistui osittain ja järjestäjä tarkistaa tilanteen.'
  }
  if (syncStatus === 'failed') {
    return 'Ilmoittautuminen vastaanotettu. SSI-käsittely epäonnistui, mutta järjestäjä näkee ilmoittautumisesi.'
  }
  return 'Ilmoittautuminen vastaanotettu.'
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
    const err = new Error('Cup is full')
    err.code = 'CUP_FULL'
    err.publicMessage = 'Tapahtuma on täynnä.'
    throw err
  }

  if (squadMaxCompetitors != null && squadCount >= Number(squadMaxCompetitors)) {
    const err = new Error('Squad is full')
    err.code = 'SQUAD_FULL'
    err.publicMessage = 'Valittu squad on täynnä.'
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
