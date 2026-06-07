/**
 * Role Assigner — assigns special roles to confirmed staff.
 *
 * Rules (from design decisions Q4, Q7):
 * - Role preference is BINDING: if a volunteer requested a role, they get it (FIFO)
 * - No dual roles: one person cannot hold both special roles
 * - Fallback: if no volunteer, randomly assign from unassigned confirmed staff
 *
 * See docs/design/sra-staffing-design.md Section 4.3
 */

import { getRequiredRoles } from './config-loader.js'

/**
 * Assign special roles to confirmed staff members.
 *
 * @param {Array<object>} confirmedStaff — staff with status "confirmed", sorted by signupTime
 *   Each: { userId, userName, email, signupTime, rolePreference, assignedRole }
 * @returns {{ assignments: Array<{ roleKey: string, userId: string, userName: string, method: string }>, warnings: string[] }}
 */
export function assignRoles(confirmedStaff) {
  const requiredRoles = getRequiredRoles()
  const assignments = []
  const warnings = []
  const assignedUserIds = new Set()

  for (const role of requiredRoles) {
    const { key: roleKey } = role

    // Find volunteers for this role (binding preference, FIFO order)
    const volunteers = confirmedStaff.filter(
      s => s.rolePreference === roleKey && !assignedUserIds.has(s.userId)
    )

    if (volunteers.length > 0) {
      // Binding: first volunteer by signupTime gets the role
      const winner = volunteers[0] // already sorted by signupTime
      winner.assignedRole = roleKey
      assignedUserIds.add(winner.userId)
      assignments.push({
        roleKey,
        userId: winner.userId,
        userName: winner.userName,
        method: 'volunteer',
      })
      continue
    }

    // No volunteer — random assignment from unassigned confirmed staff
    const available = confirmedStaff.filter(
      s => !assignedUserIds.has(s.userId) && !s.rolePreference
    )

    if (available.length > 0) {
      const randomIndex = Math.floor(Math.random() * available.length)
      const selected = available[randomIndex]
      selected.assignedRole = roleKey
      assignedUserIds.add(selected.userId)
      assignments.push({
        roleKey,
        userId: selected.userId,
        userName: selected.userName,
        method: 'random',
      })
    } else {
      // Cannot fill this role
      warnings.push(`No volunteer or available staff for role: ${roleKey}`)
      assignments.push({
        roleKey,
        userId: null,
        userName: null,
        method: null,
      })
    }
  }

  return { assignments, warnings }
}

/**
 * Re-assign a single role after cancellation.
 * Finds a replacement from remaining confirmed staff.
 *
 * @param {string} roleKey — the role to reassign
 * @param {Array<object>} confirmedStaff — current confirmed staff (sorted by signupTime)
 * @param {Set<string>} assignedUserIds — currently assigned user IDs
 * @returns {{ userId: string, userName: string, method: string } | null}
 */
export function reassignRole(roleKey, confirmedStaff, assignedUserIds) {
  // First try volunteers
  const volunteers = confirmedStaff.filter(
    s => s.rolePreference === roleKey && !assignedUserIds.has(s.userId)
  )

  if (volunteers.length > 0) {
    const winner = volunteers[0]
    winner.assignedRole = roleKey
    assignedUserIds.add(winner.userId)
    return { userId: winner.userId, userName: winner.userName, method: 'volunteer' }
  }

  // Random from unassigned
  const available = confirmedStaff.filter(
    s => !assignedUserIds.has(s.userId) && !s.rolePreference
  )

  if (available.length > 0) {
    const randomIndex = Math.floor(Math.random() * available.length)
    const selected = available[randomIndex]
    selected.assignedRole = roleKey
    assignedUserIds.add(selected.userId)
    return { userId: selected.userId, userName: selected.userName, method: 'random' }
  }

  return null
}
