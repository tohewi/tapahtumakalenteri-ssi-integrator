// ============================================================
// Calendar Statistics Service Tests (CAL-5)
// ============================================================
// Tests for lib/services/calendar-stats-service.js
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock functions
const {
  mockGetEventStats,
  mockWpLogin,
  mockWpSubmitOtp,
  mockIsAuthenticated,
  mockFetchOtp,
  mockUpdateEvent,
} = vi.hoisted(() => ({
  mockGetEventStats: vi.fn(),
  mockWpLogin: vi.fn(),
  mockWpSubmitOtp: vi.fn(),
  mockIsAuthenticated: vi.fn(),
  mockFetchOtp: vi.fn(),
  mockUpdateEvent: vi.fn(),
}))

vi.mock('../lib/ssi-core/stats-graphql.js', () => ({
  ssiGetEventStats: mockGetEventStats,
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
    updateEvent(...args) { return mockUpdateEvent(...args) }
  },
}))

import { updateCalendarStats } from '../lib/services/calendar-stats-service.js'

// ---- Test data ----

const validSsiReferences = {
  cupId: '141',
  cupTypeId: '136',
  cupUrl: 'https://shootnscoreit.com/event/136/141/',
  cupName: 'TurRes Kupittaa CUP 14.02.2026',
  isCup: true,
}

const validCalendarReference = {
  eventId: '12345',
  eventUrl: 'https://example.com/?p=12345',
  editUrl: 'https://example.com/wp-admin/post.php?post=12345&action=edit',
  status: 'publish',
}

const validCalendarConfig = {
  adapter: 'wordpress',
  wpBaseUrl: 'https://example.com',
  wpUsername: 'admin',
  wpPassword: 'secret123',
}

const validSsiCredentials = {
  email: 'test@example.com',
  password: 'ssi-secret',
}

const validCalendarTemplate = {
  titleTemplate: 'Kupittaan ampumavuoro {date}',
  shotsPerParticipant: 100,
}

const ssiStatsResult = {
  approvedCount: 22,
  totalCount: 25,
  matchCount: 3,
  status: 'cp',
  eventName: 'TurRes Kupittaa CUP 14.02.2026',
  starts: '2026-02-14T08:00:00+00:00',
  ends: '2026-02-14T18:00:00+00:00',
  matches: [
    { id: '201', number: 1, name: 'Kupittaa Tarkkuus', status: 'cp', approvedCount: 23, totalCount: 26 },
    { id: '202', number: 2, name: 'Kupittaa Pika', status: 'cp', approvedCount: 23, totalCount: 25 },
    { id: '203', number: 3, name: 'Kupittaa Kuvio', status: 'cp', approvedCount: 23, totalCount: 25 },
  ],
}

// ---- Tests ----

describe('updateCalendarStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: WP login succeeds without 2FA
    mockWpLogin.mockResolvedValue({ needs2fa: false, cookies: {} })
    mockIsAuthenticated.mockReturnValue(true)
    mockGetEventStats.mockResolvedValue(ssiStatsResult)
    mockUpdateEvent.mockResolvedValue({ status: 'publish' })
  })

  it('should query SSI, calculate stats, and update WordPress', async () => {
    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(result.success).toBe(true)
    expect(result.stats.approvedCount).toBe(22)
    expect(result.stats.shotsFired).toBe(2200) // 22 × 100
    expect(result.stats.eventCount).toBe(1)
    expect(result.stats.shotsPerParticipant).toBe(100)
    expect(result.stats.matchCount).toBe(3)
    expect(result.stats.ssiStatus).toBe('cp')
    expect(result.stats.updatedAt).toBeTruthy()
  })

  it('should call ssiGetEventStats with correct parameters', async () => {
    await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(mockGetEventStats).toHaveBeenCalledWith({
      credentials: validSsiCredentials,
      cupTypeId: '136',
      cupId: '141',
      isCup: true,
    })
  })

  it('should update WordPress with correct ACF fields', async () => {
    await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(mockUpdateEvent).toHaveBeenCalledWith('12345', {
      shotsFired: 2200,
      attendeeCount: 22,
      eventCount: 1,
    })
  })

  it('should use custom shotsPerParticipant from template', async () => {
    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: { ...validCalendarTemplate, shotsPerParticipant: 150 },
      ssiCredentials: validSsiCredentials,
    })

    expect(result.stats.shotsFired).toBe(3300) // 22 × 150
    expect(result.stats.shotsPerParticipant).toBe(150)
    expect(mockUpdateEvent).toHaveBeenCalledWith('12345', {
      shotsFired: 3300,
      attendeeCount: 22,
      eventCount: 1,
    })
  })

  it('should default shotsPerParticipant to 100 when not in template', async () => {
    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: {}, // no shotsPerParticipant
      ssiCredentials: validSsiCredentials,
    })

    expect(result.stats.shotsFired).toBe(2200) // 22 × 100 (default)
    expect(result.stats.shotsPerParticipant).toBe(100)
  })

  it('should handle zero participants gracefully', async () => {
    mockGetEventStats.mockResolvedValue({
      ...ssiStatsResult,
      approvedCount: 0,
      totalCount: 0,
    })

    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(result.success).toBe(true)
    expect(result.stats.approvedCount).toBe(0)
    expect(result.stats.shotsFired).toBe(0)
    expect(mockUpdateEvent).toHaveBeenCalledWith('12345', {
      shotsFired: 0,
      attendeeCount: 0,
      eventCount: 1,
    })
  })

  it('should call progress callback at each step', async () => {
    const progress = vi.fn()
    await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
      onProgress: progress,
    })

    expect(progress).toHaveBeenCalledWith('ssi_stats', expect.any(String))
    expect(progress).toHaveBeenCalledWith('wp_auth', expect.any(String))
    expect(progress).toHaveBeenCalledWith('wp_update', expect.any(String))
    expect(progress).toHaveBeenCalledWith('stats_done', expect.any(String))
  })

  // ---- Validation tests ----

  it('should return error if SSI references are missing', async () => {
    const result = await updateCalendarStats({
      ssiReferences: {},
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SSI references/)
  })

  it('should return error if calendar reference is missing', async () => {
    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: {},
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/calendar reference/)
  })

  it('should return error if calendar config is invalid', async () => {
    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: { wpBaseUrl: 'https://example.com' }, // missing username/password
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/calendar config/)
  })

  it('should return error if SSI credentials are missing', async () => {
    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: {},
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SSI credentials/)
  })

  // ---- Error handling ----

  it('should return error if SSI query fails', async () => {
    mockGetEventStats.mockRejectedValue(new Error('SSI GraphQL timeout'))

    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('SSI GraphQL timeout')
  })

  it('should return error if WordPress auth fails', async () => {
    mockWpLogin.mockRejectedValue(new Error('WordPress login failed'))

    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('WordPress login failed')
  })

  it('should return error if WordPress update fails', async () => {
    mockUpdateEvent.mockRejectedValue(new Error('ACF update failed'))

    const result = await updateCalendarStats({
      ssiReferences: validSsiReferences,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('ACF update failed')
  })

  it('should handle isCup=false for standalone matches', async () => {
    const matchRefs = { ...validSsiReferences, isCup: false }
    mockGetEventStats.mockResolvedValue({
      approvedCount: 12,
      totalCount: 15,
      matchCount: 0,
      status: 'cp',
      eventName: 'Standalone Match',
      matches: [],
    })

    const result = await updateCalendarStats({
      ssiReferences: matchRefs,
      calendarReference: validCalendarReference,
      calendarConfig: validCalendarConfig,
      calendarTemplate: validCalendarTemplate,
      ssiCredentials: validSsiCredentials,
    })

    expect(result.success).toBe(true)
    expect(result.stats.approvedCount).toBe(12)
    expect(result.stats.shotsFired).toBe(1200) // 12 × 100
    expect(mockGetEventStats).toHaveBeenCalledWith(
      expect.objectContaining({ isCup: false })
    )
  })
})
