import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initRedis, closeRedis } from '../lib/session/redis.js'
import { getEntry, getInductionGroup } from '../lib/waitlist/store.js'
import {
  cancelWaitlistEntry,
  completeInductionGroup,
  createInductionGroupSelection,
  listWaitlistAdminData,
  registerWaitlistEntry,
} from '../lib/services/waitlist-service.js'

beforeEach(async () => {
  delete process.env.REDIS_URL
  await initRedis()
})

afterEach(async () => {
  await closeRedis()
})

async function seedEntry(email) {
  return registerWaitlistEntry({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email,
    association: 'TurRes',
    equipmentChoice: 'need-club-22',
    preferredLanguage: 'fi',
  }, {
    emailExistsInSSI: vi.fn().mockResolvedValue(true),
    sendConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
  })
}

describe('wait list admin service', () => {
  it('lists admin data with entries and groups', async () => {
    await seedEntry('ada@example.com')
    const data = await listWaitlistAdminData()

    expect(data.entries).toHaveLength(1)
    expect(data.groups).toHaveLength(0)
  })

  it('creates induction groups from waiting entries and marks them selected', async () => {
    const first = await seedEntry('ada@example.com')
    const second = await seedEntry('grace@example.com')

    const group = await createInductionGroupSelection({
      participantIds: [first.id, second.id],
      label: 'May 2026',
      plannedDate: '2026-05-03',
      actorEmail: 'admin@example.com',
    })

    const updatedFirst = await getEntry(first.id)
    const updatedSecond = await getEntry(second.id)

    expect(group.status).toBe('planned')
    expect(updatedFirst.status).toBe('selected')
    expect(updatedSecond.status).toBe('selected')
    expect(updatedFirst.groupId).toBe(group.id)
  })

  it('completes an induction group and marks all entries completed', async () => {
    const first = await seedEntry('ada@example.com')
    const second = await seedEntry('grace@example.com')

    const group = await createInductionGroupSelection({
      participantIds: [first.id, second.id],
      label: 'May 2026',
      plannedDate: '2026-05-03',
      actorEmail: 'admin@example.com',
    })

    const completed = await completeInductionGroup({
      groupId: group.id,
      actorEmail: 'admin@example.com',
    })

    expect(completed.status).toBe('completed')
    expect((await getEntry(first.id)).status).toBe('completed')
    expect((await getEntry(second.id)).status).toBe('completed')
    expect((await getInductionGroup(group.id)).status).toBe('completed')
  })

  it('cancels an active wait list entry', async () => {
    const entry = await seedEntry('ada@example.com')
    const updated = await cancelWaitlistEntry({
      entryId: entry.id,
      actorEmail: 'ada@example.com',
      sendStatusChangeEmail: vi.fn().mockResolvedValue({ success: true }),
    })

    expect(updated.status).toBe('withdrawn')
    expect((await getEntry(entry.id)).status).toBe('withdrawn')
  })

  it('includes threshold and thresholdReached in admin data response', async () => {
    const data = await listWaitlistAdminData()
    expect(typeof data.threshold).toBe('number')
    expect(data.threshold).toBeGreaterThan(0)
    expect(data.thresholdReached).toBe(false)

    // Seed entries up to threshold
    for (let i = 0; i < data.threshold; i++) {
      await seedEntry(`user${i}@example.com`)
    }

    const dataAfter = await listWaitlistAdminData()
    expect(dataAfter.thresholdReached).toBe(true)
  })
})