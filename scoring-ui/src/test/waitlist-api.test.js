import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adminCancelWaitlistEntry,
  cancelWaitlistEntry,
  completeWaitlistGroup,
  createWaitlistInductionGroup,
  fetchWaitlistAdminData,
  getWaitlistCaptcha,
  submitWaitlistEntry,
  verifyWaitlistCaptcha,
} from '../waitlist-api'

describe('waitlist API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads captcha from the waitlist endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'abc', question: '1 + 2 = ?' }),
    })

    const result = await getWaitlistCaptcha()
    expect(result.question).toBe('1 + 2 = ?')
    expect(fetch).toHaveBeenCalledWith('/api/v1/waitlist/captcha', expect.any(Object))
  })

  it('posts numeric captcha verification', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })

    await verifyWaitlistCaptcha('captcha-1', '9')
    const [, options] = fetch.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ captchaId: 'captcha-1', captchaAnswer: 9 })
  })

  it('submits a waitlist entry', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, entry: { id: 'entry-1', status: 'waiting' } }),
    })

    const result = await submitWaitlistEntry({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      association: 'TurRes',
      equipmentChoice: 'need-club-22',
      preferredLanguage: 'en',
      captchaId: 'captcha-1',
      captchaAnswer: '7',
    })

    expect(result.entry.status).toBe('waiting')
    const [, options] = fetch.mock.calls[0]
    expect(JSON.parse(options.body).captchaAnswer).toBe(7)
  })

  it('includes credentials for admin data fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [], groups: [] }),
    })

    await fetchWaitlistAdminData()
    expect(fetch).toHaveBeenCalledWith('/api/v1/waitlist/admin/data', expect.objectContaining({ credentials: 'include' }))
  })

  it('supports admin group and cancellation mutations', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })

    await createWaitlistInductionGroup({ participantIds: ['a'], label: 'May', plannedDate: '2026-05-03' })
    await completeWaitlistGroup('group-1')
    await cancelWaitlistEntry('ada@example.com')
    await adminCancelWaitlistEntry('entry-1')

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/waitlist/admin/groups', expect.objectContaining({ method: 'POST' }))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/waitlist/admin/groups/group-1/complete', expect.objectContaining({ method: 'POST' }))
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/v1/waitlist/cancel', expect.objectContaining({ method: 'POST' }))
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/v1/waitlist/admin/entries/entry-1/cancel', expect.objectContaining({ method: 'POST' }))
  })
})