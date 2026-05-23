import crypto from 'node:crypto'

export const REGISTRATION_ACTIVE_STATUSES = ['confirmed', 'manual_handled']
export const REGISTRATION_STATUS_VALUES = ['confirmed', 'waitlisted', 'cancelled', 'manual_handled']
export const SYNC_STATUS_VALUES = ['not_applicable', 'pending', 'syncing', 'synced', 'partial', 'failed', 'manual_needed']
export const SSI_ACCOUNT_VALUES = ['yes', 'no', 'unsure']

export const REGISTRATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public_registrations (
  id                    TEXT PRIMARY KEY,
  ssi_cup_id             TEXT NOT NULL,
  cup_name_snapshot      TEXT NOT NULL,
  cup_starts_snapshot    TIMESTAMPTZ,
  selected_squad_number  INT NOT NULL,
  selected_squad_label   TEXT,
  shooter_name           TEXT,
  email                  TEXT NOT NULL,
  phone                  TEXT,
  has_ssi_account        TEXT NOT NULL,
  ssi_email              TEXT,
  status                 TEXT NOT NULL DEFAULT 'confirmed',
  sync_status            TEXT NOT NULL DEFAULT 'pending',
  sync_error_code        TEXT,
  sync_error_message     TEXT,
  last_sync_attempt_at   TIMESTAMPTZ,
  synced_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_registrations_cup
  ON public_registrations (ssi_cup_id);

CREATE INDEX IF NOT EXISTS idx_public_registrations_cup_squad
  ON public_registrations (ssi_cup_id, selected_squad_number);

CREATE INDEX IF NOT EXISTS idx_public_registrations_sync
  ON public_registrations (sync_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_registrations_unique_active_email
  ON public_registrations (ssi_cup_id, LOWER(email))
  WHERE status != 'cancelled';

CREATE TABLE IF NOT EXISTS public_registration_sync_attempts (
  id                TEXT PRIMARY KEY,
  registration_id   TEXT NOT NULL REFERENCES public_registrations(id) ON DELETE CASCADE,
  attempt_number    INT NOT NULL,
  trigger           TEXT NOT NULL,
  status            TEXT NOT NULL,
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  error_code        TEXT,
  error_message     TEXT,
  details           JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_public_registration_sync_attempts_registration
  ON public_registration_sync_attempts (registration_id);
`

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function normalizeNullableText(value) {
  const normalized = String(value || '').trim()
  return normalized.length > 0 ? normalized : null
}

export function normalizeRegistrationForStore(input = {}, idFactory = crypto.randomUUID) {
  const email = normalizeEmail(input.email)
  if (!email) throw new Error('Registration contact email is required')

  const hasSsiAccount = String(input.hasSsiAccount || 'unsure').trim().toLowerCase()
  if (!SSI_ACCOUNT_VALUES.includes(hasSsiAccount)) {
    throw new Error('Invalid SSI account value')
  }

  const status = input.status || 'confirmed'
  if (!REGISTRATION_STATUS_VALUES.includes(status)) {
    throw new Error('Invalid registration status')
  }

  const syncStatus = input.syncStatus || (hasSsiAccount === 'yes' ? 'pending' : 'manual_needed')
  if (!SYNC_STATUS_VALUES.includes(syncStatus)) {
    throw new Error('Invalid sync status')
  }

  const squadNumber = Number(input.selectedSquadNumber ?? input.squadNumber)
  if (!Number.isInteger(squadNumber) || squadNumber < 1 || squadNumber > 99) {
    throw new Error('Invalid squad number')
  }

  const ssiCupId = String(input.ssiCupId ?? input.cupId ?? '').trim()
  if (!/^\d{1,10}$/.test(ssiCupId)) {
    throw new Error('Invalid SSI cup id')
  }

  const cupName = normalizeNullableText(input.cupNameSnapshot ?? input.cupName)
  if (!cupName) throw new Error('Cup name snapshot is required')

  const ssiEmail = normalizeNullableText(input.ssiEmail)

  return {
    id: input.id || idFactory(),
    ssiCupId,
    cupNameSnapshot: cupName,
    cupStartsSnapshot: input.cupStartsSnapshot || input.cupStarts || null,
    selectedSquadNumber: squadNumber,
    selectedSquadLabel: normalizeNullableText(input.selectedSquadLabel ?? input.squadLabel),
    shooterName: normalizeNullableText(input.shooterName ?? input.name),
    email,
    phone: normalizeNullableText(input.phone),
    hasSsiAccount,
    ssiEmail: ssiEmail ? normalizeEmail(ssiEmail) : null,
    status,
    syncStatus,
    syncErrorCode: normalizeNullableText(input.syncErrorCode),
    syncErrorMessage: normalizeNullableText(input.syncErrorMessage),
  }
}

export function mapRegistrationRow(row = {}) {
  return {
    id: row.id,
    ssiCupId: row.ssi_cup_id,
    cupNameSnapshot: row.cup_name_snapshot,
    cupStartsSnapshot: row.cup_starts_snapshot,
    selectedSquadNumber: row.selected_squad_number,
    selectedSquadLabel: row.selected_squad_label,
    shooterName: row.shooter_name,
    email: row.email,
    phone: row.phone,
    hasSsiAccount: row.has_ssi_account,
    ssiEmail: row.ssi_email,
    status: row.status,
    syncStatus: row.sync_status,
    syncErrorCode: row.sync_error_code,
    syncErrorMessage: row.sync_error_message,
    lastSyncAttemptAt: row.last_sync_attempt_at,
    syncedAt: row.synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function initializeRegistrationSchema(db) {
  await db.query(REGISTRATION_SCHEMA_SQL)
}

async function runInTransaction(db, callback) {
  if (typeof db.withTransaction === 'function') return db.withTransaction(callback)
  return callback(db)
}

export async function upsertRegistration(db, input, options = {}) {
  const normalized = normalizeRegistrationForStore(input, options.idFactory)

  return runInTransaction(db, async (client) => {
    const existing = await client.query(
      `SELECT * FROM public_registrations
       WHERE ssi_cup_id = $1
         AND LOWER(email) = LOWER($2)
         AND status != 'cancelled'
       FOR UPDATE`,
      [normalized.ssiCupId, normalized.email]
    )

    if (existing.rows.length > 0) {
      const current = existing.rows[0]
      const updated = await client.query(
        `UPDATE public_registrations
         SET cup_name_snapshot = $2,
             cup_starts_snapshot = $3,
             selected_squad_number = $4,
             selected_squad_label = $5,
             shooter_name = $6,
             phone = $7,
             has_ssi_account = $8,
             ssi_email = $9,
             status = $10,
             sync_status = $11,
             sync_error_code = $12,
             sync_error_message = $13,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          current.id,
          normalized.cupNameSnapshot,
          normalized.cupStartsSnapshot,
          normalized.selectedSquadNumber,
          normalized.selectedSquadLabel,
          normalized.shooterName,
          normalized.phone,
          normalized.hasSsiAccount,
          normalized.ssiEmail,
          normalized.status,
          normalized.syncStatus,
          normalized.syncErrorCode,
          normalized.syncErrorMessage,
        ]
      )
      return { registration: mapRegistrationRow(updated.rows[0]), created: false }
    }

    const inserted = await client.query(
      `INSERT INTO public_registrations (
         id, ssi_cup_id, cup_name_snapshot, cup_starts_snapshot,
         selected_squad_number, selected_squad_label,
         shooter_name, email, phone, has_ssi_account, ssi_email,
         status, sync_status, sync_error_code, sync_error_message
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15
       )
       RETURNING *`,
      [
        normalized.id,
        normalized.ssiCupId,
        normalized.cupNameSnapshot,
        normalized.cupStartsSnapshot,
        normalized.selectedSquadNumber,
        normalized.selectedSquadLabel,
        normalized.shooterName,
        normalized.email,
        normalized.phone,
        normalized.hasSsiAccount,
        normalized.ssiEmail,
        normalized.status,
        normalized.syncStatus,
        normalized.syncErrorCode,
        normalized.syncErrorMessage,
      ]
    )
    return { registration: mapRegistrationRow(inserted.rows[0]), created: true }
  })
}

export async function countActiveRegistrations(db, { cupId, squadNumber = null }) {
  const params = [String(cupId), REGISTRATION_ACTIVE_STATUSES]
  const squadFilter = squadNumber == null ? '' : ' AND selected_squad_number = $3'
  if (squadNumber != null) params.push(Number(squadNumber))

  const result = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM public_registrations
     WHERE ssi_cup_id = $1
       AND status = ANY($2)${squadFilter}`,
    params
  )
  return Number(result.rows[0]?.count || 0)
}

export async function listRegistrationsForCup(db, cupId) {
  const result = await db.query(
    `SELECT * FROM public_registrations
     WHERE ssi_cup_id = $1
     ORDER BY selected_squad_number ASC, created_at ASC`,
    [String(cupId)]
  )
  return result.rows.map(mapRegistrationRow)
}

export async function updateRegistrationStatus(db, registrationId, { status, syncStatus, syncErrorCode = null, syncErrorMessage = null }) {
  if (status && !REGISTRATION_STATUS_VALUES.includes(status)) throw new Error('Invalid registration status')
  if (syncStatus && !SYNC_STATUS_VALUES.includes(syncStatus)) throw new Error('Invalid sync status')

  const result = await db.query(
    `UPDATE public_registrations
     SET status = COALESCE($2, status),
         sync_status = COALESCE($3, sync_status),
         sync_error_code = $4,
         sync_error_message = $5,
         last_sync_attempt_at = CASE WHEN $3 IS NULL THEN last_sync_attempt_at ELSE NOW() END,
         synced_at = CASE WHEN $3 = 'synced' THEN NOW() ELSE synced_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [registrationId, status || null, syncStatus || null, syncErrorCode, syncErrorMessage]
  )

  return result.rows[0] ? mapRegistrationRow(result.rows[0]) : null
}

export async function recordSyncAttempt(db, { registrationId, attemptNumber, trigger, status, errorCode = null, errorMessage = null, details = {} }, idFactory = crypto.randomUUID) {
  const result = await db.query(
    `INSERT INTO public_registration_sync_attempts (
       id, registration_id, attempt_number, trigger, status,
       finished_at, error_code, error_message, details
     ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
     RETURNING *`,
    [idFactory(), registrationId, attemptNumber, trigger, status, errorCode, errorMessage, JSON.stringify(details)]
  )
  return result.rows[0]
}
