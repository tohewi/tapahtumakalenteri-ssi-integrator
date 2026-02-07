const API_BASE = '/api'

export async function login(email, password, apiKey) {
  const resp = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, apiKey }),
  })
  const data = await resp.json()
  if (!resp.ok || data.error) throw new Error(data.error || 'Login failed')
  return data
}

export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
}

export async function getAuthStatus() {
  const resp = await fetch(`${API_BASE}/auth/status`, { credentials: 'include' })
  return resp.json()
}

export async function searchCups(search) {
  const resp = await fetch(`${API_BASE}/cups?search=${encodeURIComponent(search)}`, { credentials: 'include' })
  if (!resp.ok) throw new Error('Failed to search cups')
  const data = await resp.json()
  return data.cups || []
}

export async function getCup(cupId) {
  const resp = await fetch(`${API_BASE}/cup/${cupId}`, { credentials: 'include' })
  if (!resp.ok) throw new Error('Failed to fetch cup')
  return resp.json()
}

export async function getMatch(matchId) {
  const resp = await fetch(`${API_BASE}/match/${matchId}`, { credentials: 'include' })
  if (!resp.ok) throw new Error('Failed to fetch match')
  return resp.json()
}

export async function getCompetitor(competitorId) {
  const resp = await fetch(`${API_BASE}/competitor/${competitorId}`, { credentials: 'include' })
  if (!resp.ok) throw new Error('Failed to fetch competitor')
  return resp.json()
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
  const data = await resp.json()
  if (!resp.ok || data.error) throw new Error(data.error || 'Score submission failed')
  return data
}

export async function searchMatches(search) {
  const resp = await fetch(`${API_BASE}/matches?search=${encodeURIComponent(search)}`, { credentials: 'include' })
  if (!resp.ok) throw new Error('Failed to search matches')
  const data = await resp.json()
  return data.matches || []
}

export async function getReportData(matches) {
  const resp = await fetch(`${API_BASE}/report/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ matches }),
  })
  const data = await resp.json()
  if (!resp.ok || data.error) throw new Error(data.error || 'Report generation failed')
  return data.rows || []
}

// ============================================================
// Management actions
// ============================================================

export async function manageAssignSquad(cupId, shooterName, squadNumber) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/assign-squad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, squadNumber }),
  })
  const data = await resp.json()
  if (!resp.ok || data.error) throw new Error(data.error || 'Assign squad failed')
  return data
}

export async function manageFixSquad(cupId, shooterName, targetSquad) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/fix-squad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName, targetSquad }),
  })
  const data = await resp.json()
  if (!resp.ok || data.error) throw new Error(data.error || 'Fix squad failed')
  return data
}

export async function manageAddToCup(cupId, shooterName) {
  const resp = await fetch(`${API_BASE}/manage/cup/${cupId}/add-to-cup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shooterName }),
  })
  const data = await resp.json()
  if (!resp.ok || data.error) throw new Error(data.error || 'Add to cup failed')
  return data
}

// ============================================================
// Data transformers: SSI API → UI format
// ============================================================

const SCORE_ZONES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']

// Parse SSI string "X,10,9,8,7,6,5,4,3,2,1,M,max_hits" → {X: n, '10': n, ...}
export function parseStringScore(ssiString) {
  if (!ssiString || ssiString === '0,0,0,0,0,0,0,0,0,0,0,0,0') {
    return Object.fromEntries(SCORE_ZONES.map(z => [z, 0]))
  }
  const parts = ssiString.split(',').map(Number)
  // SSI format: X, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, M, max_hits
  const scores = {}
  SCORE_ZONES.forEach((z, i) => { scores[z] = parts[i] || 0 })
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
    squads: [], // placeholder — MatchPicker shows count, so use a fake array
    squadCount: 0, // real count unknown until match is loaded
  }
}

// Build scores object from SSI competitor data for all 6 strings
export function buildScoresFromSSI(shooter, seriesCount = 6) {
  const scores = {}
  for (let i = 0; i < seriesCount; i++) {
    const sKey = `s${i + 1}`
    scores[i] = parseStringScore(shooter.ssiScores?.[sKey])
  }
  return scores
}
