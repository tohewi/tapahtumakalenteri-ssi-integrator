// ============================================================
// SSI Event Status Tests (CAL-7)
// ============================================================
// Tests for lib/ssi-core/event-status.js
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockFetchCsrf,
  mockPostForm,
  mockParseFormFields,
  mockExtractFormErrors,
  mockExtractPageTitle,
} = vi.hoisted(() => ({
  mockFetchCsrf: vi.fn(),
  mockPostForm: vi.fn(),
  mockParseFormFields: vi.fn(),
  mockExtractFormErrors: vi.fn(),
  mockExtractPageTitle: vi.fn(),
}))

vi.mock('../lib/services/event-form-helpers.js', () => ({
  fetchCsrf: mockFetchCsrf,
  postForm: mockPostForm,
  parseFormFields: mockParseFormFields,
  extractFormErrors: mockExtractFormErrors,
  extractPageTitle: mockExtractPageTitle,
}))

vi.mock('../lib/ssi-core/graphql.js', () => ({
  ssiLogin: vi.fn().mockResolvedValue({ sessionid: 'mock' }),
}))

import { ssiSetEventStatus, ssiCompleteEvent, SSI_EVENT_STATUSES } from '../lib/ssi-core/event-status.js'

const cookies = { sessionid: 'test123', csrftoken: 'csrf123' }

describe('ssiSetEventStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExtractPageTitle.mockReturnValue('Edit Event')
    mockParseFormFields.mockReturnValue({
      fields: { status: 'on', csrfmiddlewaretoken: 'csrf123', name: 'Test Event' },
      arrayFields: { weapon_groups: ['STD'] },
    })
    mockFetchCsrf.mockResolvedValue({
      csrfToken: 'csrf123',
      html: '<form><select name="status"><option value="on" selected>Active</option></select></form>',
      cookies: { ...cookies },
    })
    mockPostForm.mockResolvedValue({
      finalUrl: 'https://shootnscoreit.com/event/136/201/',
      html: '',
      cookies: { ...cookies },
      status: 302,
    })
    mockExtractFormErrors.mockReturnValue([])
  })

  it('should change event status via web form POST', async () => {
    const result = await ssiSetEventStatus({
      contentTypeId: '136',
      eventId: '201',
      targetStatus: 'cp',
      cookies,
    })

    expect(result.success).toBe(true)
    expect(result.previousStatus).toBe('on')
    expect(result.newStatus).toBe('cp')
  })

  it('should call fetchCsrf with correct edit URL', async () => {
    await ssiSetEventStatus({ contentTypeId: '136', eventId: '201', targetStatus: 'cp', cookies })

    expect(mockFetchCsrf).toHaveBeenCalledWith(
      'https://shootnscoreit.com/event/136/201/edit/',
      cookies
    )
  })

  it('should POST form with status overridden to target', async () => {
    await ssiSetEventStatus({ contentTypeId: '91', eventId: '1849', targetStatus: 'cp', cookies })

    expect(mockPostForm).toHaveBeenCalledWith(
      'https://shootnscoreit.com/event/91/1849/edit/',
      expect.objectContaining({ status: 'cp', csrfmiddlewaretoken: 'csrf123' }),
      { weapon_groups: ['STD'] },
      'csrf123',
      expect.any(Object)
    )
  })

  it('should short-circuit if already at target status', async () => {
    mockParseFormFields.mockReturnValue({
      fields: { status: 'cp', name: 'Test Event' },
      arrayFields: {},
    })

    const result = await ssiSetEventStatus({
      contentTypeId: '136',
      eventId: '201',
      targetStatus: 'cp',
      cookies,
    })

    expect(result.success).toBe(true)
    expect(result.alreadyAtTarget).toBe(true)
    expect(mockPostForm).not.toHaveBeenCalled()
  })

  it('should return error if edit page redirects to login', async () => {
    mockFetchCsrf.mockResolvedValue({
      csrfToken: null,
      html: '<input id="id_password" name="password">',
      cookies: {},
    })
    mockExtractPageTitle.mockReturnValue('Log in')

    await expect(ssiSetEventStatus({
      contentTypeId: '136',
      eventId: '201',
      targetStatus: 'cp',
      cookies,
    })).rejects.toThrow(/session expired/)
  })

  it('should return error if no status field found', async () => {
    mockParseFormFields.mockReturnValue({ fields: { name: 'Test' }, arrayFields: {} })

    await expect(ssiSetEventStatus({
      contentTypeId: '136',
      eventId: '201',
      targetStatus: 'cp',
      cookies,
    })).rejects.toThrow(/No status field/)
  })

  it('should return error on form validation failure', async () => {
    mockPostForm.mockResolvedValue({
      finalUrl: 'https://shootnscoreit.com/event/136/201/edit/',
      html: '<ul class="errorlist"><li>Status change not allowed</li></ul>',
      cookies: { ...cookies },
      status: 200,
    })
    mockExtractFormErrors.mockReturnValue(['Status change not allowed'])

    const result = await ssiSetEventStatus({
      contentTypeId: '136',
      eventId: '201',
      targetStatus: 'cp',
      cookies,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Status change not allowed')
  })

  it('should handle match content type (91)', async () => {
    await ssiSetEventStatus({ contentTypeId: '91', eventId: '1849', targetStatus: 'cp', cookies })

    expect(mockFetchCsrf).toHaveBeenCalledWith(
      'https://shootnscoreit.com/event/91/1849/edit/',
      cookies
    )
  })
})

describe('ssiCompleteEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExtractPageTitle.mockReturnValue('Edit Event')
    mockParseFormFields.mockReturnValue({
      fields: { status: 'on', csrfmiddlewaretoken: 'csrf123' },
      arrayFields: {},
    })
    mockFetchCsrf.mockResolvedValue({
      csrfToken: 'csrf123',
      html: '<form></form>',
      cookies: { ...cookies },
    })
    mockPostForm.mockResolvedValue({
      finalUrl: 'https://shootnscoreit.com/event/136/201/',
      html: '',
      cookies: { ...cookies },
      status: 302,
    })
    mockExtractFormErrors.mockReturnValue([])
  })

  it('should set status to cp (Completed)', async () => {
    const result = await ssiCompleteEvent({ contentTypeId: '136', eventId: '201', cookies })

    expect(result.success).toBe(true)
    expect(result.newStatus).toBe('cp')
    expect(mockPostForm).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'cp' }),
      expect.any(Object),
      expect.any(String),
      expect.any(Object)
    )
  })
})

describe('SSI_EVENT_STATUSES', () => {
  it('should define all 6 statuses', () => {
    expect(SSI_EVENT_STATUSES.DRAFT).toBe('dr')
    expect(SSI_EVENT_STATUSES.ACTIVE).toBe('on')
    expect(SSI_EVENT_STATUSES.ACTIVE_NO_SELF_EDIT).toBe('ol')
    expect(SSI_EVENT_STATUSES.PRELIMINARY_COMPLETED).toBe('pr')
    expect(SSI_EVENT_STATUSES.COMPLETED).toBe('cp')
    expect(SSI_EVENT_STATUSES.CANCELLED).toBe('cs')
  })
})
