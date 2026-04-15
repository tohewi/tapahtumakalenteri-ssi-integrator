import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { initRedis, closeRedis } from '../lib/session/redis.js'
import {
  ACTIVE_STATUSES,
  createEntry,
  createInductionGroup,
  findActiveEntryByEmail,
  getEntry,
  getInductionGroup,
  listEntries,
  listInductionGroups,
  updateEntry,
} from '../lib/waitlist/store.js'

beforeEach(async () => {
  delete process.env.REDIS_URL
  await initRedis()
})

afterEach(async () => {
  await closeRedis()
})

describe('wait list store', () => {
  it('creates a waiting entry with stable fields', async () => {
    const entry = await createEntry({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'Ada@example.com',
      association: 'TurRes',
      equipmentChoice: 'need-club-22',
    })

    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(entry.status).toBe('waiting')
    expect(entry.email).toBe('ada@example.com')
    expect(entry.createdAt).toBeGreaterThan(0)
    expect(entry.updatedAt).toBeGreaterThan(0)
  })

  it('finds active entries by email case-insensitively', async () => {
    await createEntry({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'Ada@example.com',
      association: 'TurRes',
      equipmentChoice: 'need-club-22',
    })

    const found = await findActiveEntryByEmail('ADA@EXAMPLE.COM')
    expect(found).not.toBeNull()
    expect(ACTIVE_STATUSES.has(found.status)).toBe(true)
  })

  it('stops treating completed entries as active', async () => {
    const entry = await createEntry({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'Ada@example.com',
      association: 'TurRes',
      equipmentChoice: 'own-pistol',
    })

    await updateEntry(entry.id, { status: 'completed' }, { actorEmail: 'admin@example.com', action: 'complete' })

    const found = await findActiveEntryByEmail('ada@example.com')
    expect(found).toBeNull()
  })

  it('records audit entries on status updates', async () => {
    const entry = await createEntry({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'Ada@example.com',
      association: 'TurRes',
      equipmentChoice: 'own-pistol',
    })

    const updated = await updateEntry(entry.id, { status: 'selected' }, { actorEmail: 'admin@example.com', action: 'select' })
    expect(updated.audit).toHaveLength(1)
    expect(updated.audit[0].actorEmail).toBe('admin@example.com')
    expect(updated.audit[0].action).toBe('select')
  })

  it('creates induction groups as first-class records', async () => {
    const entry = await createEntry({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'Ada@example.com',
      association: 'TurRes',
      equipmentChoice: 'need-club-22',
    })

    const group = await createInductionGroup({
      label: 'May 2026 induction',
      plannedDate: '2026-05-03',
      participantIds: [entry.id],
      actorEmail: 'admin@example.com',
    })

    expect(group.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(group.participantIds).toEqual([entry.id])
    expect(group.status).toBe('planned')
    expect(group.audit[0].actorEmail).toBe('admin@example.com')
  })

  it('lists entries and groups in creation order', async () => {
    const first = await createEntry({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      association: 'TurRes',
      equipmentChoice: 'need-club-22',
    })
    const second = await createEntry({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      association: 'TurRes',
      equipmentChoice: 'own-pistol',
    })

    const group = await createInductionGroup({
      label: 'May 2026 induction',
      plannedDate: '2026-05-03',
      participantIds: [first.id, second.id],
      actorEmail: 'admin@example.com',
    })

    const entries = await listEntries()
    const groups = await listInductionGroups()
    expect(entries.map(entry => entry.id)).toEqual([first.id, second.id])
    expect(groups.map(item => item.id)).toEqual([group.id])

    expect(await getEntry(first.id)).not.toBeNull()
    expect(await getInductionGroup(group.id)).not.toBeNull()
  })
})