// ============================================================
// Event Complete Service Tests (CAL-7)
// ============================================================
// Tests for lib/services/event-complete-service.js
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockSsiLogin,
  mockSsiCompleteEvent,
  mockSsiGetEventStats,
} = vi.hoisted(() => ({
  mockSsiLogin: vi.fn(),
  mockSsiCompleteEvent: vi.fn(),
  mockSsiGetEventStats: vi.fn(),
}))

vi.mock('../lib/ssi-core/graphql.js', () => ({
  ssiLogin: mockSsiLogin,
}))

vi.mock('../lib/ssi-core/event-status.js', () => ({
  ssiCompleteEvent: mockSsiCompleteEvent,
  SSI_EVENT_STATUSES: { COMPLETED: 'cp' },
}))

vi.mock('../lib/ssi-core/stats-graphql.js', () => ({
  ssiGetEventStats: mockSsiGetEventStats,
}))

import { completeEvent } from '../lib/services/event-complete-service.js'

const validSsiRefs = {
  cupId: '201',
  cupTypeId: '136',
  isCup: true,
}

const validCreds = { email: 'test@example.com', password: 'secret' }
const mockCookies = { sessionid: 'mock123' }

const cupStats = {
  approvedCount: 22,
  totalCount: 25,
  matchCount: 3,
  status: 'on',
  eventName: 'Test Cup',
  matches: [
    { id: '301', number: 1, name: 'Match 1', status: 'on', contentTypeKey: '91', approvedCount: 23, totalCount: 25 },
    { id: '302', number: 2, name: 'Match 2', status: 'on', contentTypeKey: '91', approvedCount: 22, totalCount: 24 },
    { id: '303', number: 3, name: 'Match 3', status: 'on', contentTypeKey: '91', approvedCount: 23, totalCount: 25 },
  ],
}

describe('completeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSsiLogin.mockResolvedValue(mockCookies)
    mockSsiGetEventStats.mockResolvedValue(cupStats)
    mockSsiCompleteEvent.mockResolvedValue({ success: true, previousStatus: 'on', newStatus: 'cp' })
  })

  it('should complete all matches then cup for a cup event', async () => {
    const result = await completeEvent({
      ssiReferences: validSsiRefs,
      ssiCredentials: validCreds,
    })

    expect(result.success).toBe(true)
    // 3 matches + 1 cup = 4 calls
    expect(mockSsiCompleteEvent).toHaveBeenCalledTimes(4)
    expect(result.results).toHaveLength(3)
    expect(result.cupResult).toBeTruthy()
    expect(result.cupResult.success).toBe(true)
  })

  it('should call ssiCompleteEvent with correct match content types', async () => {
    await completeEvent({ ssiReferences: validSsiRefs, ssiCredentials: validCreds })

    // Match calls
    expect(mockSsiCompleteEvent).toHaveBeenCalledWith(
      expect.objectContaining({ contentTypeId: '91', eventId: '301' })
    )
    expect(mockSsiCompleteEvent).toHaveBeenCalledWith(
      expect.objectContaining({ contentTypeId: '91', eventId: '302' })
    )
    // Cup call
    expect(mockSsiCompleteEvent).toHaveBeenCalledWith(
      expect.objectContaining({ contentTypeId: '136', eventId: '201' })
    )
  })

  it('should skip already-completed matches', async () => {
    mockSsiGetEventStats.mockResolvedValue({
      ...cupStats,
      matches: [
        { id: '301', number: 1, name: 'Match 1', status: 'cp', contentTypeKey: '91' },
        { id: '302', number: 2, name: 'Match 2', status: 'on', contentTypeKey: '91' },
        { id: '303', number: 3, name: 'Match 3', status: 'cp', contentTypeKey: '91' },
      ],
    })

    const result = await completeEvent({ ssiReferences: validSsiRefs, ssiCredentials: validCreds })

    expect(result.success).toBe(true)
    // Only match 302 + cup = 2 calls
    expect(mockSsiCompleteEvent).toHaveBeenCalledTimes(2)
    expect(result.results[0].alreadyCompleted).toBe(true)
    expect(result.results[2].alreadyCompleted).toBe(true)
  })

  it('should complete standalone match directly', async () => {
    mockSsiGetEventStats.mockResolvedValue({
      approvedCount: 12, totalCount: 15, matchCount: 0, status: 'on', matches: [],
    })

    const result = await completeEvent({
      ssiReferences: { cupId: '500', cupTypeId: '91', isCup: false },
      ssiCredentials: validCreds,
    })

    expect(result.success).toBe(true)
    expect(mockSsiCompleteEvent).toHaveBeenCalledTimes(1)
    expect(mockSsiCompleteEvent).toHaveBeenCalledWith(
      expect.objectContaining({ contentTypeId: '91', eventId: '500' })
    )
  })

  it('should still complete cup even if some matches fail', async () => {
    mockSsiCompleteEvent
      .mockResolvedValueOnce({ success: true, previousStatus: 'on', newStatus: 'cp' })
      .mockResolvedValueOnce({ success: false, error: 'Form validation error' })
      .mockResolvedValueOnce({ success: true, previousStatus: 'on', newStatus: 'cp' })
      .mockResolvedValueOnce({ success: true, previousStatus: 'on', newStatus: 'cp' }) // cup

    const result = await completeEvent({ ssiReferences: validSsiRefs, ssiCredentials: validCreds })

    // Cup completes even though match 2 failed
    expect(result.success).toBe(true)
    expect(result.results[1].success).toBe(false)
    expect(mockSsiCompleteEvent).toHaveBeenCalledTimes(4)
  })

  it('should call progress callback at each step', async () => {
    const progress = vi.fn()
    await completeEvent({
      ssiReferences: validSsiRefs,
      ssiCredentials: validCreds,
      onProgress: progress,
    })

    expect(progress).toHaveBeenCalledWith('ssi_login', expect.any(String))
    expect(progress).toHaveBeenCalledWith('ssi_query', expect.any(String))
    expect(progress).toHaveBeenCalledWith('completing_matches', expect.any(String))
    expect(progress).toHaveBeenCalledWith('completing_cup', expect.any(String))
    expect(progress).toHaveBeenCalledWith('complete_done', expect.any(String))
  })

  // ---- Validation ----

  it('should return error if SSI references missing', async () => {
    const result = await completeEvent({ ssiReferences: {}, ssiCredentials: validCreds })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SSI references/)
  })

  it('should return error if SSI credentials missing', async () => {
    const result = await completeEvent({ ssiReferences: validSsiRefs, ssiCredentials: {} })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SSI credentials/)
  })

  // ---- Error handling ----

  it('should return error if SSI login fails', async () => {
    mockSsiLogin.mockRejectedValue(new Error('SSI login failed'))

    const result = await completeEvent({ ssiReferences: validSsiRefs, ssiCredentials: validCreds })
    expect(result.success).toBe(false)
    expect(result.error).toBe('SSI login failed')
  })

  it('should handle stats query failure gracefully and still attempt completion', async () => {
    mockSsiGetEventStats.mockRejectedValue(new Error('GraphQL timeout'))
    // Without stats, service treats as standalone event
    mockSsiCompleteEvent.mockResolvedValue({ success: true, previousStatus: 'on', newStatus: 'cp' })

    const result = await completeEvent({ ssiReferences: validSsiRefs, ssiCredentials: validCreds })
    expect(result.success).toBe(true)
    expect(mockSsiCompleteEvent).toHaveBeenCalledTimes(1)
  })

  it('should return error if cup completion fails', async () => {
    // Matches succeed, cup fails
    mockSsiCompleteEvent
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Cup form error' })

    const result = await completeEvent({ ssiReferences: validSsiRefs, ssiCredentials: validCreds })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Cup form error')
  })
})
