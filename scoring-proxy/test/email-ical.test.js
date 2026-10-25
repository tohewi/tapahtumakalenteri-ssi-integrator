import { describe, it, expect } from 'vitest'
import { buildRegistrationIcs } from '../lib/email.js'

describe('GQL-HF6: iCal (.ics) Registration Calendar Attachment', () => {
  it('generates a valid RFC 5545 VCALENDAR with deterministic UID and 8h fallback when ends is missing', () => {
    const ics = buildRegistrationIcs({
      cupId: '160',
      cupName: 'TurRes Kupittaa CUP 13.06.2026',
      starts: '2026-06-13T09:00:00Z',
      ends: null,
      shooterEmail: 'Matti@Example.com',
      matchSquads: [
        { matchName: 'Kupittaa Tarkkuus', squadNumber: 1, squadLabel: 'Laina-ase' },
      ],
    })

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('METHOD:REQUEST')
    expect(ics).toContain('UID:registration-160-matti@example.com@ssi-tools')
    expect(ics).toContain('DTSTART:20260613T090000Z')
    expect(ics).toContain('DTEND:20260613T170000Z')
    expect(ics).toContain('SUMMARY:TurRes Kupittaa CUP 13.06.2026')
    expect(ics).toContain('Kupittaa Tarkkuus: Squad 1 (Laina-ase)')
  })

  it('returns null gracefully when starts is missing or invalid', () => {
    expect(buildRegistrationIcs({ cupId: '160', cupName: 'Cup', starts: null })).toBeNull()
    expect(buildRegistrationIcs({ cupId: '160', cupName: 'Cup', starts: 'not-a-date' })).toBeNull()
  })
})
