// ============================================================
// Platform Store — Role-Based Access Control (RBAC)
//
// Defines tenant roles, role assignment matrix, and role-check helpers.
// See docs/design/platform-data-model.md §2.6 for full permission matrix.
// ============================================================

/** All valid tenant member roles */
export const TENANT_ROLES = ['owner', 'tenant_admin', 'discipline_admin', 'instructor_admin', 'match_admin', 'instructor']

/** Roles that inherit ALL operational permissions (but NOT billing/SSI) */
const ADMIN_ROLES = new Set(['owner', 'tenant_admin']) // eslint-disable-line no-unused-vars

/**
 * Role Assignment Matrix — defines which roles each actor role can assign.
 * Used for both invitations and member role updates.
 * See docs/requirements/requirements.md Release 8.2 RBAC1.
 */
export const ROLE_ASSIGNMENT_MATRIX = {
  owner:            ['owner', 'tenant_admin', 'discipline_admin', 'instructor_admin', 'match_admin', 'instructor'],
  tenant_admin:     ['discipline_admin', 'instructor_admin', 'match_admin', 'instructor'],
  instructor_admin: ['match_admin', 'instructor'],
  discipline_admin: [],
  match_admin:      [],
  instructor:       [],
}

/**
 * Get the set of roles an actor can assign, based on all their roles (union).
 * @param {string[]} actorRoles - the actor's current roles
 * @returns {string[]} roles the actor is allowed to assign
 */
export function getAssignableRoles(actorRoles) {
  if (!actorRoles || actorRoles.length === 0) return []
  const assignable = new Set()
  for (const role of actorRoles) {
    const allowed = ROLE_ASSIGNMENT_MATRIX[role] || []
    allowed.forEach(r => assignable.add(r))
  }
  return [...assignable]
}

/**
 * Check if actor can assign all the requested roles.
 * @param {string[]} actorRoles
 * @param {string[]} requestedRoles
 * @returns {{ allowed: boolean, disallowed: string[] }}
 */
export function validateRoleAssignment(actorRoles, requestedRoles) {
  const assignable = new Set(getAssignableRoles(actorRoles))
  const disallowed = requestedRoles.filter(r => !assignable.has(r))
  return { allowed: disallowed.length === 0, disallowed }
}

/**
 * Check if a membership's roles satisfy the required roles for an action.
 * - `owner` implicitly satisfies every role
 * - `tenant_admin` implicitly satisfies every operational role (not billing/SSI)
 *
 * @param {string[]} memberRoles - roles the member actually has
 * @param {string[]} requiredRoles - any one of these must match
 * @returns {boolean}
 */
export function hasRequiredRole(memberRoles, requiredRoles) {
  if (!memberRoles || memberRoles.length === 0) return false
  if (!requiredRoles || requiredRoles.length === 0) return false

  // owner can do everything
  if (memberRoles.includes('owner')) return true

  // tenant_admin can do everything except owner-only actions (billing, SSI creds)
  // Owner-only actions are identified by requiring ONLY 'owner' in requiredRoles
  if (memberRoles.includes('tenant_admin')) {
    const ownerOnly = requiredRoles.length === 1 && requiredRoles[0] === 'owner'
    if (!ownerOnly) return true
  }

  // Direct role match
  return memberRoles.some(r => requiredRoles.includes(r))
}
