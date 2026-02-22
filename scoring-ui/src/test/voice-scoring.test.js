import { describe, it, expect } from 'vitest'
import { parseVoiceCommand, VOICE_COMMANDS } from '../hooks/useVoiceScoring'

describe('parseVoiceCommand', () => {
  // Finnish score zone words
  it('recognises Finnish "napa" as X', () => {
    expect(parseVoiceCommand('napa')).toBe('X')
  })

  it('recognises Finnish "napakymppi" as X', () => {
    expect(parseVoiceCommand('napakymppi')).toBe('X')
  })

  it('recognises Finnish "kymmenen" as 10', () => {
    expect(parseVoiceCommand('kymmenen')).toBe('10')
  })

  it('recognises Finnish "yhdeksän" as 9', () => {
    expect(parseVoiceCommand('yhdeksän')).toBe('9')
  })

  it('recognises Finnish "kahdeksan" as 8', () => {
    expect(parseVoiceCommand('kahdeksan')).toBe('8')
  })

  it('recognises Finnish "kasi" (8 slang) as 8', () => {
    expect(parseVoiceCommand('kasi')).toBe('8')
  })

  it('recognises Finnish "seitsemän" as 7', () => {
    expect(parseVoiceCommand('seitsemän')).toBe('7')
  })

  it('recognises Finnish "seiska" (7 slang) as 7', () => {
    expect(parseVoiceCommand('seiska')).toBe('7')
  })

  it('recognises Finnish "kuusi" as 6', () => {
    expect(parseVoiceCommand('kuusi')).toBe('6')
  })

  it('recognises Finnish "viisi" as 5', () => {
    expect(parseVoiceCommand('viisi')).toBe('5')
  })

  it('recognises Finnish "vitonen" (5 slang) as 5', () => {
    expect(parseVoiceCommand('vitonen')).toBe('5')
  })

  it('recognises Finnish "neljä" as 4', () => {
    expect(parseVoiceCommand('neljä')).toBe('4')
  })

  it('recognises Finnish "kolme" as 3', () => {
    expect(parseVoiceCommand('kolme')).toBe('3')
  })

  it('recognises Finnish "kolonen" (3 slang) as 3', () => {
    expect(parseVoiceCommand('kolonen')).toBe('3')
  })

  it('recognises Finnish "kaksi" as 2', () => {
    expect(parseVoiceCommand('kaksi')).toBe('2')
  })

  it('recognises Finnish "kakonen" (2 slang) as 2', () => {
    expect(parseVoiceCommand('kakonen')).toBe('2')
  })

  it('recognises Finnish "kakkonen" (2 slang) as 2', () => {
    expect(parseVoiceCommand('kakkonen')).toBe('2')
  })

  it('recognises Finnish "yksi" as 1', () => {
    expect(parseVoiceCommand('yksi')).toBe('1')
  })

  it('recognises Finnish "ykkönen" (1 slang) as 1', () => {
    expect(parseVoiceCommand('ykkönen')).toBe('1')
  })

  it('recognises Finnish "ykönen" (1 slang) as 1', () => {
    expect(parseVoiceCommand('ykönen')).toBe('1')
  })

  it('recognises Finnish "ohi" as M', () => {
    expect(parseVoiceCommand('ohi')).toBe('M')
  })

  it('recognises Finnish "ohilaukaus" as M', () => {
    expect(parseVoiceCommand('ohilaukaus')).toBe('M')
  })

  // English score zone words
  it('recognises English "ten" as 10', () => {
    expect(parseVoiceCommand('ten')).toBe('10')
  })

  it('recognises English "nine" as 9', () => {
    expect(parseVoiceCommand('nine')).toBe('9')
  })

  it('recognises English "eight" as 8', () => {
    expect(parseVoiceCommand('eight')).toBe('8')
  })

  it('recognises English "seven" as 7', () => {
    expect(parseVoiceCommand('seven')).toBe('7')
  })

  it('recognises English "six" as 6', () => {
    expect(parseVoiceCommand('six')).toBe('6')
  })

  it('recognises English "five" as 5', () => {
    expect(parseVoiceCommand('five')).toBe('5')
  })

  it('recognises English "four" as 4', () => {
    expect(parseVoiceCommand('four')).toBe('4')
  })

  it('recognises English "three" as 3', () => {
    expect(parseVoiceCommand('three')).toBe('3')
  })

  it('recognises English "two" as 2', () => {
    expect(parseVoiceCommand('two')).toBe('2')
  })

  it('recognises English "one" as 1', () => {
    expect(parseVoiceCommand('one')).toBe('1')
  })

  it('recognises English "miss" as M', () => {
    expect(parseVoiceCommand('miss')).toBe('M')
  })

  // Case insensitivity
  it('recognises upper-case "TEN" as 10', () => {
    expect(parseVoiceCommand('TEN')).toBe('10')
  })

  it('recognises mixed-case "YHDEKSÄN" as 9', () => {
    expect(parseVoiceCommand('YHDEKSÄN')).toBe('9')
  })

  // Multi-word transcripts – first matching word wins
  it('picks first matching word from multi-word transcript', () => {
    expect(parseVoiceCommand('se oli kymmenen hyvä')).toBe('10')
  })

  it('picks first matching word when second word matches', () => {
    expect(parseVoiceCommand('hmm nine please')).toBe('9')
  })

  // No match
  it('returns null for unrecognised transcript', () => {
    expect(parseVoiceCommand('foobar')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseVoiceCommand('')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(parseVoiceCommand(null)).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(parseVoiceCommand('   ')).toBeNull()
  })

  // Numeric strings work too
  it('recognises spoken digit "10" as 10', () => {
    expect(parseVoiceCommand('10')).toBe('10')
  })

  it('recognises spoken digit "1" as 1', () => {
    expect(parseVoiceCommand('1')).toBe('1')
  })

  // VOICE_COMMANDS structure sanity check
  it('VOICE_COMMANDS covers all 12 score zones', () => {
    const zones = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']
    for (const zone of zones) {
      expect(VOICE_COMMANDS[zone]).toBeDefined()
      expect(VOICE_COMMANDS[zone].length).toBeGreaterThan(0)
    }
  })
})
