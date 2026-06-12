// ============================================================
// SSI Event System Adapter (INT-1 Phase 1)
//
// Wraps existing ssi-core/ functions into the EventSystemAdapter
// interface. This is a facade — no behavior changes, just a
// uniform API that services can depend on instead of importing
// ssi-core modules directly.
//
// Usage:
//   const adapter = new SsiEventAdapter(credentials)
//   const cookies = await adapter.login()
//   const stats = await adapter.getEventStats({ cupTypeId, cupId })
// ============================================================

import { ssiLogin } from '../ssi-core/client.js'
import { ssiGraphQL } from '../ssi-core/graphql.js'
import { ssiFetchEventStructure, ssiSearchEvents } from '../ssi-core/seed-import.js'
import { ssiGetEventStats } from '../ssi-core/stats-graphql.js'
import { ssiCompleteEvent, SSI_EVENT_STATUSES } from '../ssi-core/event-status.js'
import { createSsiEvent, deleteSsiEvent } from '../services/event-creation-service.js'
import { completeEvent } from '../services/event-complete-service.js'
import { log } from '../logger.js'

/**
 * SSI Event System Adapter — implements EventSystemAdapter interface.
 *
 * Wraps all SSI-specific operations (GraphQL, web scraping, form POST)
 * behind a uniform interface that services can depend on.
 */
export class SsiEventAdapter {
  constructor(credentials) {
    this.credentials = credentials // { email, password, apiKey }
    this.type = 'ssi'
  }

  /**
   * Authenticate with SSI (web login for cookie-based operations).
   * @returns {Promise<object>} Cookie jar for subsequent web requests
   */
  async login() {
    if (!this.credentials?.email || !this.credentials?.password) {
      throw new Error('SSI credentials required (email + password)')
    }
    return ssiLogin(this.credentials.email, this.credentials.password)
  }

  /**
   * Authenticate with SSI GraphQL (JWT token).
   * @returns {Promise<string>} JWT token
   */
  async loginGraphQL() {
    const auth = await ssiGraphQL(null, `
      mutation Auth($email: String!, $password: String!) {
        token_auth(email: $email, password: $password) {
          token { token }
        }
      }
    `, { email: this.credentials.email, password: this.credentials.password })

    const jwt = auth?.token_auth?.token?.token
    if (!jwt) throw new Error('SSI GraphQL authentication failed')
    return jwt
  }

  /**
   * Create event(s) in SSI from a template.
   * Delegates to the existing event-creation-service.
   * @param {object} params - { template, eventDate, tenant, ... }
   * @returns {Promise<object>} SSI references (cupId, matches, etc.)
   */
  async createEvent(params) {
    return createSsiEvent(params)
  }

  /**
   * Delete/cancel an event in SSI.
   * @param {object} params - { ssiReferences, ssiCredentials }
   * @returns {Promise<object>} Deletion result
   */
  async deleteEvent(params) {
    return deleteSsiEvent(params)
  }

  /**
   * Mark an SSI event as completed.
   * @param {object} params - { ssiReferences, ssiCredentials, onProgress }
   * @returns {Promise<object>} Completion result
   */
  async completeEvent(params) {
    return completeEvent({
      ...params,
      ssiCredentials: params.ssiCredentials || this.credentials,
    })
  }

  /**
   * Fetch participant count and stats from SSI.
   * @param {object} params - { cupTypeId, cupId, isCup }
   * @returns {Promise<object>} Stats { eventName, participantCount, ... }
   */
  async getEventStats(params) {
    return ssiGetEventStats({
      credentials: this.credentials,
      ...params,
    })
  }

  /**
   * Search SSI events by name, sport, date range, region.
   * @param {string} jwt - SSI GraphQL JWT token
   * @param {object} filters - { search, sport, startsAfter, startsBefore, region }
   * @returns {Promise<Array>} Matching events
   */
  async searchEvents(jwt, filters) {
    return ssiSearchEvents(jwt, filters)
  }

  /**
   * Import event structure from SSI as a seed snapshot.
   * @param {object} params - { ssiEventUrl, credentials }
   * @returns {Promise<object>} Structured snapshot
   */
  async importEventStructure(params) {
    return ssiFetchEventStructure({
      ...params,
      credentials: params.credentials || this.credentials,
    })
  }

  /**
   * Get available SSI event statuses.
   * @returns {object} Status constants
   */
  getEventStatuses() {
    return SSI_EVENT_STATUSES
  }
}
