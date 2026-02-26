import { log } from './log.js'

const API_BASE = '/api/v1'

// Custom error for session expiry
export class SessionExpiredError extends Error {
  constructor(message = 'Session expired') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

// Custom error for scope mismatch
export class ScopeMismatchError extends Error {
  constructor(message = 'Access denied', requiredScope, currentScope) {
    super(message)
    this.name = 'ScopeMismatchError'
    this.requiredScope = requiredScope
    this.currentScope = currentScope
  }
}

// Helper to check for session expiry or scope mismatch in response
async function handleResponse(resp) {
  const data = await resp.json()
  if (resp.status === 401 && data.sessionExpired) {
    throw new SessionExpiredError(data.error || 'Session expired. Please login again.')
  }
  if (resp.status === 403 && data.scopeMismatch) {
    throw new ScopeMismatchError(data.error || 'Access denied', data.requiredScope, data.currentScope)
  }
  if (!resp.ok || data.error) {
    throw new Error(data.error || `Request failed with status ${resp.status}`)
  }
  return data
}

export async function login(email, password, apiKey, scope = 'scoring') {
  const resp = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, apiKey, scope }),
  })
  return handleResponse(resp)
}

export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
}

export async function getAuthStatus() {
  const resp = await fetch(`${API_BASE}/auth/status`, { credentials: 'include' })
  return resp.json()
}

export async function getUserInfo() {
  const resp = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
  return handleResponse(resp)
}

export async function searchCups(search) {
  const resp = await fetch(`${API_BASE}/cups?search=${encodeURIComponent(search)}`, { credentials: 'include' })
  const data = await handleResponse(resp)
  return data.cups || []
}

export async function getCup(cupId) {
  const resp = await fetch(`${API_BASE}/cup/${cupId}`, { credentials: 'include' })
  return handleResponse(resp)
}

export async function getMatch(matchId) {
  const resp = await fetch(`${API_BASE}/match/${matchId}`, { credentials: 'include' })
  return handleResponse(resp)
}

export async function getCompetitor(competitorId) {
  const resp = await fetch(`${API_BASE}/competitor/${competitorId}`, { credentials: 'include' })
  return handleResponse(resp)
}

export async function submitScore(competitorId, scores, options = {}) {
  const resp = await fetch(`${API_BASE}/competitor/${competitorId}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      scores,
      warning: options.warning || false,
      dqReason: options.dqReason || 'no',
      comment: options.comment || '',
    }),
  })
  return handleResponse(resp)
}

export async function searchMatches(search) {
  const resp = await fetch(`${API_BASE}/matches?search=${encodeURIComponent(search)}`, { credentials: 'include' })
  const data = await handleResponse(resp)
  return data.matches || []
}

export async function getReportData(matches) {
  const resp = await fetch(`${API_BASE}/report/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ matches }),
  })
  const data = await handleResponse(resp)
  return data.rows || []
}

export async function getSummaryReport(matches) {
  const resp = await fetch(`${API_BASE}/report/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ matches }),
  })
  const data = await handleResponse(resp)
  return data.rows || []
}

// ============================================================
// Management actions
// ============================================================

export async function manageAssignSquad(cupId, shooterName, squadNumber, email = null) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/assign-squad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, squadNumber, email }),
  })
  return handleResponse(resp)
}

export async function manageFixSquad(cupId, shooterName, targetSquad, email = null) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/fix-squad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, targetSquad, email }),
  })
  return handleResponse(resp)
}

export async function manageAddToCup(cupId, shooterName, email = null) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/add-to-cup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, email }),
  })
  return handleResponse(resp)
}

export async function manageApprovePending(cupId, shooterName, email = null, cupParticipantId = null) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/approve-pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, email, cupParticipantId }),
  })
  return handleResponse(resp)
}

export async function manageRemovePending(cupId, shooterName, email = null, cupParticipantId = null, matchParticipants = []) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/remove-pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, email, cupParticipantId, matchParticipants }),
  })
  return handleResponse(resp)
}

export async function manageSetDns(cupId, shooterName, email = null, cupParticipantId = null) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/set-dns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, email, cupParticipantId }),
  })
  return handleResponse(resp)
}

export async function manageUndoDns(cupId, shooterName, email = null, cupParticipantId = null) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/undo-dns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, email, cupParticipantId }),
  })
  return handleResponse(resp)
}

export async function manageTogglePaid(cupId, shooterName, cupParticipantId) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/toggle-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, cupParticipantId }),
  })
  return handleResponse(resp)
}

// ============================================================
// Data transformers: SSI API → UI format
// ============================================================

const SCORE_ZONES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']

export function validateSeriesShotCounts(scoreCard, options = {}) {
  const {
    seriesCount = 6,
    shotsPerSeries = 5,
  } = options

  const invalidSeries = []

  for (let i = 0; i < seriesCount; i++) {
    const seriesScores = scoreCard?.[i] || {}
    const shots = SCORE_ZONES.reduce((sum, zone) => sum + (Number(seriesScores[zone]) || 0), 0)

    if (shots !== 0 && shots !== shotsPerSeries) {
      invalidSeries.push({ seriesIndex: i, shots })
    }
  }

  return {
    isValid: invalidSeries.length === 0,
    invalidSeries,
    seriesCount,
    shotsPerSeries,
  }
}

export function buildIncompleteSeriesValidationMessage(validation, options = {}) {
  if (!validation || validation.isValid) return ''

  const {
    headerFormatter = (shotsPerSeries) => `Cannot save: Each string must have exactly ${shotsPerSeries} shots or be empty.`,
    lineFormatter = (seriesNumber, shots, shotsPerSeries) => `String ${seriesNumber}: ${shots}/${shotsPerSeries} shots`,
  } = options

  const header = headerFormatter(validation.shotsPerSeries)
  const lines = validation.invalidSeries.map(({ seriesIndex, shots }) =>
    lineFormatter(seriesIndex + 1, shots, validation.shotsPerSeries)
  )

  return [header, ...lines].join('\n')
}

// Parse SSI string "X,10,9,8,7,6,5,4,3,2,1,M,max_hits" → {X: n, '10': n, ...}
export function parseStringScore(ssiString, options = {}) {
  const {
    inferMissingMisses = false,
    maxHitsPerSeries = 5,
  } = options
  const normalizedMaxHits = Number(maxHitsPerSeries) || 5

  if (!ssiString || ssiString === '0,0,0,0,0,0,0,0,0,0,0,0,0') {
    return Object.fromEntries(SCORE_ZONES.map(z => [z, 0]))
  }

  // Prefer comma format, but tolerate slash-separated debug/export variants.
  const rawScore = String(ssiString)
  const parts = rawScore
    .split(/[\s,\/]+/)
    .filter(Boolean)
    .map(Number)

  // SSI format: X, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, M, max_hits
  const scores = {}
  SCORE_ZONES.forEach((z, i) => { scores[z] = parts[i] || 0 })

  const nonMissHits = SCORE_ZONES
    .filter(z => z !== 'M')
    .reduce((sum, z) => sum + (scores[z] || 0), 0)

  // Compact SSI variant: X..1,max_hits (M omitted).
  // In this case the 12th value is max_hits, not misses.
  const trailingValue = parts[parts.length - 1] || 0
  const hasSlashDelimiter = rawScore.includes('/')
  const hasCompactMaxHitsTail = parts.length === SCORE_ZONES.length
    && !hasSlashDelimiter
    && trailingValue === normalizedMaxHits
  // Some SSI payloads use a 13-part variant where the trailing value is misses,
  // while the penultimate M slot is always 0.
  const hasTrailingMissVariant = parts.length === SCORE_ZONES.length + 1
    && (parts[SCORE_ZONES.length - 1] || 0) === 0
    && trailingValue >= 0
    && trailingValue <= normalizedMaxHits
    && (nonMissHits + trailingValue) <= normalizedMaxHits
  // Some SSI responses are even shorter and omit both M and max_hits (X..1 only).
  const hasCompactNoMissNoTail = parts.length === SCORE_ZONES.length - 1

  if (hasCompactMaxHitsTail) {
    scores.M = 0
  }

  if (hasTrailingMissVariant) {
    scores.M = trailingValue
  }

  // If SSI returns compact X..1,max_hits and there are already hits,
  // the missing slots are misses in saved scorecards (our UI only saves full strings or empty).
  const shouldInferForCompactString = (hasCompactMaxHitsTail || hasCompactNoMissNoTail)
    && (inferMissingMisses || nonMissHits > 0)

  // Some SSI responses omit explicit "M" and only return X..1 counts.
  // For completed matches we can safely infer misses from max hits per string.
  if ((inferMissingMisses && parts.length < SCORE_ZONES.length) || shouldInferForCompactString) {
    scores.M = Math.max(0, normalizedMaxHits - nonMissHits)
  }

  return scores
}

// Transform SSI match response → UI match format
export function transformMatch(ssiMatch) {
  if (!ssiMatch) return null
  return {
    id: Number(ssiMatch.id),
    name: ssiMatch.name,
    type: 'RESUL Nordic',
    date: ssiMatch.starts ? ssiMatch.starts.split('T')[0] : new Date().toISOString().split('T')[0],
    status: ssiMatch.status,
    numberOfStrings: ssiMatch.number_of_strings || 6,
    roundsPerString: ssiMatch.number_of_rounds_per_string || 5,
    squads: (ssiMatch.squads || []).map(sq => ({
      id: Number(sq.id),
      name: sq.number ? `Squad ${sq.number}` : `Squad ${sq.id}`,
      comment: sq.comment || '',
      maxShooters: sq.competitors?.length || 0,
      shooters: (sq.competitors || [])
        .filter(c => c.status === 'a')
        .map(c => ({
          id: Number(c.id),
          number: c.number || 0,
          name: `${c.first_name} ${c.last_name}`,
          division: [c.weapon_group, c.category, c.classification].filter(Boolean).join(' · ') || '',
          ssiScores: {
            s1: c.s1, s2: c.s2, s3: c.s3, s4: c.s4, s5: c.s5, s6: c.s6,
          },
          totPoints: c.tot_precision_points || 0,
          totHits: c.tot_hits || 0,
          isVerified: c.is_verified || false,
          isScoringStarted: c.is_scoring_started || false,
        })),
    })),
  }
}

// Transform SSI match list item → UI match format (lighter, no squads detail)
export function transformMatchListItem(ssiMatch) {
  return {
    id: Number(ssiMatch.id),
    name: ssiMatch.name,
    type: 'RESUL Nordic',
    date: ssiMatch.starts ? ssiMatch.starts.split('T')[0] : new Date().toISOString().split('T')[0],
    status: ssiMatch.status,
    squads: [], // squad details are omitted in the list view; load via transformMatch if needed
    squadCount: 0, // placeholder; actual squad count can be set when full match data is loaded
  }
}

// Build scores object from SSI competitor data for all 6 strings
export function buildScoresFromSSI(shooter, seriesCount = 6, options = {}) {
  log.debug('[buildScoresFromSSI] Input shooter:', shooter)
  const scores = {}
  for (let i = 0; i < seriesCount; i++) {
    const sKey = `s${i + 1}`
    // Support both shooter.ssiScores.s1 (transformed squad data) and shooter.s1 (direct from SSI API)
    const scoreString = shooter?.ssiScores?.[sKey] || shooter?.[sKey]
    log.debug(`[buildScoresFromSSI] ${sKey}:`, scoreString)
    scores[i] = parseStringScore(scoreString, options)
  }
  log.debug('[buildScoresFromSSI] Result scores:', scores)
  return scores
}
