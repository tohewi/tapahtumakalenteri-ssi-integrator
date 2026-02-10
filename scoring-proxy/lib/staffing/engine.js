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
import { loadConfig, isAdminEmail } from './config-loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data')
const DATA_FILE = path.join(DATA_DIR, 'staffing-events.json')

// ============================================================
// In-memory state + JSON persistence
// ============================================================

let events = new Map() // eventId → TrainingEvent

function loadState() {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf8')
      const arr = JSON.parse(raw)
      events = new Map(arr.map(e => [e.eventId, e]))
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
 * @returns {object} The training event
 */
export function upsertEvent({ eventId, eventName, trainingType, eventDate, shooterCount }) {
  const config = loadConfig()
  const ttConfig = config.trainingTypes[trainingType]
  if (!ttConfig) throw new Error(`Unknown training type: ${trainingType}`)

  let event = events.get(String(eventId))
  if (event) {
    // Update mutable fields from SSI
    event.eventName = eventName
    event.shooterCount = shooterCount
    event.maxTrainers = ttConfig.maxTrainers || 10
  } else {
    event = {
      eventId: String(eventId),
      eventName,
      trainingType,
      eventDate,
      shooterCount,
      maxTrainers: ttConfig.maxTrainers || 10,
      // Role slots: userId/userName or null
      leadInstructor: null,
      equipmentManager: null,
      // Staff list (vetäjät): array of { userId, userName, email, signupTime }
      staff: [],
    }
    events.set(String(eventId), event)
  }

  saveState()
  return event
}

/**
 * Get all training events.
 * @returns {Array<object>}
 */
export function getAllEvents() {
  return [...events.values()]
}

/**
 * Get a single training event by ID.
 * @param {string} eventId
 * @returns {object | null}
 */
export function getEvent(eventId) {
  return events.get(String(eventId)) || null
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
 * @returns {{ role: string, userName: string }}
 */
export function signup(eventId, user, role) {
  const event = events.get(String(eventId))
  if (!event) throw new Error('Event not found')

  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}`)
  }

  // Check admin eligibility
  if (!isAdminEmail(user.email)) {
    throw new Error('Not authorized to sign up as staff')
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
 * @returns {{ resigned: boolean, previousRole: string }}
 */
export function resign(eventId, email) {
  const event = events.get(String(eventId))
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
// Event status for API responses
// ============================================================

/**
 * Get event status summary for the API.
 * @param {string} eventId
 * @returns {object | null}
 */
export function getEventStatus(eventId) {
  const event = events.get(String(eventId))
  if (!event) return null

  const config = loadConfig()
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
    leadInstructor: event.leadInstructor
      ? { email: event.leadInstructor.email, userName: event.leadInstructor.userName }
      : null,
    equipmentManager: event.equipmentManager
      ? { email: event.equipmentManager.email, userName: event.equipmentManager.userName }
      : null,
    staff: event.staff.map(s => ({
      email: s.email,
      userName: s.userName,
    })),
    trainingTypeLabel: ttConfig?.label || null,
  }
}
