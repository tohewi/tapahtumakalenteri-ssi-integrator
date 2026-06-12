// ============================================================
// Null Adapters (INT-1 Phase 1)
//
// No-op implementations for tenants without integrations configured.
// Services call adapter methods unconditionally — null adapters
// handle the "not configured" case cleanly without if-checks.
// ============================================================

import { AppError } from '../errors/AppError.js'
import { log } from '../logger.js'

/**
 * NullEventAdapter — used when no event system is configured.
 * Destructive operations throw; read operations return empty.
 */
export class NullEventAdapter {
  constructor() {
    this.type = 'none'
  }

  async login() {
    throw new AppError('No event system configured for this tenant', 400, 'INTEGRATION_NOT_CONFIGURED')
  }

  async loginGraphQL() {
    throw new AppError('No event system configured for this tenant', 400, 'INTEGRATION_NOT_CONFIGURED')
  }

  async createEvent() {
    throw new AppError('No event system configured — cannot create events', 400, 'INTEGRATION_NOT_CONFIGURED')
  }

  async deleteEvent() {
    throw new AppError('No event system configured — cannot delete events', 400, 'INTEGRATION_NOT_CONFIGURED')
  }

  async completeEvent() {
    throw new AppError('No event system configured — cannot complete events', 400, 'INTEGRATION_NOT_CONFIGURED')
  }

  async getEventStats() {
    return null
  }

  async searchEvents() {
    return []
  }

  async importEventStructure() {
    throw new AppError('No event system configured — cannot import event structure', 400, 'INTEGRATION_NOT_CONFIGURED')
  }

  getEventStatuses() {
    return {}
  }
}

/**
 * NullCalendarAdapter — used when no calendar system is configured.
 * All operations are no-ops (skip silently with log).
 */
export class NullCalendarAdapter {
  constructor() {
    this.type = 'none'
  }

  async publishEvent() {
    log.info('[calendar-null] No calendar configured — skipping publish')
    return { skipped: true }
  }

  async updateEvent() {
    log.info('[calendar-null] No calendar configured — skipping update')
    return { skipped: true }
  }

  async deleteEvent() {
    log.info('[calendar-null] No calendar configured — skipping delete')
    return { skipped: true }
  }

  async getEvent() {
    return null
  }

  async updateStats() {
    log.info('[calendar-null] No calendar configured — skipping stats update')
    return { skipped: true }
  }
}
