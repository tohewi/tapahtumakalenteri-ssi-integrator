import { useState, useEffect, useRef, useCallback } from 'react'

// ============================================================
// Voice command mappings: zone → recognized spoken words
// Finnish + English variants from the R7.6 specification
// ============================================================

export const VOICE_COMMANDS = {
  'X':  ['napa', 'napakymppi', 'x'],
  '10': ['kymmenen', 'kymppi', 'ten', '10'],
  '9':  ['yhdeksän', 'yhdeksan', 'nine', '9'],
  '8':  ['kahdeksan', 'kasi', 'eight', '8'],
  '7':  ['seitsemän', 'seitseman', 'seiska', 'seven', '7'],
  '6':  ['kuusi', 'six', '6'],
  '5':  ['viisi', 'vitonen', 'five', '5'],
  '4':  ['neljä', 'nelja', 'four', '4'],
  '3':  ['kolme', 'kolonen', 'three', '3'],
  '2':  ['kaksi', 'kakonen', 'kakkonen', 'two', '2'],
  '1':  ['yksi', 'ykönen', 'ykkönen', 'ykkonen', 'one', '1'],
  'M':  ['ohi', 'ohilaukaus', 'miss', 'm'],
}

// Inverted lookup: lowercased word → zone
const WORD_TO_ZONE = {}
for (const [zone, words] of Object.entries(VOICE_COMMANDS)) {
  for (const word of words) {
    WORD_TO_ZONE[word.toLowerCase()] = zone
  }
}

/**
 * Parse a speech recognition transcript into a score zone.
 * Tries each whitespace-separated word in order and returns
 * the first matching zone, or null if nothing is recognised.
 *
 * @param {string} transcript - Raw text from SpeechRecognition
 * @returns {string|null} Zone ('X', '10'…'1', 'M') or null
 */
export function parseVoiceCommand(transcript) {
  if (!transcript) return null
  const words = transcript.toLowerCase().trim().split(/\s+/)
  for (const word of words) {
    const zone = WORD_TO_ZONE[word]
    if (zone !== undefined) return zone
  }
  return null
}

// ============================================================
// TTS zone confirmation text per language
// ============================================================
const ZONE_SPEAK = {
  fi: { X: 'napakymppi', '10': 'kymmenen', '9': 'yhdeksän', '8': 'kahdeksan',
        '7': 'seitsemän', '6': 'kuusi', '5': 'viisi', '4': 'neljä',
        '3': 'kolme', '2': 'kaksi', '1': 'yksi', M: 'ohi' },
  en: { X: 'X', '10': 'ten', '9': 'nine', '8': 'eight', '7': 'seven',
        '6': 'six', '5': 'five', '4': 'four', '3': 'three', '2': 'two',
        '1': 'one', M: 'miss' },
}

/**
 * Speak text via the browser SpeechSynthesis API.
 * Cancels any ongoing utterance before starting the new one.
 *
 * @param {string} text
 * @param {'fi'|'en'} lang
 */
export function speak(text, lang = 'fi') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = lang === 'en' ? 'en-US' : 'fi-FI'
  utter.rate = 1.1
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}

/**
 * Detect the UI language based on navigator.language.
 * Returns 'en' for English browsers, 'fi' otherwise.
 */
export function getVoiceLang() {
  if (typeof navigator === 'undefined' || !navigator.language) return 'fi'
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fi'
}

// ============================================================
// useVoiceScoring hook
// ============================================================

/**
 * React hook for voice-driven score input using the Web Speech API.
 *
 * Listens continuously for spoken score zone commands, calls onScore(zone)
 * on each recognised zone, and speaks back a TTS confirmation.
 * When the series becomes full (totalShots reaches maxHits after a new shot),
 * the hook announces the completion count.
 *
 * @param {object} opts
 * @param {function(string): void} opts.onScore   - Called with the recognised zone
 * @param {number}   opts.totalShots              - Current shot count for the series
 * @param {number}   opts.maxHits                 - Maximum shots allowed in the series
 * @returns {{ isListening: boolean, isSupported: boolean, lastRecognized: string|null,
 *             startListening: function, stopListening: function }}
 */
export function useVoiceScoring({ onScore, totalShots, maxHits }) {
  const [isListening, setIsListening] = useState(false)
  const [lastRecognized, setLastRecognized] = useState(null)
  const recognitionRef = useRef(null)
  // Keep refs for values used inside event handler callbacks to avoid stale closures
  const onScoreRef = useRef(onScore)
  const totalShotsRef = useRef(totalShots)
  const maxHitsRef = useRef(maxHits)
  const langRef = useRef(getVoiceLang())

  // Keep refs in sync
  useEffect(() => { onScoreRef.current = onScore }, [onScore])
  useEffect(() => { totalShotsRef.current = totalShots }, [totalShots])
  useEffect(() => { maxHitsRef.current = maxHits }, [maxHits])

  const isSupported = typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current
    if (rec) {
      // Disable auto-restart before stopping
      rec.onend = null
      rec.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    const lang = langRef.current
    recognition.lang = lang === 'en' ? 'en-US' : 'fi-FI'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.maxAlternatives = 3

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result.isFinal) continue
        // Try each alternative transcript in confidence order
        for (let j = 0; j < result.length; j++) {
          const zone = parseVoiceCommand(result[j].transcript)
          if (zone !== null) {
            setLastRecognized(zone)
            onScoreRef.current(zone)
            // Speak zone confirmation
            speak(ZONE_SPEAK[lang][zone], lang)
            // Announce series completion if this shot fills the series
            const shotsAfter = totalShotsRef.current + 1
            if (shotsAfter >= maxHitsRef.current) {
              const announcement = lang === 'en'
                ? `${maxHitsRef.current} shots`
                : `${maxHitsRef.current} laukausta`
              setTimeout(() => speak(announcement, lang), 800)
            }
            break
          }
        }
      }
    }

    recognition.onerror = (event) => {
      // Ignore transient errors; only stop on fatal ones
      if (event.error === 'no-speech' || event.error === 'aborted') return
      stopListening()
    }

    recognition.onend = () => {
      // Auto-restart if we're still supposed to be listening
      if (recognitionRef.current) {
        try { recognitionRef.current.start() } catch { /* already starting */ }
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isSupported, stopListening])

  // Stop recognition and clean up on component unmount
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current
      if (rec) {
        rec.onend = null
        rec.stop()
        recognitionRef.current = null
      }
    }
  }, [])

  return { isListening, isSupported, lastRecognized, startListening, stopListening }
}
