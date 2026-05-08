// ============================================================
// Cup Management Service
//
// Business logic extracted from routes/management.js.
// Pure data transformation — no Express req/res, no HTTP.
// ============================================================

import { log } from '../logger.js'

// ============================================================
// Build consolidated squadding overview from GraphQL cup data
//
// Input: cup object from GraphQL (NordicSerieNode with component_matches)
// Output: { matches, shooters, cupOnly, matchOnly, pendingShooters }
// ============================================================

export function buildSquaddingOverview(cup) {
  const componentMatches = (cup.component_matches || [])
    .filter(cm => cm.included && cm.match)
    .sort((a, b) => a.number - b.number)

  // Build match info with squads, match-level competitors, and squad-level competitors
  const matches = componentMatches.map(cm => {
    const m = cm.match
    const squads = (m.squads || []).map(sq => ({
      number: sq.number,
      name: sq.comment || `Squad ${sq.number}`,
      max: sq.max_competitors || 0,
      shooters: (sq.competitors || [])
        .filter(c => c.status === 'a')
        .map(c => mapCompetitor(c)),
    }))

    // All approved match-level participants (includes both squadded and unsquadded)
    const allParticipants = (m.competitors || [])
      .filter(c => c.status === 'a')
      .map(c => mapCompetitor(c))

    // Pending match-level participants
    const pendingParticipants = (m.competitors || [])
      .filter(c => c.status === 'p')
      .map(c => ({ ...mapCompetitor(c), status: 'p' }))

    return {
      id: m.id,
      name: m.name,
      componentNumber: cm.number,
      squads,
      allParticipants,
      pendingParticipants,
    }
  })

  // Collect all shooters across all matches
  // Track: which matches they're IN (as participant) and which squad (if any)
  // Use (firstName, lastName, email) triplet as key for unique identification
  // Note: shooters with missing email get a unique error key to prevent false matches
  const shooterMap = new Map()

  // First: add all match-level participants (squadNumber = null means unsquadded)
  for (const match of matches) {
    for (const participant of match.allParticipants) {
      const key = makeShooterKey(participant.firstName, participant.lastName, participant.email)
      if (participant.email) {
        log.debug(`[manage] Match participant: ${participant.firstName} ${participant.lastName} (${participant.email}) -> key: ${key}`)
      }
      if (!shooterMap.has(key)) {
        shooterMap.set(key, {
          firstName: participant.firstName,
          lastName: participant.lastName,
          email: participant.email,
          hasEmailError: participant.hasEmailError,
          name: participant.name,
          matches: {}
        })
      }
      // Mark as in-match but unsquadded (null)
      shooterMap.get(key).matches[match.id] = null
    }
  }

  // Then: overlay squad assignments (overwrite null with squad number)
  for (const match of matches) {
    for (const squad of match.squads) {
      for (const shooter of squad.shooters) {
        const key = makeShooterKey(shooter.firstName, shooter.lastName, shooter.email)
        if (!shooterMap.has(key)) {
          shooterMap.set(key, {
            firstName: shooter.firstName,
            lastName: shooter.lastName,
            email: shooter.email,
            hasEmailError: shooter.hasEmailError,
            name: shooter.name,
            matches: {}
          })
        }
        shooterMap.get(key).matches[match.id] = squad.number
      }
    }
  }

  // CUP-level participants (approved)
  // Note: CUP competitors can have email at competitor level OR nested in shooter object
  const cupParticipants = (cup.competitors || [])
    .filter(c => c.status === 'a')
    .map(c => mapCupCompetitor(c))
    .filter(p => p.firstName || p.lastName)

  // CUP-level participants (pending)
  const cupPending = (cup.competitors || [])
    .filter(c => c.status === 'p')
    .map(c => ({
      ...mapCupCompetitor(c),
      id: c.id,
      status: 'p',
      location: 'cup'
    }))
    .filter(p => p.firstName || p.lastName)

  log.debug(`[manage] CUP participants: ${cupParticipants.length}, CUP pending: ${cupPending.length}, Match participants: ${shooterMap.size}`)

  // Build key sets for comparison
  const cupKeySet = new Set(cupParticipants.map(p => makeShooterKey(p.firstName, p.lastName, p.email)))
  const pendingKeySet = new Set()

  // Collect all pending shooter keys from CUP
  for (const p of cupPending) {
    pendingKeySet.add(makeShooterKey(p.firstName, p.lastName, p.email))
  }

  // Also collect pending shooter keys from matches
  for (const match of matches) {
    for (const p of match.pendingParticipants) {
      pendingKeySet.add(makeShooterKey(p.firstName, p.lastName, p.email))
    }
  }

  // Find CUP participants not in any match
  const cupOnly = []
  for (const cupP of cupParticipants) {
    const cupKey = makeShooterKey(cupP.firstName, cupP.lastName, cupP.email)
    if (!cupP.email) {
      console.warn(`[manage] WARNING: CUP participant missing email: ${cupP.firstName} ${cupP.lastName}`)
    }
    if (!shooterMap.has(cupKey) && !pendingKeySet.has(cupKey)) {
      cupOnly.push({
        firstName: cupP.firstName,
        lastName: cupP.lastName,
        email: cupP.email,
        hasEmailError: cupP.hasEmailError,
        name: `${cupP.firstName} ${cupP.lastName}`.trim()
      })
    }
  }

  // Find match participants not in CUP
  const matchOnly = []
  for (const [key, shooter] of shooterMap) {
    if (!shooter.email) {
      console.warn(`[manage] WARNING: Match participant missing email: ${shooter.firstName} ${shooter.lastName}`)
    }
    if (!cupKeySet.has(key) && !pendingKeySet.has(key)) {
      matchOnly.push({
        firstName: shooter.firstName,
        lastName: shooter.lastName,
        email: shooter.email,
        hasEmailError: shooter.hasEmailError,
        name: shooter.name
      })
    }
  }

  // Consolidate pending shooters from CUP and matches
  const pendingMap = new Map()

  // Add CUP pending shooters
  for (const p of cupPending) {
    const key = makeShooterKey(p.firstName, p.lastName, p.email)
    if (!pendingMap.has(key)) {
      pendingMap.set(key, {
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        hasEmailError: p.hasEmailError,
        name: p.name,
        inCup: true,
        cupParticipantId: p.id,
        inMatches: []
      })
    }
  }

  // Add match pending shooters
  for (const match of matches) {
    for (const p of match.pendingParticipants) {
      const key = makeShooterKey(p.firstName, p.lastName, p.email)
      if (!pendingMap.has(key)) {
        pendingMap.set(key, {
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          hasEmailError: p.hasEmailError,
          name: p.name,
          inCup: false,
          inMatches: []
        })
      }
      pendingMap.get(key).inMatches.push({
        matchId: match.id,
        matchName: match.name,
        componentNumber: match.componentNumber,
        participantId: p.id
      })
    }
  }

  // Also check if CUP pending shooters are approved in matches
  // This handles the case where shooter is pending in CUP but already approved in matches
  for (const [key, pending] of pendingMap.entries()) {
    if (pending.inCup) {
      for (const match of matches) {
        for (const p of match.allParticipants) {
          const matchKey = makeShooterKey(p.firstName, p.lastName, p.email)
          if (matchKey === key) {
            const alreadyTracked = pending.inMatches.some(m => m.matchId === match.id)
            if (!alreadyTracked) {
              pending.inMatches.push({
                matchId: match.id,
                matchName: match.name,
                componentNumber: match.componentNumber,
                participantId: p.id
              })
            }
            break
          }
        }
      }
    }
  }

  const pendingShooters = [...pendingMap.values()]

  return {
    matches,
    shooters: [...shooterMap.values()],
    cupOnly,
    matchOnly,
    pendingShooters,
  }
}

// ============================================================
// Attach paid/DNS status from scraped CUP participants page
//
// Input: shooters array, cupOnly array, cup competitors, statuses Map
// Output: { shootersWithStatus, cupOnlyWithStatus }
// ============================================================

export function attachCupStatuses(shooters, cupOnly, cupCompetitors, cupParticipantStatuses) {
  // Build cupParticipantId map: name → participantId (from CUP competitors)
  const cupParticipantIdMap = new Map()
  for (const c of (cupCompetitors || [])) {
    if (c.status !== 'a') continue
    const firstName = c.shooter?.first_name || ''
    const lastName = c.shooter?.last_name || ''
    const name = `${firstName} ${lastName}`.trim()
    if (name) cupParticipantIdMap.set(name.toLowerCase(), { id: c.id, firstName, lastName })
  }

  const addStatus = (s) => {
    const cupPartInfo = cupParticipantIdMap.get(s.name.toLowerCase())
    const cupPartId = cupPartInfo?.id || null
    const statusInfo = cupPartId ? cupParticipantStatuses.get(String(cupPartId)) : null
    return {
      ...s,
      cupParticipantId: cupPartId,
      paid: statusInfo?.paid ?? false,
      didNotShow: statusInfo?.didNotShow ?? false,
    }
  }

  return {
    shootersWithStatus: shooters.map(addStatus),
    cupOnlyWithStatus: cupOnly.map(addStatus),
  }
}

// ============================================================
// Extract included component match IDs from cup GraphQL data
// ============================================================

export function getIncludedMatchIds(cupEvent) {
  return (cupEvent.component_matches || [])
    .filter(cm => cm.included && cm.match)
    .map(cm => ({ id: cm.match.id, name: cm.match.name }))
}

// ============================================================
// Filter active cups for management listing
// ============================================================

export const MANAGE_WINDOW_DAYS = 5

export function getManageWindowBounds(now = new Date(), windowDays = MANAGE_WINDOW_DAYS) {
  const windowStart = new Date(now)
  windowStart.setUTCHours(0, 0, 0, 0)

  const windowEndExclusive = new Date(windowStart)
  windowEndExclusive.setUTCDate(windowEndExclusive.getUTCDate() + windowDays + 1)

  return { windowStart, windowEndExclusive }
}

function isWithinManageWindow(starts, windowStart, windowEndExclusive) {
  const startsAt = starts ? new Date(starts) : null
  if (!startsAt || Number.isNaN(startsAt.getTime())) return false
  return startsAt >= windowStart && startsAt < windowEndExclusive
}

export function filterManageableCups(events, now = new Date(), windowDays = MANAGE_WINDOW_DAYS) {
  const { windowStart, windowEndExclusive } = getManageWindowBounds(now, windowDays)

  return (events || [])
    .filter(e => e.get_content_type_key === 136)
    .filter(e => e.status === 'on')
    .filter(e => isWithinManageWindow(e.starts, windowStart, windowEndExclusive))
    .map(c => {
      const registered = countRegisteredCupCompetitors(c)
      const maxCompetitors = c.max_competitors || 25
      const full = registered >= maxCompetitors
      const regStarts = c.registration_starts ? new Date(c.registration_starts) : null
      const regCloses = c.registration_closes ? new Date(c.registration_closes) : null
      const registrationOpen = (c.registration === 'op' || c.registration === 'aa')
        && (!regStarts || now >= regStarts)
        && (!regCloses || now <= regCloses)
        && !full
      return {
        id: c.id,
        name: c.name,
        starts: c.starts,
        ends: c.ends || null,
        maxCompetitors,
        registered,
        full,
        registrationOpen,
      }
    })
    .sort((a, b) => new Date(a.starts) - new Date(b.starts))
}

// ============================================================
// Internal helpers
// ============================================================

function mapCompetitor(c) {
  return {
    id: c.id,
    firstName: c.first_name || '',
    lastName: c.last_name || '',
    email: c.email || '',
    hasEmailError: !c.email,
    name: `${c.first_name} ${c.last_name}`.trim()
  }
}

function mapCupCompetitor(c) {
  const email = c.email || c.shooter?.email || ''
  const firstName = c.shooter?.first_name || ''
  const lastName = c.shooter?.last_name || ''

  log.debug('[manage] CUP competitor raw:', {
    competitorEmail: c.email,
    shooterEmail: c.shooter?.email,
    resolvedEmail: email,
    firstName,
    lastName,
    emailType: typeof email,
    emailLength: email?.length,
    hasEmail: !!email
  })

  return {
    firstName,
    lastName,
    email,
    hasEmailError: !email,
    name: `${firstName} ${lastName}`.trim(),
  }
}

function countRegisteredCupCompetitors(cupEvent) {
  const fromCup = countApprovedCupCompetitors(cupEvent?.competitors)
  if (fromCup > 0) return fromCup
  return countApprovedMatchSquadCompetitors(cupEvent?.component_matches)
}

function countApprovedCupCompetitors(competitors = []) {
  const approvedIds = new Set()
  for (const competitor of competitors || []) {
    if (isCountableRegistrationStatus(competitor?.status) && competitor?.id != null) {
      approvedIds.add(String(competitor.id))
    }
  }
  return approvedIds.size
}

function countApprovedMatchSquadCompetitors(componentMatches = []) {
  const firstMatch = (componentMatches || []).find(cm => cm.included && cm.match)
  const approvedIds = new Set()

  if (firstMatch?.match?.squads) {
    for (const squad of firstMatch.match.squads) {
      for (const competitor of (squad.competitors || [])) {
        if (isCountableRegistrationStatus(competitor?.status) && competitor?.id != null) {
          approvedIds.add(String(competitor.id))
        }
      }
    }
  }

  return approvedIds.size
}

function isCountableRegistrationStatus(status) {
  const normalized = String(status || '').toLowerCase()
  if (!normalized) return true
  return normalized === 'a'
    || normalized === 'approved'
    || normalized === 'p'
    || normalized === 'pending'
    || normalized === 'r'
    || normalized === 'registered'
}

// Key for unique shooter identification by (firstName, lastName, email) triplet
// If email is missing, create a unique error key to prevent false matches
export function makeShooterKey(firstName, lastName, email) {
  if (!email) {
    return `${firstName}|||${lastName}|||ERROR_NO_EMAIL_${Math.random()}`
  }
  return `${firstName}|||${lastName}|||${email}`
}
