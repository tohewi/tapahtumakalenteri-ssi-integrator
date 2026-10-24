import { describe, it, expect, afterAll } from 'vitest'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  matchTrainingType,
  calculateShooterCount,
  extractTrainerSquadMembers,
  buildResignWarning,
} from '../lib/services/staffing-service.js'
import {
  upsertEvent,
  getEventStatus,
} from '../lib/staffing/engine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const staffingDataFile = resolve(__dirname, '../data/staffing-events.json')
const hadOriginalStaffingData = existsSync(staffingDataFile)
const originalStaffingData = hadOriginalStaffingData ? readFileSync(staffingDataFile, 'utf8') : null

afterAll(() => {
  if (hadOriginalStaffingData && originalStaffingData !== null) {
    writeFileSync(staffingDataFile, originalStaffingData, 'utf8')
  } else {
    rmSync(staffingDataFile, { force: true })
  }
})

describe('staffing-service & engine unit tests', () => {
  it('matches training type from event name patterns', () => {
    const trainingTypes = {
      oldies: { searchPatterns: ['Oldies', 'Vanhat'] },
      newbie: { searchPatterns: ['Newbie', 'Uudet'] },
    }
    expect(matchTrainingType('TurRes SRA Oldies 20.06.2026', trainingTypes)).toBe('oldies')
    expect(matchTrainingType('TurRes SRA Newbie 21.06.2026', trainingTypes)).toBe('newbie')
    expect(matchTrainingType('Kupittaa CUP', trainingTypes)).toBe(null)
  })

  it('calculates shooter count excluding staff squad', () => {
    const squads = [
      { number: 1, comment: 'Squad 1', competitors: [{ id: '1', status: 'a' }, { id: '2', status: 'p' }] },
      { number: 5, comment: 'Staff', competitors: [{ id: '3', status: 'a' }] },
    ]
    expect(calculateShooterCount(squads, 5, 'Staff')).toBe(1)
  })

  it('extracts trainer squad members with valid shooter emails', () => {
    const squads = [
      {
        number: 5,
        comment: 'Trainer Squad',
        competitors: [
          { id: 'c1', status: 'a', shooter: { email: 'trainer@example.com', first_name: 'Matti', last_name: 'Meikäläinen' } },
          { id: 'c2', status: 'd', shooter: { email: 'deleted@example.com', first_name: 'Del', last_name: 'User' } },
        ],
      },
    ]
    const members = extractTrainerSquadMembers(squads, 5)
    expect(members).toEqual([{ email: 'trainer@example.com', userName: 'Matti Meikäläinen' }])
  })

  it('builds resign warning messages accurately', () => {
    expect(buildResignWarning({
      management: { success: true, usedFallback: false },
      trainerSquad: { success: true },
    })).toBe(null)

    expect(buildResignWarning({
      management: { success: true, usedFallback: true },
      trainerSquad: { success: true },
    })).toContain('Partial withdrawal detected')

    expect(buildResignWarning({
      management: { success: false, message: 'HTTP 500' },
      trainerSquad: { success: true },
    })).toContain('management: HTTP 500')
  })

  it('upserts and retrieves staffing event status in engine', () => {
    upsertEvent({
      eventId: 'test-evt-999',
      eventName: 'SRA Oldies Test',
      trainingType: 'oldies',
      eventDate: '2027-06-01T10:00:00Z',
      shooterCount: 12,
      contentType: 22,
    })

    const status = getEventStatus('test-evt-999')
    expect(status).toBeDefined()
    expect(status.eventId).toBe('test-evt-999')
    expect(status.shooterCount).toBe(12)
  })
})
