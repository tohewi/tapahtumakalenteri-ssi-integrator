import crypto from 'node:crypto'
import { getRedisClient } from '../session/redis.js'

const ENTRY_PREFIX = 'waitlist:entry:'
const GROUP_PREFIX = 'waitlist:group:'
const ACTIVE_STATUSES = new Set(['waiting', 'selected'])

function now() {
  return Date.now()
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase()
}

function normalizeEntry(entry) {
  return {
    ...entry,
    email: normalizeEmail(entry.email),
  }
}

export async function createEntry({ firstName, lastName, email, association, equipmentChoice, preferredLanguage = 'fi' }) {
  const redis = getRedisClient()
  const timestamp = now()
  const entry = normalizeEntry({
    id: crypto.randomUUID(),
    firstName,
    lastName,
    email,
    association,
    equipmentChoice,
    preferredLanguage,
    status: 'waiting',
    groupId: null,
    audit: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  await redis.set(`${ENTRY_PREFIX}${entry.id}`, JSON.stringify(entry))
  return entry
}

export async function getEntry(id) {
  const redis = getRedisClient()
  const raw = await redis.get(`${ENTRY_PREFIX}${id}`)
  return raw ? JSON.parse(raw) : null
}

export async function deleteEntry(id) {
  const redis = getRedisClient()
  const deleted = await redis.del(`${ENTRY_PREFIX}${id}`)
  return deleted > 0
}

export async function listEntries({ status = null } = {}) {
  const redis = getRedisClient()
  const keys = await redis.keys(`${ENTRY_PREFIX}*`)
  const entries = []

  for (const key of keys) {
    const raw = await redis.get(key)
    if (!raw) continue
    const entry = JSON.parse(raw)
    if (!status || entry.status === status) entries.push(entry)
  }

  return entries.sort((a, b) => a.createdAt - b.createdAt)
}

export async function findActiveEntryByEmail(email) {
  const entries = await listEntries()
  const normalized = normalizeEmail(email)
  return entries.find(entry => entry.email === normalized && ACTIVE_STATUSES.has(entry.status)) || null
}

export async function updateEntry(id, updates, auditRecord = null) {
  const redis = getRedisClient()
  const existing = await getEntry(id)
  if (!existing) return null

  const updated = normalizeEntry({
    ...existing,
    ...updates,
    updatedAt: now(),
  })

  if (auditRecord) {
    updated.audit = [
      ...(existing.audit || []),
      {
        ...auditRecord,
        timestamp: now(),
      },
    ]
  }

  await redis.set(`${ENTRY_PREFIX}${id}`, JSON.stringify(updated))
  return updated
}

export async function createInductionGroup({ label, plannedDate = null, participantIds, actorEmail }) {
  const redis = getRedisClient()
  const timestamp = now()
  const group = {
    id: crypto.randomUUID(),
    label,
    plannedDate,
    participantIds: [...participantIds],
    status: 'planned',
    createdAt: timestamp,
    updatedAt: timestamp,
    audit: [{ actorEmail, action: 'create-group', timestamp }],
  }

  await redis.set(`${GROUP_PREFIX}${group.id}`, JSON.stringify(group))
  return group
}

export async function updateInductionGroup(id, updates, auditRecord = null) {
  const redis = getRedisClient()
  const existing = await getInductionGroup(id)
  if (!existing) return null

  const updated = {
    ...existing,
    ...updates,
    updatedAt: now(),
  }

  if (auditRecord) {
    updated.audit = [
      ...(existing.audit || []),
      {
        ...auditRecord,
        timestamp: now(),
      },
    ]
  }

  await redis.set(`${GROUP_PREFIX}${id}`, JSON.stringify(updated))
  return updated
}

export async function getInductionGroup(id) {
  const redis = getRedisClient()
  const raw = await redis.get(`${GROUP_PREFIX}${id}`)
  return raw ? JSON.parse(raw) : null
}

export async function listInductionGroups() {
  const redis = getRedisClient()
  const keys = await redis.keys(`${GROUP_PREFIX}*`)
  const groups = []

  for (const key of keys) {
    const raw = await redis.get(key)
    if (!raw) continue
    groups.push(JSON.parse(raw))
  }

  return groups.sort((a, b) => a.createdAt - b.createdAt)
}

export { ACTIVE_STATUSES }
