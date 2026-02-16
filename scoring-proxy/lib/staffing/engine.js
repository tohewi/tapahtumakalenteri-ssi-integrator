/**
 * Staffing Engine — core business logic for SRA training staff management.
 *
 * Direct role registration model:
 * - Three roles: leadInstructor (vastuuvetäjä), equipmentManager (kalustovastaava), staff (vetäjä)
 * - All roles count toward maxTrainers per training type
 * - One role per person per event (mutually exclusive)
 * - Registration closes when maxTrainers reached
 *
 * See docs/design/sra-staffing-design.md
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadConfig, DEFAULT_SITE_KEY } from './config-loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data')
const DATA_FILE = path.join(DATA_DIR, 'staffing-events.json')

// ============================================================
// In-memory state + JSON persistence
// ============================================================

let events = new Map() // eventId → TrainingEvent

function normalizeSiteKey(siteKey) {
  if (!siteKey || typeof siteKey !== 'string') return DEFAULT_SITE_KEY
  const normalized = siteKey.trim().toLowerCase()
  if (!normalized) return DEFAULT_SITE_KEY
  return /^[a-z0-9-]+$/.test(normalized) ? normalized : DEFAULT_SITE_KEY
}

function getEventStoreKey(eventId, siteKey = DEFAULT_SITE_KEY) {
  return `${normalizeSiteKey(siteKey)}:${String(eventId)}`
}

function normalizeStoredEvent(rawEvent) {
  const siteKey = normalizeSiteKey(rawEvent?.siteKey)
  return {
    ...rawEvent,
    siteKey,
    eventId: String(rawEvent?.eventId),
  }
}

function loadState() {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf8')
      const arr = JSON.parse(raw)
      events = new Map(
        (arr || []).map(event => {
          const normalizedEvent = normalizeStoredEvent(event)
          return [getEventStoreKey(normalizedEvent.eventId, normalizedEvent.siteKey), normalizedEvent]
        })
      )
      console.log(`[staffing] Loaded ${events.size} event(s) from disk`)
    }
  } catch (err) {
    console.error('[staffing] Failed to load state:', err.message)
    events = new Map()
  }
}

function saveState() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    const arr = [...events.values()]
    writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8')
  } catch (err) {
    console.error('[staffing] Failed to save state:', err.message)
  }
}

// Load on module init
loadState()

// ============================================================
// Event management
// ============================================================

/**
 * Create or update a training event from SSI data.
 *
 * @param {object} params
 * @param {string} params.eventId — SSI match ID
 * @param {string} params.eventName — match name
 * @param {string} params.trainingType — "oldies" or "newbie"
 * @param {string} params.eventDate — ISO date
 * @param {number} params.shooterCount — current shooter count in shooter squads
 * @param {number} params.contentType — SSI content type (22 for match, 136 for cup)
 * @param {string} params.siteKey — staffing site key
 * @returns {Promise<object>} The training event
 */
export async function upsertEvent({ eventId, eventName, trainingType, eventDate, shooterCount, contentType, siteKey = DEFAULT_SITE_KEY }) {
  const normalizedSiteKey = normalizeSiteKey(siteKey)
  const config = await loadConfig(normalizedSiteKey)
  const ttConfig = config.trainingTypes[trainingType]
  if (!ttConfig) throw new Error(`Unknown training type: ${trainingType}`)

  const eventStoreKey = getEventStoreKey(eventId, normalizedSiteKey)
  let event = events.get(eventStoreKey)
  if (event) {
    // Update mutable fields from SSI
    event.eventName = eventName
    event.shooterCount = shooterCount
    event.maxTrainers = ttConfig.maxTrainers || 10
    if (contentType !== undefined) event.contentType = contentType
  } else {
    event = {
      eventId: String(eventId),
      siteKey: normalizedSiteKey,
      eventName,
      trainingType,
      eventDate,
      shooterCount,
      maxTrainers: ttConfig.maxTrainers || 10,
      contentType: contentType || null,
      // Role slots: userId/userName or null
      leadInstructor: null,
      equipmentManager: null,
      // Staff list (vetäjät): array of { userId, userName, email, signupTime }
      staff: [],
    }
    events.set(eventStoreKey, event)
  }

  saveState()
  return event
}

/**
 * Get all training events.
 * @returns {Array<object>}
 */
export function getAllEvents(siteKey = DEFAULT_SITE_KEY) {
  const normalizedSiteKey = normalizeSiteKey(siteKey)
  return [...events.values()].filter(event => normalizeSiteKey(event.siteKey) === normalizedSiteKey)
}

/**
 * Get a single training event by ID.
 * @param {string} eventId
 * @returns {object | null}
 */
export function getEvent(eventId, siteKey = DEFAULT_SITE_KEY) {
  return events.get(getEventStoreKey(eventId, siteKey)) || null
}

// ============================================================
// Staff signup — direct role registration
// ============================================================

const VALID_ROLES = ['leadInstructor', 'equipmentManager', 'staff']

/**
 * Count total trainers (all roles) for an event.
 */
function totalTrainers(event) {
  let count = event.staff.length
  if (event.leadInstructor) count++
  if (event.equipmentManager) count++
  return count
}

/**
 * Find which role a user holds in an event, or null.
 * Users are identified by email (primary key in SSI).
 */
function getUserRole(event, email) {
  if (event.leadInstructor?.email === email) return 'leadInstructor'
  if (event.equipmentManager?.email === email) return 'equipmentManager'
  if (event.staff.some(s => s.email === email)) return 'staff'
  return null
}

/**
 * Register for a specific role in an event.
 *
 * @param {string} eventId
 * @param {object} user — { email, userName }
 * @param {string} role — "leadInstructor", "equipmentManager", or "staff"
 * @param {string} siteKey - staffing site key
 * @returns {{ role: string, userName: string }}
 */
export function signup(eventId, user, role, siteKey = DEFAULT_SITE_KEY) {
  const event = events.get(getEventStoreKey(eventId, siteKey))
  if (!event) throw new Error('Event not found')

  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}`)
  }

  // Check if already registered in any role (email is primary key)
  const existingRole = getUserRole(event, user.email)
  if (existingRole) {
    throw new Error(`Already registered as ${existingRole}`)
  }

  // Check max trainers
  if (totalTrainers(event) >= event.maxTrainers) {
    throw new Error('Registration is full')
  }

  const now = new Date().toISOString()

  if (role === 'leadInstructor') {
    if (event.leadInstructor) throw new Error('Lead instructor slot already taken')
    event.leadInstructor = { email: user.email, userName: user.userName, signupTime: now }
  } else if (role === 'equipmentManager') {
    if (event.equipmentManager) throw new Error('Equipment manager slot already taken')
    event.equipmentManager = { email: user.email, userName: user.userName, signupTime: now }
  } else {
    event.staff.push({ email: user.email, userName: user.userName, signupTime: now })
  }

  saveState()
  return { role, userName: user.userName }
}

/**
 * Resign from own role in an event.
 *
 * @param {string} eventId
 * @param {string} email — user's email (primary identifier)
 * @param {string} siteKey - staffing site key
 * @returns {{ resigned: boolean, previousRole: string }}
 */
export function resign(eventId, email, siteKey = DEFAULT_SITE_KEY) {
  const event = events.get(getEventStoreKey(eventId, siteKey))
  if (!event) throw new Error('Event not found')

  const currentRole = getUserRole(event, email)
  if (!currentRole) throw new Error('Not registered for this event')

  if (currentRole === 'leadInstructor') {
    event.leadInstructor = null
  } else if (currentRole === 'equipmentManager') {
    event.equipmentManager = null
  } else {
    event.staff = event.staff.filter(s => s.email !== email)
  }

  saveState()
  return { resigned: true, previousRole: currentRole }
}

// ============================================================
// Sync staff from SSI — populate roles from SSI management data
// ============================================================

/**
 * Sync staff roles from SSI data into engine state.
 * Called on event load to reflect current SSI management group + trainer squad.
 *
 * @param {string} eventId
 * @param {Array<{email: string, userName: string, role: string}>} staffList
 *   role: "leadInstructor" | "equipmentManager" | "staff"
 * @param {string} siteKey - staffing site key
 */
export function syncStaffFromSSI(eventId, staffList, siteKey = DEFAULT_SITE_KEY) {
  const event = events.get(getEventStoreKey(eventId, siteKey))
  if (!event) return

  let changed = false

  for (const member of staffList) {
    if (!member.email) continue

    // Skip if already registered in any role
    if (getUserRole(event, member.email)) continue

    // Check max trainers
    if (totalTrainers(event) >= event.maxTrainers) break

    if (member.role === 'leadInstructor' && !event.leadInstructor) {
      event.leadInstructor = { email: member.email, userName: member.userName, signupTime: null }
      changed = true
    } else if (member.role === 'equipmentManager' && !event.equipmentManager) {
      event.equipmentManager = { email: member.email, userName: member.userName, signupTime: null }
      changed = true
    } else if (member.role === 'staff') {
      event.staff.push({ email: member.email, userName: member.userName, signupTime: null })
      changed = true
    }
  }

  if (changed) saveState()
}

// ============================================================
// Event status for API responses
// ============================================================

/**
 * Get event status summary for the API.
 * @param {string} eventId
 * @param {string} siteKey - staffing site key
 * @returns {Promise<object | null>}
 */
export async function getEventStatus(eventId, siteKey = DEFAULT_SITE_KEY) {
  const event = events.get(getEventStoreKey(eventId, siteKey))
  if (!event) return null

  const config = await loadConfig(event.siteKey || siteKey)
  const ttConfig = config.trainingTypes[event.trainingType]
  const current = totalTrainers(event)
  const isFull = current >= event.maxTrainers

  return {
    eventId: event.eventId,
    eventName: event.eventName,
    trainingType: event.trainingType,
    eventDate: event.eventDate,
    shooterCount: event.shooterCount,
    maxTrainers: event.maxTrainers,
    currentTrainers: current,
    isFull,
    contentType: event.contentType || null,
    leadInstructor: event.leadInstructor
      ? { email: event.leadInstructor.email, userName: event.leadInstructor.userName }
      : null,
    equipmentManager: event.equipmentManager
      ? { email: event.equipmentManager.email, userName: event.equipmentManager.userName }
      : null,
    staff: event.staff
      .map(s => ({
        email: s.email,
        userName: s.userName,
      })),
    trainingTypeLabel: ttConfig?.label || null,
  }
}
