// ============================================================
// Gmail OTP Fetching Module (CAL-2)
// ============================================================
// Retrieves one-time password (OTP) codes from Gmail via IMAP.
// Used for unattended WordPress 2FA authentication.
//
// Usage:
//   import { fetchOtpFromGmail } from './gmail-otp.js'
//   const code = await fetchOtpFromGmail({
//     gmailAddress: 'user@gmail.com',
//     appPassword: 'xxxx xxxx xxxx xxxx',
//     senderFilter: 'wordpress@example.com',
//     subjectFilter: 'Login Confirmation',
//     maxAgeMinutes: 10,
//   })
//   // code is e.g. '12345678' or null if not found
//
// Security:
//   - Requires Gmail App Password (not account password)
//   - Narrow IMAP SEARCH: sender + subject + date
//   - No full mailbox access, no persistent connection
//   - Disconnects immediately after fetch
// ============================================================

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { log } from '../logger.js'

// ---- Constants ----

const GMAIL_HOST = 'imap.gmail.com'
const GMAIL_PORT = 993

// OTP patterns — WordPress Two-Factor Email plugin sends 8-digit codes
// Match 6-8 digit codes to be safe across WP plugin versions
const OTP_PATTERN = /\b(\d{6,8})\b/

// ---- Internal helpers ----

/**
 * Extract the first OTP code from email text content.
 * Looks for a standalone 6-8 digit number.
 *
 * @param {string} text - Plain text email body
 * @returns {string|null} OTP code or null
 */
export function extractOtpFromText(text) {
  if (!text) return null
  const match = text.match(OTP_PATTERN)
  return match ? match[1] : null
}

/**
 * Build an IMAP SEARCH criteria array for finding OTP emails.
 *
 * @param {object} params
 * @param {string} params.senderFilter - Sender email address or domain to match
 * @param {string} params.subjectFilter - Subject string to search for
 * @param {number} params.maxAgeMinutes - Max age of email in minutes
 * @returns {object} ImapFlow search query object
 */
export function buildSearchQuery({ senderFilter, subjectFilter, maxAgeMinutes }) {
  const since = new Date(Date.now() - maxAgeMinutes * 60 * 1000)

  const query = {
    seen: false,  // Only unread messages
    since,        // Only recent messages
  }

  if (senderFilter) query.from = senderFilter
  if (subjectFilter) query.subject = subjectFilter

  return query
}

// ---- Public API ----

/**
 * Fetch the most recent OTP code from Gmail via IMAP.
 * Connects, searches for matching unread email, extracts the code, disconnects.
 *
 * @param {object} params
 * @param {string} params.gmailAddress - Gmail email address (IMAP username)
 * @param {string} params.appPassword - Gmail App Password (16-char, spaces ok)
 * @param {string} [params.senderFilter] - Sender email to filter by (e.g. 'wordpress@site.com')
 * @param {string} [params.subjectFilter] - Subject text to filter by (e.g. 'Login Confirmation')
 * @param {number} [params.maxAgeMinutes=10] - Only consider emails from the last N minutes
 * @param {number} [params.timeoutMs=15000] - Connection timeout in milliseconds
 * @returns {Promise<string|null>} OTP code string or null if not found
 */
export async function fetchOtpFromGmail({
  gmailAddress,
  appPassword,
  senderFilter,
  subjectFilter,
  maxAgeMinutes = 10,
  timeoutMs = 15000,
}) {
  if (!gmailAddress || !appPassword) {
    throw new Error('[gmail-otp] gmailAddress and appPassword are required')
  }

  const client = new ImapFlow({
    host: GMAIL_HOST,
    port: GMAIL_PORT,
    secure: true,
    auth: {
      user: gmailAddress,
      pass: appPassword.replace(/\s/g, ''), // Strip spaces from app password
    },
    logger: false, // Suppress ImapFlow debug logging
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  })

  try {
    log.info(`[gmail-otp] Connecting to Gmail IMAP as ${gmailAddress}...`)
    await client.connect()

    // Open INBOX (read-only to avoid marking messages)
    const lock = await client.getMailboxLock('INBOX')

    try {
      const searchQuery = buildSearchQuery({ senderFilter, subjectFilter, maxAgeMinutes })
      log.debug('[gmail-otp] Search query:', JSON.stringify(searchQuery))

      // Search for matching messages
      const messages = []
      for await (const msg of client.fetch(searchQuery, { source: true, uid: true })) {
        messages.push(msg)
      }

      if (messages.length === 0) {
        log.info('[gmail-otp] No matching OTP emails found')
        return null
      }

      log.info(`[gmail-otp] Found ${messages.length} matching email(s), checking newest first`)

      // Process newest first (IMAP returns oldest first, reverse)
      messages.reverse()

      for (const msg of messages) {
        const parsed = await simpleParser(msg.source)
        const text = parsed.text || ''

        const code = extractOtpFromText(text)
        if (code) {
          log.info(`[gmail-otp] Found OTP code (${code.length} digits) in email: "${parsed.subject}"`)
          return code
        }

        // Also check HTML if no code in plain text
        if (parsed.html) {
          // Strip HTML tags for OTP extraction
          const stripped = parsed.html.replace(/<[^>]+>/g, ' ')
          const htmlCode = extractOtpFromText(stripped)
          if (htmlCode) {
            log.info(`[gmail-otp] Found OTP code (${htmlCode.length} digits) in HTML email: "${parsed.subject}"`)
            return htmlCode
          }
        }
      }

      log.warn('[gmail-otp] Matching emails found but no OTP code extracted')
      return null
    } finally {
      lock.release()
    }
  } catch (err) {
    // Provide helpful error messages for common issues
    if (err.authenticationFailed || err.code === 'AUTHENTICATIONFAILED') {
      throw new Error('[gmail-otp] Gmail authentication failed. Check App Password and ensure IMAP is enabled in Gmail settings.')
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      throw new Error(`[gmail-otp] Could not connect to Gmail IMAP: ${err.code}`)
    }
    throw err
  } finally {
    try {
      await client.logout()
    } catch {
      // Ignore logout errors
    }
  }
}
