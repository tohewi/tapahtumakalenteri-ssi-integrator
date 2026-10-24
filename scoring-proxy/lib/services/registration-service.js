// ============================================================
// Registration Service — Pure Business Logic for Public Registration
// ============================================================

import crypto from 'node:crypto'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MAX_EMAIL_LEN = 254

export function isCountableRegistrationStatus(status) {
  const normalized = String(status || '').toLowerCase()
  if (!normalized) return true
  return normalized === 'a'
    || normalized === 'approved'
    || normalized === 'p'
    || normalized === 'pending'
    || normalized === 'r'
    || normalized === 'registered'
}

export function countApprovedCupCompetitors(competitors = []) {
  const approvedIds = new Set()
  for (const competitor of competitors || []) {
    if (isCountableRegistrationStatus(competitor?.status) && competitor?.id != null) {
      approvedIds.add(String(competitor.id))
    }
  }
  return approvedIds.size
}

export function countApprovedSquadCompetitors(componentMatches = []) {
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

export function countRegisteredCupCompetitors(cupEvent) {
  const fromCup = countApprovedCupCompetitors(cupEvent?.competitors)
  if (fromCup > 0) return fromCup
  return countApprovedSquadCompetitors(cupEvent?.component_matches)
}

export function validateRegistrationInput({ cupId, squadNumber, email, captchaId, captchaAnswer }) {
  const errors = []

  if (typeof cupId !== 'string' && typeof cupId !== 'number') errors.push('cupId: required')
  else if (!/^\d{1,10}$/.test(String(cupId))) errors.push('cupId: invalid format')

  if (squadNumber == null) errors.push('squadNumber: required')
  else if (!Number.isInteger(Number(squadNumber)) || Number(squadNumber) < 1 || Number(squadNumber) > 99) errors.push('squadNumber: invalid')

  if (typeof email !== 'string') errors.push('email: required')
  else if (email.length > MAX_EMAIL_LEN) errors.push('email: too long')
  else if (!EMAIL_RE.test(email)) errors.push('email: invalid format')

  if (typeof captchaId !== 'string') errors.push('captchaId: required')
  else if (!UUID_RE.test(captchaId)) errors.push('captchaId: invalid format')

  if (captchaAnswer == null) errors.push('captchaAnswer: required')
  else if (!Number.isInteger(Number(captchaAnswer)) || Math.abs(Number(captchaAnswer)) > 999) errors.push('captchaAnswer: invalid')

  return errors
}

export function createCaptchaChallenge(captchaChallenges) {
  const a = Math.floor(Math.random() * 20) + 1
  const b = Math.floor(Math.random() * 20) + 1
  const id = crypto.randomUUID()
  captchaChallenges.set(id, { answer: a + b, created: Date.now() })
  return { id, question: `${a} + ${b} = ?` }
}

export function formatOpenCupsList(events = [], now = new Date()) {
  return (events || [])
    .filter(e => e.get_content_type_key === 136)
    .filter(e => new Date(e.starts) > now)
    .filter(e => e.status === 'on')
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
        maxCompetitors,
        registered,
        full,
        registrationOpen,
      }
    })
    .sort((a, b) => new Date(a.starts) - new Date(b.starts))
}

export function buildCupDetailPayload(cup) {
  const componentMatches = (cup.component_matches || [])
    .filter(cm => cm.included && cm.match)
    .sort((a, b) => a.number - b.number)

  const firstMatch = componentMatches[0]?.match
  if (!firstMatch) return null

  const squads = (firstMatch.squads || []).map((sq, idx) => {
    const counts = componentMatches.map(cm => {
      const matchSquad = cm.match.squads?.[idx]
      if (!matchSquad) return { current: 0, max: 0 }
      const active = (matchSquad.competitors || []).filter(c => c.status === 'a').length
      return { current: active, max: matchSquad.max_competitors || 0 }
    })

    const maxCurrent = Math.max(...counts.map(c => c.current))
    const minMax = Math.min(...counts.map(c => c.max))

    return {
      number: sq.number,
      name: sq.comment || `Squad ${sq.number}`,
      current: maxCurrent,
      max: minMax,
      full: maxCurrent >= minMax,
    }
  })

  const registered = countRegisteredCupCompetitors(cup)

  return {
    id: cup.id,
    name: cup.name,
    starts: cup.starts,
    status: cup.status,
    maxCompetitors: cup.max_competitors || 25,
    registered,
    squads,
  }
}
