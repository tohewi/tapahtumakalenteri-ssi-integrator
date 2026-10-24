import { describe, it, expect } from 'vitest'
import {
  isCountableRegistrationStatus,
  countRegisteredCupCompetitors,
  validateRegistrationInput,
  formatOpenCupsList,
  buildCupDetailPayload,
} from '../lib/services/registration-service.js'

describe('registration-service pure functions', () => {
  it('validates registration input fields strictly', () => {
    expect(validateRegistrationInput({
      cupId: '1234',
      squadNumber: 2,
      email: 'shooter@example.com',
      captchaId: '123e4567-e89b-12d3-a456-426614174000',
      captchaAnswer: 15,
    })).toEqual([])

    const errs = validateRegistrationInput({
      cupId: 'bad',
      squadNumber: 0,
      email: 'invalid-email',
      captchaId: 'not-a-uuid',
      captchaAnswer: 5000,
    })
    expect(errs).toHaveLength(5)
  })

  it('counts countable registration statuses and falls back to squad competitors', () => {
    expect(isCountableRegistrationStatus('a')).toBe(true)
    expect(isCountableRegistrationStatus('d')).toBe(false)

    expect(countRegisteredCupCompetitors({
      competitors: [{ id: '1', status: 'a' }, { id: '2', status: 'd' }],
    })).toBe(1)

    expect(countRegisteredCupCompetitors({
      competitors: [],
      component_matches: [{
        included: true,
        match: { squads: [{ competitors: [{ id: '10', status: 'a' }] }] },
      }],
    })).toBe(1)
  })

  it('formats open cups list and cup detail payload', () => {
    const now = new Date('2026-06-01T10:00:00Z')
    const list = formatOpenCupsList([
      {
        id: '100',
        name: 'TurRes Kupittaa CUP',
        starts: '2026-06-10T09:00:00Z',
        status: 'on',
        get_content_type_key: 136,
        max_competitors: 25,
        registration: 'op',
        competitors: [{ id: '1', status: 'a' }],
      },
    ], now)
    expect(list).toHaveLength(1)
    expect(list[0].registrationOpen).toBe(true)

    const detail = buildCupDetailPayload({
      id: '100',
      name: 'TurRes Kupittaa CUP',
      starts: '2026-06-10T09:00:00Z',
      status: 'on',
      max_competitors: 25,
      competitors: [{ id: '1', status: 'a' }],
      component_matches: [
        {
          number: 1,
          included: true,
          match: {
            id: 'm1',
            name: 'Match 1',
            squads: [{ number: 1, comment: 'Laina-ase', max_competitors: 9, competitors: [{ id: '1', status: 'a' }] }],
          },
        },
      ],
    })
    expect(detail.squads[0]).toEqual({
      number: 1,
      name: 'Laina-ase',
      current: 1,
      max: 9,
      full: false,
    })
  })
})
