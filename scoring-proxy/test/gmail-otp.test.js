// ============================================================
// Gmail OTP Fetching Module Tests (CAL-2)
// ============================================================
// Tests for lib/calendar/gmail-otp.js — OTP extraction and search query building.
// Network-dependent IMAP tests are not included — only pure function tests
// and mocked integration tests.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractOtpFromText, buildSearchQuery } from '../lib/calendar/gmail-otp.js'

// ---- extractOtpFromText ----

describe('extractOtpFromText', () => {
  it('extracts 8-digit OTP from plain text', () => {
    const text = 'Your verification code is 12345678. Enter this code to complete your login.'
    expect(extractOtpFromText(text)).toBe('12345678')
  })

  it('extracts 6-digit OTP', () => {
    const text = 'Code: 654321'
    expect(extractOtpFromText(text)).toBe('654321')
  })

  it('extracts 7-digit OTP', () => {
    const text = 'Your one-time code: 9876543'
    expect(extractOtpFromText(text)).toBe('9876543')
  })

  it('returns first OTP when multiple codes present', () => {
    const text = 'Code 12345678 or backup 87654321'
    expect(extractOtpFromText(text)).toBe('12345678')
  })

  it('returns null for text with no digit sequences', () => {
    expect(extractOtpFromText('No codes here, just words.')).toBeNull()
  })

  it('returns null for empty/null input', () => {
    expect(extractOtpFromText(null)).toBeNull()
    expect(extractOtpFromText('')).toBeNull()
    expect(extractOtpFromText(undefined)).toBeNull()
  })

  it('ignores short numbers (less than 6 digits)', () => {
    expect(extractOtpFromText('Error code 404 happened')).toBeNull()
    expect(extractOtpFromText('Port 12345 is open')).toBeNull()
  })

  it('ignores long numbers (more than 8 digits)', () => {
    // 9+ digit numbers should not match as OTP
    expect(extractOtpFromText('Account 123456789 is active')).toBeNull()
  })

  it('extracts OTP from WordPress Two-Factor Email format', () => {
    // Realistic WordPress email body
    const wpEmail = `Kirjaudu sisään: 48291537

Tämä koodi vanhenee 15 minuutin kuluttua.

Jos et yrittänyt kirjautua, vaihda salasanasi.`
    expect(extractOtpFromText(wpEmail)).toBe('48291537')
  })

  it('extracts OTP from HTML-stripped content', () => {
    const stripped = ' Your login code:  83726154  Enter this on the login page. '
    expect(extractOtpFromText(stripped)).toBe('83726154')
  })
})

// ---- buildSearchQuery ----

describe('buildSearchQuery', () => {
  it('builds query with all filters', () => {
    const before = Date.now()
    const query = buildSearchQuery({
      senderFilter: 'wp@example.com',
      subjectFilter: 'Login Confirmation',
      maxAgeMinutes: 10,
    })

    expect(query.seen).toBe(false)
    expect(query.from).toBe('wp@example.com')
    expect(query.subject).toBe('Login Confirmation')
    expect(query.since).toBeInstanceOf(Date)
    // Since should be ~10 minutes ago
    const tenMinAgo = before - 10 * 60 * 1000
    expect(query.since.getTime()).toBeGreaterThanOrEqual(tenMinAgo - 1000)
    expect(query.since.getTime()).toBeLessThanOrEqual(tenMinAgo + 1000)
  })

  it('omits from when senderFilter is empty', () => {
    const query = buildSearchQuery({
      senderFilter: '',
      subjectFilter: 'OTP',
      maxAgeMinutes: 5,
    })
    expect(query.from).toBeUndefined()
    expect(query.subject).toBe('OTP')
  })

  it('omits subject when subjectFilter is empty', () => {
    const query = buildSearchQuery({
      senderFilter: 'test@example.com',
      subjectFilter: '',
      maxAgeMinutes: 5,
    })
    expect(query.subject).toBeUndefined()
    expect(query.from).toBe('test@example.com')
  })

  it('handles zero maxAgeMinutes (since = now)', () => {
    const before = Date.now()
    const query = buildSearchQuery({ maxAgeMinutes: 0 })
    expect(query.since.getTime()).toBeGreaterThanOrEqual(before - 1000)
  })
})

// ---- fetchOtpFromGmail (mocked) ----

describe('fetchOtpFromGmail', () => {
  it('throws when gmailAddress is missing', async () => {
    const { fetchOtpFromGmail } = await import('../lib/calendar/gmail-otp.js')
    await expect(fetchOtpFromGmail({
      gmailAddress: '',
      appPassword: 'test',
    })).rejects.toThrow('gmailAddress and appPassword are required')
  })

  it('throws when appPassword is missing', async () => {
    const { fetchOtpFromGmail } = await import('../lib/calendar/gmail-otp.js')
    await expect(fetchOtpFromGmail({
      gmailAddress: 'user@gmail.com',
      appPassword: '',
    })).rejects.toThrow('gmailAddress and appPassword are required')
  })
})
