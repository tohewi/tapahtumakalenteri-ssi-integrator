// ============================================================
// WordPress Calendar System Adapter (INT-1 Phase 2)
//
// Wraps the existing WpCalendarAdapter (lib/calendar/wp-adapter.js)
// and calendar-publish-service.js into the CalendarSystemAdapter
// interface. Handles WP authentication + OTP internally.
//
// Usage:
//   const adapter = new WpCalendarSystemAdapter(calendarConfig)
//   await adapter.publishEvent({ title, date, content, ... })
//   await adapter.updateStats(eventId, { attendeeCount, shotsFired })
// ============================================================

import { authenticateToWordPress, validateCalendarConfig } from '../services/calendar-publish-service.js'
import { WpCalendarAdapter } from '../calendar/wp-adapter.js'
import { log } from '../logger.js'

/**
 * WordPress Calendar System Adapter — implements CalendarSystemAdapter interface.
 *
 * Orchestrates WP authentication (with optional Gmail OTP for 2FA)
 * and delegates CRUD operations to the underlying WpCalendarAdapter.
 */
export class WpCalendarSystemAdapter {
  constructor(calendarConfig) {
    this.calendarConfig = calendarConfig
    this.type = 'wordpress'
    this._wpAdapter = null // lazy-initialized after auth
  }

  /**
   * Validate that the calendar config has all required fields.
   * @returns {{ valid: boolean, missing: string[] }}
   */
  validate() {
    return validateCalendarConfig(this.calendarConfig)
  }

  /**
   * Authenticate to WordPress (handles 2FA + Gmail OTP if configured).
   * Caches the authenticated adapter for subsequent calls.
   * @returns {Promise<WpCalendarAdapter>} Authenticated adapter instance
   */
  async _ensureAuthenticated() {
    if (this._wpAdapter) return this._wpAdapter

    const validation = this.validate()
    if (!validation.valid) {
      throw new Error(`Calendar not configured: missing ${validation.missing.join(', ')}`)
    }

    log.info('[wp-calendar-adapter] Authenticating to WordPress...')
    const wpSession = await authenticateToWordPress(this.calendarConfig)
    this._wpAdapter = new WpCalendarAdapter(wpSession)
    return this._wpAdapter
  }

  /**
   * Create and publish a calendar event.
   * @param {object} params - { title, date, startTime, content, shortDescription, location, taxonomyIds }
   * @returns {Promise<object>} { eventId, eventUrl, editUrl, status, title }
   */
  async publishEvent(params) {
    const wp = await this._ensureAuthenticated()

    // Create as draft
    const created = await wp.createEvent(params)
    log.info(`[wp-calendar-adapter] Created draft event ${created.eventId}`)

    // Publish
    await wp.publishEvent(created.eventId)
    log.info(`[wp-calendar-adapter] Published event ${created.eventId}`)

    return {
      eventId: created.eventId,
      eventUrl: created.eventUrl,
      editUrl: created.editUrl,
      status: 'publish',
      title: created.title,
    }
  }

  /**
   * Update an existing calendar event.
   * @param {string} eventId - WordPress post ID
   * @param {object} changes - { attendeeCount, shotsFired, content, ... }
   * @returns {Promise<object>} { eventId, status }
   */
  async updateEvent(eventId, changes) {
    const wp = await this._ensureAuthenticated()
    return wp.updateEvent(eventId, changes)
  }

  /**
   * Delete/trash a calendar event.
   * @param {string} eventId - WordPress post ID
   * @returns {Promise<object>} { eventId, status }
   */
  async deleteEvent(eventId) {
    const wp = await this._ensureAuthenticated()
    return wp.deleteEvent(eventId)
  }

  /**
   * Fetch a calendar event for verification.
   * @param {string} eventId - WordPress post ID
   * @returns {Promise<object>} { eventId, title, status, acfFields, editUrl }
   */
  async getEvent(eventId) {
    const wp = await this._ensureAuthenticated()
    return wp.getEvent(eventId)
  }

  /**
   * Update attendance stats on a calendar event (ACF fields).
   * @param {string} eventId - WordPress post ID
   * @param {object} stats - { attendeeCount, shotsFired }
   * @returns {Promise<object>} { eventId, status }
   */
  async updateStats(eventId, stats) {
    const wp = await this._ensureAuthenticated()
    return wp.updateEvent(eventId, stats)
  }
}
