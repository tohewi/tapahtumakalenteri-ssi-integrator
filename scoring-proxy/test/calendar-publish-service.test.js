// ============================================================
// Calendar Publishing Service Tests (CAL-4)
// ============================================================
// Tests for lib/services/calendar-publish-service.js
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock functions so they're available both inside vi.mock factories and in tests
const { mockWpLogin, mockWpSubmitOtp, mockIsAuthenticated, mockFetchOtp, mockCreateEvent, mockPublishEvent } = vi.hoisted(() => ({
  mockWpLogin: vi.fn(),
  mockWpSubmitOtp: vi.fn(),
  mockIsAuthenticated: vi.fn(),
  mockFetchOtp: vi.fn(),
  mockCreateEvent: vi.fn(),
  mockPublishEvent: vi.fn(),
}))

vi.mock('../lib/calendar/wp-auth.js', () => ({
  wpLogin: mockWpLogin,
  wpSubmitOtp: mockWpSubmitOtp,
  isAuthenticated: mockIsAuthenticated,
}))

vi.mock('../lib/calendar/gmail-otp.js', () => ({
  fetchOtpFromGmail: mockFetchOtp,
}))

vi.mock('../lib/calendar/wp-adapter.js', () => ({
  WpCalendarAdapter: class MockWpCalendarAdapter {
    constructor() { /* mock — skips session check */ }
    createEvent(...args) { return mockCreateEvent(...args) }
    publishEvent(...args) { return mockPublishEvent(...args) }
  },
}))

import {
  validateCalendarConfig,
  validateCalendarTemplate,
  authenticateToWordPress,
  buildEventTitle,
  buildEventContent,
  publishCalendarEvent,
} from '../lib/services/calendar-publish-service.js'

// ---- Test data ----

const validCalendarConfig = {
  adapter: 'wordpress',
  wpBaseUrl: 'https://example.com',
  wpUsername: 'admin',
  wpPassword: 'secret123',
  gmailAddress: 'test@gmail.com',
  gmailAppPassword: 'xxxx xxxx xxxx xxxx',
  gmailSenderFilter: 'wordpress@example.com',
  gmailSubjectFilter: 'Login Confirmation',
}

const validCalendarTemplate = {
  titleTemplate: 'Kupittaan ampumavuoro {date}',
  shortDescription: 'Kupittaan ampumavuoro',
  contentTemplate: '<p>Tervetuloa! SSI Cup: {ssiCupUrl}</p>',
  location: 'Kupittaan urheiluhallin ampumarata',
  mapLink: 'https://maps.google.com/test',
  startTime: '09.00',
  endTime: '12.00',
  taxonomyIds: [50, 52],
}

const ssiReferences = {
  cupId: '141',
  cupTypeId: '136',
  cupUrl: 'https://shootnscoreit.com/event/136/141/',
  cupName: 'TEST Kupittaa CUP 31.01.2026',
  isCup: true,
  matches: [],
}

// ---- Pure function tests ----

describe('validateCalendarConfig', () => {
  it('returns valid for complete config', () => {
    expect(validateCalendarConfig(validCalendarConfig)).toEqual({ valid: true, missing: [] })
  })

  it('returns invalid for null config', () => {
    const result = validateCalendarConfig(null)
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('calendarConfig')
  })

  it('returns invalid when wpBaseUrl is missing', () => {
    const { wpBaseUrl, ...config } = validCalendarConfig
    const result = validateCalendarConfig(config)
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('wpBaseUrl')
  })

  it('returns invalid when wpUsername is missing', () => {
    const result = validateCalendarConfig({ ...validCalendarConfig, wpUsername: '' })
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('wpUsername')
  })

  it('returns invalid when wpPassword is missing', () => {
    const result = validateCalendarConfig({ ...validCalendarConfig, wpPassword: undefined })
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('wpPassword')
  })

  it('does not require Gmail fields (only needed for 2FA)', () => {
    const config = { wpBaseUrl: 'https://x.com', wpUsername: 'u', wpPassword: 'p' }
    expect(validateCalendarConfig(config)).toEqual({ valid: true, missing: [] })
  })
})

describe('validateCalendarTemplate', () => {
  it('returns valid for complete template', () => {
    expect(validateCalendarTemplate(validCalendarTemplate)).toEqual({ valid: true, missing: [] })
  })

  it('returns invalid for null template', () => {
    expect(validateCalendarTemplate(null).valid).toBe(false)
  })

  it('returns invalid for empty object', () => {
    expect(validateCalendarTemplate({}).valid).toBe(false)
  })

  it('returns invalid when titleTemplate is missing', () => {
    const { titleTemplate, ...rest } = validCalendarTemplate
    expect(validateCalendarTemplate(rest).valid).toBe(false)
  })

  it('is valid with only titleTemplate', () => {
    expect(validateCalendarTemplate({ titleTemplate: 'Event {date}' }).valid).toBe(true)
  })
})

describe('buildEventTitle', () => {
  it('replaces {date} placeholder with formatted date', () => {
    const title = buildEventTitle(validCalendarTemplate, {
      eventDate: '2026-01-31',
      ssiReferences,
    })
    expect(title).toBe('Kupittaan ampumavuoro 31.01.2026')
  })

  it('replaces {cupName} placeholder', () => {
    const template = { titleTemplate: '{cupName} - Calendar' }
    const title = buildEventTitle(template, { eventDate: '2026-01-31', ssiReferences })
    expect(title).toBe('TEST Kupittaa CUP 31.01.2026 - Calendar')
  })

  it('replaces {cupId} placeholder', () => {
    const template = { titleTemplate: 'Event {date} cup{cupId}' }
    const title = buildEventTitle(template, { eventDate: '2026-01-31', ssiReferences })
    expect(title).toBe('Event 31.01.2026 cup141')
  })

  it('uses default template when titleTemplate is missing', () => {
    const title = buildEventTitle({}, { eventDate: '2026-06-15', ssiReferences })
    expect(title).toBe('Event 15.06.2026')
  })

  it('handles missing ssiReferences gracefully', () => {
    const title = buildEventTitle(validCalendarTemplate, {
      eventDate: '2026-01-31',
      ssiReferences: null,
    })
    expect(title).toBe('Kupittaan ampumavuoro 31.01.2026')
  })
})

describe('buildEventContent', () => {
  it('replaces {ssiCupUrl} in content', () => {
    const content = buildEventContent(validCalendarTemplate, ssiReferences)
    expect(content).toContain('https://shootnscoreit.com/event/136/141/')
  })

  it('replaces {ssiCupName} in content', () => {
    const template = { contentTemplate: '<p>Cup: {ssiCupName}</p>' }
    const content = buildEventContent(template, ssiReferences)
    expect(content).toBe('<p>Cup: TEST Kupittaa CUP 31.01.2026</p>')
  })

  it('returns empty string when no contentTemplate', () => {
    expect(buildEventContent({}, ssiReferences)).toBe('')
  })

  it('handles null ssiReferences', () => {
    const content = buildEventContent(validCalendarTemplate, null)
    expect(content).not.toContain('undefined')
  })
})

// ---- Integration tests (mocked dependencies) ----

describe('authenticateToWordPress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('authenticates without 2FA when not required', async () => {
    const session = { needs2fa: false, authenticated: true, cookieJar: {} }
    mockWpLogin.mockResolvedValue(session)
    mockIsAuthenticated.mockReturnValue(true)

    const result = await authenticateToWordPress(validCalendarConfig)
    expect(result).toBe(session)
    expect(mockWpLogin).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      username: 'admin',
      password: 'secret123',
    })
    expect(mockFetchOtp).not.toHaveBeenCalled()
  })

  it('handles 2FA with Gmail OTP', async () => {
    const session2fa = { needs2fa: true, authenticated: false, _2fa: {} }
    const sessionAuth = { needs2fa: false, authenticated: true }
    mockWpLogin.mockResolvedValue(session2fa)
    mockFetchOtp.mockResolvedValue('12345678')
    mockWpSubmitOtp.mockResolvedValue(sessionAuth)
    mockIsAuthenticated.mockReturnValue(true)

    const session = await authenticateToWordPress(validCalendarConfig)
    expect(session).toBe(sessionAuth)
    expect(mockFetchOtp).toHaveBeenCalledWith({
      gmailAddress: 'test@gmail.com',
      appPassword: 'xxxx xxxx xxxx xxxx',
      senderFilter: 'wordpress@example.com',
      subjectFilter: 'Login Confirmation',
      maxAgeMinutes: 5,
    })
    expect(mockWpSubmitOtp).toHaveBeenCalledWith(session2fa, '12345678')
  })

  it('throws when login fails without 2FA', async () => {
    const failedSession = { needs2fa: false, authenticated: false }
    mockWpLogin.mockResolvedValue(failedSession)
    mockIsAuthenticated.mockReturnValue(false)

    await expect(authenticateToWordPress(validCalendarConfig))
      .rejects.toThrow('session not authenticated')
  })

  it('throws when 2FA needed but Gmail not configured', async () => {
    const session2fa = { needs2fa: true, _2fa: {} }
    mockWpLogin.mockResolvedValue(session2fa)

    const config = { ...validCalendarConfig, gmailAddress: '', gmailAppPassword: '' }
    await expect(authenticateToWordPress(config))
      .rejects.toThrow('Gmail credentials not configured')
  })

  it('throws when OTP cannot be fetched from Gmail', async () => {
    const session2fa = { needs2fa: true, _2fa: {} }
    mockWpLogin.mockResolvedValue(session2fa)
    mockFetchOtp.mockResolvedValue(null)

    await expect(authenticateToWordPress(validCalendarConfig, { retryDelayMs: 0 }))
      .rejects.toThrow('Could not fetch OTP')
    expect(mockFetchOtp).toHaveBeenCalledTimes(3) // 3 attempts
  })

  it('throws when OTP verification fails', async () => {
    const session2fa = { needs2fa: true, _2fa: {} }
    mockWpLogin.mockResolvedValue(session2fa)
    mockFetchOtp.mockResolvedValue('12345678')
    mockWpSubmitOtp.mockResolvedValue({ authenticated: false })
    mockIsAuthenticated.mockReturnValue(false)

    await expect(authenticateToWordPress(validCalendarConfig))
      .rejects.toThrow('2FA verification failed')
  })
})

describe('publishCalendarEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: successful auth
    const session = { needs2fa: false, authenticated: true, baseUrl: 'https://example.com', cookieJar: {} }
    mockWpLogin.mockResolvedValue(session)
    mockIsAuthenticated.mockReturnValue(true)
  })

  it('creates and publishes a calendar event successfully', async () => {
    mockCreateEvent.mockResolvedValue({
      eventId: '999',
      eventUrl: 'https://example.com/?p=999',
      editUrl: 'https://example.com/wp-admin/post.php?post=999&action=edit',
      status: 'draft',
      title: 'Kupittaan ampumavuoro 31.01.2026',
    })
    mockPublishEvent.mockResolvedValue({ eventId: '999', status: 'publish' })

    const result = await publishCalendarEvent({
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      eventDate: '2026-01-31',
      ssiReferences,
    })

    expect(result.success).toBe(true)
    expect(result.calendarReference.eventId).toBe('999')
    expect(result.calendarReference.status).toBe('publish')
    expect(result.calendarReference.title).toBe('Kupittaan ampumavuoro 31.01.2026')
    expect(result.calendarReference.publishedAt).toBeDefined()

    // Verify adapter was called with correct params
    expect(mockCreateEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Kupittaan ampumavuoro 31.01.2026',
      startTime: '09.00',
      endTime: '12.00',
      location: 'Kupittaan urheiluhallin ampumarata',
      taxonomyIds: [50, 52],
      ssiCupId: '141',
    }))
    expect(mockPublishEvent).toHaveBeenCalledWith('999')
  })

  it('returns success=false when calendarConfig is invalid', async () => {
    const result = await publishCalendarEvent({
      calendarConfig: { wpBaseUrl: 'x' },
      calendarTemplate: validCalendarTemplate,
      eventDate: '2026-01-31',
      ssiReferences,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Calendar config missing')
  })

  it('returns success=false when calendarTemplate is invalid', async () => {
    const result = await publishCalendarEvent({
      calendarConfig: validCalendarConfig,
      calendarTemplate: {},
      eventDate: '2026-01-31',
      ssiReferences,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Calendar template missing')
  })

  it('returns success=false for unsupported adapter', async () => {
    const result = await publishCalendarEvent({
      calendarConfig: { ...validCalendarConfig, adapter: 'google' },
      calendarTemplate: validCalendarTemplate,
      eventDate: '2026-01-31',
      ssiReferences,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unsupported calendar adapter')
  })

  it('returns success=false with error details when auth fails', async () => {
    mockWpLogin.mockRejectedValue(new Error('Connection refused'))

    const result = await publishCalendarEvent({
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      eventDate: '2026-01-31',
      ssiReferences,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
    expect(result.calendarReference.status).toBe('error')
  })

  it('returns success=false with error when createEvent fails', async () => {
    mockCreateEvent.mockRejectedValue(new Error('Could not extract form tokens'))

    const result = await publishCalendarEvent({
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      eventDate: '2026-01-31',
      ssiReferences,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('form tokens')
    expect(result.calendarReference.status).toBe('error')
  })

  it('handles publish with unknown status gracefully', async () => {
    mockCreateEvent.mockResolvedValue({
      eventId: '999',
      eventUrl: 'https://example.com/?p=999',
      editUrl: 'https://example.com/wp-admin/post.php?post=999&action=edit',
      status: 'draft',
    })
    mockPublishEvent.mockResolvedValue({ eventId: '999', status: 'unknown' })

    const result = await publishCalendarEvent({
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      eventDate: '2026-01-31',
      ssiReferences,
    })

    // Still success=true, but with warning
    expect(result.success).toBe(true)
    expect(result.calendarReference.status).toBe('unknown')
    expect(result.calendarReference.warning).toContain('uncertain')
  })

  it('uses default values when calendarTemplate fields are missing', async () => {
    mockCreateEvent.mockResolvedValue({
      eventId: '888',
      eventUrl: 'https://example.com/?p=888',
      editUrl: 'https://example.com/wp-admin/post.php?post=888&action=edit',
      status: 'draft',
    })
    mockPublishEvent.mockResolvedValue({ eventId: '888', status: 'publish' })

    const result = await publishCalendarEvent({
      calendarConfig: validCalendarConfig,
      calendarTemplate: { titleTemplate: 'Test {date}' },
      eventDate: '2026-06-15',
      ssiReferences,
    })

    expect(result.success).toBe(true)
    expect(mockCreateEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Test 15.06.2026',
      startTime: '09.00',
      endTime: '12.00',
      shortDescription: '',
      location: '',
      taxonomyIds: [],
    }))
  })

  it('calls progress callback at each step', async () => {
    mockCreateEvent.mockResolvedValue({
      eventId: '999',
      eventUrl: 'https://example.com/?p=999',
      editUrl: 'https://example.com/wp-admin/post.php?post=999&action=edit',
      status: 'draft',
    })
    mockPublishEvent.mockResolvedValue({ eventId: '999', status: 'publish' })

    const progressCalls = []
    await publishCalendarEvent({
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      eventDate: '2026-01-31',
      ssiReferences,
      onProgress: (step, msg) => progressCalls.push(step),
    })

    expect(progressCalls).toContain('calendar_auth')
    expect(progressCalls).toContain('calendar_create')
    expect(progressCalls).toContain('calendar_publish')
    expect(progressCalls).toContain('calendar_done')
  })
})
