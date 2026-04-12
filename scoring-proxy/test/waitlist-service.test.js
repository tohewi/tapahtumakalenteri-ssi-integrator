import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initRedis, closeRedis } from '../lib/session/redis.js'
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors/AppError.js'
import { findActiveEntryByEmail, listEntries } from '../lib/waitlist/store.js'
import { registerWaitlistEntry } from '../lib/services/waitlist-service.js'

beforeEach(async () => {
  delete process.env.REDIS_URL
  await initRedis()
})

afterEach(async () => {
  await closeRedis()
})

function createInput(overrides = {}) {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    association: 'TurRes',
    equipmentChoice: 'need-club-22',
    preferredLanguage: 'fi',
    ...overrides,
  }
}

describe('wait list service', () => {
  it('registers a new wait list entry when SSI email exists and email send succeeds', async () => {
    const emailExistsInSSI = vi.fn().mockResolvedValue(true)
    const sendConfirmationEmail = vi.fn().mockResolvedValue({ success: true })

    const entry = await registerWaitlistEntry(createInput(), { emailExistsInSSI, sendConfirmationEmail })

    expect(entry.status).toBe('waiting')
    expect(emailExistsInSSI).toHaveBeenCalledWith('ada@example.com')
    expect(sendConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com' }))
  })

  it('rejects duplicate active registrations', async () => {
    const emailExistsInSSI = vi.fn().mockResolvedValue(true)
    const sendConfirmationEmail = vi.fn().mockResolvedValue({ success: true })

    await registerWaitlistEntry(createInput(), { emailExistsInSSI, sendConfirmationEmail })

    await expect(registerWaitlistEntry(createInput(), { emailExistsInSSI, sendConfirmationEmail }))
      .rejects.toBeInstanceOf(ConflictError)
  })

  it('rejects emails that do not exist in SSI', async () => {
    const emailExistsInSSI = vi.fn().mockResolvedValue(false)
    const sendConfirmationEmail = vi.fn()

    await expect(registerWaitlistEntry(createInput(), { emailExistsInSSI, sendConfirmationEmail }))
      .rejects.toBeInstanceOf(NotFoundError)

    expect(sendConfirmationEmail).not.toHaveBeenCalled()
  })

  it('rolls back the entry if confirmation email sending fails', async () => {
    const emailExistsInSSI = vi.fn().mockResolvedValue(true)
    const sendConfirmationEmail = vi.fn().mockResolvedValue({ success: false, error: 'smtp failed' })

    await expect(registerWaitlistEntry(createInput(), { emailExistsInSSI, sendConfirmationEmail }))
      .rejects.toBeInstanceOf(ValidationError)

    expect(await findActiveEntryByEmail('ada@example.com')).toBeNull()
    expect(await listEntries()).toHaveLength(0)
  })

  it('rejects invalid equipment choices before hitting dependencies', async () => {
    const emailExistsInSSI = vi.fn()
    const sendConfirmationEmail = vi.fn()

    await expect(registerWaitlistEntry(createInput({ equipmentChoice: 'bad-choice' }), { emailExistsInSSI, sendConfirmationEmail }))
      .rejects.toBeInstanceOf(ValidationError)

    expect(emailExistsInSSI).not.toHaveBeenCalled()
    expect(sendConfirmationEmail).not.toHaveBeenCalled()
  })
})