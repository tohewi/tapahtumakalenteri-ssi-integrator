import { describe, it, expect } from 'vitest'
import { applyScoreDeltaForShooter, selectInitialScoreCard, getDoubleSeriesPairShotSummary } from '../App'

const SCORE_ZONES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']

function createEmptySeries() {
  return Object.fromEntries(SCORE_ZONES.map((zone) => [zone, 0]))
}

function createShooterScores() {
  return {
    0: createEmptySeries(),
    1: createEmptySeries(),
    2: createEmptySeries(),
    3: createEmptySeries(),
    4: createEmptySeries(),
    5: createEmptySeries(),
  }
}

function seriesShots(seriesScores) {
  return SCORE_ZONES.reduce((sum, zone) => sum + (seriesScores[zone] || 0), 0)
}

describe('applyScoreDeltaForShooter', () => {
  it('fills first series by total shots before starting second series in double mode', () => {
    let shooterScores = createShooterScores()

    for (const zone of ['10', '9', '8', '7', '6', '5']) {
      shooterScores = applyScoreDeltaForShooter(shooterScores, {
        seriesIdx: 0,
        zone,
        delta: 1,
        doubleSeries: true,
        maxHitsPerSeries: 5,
      })
    }

    expect(seriesShots(shooterScores[0])).toBe(5)
    expect(seriesShots(shooterScores[1])).toBe(1)
  })

  it('does not overflow above 5 + 5 shots in double mode', () => {
    let shooterScores = createShooterScores()

    for (let i = 0; i < 10; i++) {
      shooterScores = applyScoreDeltaForShooter(shooterScores, {
        seriesIdx: 0,
        zone: '10',
        delta: 1,
        doubleSeries: true,
        maxHitsPerSeries: 5,
      })
    }

    const beforeExtra = JSON.stringify(shooterScores)

    shooterScores = applyScoreDeltaForShooter(shooterScores, {
      seriesIdx: 0,
      zone: 'X',
      delta: 1,
      doubleSeries: true,
      maxHitsPerSeries: 5,
    })

    expect(seriesShots(shooterScores[0])).toBe(5)
    expect(seriesShots(shooterScores[1])).toBe(5)
    expect(JSON.stringify(shooterScores)).toBe(beforeExtra)
  })

  it('decrements from second series first in double mode', () => {
    let shooterScores = createShooterScores()
    shooterScores[0].X = 1
    shooterScores[1].X = 1

    shooterScores = applyScoreDeltaForShooter(shooterScores, {
      seriesIdx: 0,
      zone: 'X',
      delta: -1,
      doubleSeries: true,
      maxHitsPerSeries: 5,
    })

    expect(shooterScores[0].X).toBe(1)
    expect(shooterScores[1].X).toBe(0)
  })

  it('keeps single-series updates clamped at zero', () => {
    let shooterScores = createShooterScores()

    shooterScores = applyScoreDeltaForShooter(shooterScores, {
      seriesIdx: 2,
      zone: 'M',
      delta: -1,
      doubleSeries: false,
      maxHitsPerSeries: 5,
    })

    expect(shooterScores[2].M).toBe(0)
  })
})

describe('getDoubleSeriesPairShotSummary', () => {
  it('marks pair incomplete when only first series has 5 shots in 2x mode', () => {
    const scores = createShooterScores()
    scores[0].X = 5

    const summary = getDoubleSeriesPairShotSummary(scores, 0, 5)
    expect(summary.totalShots).toBe(5)
    expect(summary.requiredShots).toBe(10)
    expect(summary.isStarted).toBe(true)
    expect(summary.isComplete).toBe(false)
  })

  it('marks pair complete when both series have 5 shots', () => {
    const scores = createShooterScores()
    scores[0].X = 5
    scores[1].M = 5

    const summary = getDoubleSeriesPairShotSummary(scores, 0, 5)
    expect(summary.totalShots).toBe(10)
    expect(summary.firstShots).toBe(5)
    expect(summary.secondShots).toBe(5)
    expect(summary.isComplete).toBe(true)
  })

  it('normalizes odd series index to the same pair start', () => {
    const scores = createShooterScores()
    scores[2].X = 5
    scores[3].X = 5

    const summary = getDoubleSeriesPairShotSummary(scores, 3, 5)
    expect(summary.firstSeriesIndex).toBe(2)
    expect(summary.secondSeriesIndex).toBe(3)
    expect(summary.isComplete).toBe(true)
  })
})

describe('selectInitialScoreCard', () => {
  it('prefers SSI scorecard when restored local cache is empty but SSI has scores', () => {
    const restored = createShooterScores()
    const ssi = createShooterScores()
    ssi[0].X = 1

    const selected = selectInitialScoreCard(restored, ssi, false)
    expect(selected).toBe(ssi)
  })

  it('keeps restored local scorecard when local has in-progress scores', () => {
    const restored = createShooterScores()
    restored[0].M = 1
    const ssi = createShooterScores()
    ssi[0].X = 1

    const selected = selectInitialScoreCard(restored, ssi, false)
    expect(selected).toBe(restored)
  })

  it('always prefers SSI scorecard for completed-match miss inference mode', () => {
    const restored = createShooterScores()
    restored[0].X = 1
    const ssi = createShooterScores()

    const selected = selectInitialScoreCard(restored, ssi, true)
    expect(selected).toBe(ssi)
  })
})
