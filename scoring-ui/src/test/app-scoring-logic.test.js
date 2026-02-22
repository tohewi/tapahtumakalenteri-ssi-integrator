import { describe, it, expect } from 'vitest'
import { applyScoreDeltaForShooter } from '../App'

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
