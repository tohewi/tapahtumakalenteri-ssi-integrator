/**
 * Squad Optimizer — determines how many squads are needed
 * based on shooter count and training type configuration.
 *
 * See docs/design/sra-staffing-design.md Section 4.1
 */

/**
 * Calculate the number of active shooter squads needed.
 *
 * @param {number} shooterCount — total shooters enrolled in Squads 1-4
 * @param {number} maxSquads — maximum squads available (from config)
 * @param {number} minShootersPerSquad — minimum shooters per squad threshold
 * @returns {number} activeSquadCount (0 if no shooters)
 */
export function calculateActiveSquads(shooterCount, maxSquads, minShootersPerSquad) {
  if (shooterCount <= 0) return 0
  if (maxSquads <= 0) return 0
  if (minShootersPerSquad <= 0) return 1

  let activeSquads = Math.min(
    Math.ceil(shooterCount / minShootersPerSquad),
    maxSquads
  )

  // Ensure each squad has at least minShootersPerSquad
  while (activeSquads > 1 && (shooterCount / activeSquads) < minShootersPerSquad) {
    activeSquads--
  }

  return activeSquads
}

/**
 * Determine staff positions needed (one per active squad).
 *
 * @param {number} shooterCount
 * @param {object} trainingTypeConfig — { maxSquads, minShootersPerSquad, ... }
 * @returns {{ activeSquadCount: number, staffPositions: number }}
 */
export function calculateStaffPositions(shooterCount, trainingTypeConfig) {
  const { maxSquads, minShootersPerSquad } = trainingTypeConfig
  const activeSquadCount = calculateActiveSquads(shooterCount, maxSquads, minShootersPerSquad)
  return {
    activeSquadCount,
    staffPositions: activeSquadCount,
  }
}

/**
 * Assign overflow staff to shooter squads using round-robin (least-full first).
 *
 * @param {number} overflowCount — number of overflow staff to distribute
 * @param {Array<{ squadNumber: number, currentCount: number }>} shooterSquads
 * @returns {Array<{ squadNumber: number }>} — assignment for each overflow person
 */
export function distributeOverflowToSquads(overflowCount, shooterSquads) {
  if (overflowCount <= 0 || shooterSquads.length === 0) return []

  // Copy and sort by current count ascending (least-full first)
  const squads = shooterSquads.map(s => ({ ...s }))
  const assignments = []

  for (let i = 0; i < overflowCount; i++) {
    squads.sort((a, b) => a.currentCount - b.currentCount)
    const target = squads[0]
    assignments.push({ squadNumber: target.squadNumber })
    target.currentCount++
  }

  return assignments
}
