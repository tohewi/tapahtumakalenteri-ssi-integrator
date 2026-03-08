// ============================================================
// Scoring Constants and Pure Helper Functions
//
// Shared between App.jsx (mobile scoring) and
// TabletScoringView.jsx (tablet scoring).
//
// No React imports — pure JS only.
// ============================================================

export const SCORE_ZONES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']
export const SERIES_COUNT = 6
export const MAX_HITS_PER_SERIES = 5
export const ZONE_POINTS = { X: 10, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2, '1': 1, M: 0 }

// ---- Series score helpers ----

export function createEmptySeriesScore() {
  return Object.fromEntries(SCORE_ZONES.map(z => [z, 0]))
}

export function createEmptyAllScores(shooters) {
  const all = {}
  for (const s of shooters) {
    all[s.id] = {}
    for (let i = 0; i < SERIES_COUNT; i++) {
      all[s.id][i] = createEmptySeriesScore()
    }
  }
  return all
}

export function hitsInSeries(seriesScores) {
  return SCORE_ZONES.reduce((sum, z) => sum + seriesScores[z], 0)
}

export function pointsInSeries(seriesScores) {
  return SCORE_ZONES.reduce((sum, z) => sum + seriesScores[z] * ZONE_POINTS[z], 0)
}

export function getScoreCardShots(scoreCard) {
  if (!scoreCard) return 0
  let total = 0
  for (let i = 0; i < SERIES_COUNT; i++) {
    total += hitsInSeries(scoreCard[i] || createEmptySeriesScore())
  }
  return total
}

export function getTotalHits(allSeriesScores) {
  let total = 0
  for (let i = 0; i < SERIES_COUNT; i++) {
    total += hitsInSeries(allSeriesScores[i])
  }
  return total
}

export function getTotalPoints(allSeriesScores) {
  let total = 0
  for (let i = 0; i < SERIES_COUNT; i++) {
    total += pointsInSeries(allSeriesScores[i])
  }
  return total
}

export function getXCount(allSeriesScores) {
  let total = 0
  for (let i = 0; i < SERIES_COUNT; i++) {
    total += allSeriesScores[i].X || 0
  }
  return total
}

export function isSeriesScored(seriesScores) {
  return hitsInSeries(seriesScores) > 0
}

// ---- Complex scoring helpers (exported from App.jsx previously) ----

export function selectInitialScoreCard(restoredScoreCard, ssiScoreCard, inferMissingMisses) {
  if (!restoredScoreCard || inferMissingMisses) return ssiScoreCard

  const restoredShots = getScoreCardShots(restoredScoreCard)
  const ssiShots = getScoreCardShots(ssiScoreCard)

  // Keep local in-progress work, but avoid stale-empty cache masking fresh SSI scores.
  if (restoredShots > 0 || ssiShots === 0) {
    return restoredScoreCard
  }

  return ssiScoreCard
}

export function getDoubleSeriesPairShotSummary(scoreCard, seriesIdx, maxHitsPerSeries = MAX_HITS_PER_SERIES) {
  const pairStart = Math.max(0, Math.min(seriesIdx - (seriesIdx % 2), SERIES_COUNT - 2))
  const pairEnd = pairStart + 1

  const firstShots = hitsInSeries(scoreCard?.[pairStart] || createEmptySeriesScore())
  const secondShots = hitsInSeries(scoreCard?.[pairEnd] || createEmptySeriesScore())
  const requiredShots = maxHitsPerSeries * 2
  const totalShots = firstShots + secondShots

  return {
    firstSeriesIndex: pairStart,
    secondSeriesIndex: pairEnd,
    firstShots,
    secondShots,
    totalShots,
    requiredShots,
    isStarted: totalShots > 0,
    isComplete: firstShots === maxHitsPerSeries && secondShots === maxHitsPerSeries,
  }
}

export function applyScoreDeltaForShooter(shooterScores, {
  seriesIdx,
  zone,
  delta,
  doubleSeries,
  maxHitsPerSeries = MAX_HITS_PER_SERIES,
}) {
  const next = { ...shooterScores }

  if (!doubleSeries) {
    if (!next[seriesIdx]) next[seriesIdx] = createEmptySeriesScore()
    next[seriesIdx] = { ...next[seriesIdx] }
    next[seriesIdx][zone] = Math.max(0, (next[seriesIdx][zone] || 0) + delta)
    return next
  }

  const s1Idx = seriesIdx
  const s2Idx = seriesIdx + 1

  if (!next[s1Idx]) next[s1Idx] = createEmptySeriesScore()
  if (!next[s2Idx]) next[s2Idx] = createEmptySeriesScore()

  next[s1Idx] = { ...next[s1Idx] }
  next[s2Idx] = { ...next[s2Idx] }

  const s1Shots = hitsInSeries(next[s1Idx])
  const s2Shots = hitsInSeries(next[s2Idx])

  if (delta > 0) {
    if (s1Shots < maxHitsPerSeries) {
      next[s1Idx][zone] = (next[s1Idx][zone] || 0) + 1
    } else if (s2Shots < maxHitsPerSeries) {
      next[s2Idx][zone] = (next[s2Idx][zone] || 0) + 1
    }
    return next
  }

  if (delta < 0) {
    if ((next[s2Idx][zone] || 0) > 0) {
      next[s2Idx][zone] -= 1
    } else if ((next[s1Idx][zone] || 0) > 0) {
      next[s1Idx][zone] -= 1
    }
  }

  return next
}
