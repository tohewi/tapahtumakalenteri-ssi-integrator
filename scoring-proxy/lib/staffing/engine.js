/**
 * Staffing Engine — core business logic for SRA training staff management.
 *
 * Manages training events, staff signups, FIFO queue, allocation,
 * and persistence to JSON file.
 *
 * See docs/design/sra-staffing-design.md Sections 3-4
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadConfig, isAdminEmail, getTrainingType } from './config-loader.js'
import { calculateStaffPositions, distributeOverflowToSquads } from './squad-optimizer.js'
import { assignRoles, reassignRole } from './role-assigner.js'
import { notifyConfirmedStaff, notifyOverflowStaff, notifyMissingRoles } from './notifier.js'

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
 * @param {string} params.eventName — match name (e.g. "Oldies 15.03.2026")
 * @param {string} params.trainingType — "oldies" or "newbie"
 * @param {string} params.eventDate — ISO date
 * @param {number} params.shooterCount — current shooter count in Squads 1-4
 * @param {Array<{ squadNumber: number, currentCount: number }>} params.shooterSquads — squad details
 * @returns {object} The training event
 */
export function upsertEvent({ eventId, eventName, trainingType, eventDate, shooterCount, shooterSquads }) {
  const config = loadConfig()
  const ttConfig = config.trainingTypes[trainingType]
  if (!ttConfig) throw new Error(`Unknown training type: ${trainingType}`)

  const closesBeforeHours = config.registration.closesBeforeEventHours
  const registrationClose = new Date(new Date(eventDate).getTime() - closesBeforeHours * 60 * 60 * 1000).toISOString()

  let event = events.get(String(eventId))
  if (event) {
    // Update mutable fields
    event.eventName = eventName
    event.shooterCount = shooterCount
    event.shooterSquads = shooterSquads || event.shooterSquads
    // Recalculate positions
    const { activeSquadCount, staffPositions } = calculateStaffPositions(shooterCount, ttConfig)
    event.activeSquadCount = activeSquadCount
    event.staffPositions = staffPositions
  } else {
    const { activeSquadCount, staffPositions } = calculateStaffPositions(shooterCount, ttConfig)
    event = {
      eventId: String(eventId),
      eventName,
      trainingType,
      eventDate,
      registrationClose,
      status: 'open',
      shooterCount,
      shooterSquads: shooterSquads || [],
      activeSquadCount,
      staffPositions,
      staffSignups: [],
      roleAssignments: [],
      notifications: [],
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
// Staff signup
// ============================================================

/**
 * Sign up as staff for an event.
 *
 * @param {string} eventId
 * @param {object} user — { userId, userName, email }
 * @param {string|null} rolePreference — "leadInstructor", "equipmentManager", or null
 * @returns {{ queuePosition: number, status: string, rolePreference: string|null }}
 */
export function signup(eventId, user, rolePreference = null) {
  const event = events.get(String(eventId))
  if (!event) throw new Error('Event not found')
  if (event.status !== 'open') throw new Error('Registration is closed for this event')

  // Check admin eligibility
  if (!isAdminEmail(user.email)) {
    throw new Error('Not authorized to sign up as staff')
  }

  // Check for duplicate signup
  const existing = event.staffSignups.find(s => s.userId === user.userId)
  if (existing) {
    // Update role preference if changed
    existing.rolePreference = rolePreference
    saveState()
    return {
      queuePosition: existing.queuePosition,
      status: existing.status,
      rolePreference: existing.rolePreference,
    }
  }

  const signup = {
    userId: user.userId,
    userName: user.userName,
    email: user.email,
    signupTime: new Date().toISOString(),
    queuePosition: event.staffSignups.length + 1,
    status: 'queued',
    rolePreference,
    assignedRole: null,
  }

  event.staffSignups.push(signup)
  saveState()

  return {
    queuePosition: signup.queuePosition,
    status: signup.status,
    rolePreference: signup.rolePreference,
  }
}

/**
 * Cancel staff signup.
 *
 * @param {string} eventId
 * @param {string} userId
 * @returns {{ cancelled: boolean, promoted: object|null }}
 */
export function cancelSignup(eventId, userId) {
  const event = events.get(String(eventId))
  if (!event) throw new Error('Event not found')

  const signupIndex = event.staffSignups.findIndex(s => s.userId === userId)
  if (signupIndex === -1) throw new Error('Signup not found')

  const signup = event.staffSignups[signupIndex]
  const wasConfirmed = signup.status === 'confirmed'
  const hadRole = signup.assignedRole

  signup.status = 'cancelled'
  signup.assignedRole = null

  let promoted = null

  // If they were confirmed and event is finalized, promote from overflow
  if (wasConfirmed && event.status === 'finalized') {
    const overflow = event.staffSignups
      .filter(s => s.status === 'overflow')
      .sort((a, b) => a.queuePosition - b.queuePosition)

    if (overflow.length > 0) {
      const next = overflow[0]
      next.status = 'confirmed'
      promoted = { userId: next.userId, userName: next.userName }

      // Re-assign the vacated role if needed
      if (hadRole) {
        const assignedIds = new Set(
          event.staffSignups
            .filter(s => s.status === 'confirmed' && s.assignedRole)
            .map(s => s.userId)
        )
        const confirmedStaff = event.staffSignups.filter(s => s.status === 'confirmed')
        const replacement = reassignRole(hadRole, confirmedStaff, assignedIds)
        if (replacement) {
          const ra = event.roleAssignments.find(r => r.roleKey === hadRole)
          if (ra) {
            ra.userId = replacement.userId
            ra.userName = replacement.userName
            ra.assignmentMethod = replacement.method
            ra.assignedAt = new Date().toISOString()
          }
        }
      }
    }
  }

  saveState()
  return { cancelled: true, promoted }
}

// ============================================================
// Finalization
// ============================================================

/**
 * Finalize staffing for an event — allocate positions, assign roles, notify.
 * Idempotent: calling on already-finalized event is a no-op.
 *
 * @param {string} eventId
 * @returns {Promise<{ finalized: boolean, staffPositions: number, confirmed: number, overflow: number, warnings: string[] }>}
 */
export async function finalizeEvent(eventId) {
  const event = events.get(String(eventId))
  if (!event) throw new Error('Event not found')

  // Idempotent
  if (event.status === 'finalized') {
    return {
      finalized: false,
      message: 'Event already finalized',
      staffPositions: event.staffPositions,
      confirmed: event.staffSignups.filter(s => s.status === 'confirmed').length,
      overflow: event.staffSignups.filter(s => s.status === 'overflow').length,
      warnings: [],
    }
  }

  event.status = 'closed'
  const config = loadConfig()
  const ttConfig = config.trainingTypes[event.trainingType]

  // Recalculate staff positions from current shooter count
  const { activeSquadCount, staffPositions } = calculateStaffPositions(event.shooterCount, ttConfig)
  event.activeSquadCount = activeSquadCount
  event.staffPositions = staffPositions

  // Sort signups by signupTime (FIFO)
  const activeSignups = event.staffSignups
    .filter(s => s.status === 'queued' || s.status === 'confirmed')
    .sort((a, b) => new Date(a.signupTime) - new Date(b.signupTime))

  // Allocate: first N are confirmed, rest are overflow
  activeSignups.forEach((s, i) => {
    s.status = i < staffPositions ? 'confirmed' : 'overflow'
  })

  const confirmedStaff = activeSignups.filter(s => s.status === 'confirmed')
  const overflowStaff = activeSignups.filter(s => s.status === 'overflow')

  // Assign special roles
  const { assignments, warnings } = assignRoles(confirmedStaff)
  event.roleAssignments = assignments.map(a => ({
    roleKey: a.roleKey,
    userId: a.userId,
    userName: a.userName,
    assignmentMethod: a.method,
    assignedAt: a.userId ? new Date().toISOString() : null,
  }))

  // Distribute overflow to shooter squads (Q3: auto-move + notify)
  if (overflowStaff.length > 0 && event.shooterSquads.length > 0) {
    const squadAssignments = distributeOverflowToSquads(overflowStaff.length, event.shooterSquads)
    overflowStaff.forEach((s, i) => {
      s.assignedSquad = squadAssignments[i]?.squadNumber || null
    })
  }

  event.status = 'finalized'
  saveState()

  // Send notifications (async, non-blocking for the API response)
  try {
    await notifyConfirmedStaff(confirmedStaff, event.eventName)

    if (overflowStaff.length > 0) {
      await notifyOverflowStaff(
        overflowStaff.map(s => ({
          email: s.email,
          userId: s.userId,
          userName: s.userName,
          assignedSquad: s.assignedSquad,
        })),
        event.eventName
      )
    }

    // Notify about unfilled roles
    const missingRoles = assignments.filter(a => !a.userId).map(a => a.roleKey)
    if (missingRoles.length > 0) {
      const adminEmail = config.adminAllowlist[0]
      if (adminEmail) {
        await notifyMissingRoles(missingRoles, adminEmail, event.eventName)
      }
    }
  } catch (err) {
    console.error('[staffing] Notification error:', err.message)
    warnings.push(`Notification error: ${err.message}`)
  }

  return {
    finalized: true,
    staffPositions,
    confirmed: confirmedStaff.length,
    overflow: overflowStaff.length,
    warnings,
  }
}

/**
 * Get event status summary for the API.
 * @param {string} eventId
 * @returns {object}
 */
export function getEventStatus(eventId) {
  const event = events.get(String(eventId))
  if (!event) return null

  const config = loadConfig()
  const ttConfig = config.trainingTypes[event.trainingType]

  return {
    eventId: event.eventId,
    eventName: event.eventName,
    trainingType: event.trainingType,
    eventDate: event.eventDate,
    registrationClose: event.registrationClose,
    status: event.status,
    shooterCount: event.shooterCount,
    activeSquadCount: event.activeSquadCount,
    staffPositions: event.staffPositions,
    staffSignups: event.staffSignups
      .filter(s => s.status !== 'cancelled')
      .map(s => ({
        userName: s.userName,
        queuePosition: s.queuePosition,
        status: s.status,
        rolePreference: s.rolePreference,
        assignedRole: s.assignedRole,
        assignedSquad: s.assignedSquad || null,
      })),
    roleAssignments: Object.fromEntries(
      (event.roleAssignments || []).map(ra => [
        ra.roleKey,
        { userId: ra.userId, userName: ra.userName, method: ra.assignmentMethod },
      ])
    ),
    trainingTypeLabel: ttConfig?.label || null,
  }
}

/**
 * Get all events that are past registration close but not yet finalized.
 * Used by the cron job.
 * @returns {Array<object>}
 */
export function getEventsDueForFinalization() {
  const now = new Date()
  return [...events.values()].filter(e => {
    if (e.status !== 'open') return false
    const closeDate = new Date(e.registrationClose)
    return closeDate <= now
  })
}
