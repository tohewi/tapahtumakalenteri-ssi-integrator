/**
 * Voice Recognition for Scoring
 *
 * Uses Web Speech API to recognize score values spoken in Finnish or English.
 * Supports various colloquial forms for each score value.
 */

import { log } from './log.js'

// Score mappings for Finnish
const FINNISH_SCORE_MAP = {
  // X / bullseye (10 points)
  'napa': 'X',
  'napakymppi': 'X',

  // 10
  'kymmenen': '10',
  'kymppi': '10',
  'ten': '10', // Sometimes mixed in Finnish speech

  // 9
  'yhdeksän': '9',
  'nine': '9',

  // 8
  'kahdeksan': '8',
  'kasi': '8',
  'eight': '8',

  // 7
  'seitsemän': '7',
  'seiska': '7',
  'seven': '7',

  // 6
  'kuusi': '6',
  'six': '6',

  // 5
  'viisi': '5',
  'vitonen': '5',
  'five': '5',

  // 4
  'neljä': '4',
  'four': '4',

  // 3
  'kolme': '3',
  'kolonen': '3',
  'three': '3',

  // 2
  'kaksi': '2',
  'kakonen': '2',
  'kakkonen': '2',
  'two': '2',

  // 1
  'yksi': '1',
  'ykönen': '1',
  'ykkönen': '1',
  'one': '1',

  // Miss
  'ohi': 'M',
  'ohilaukaus': 'M',
  'miss': 'M',
}

// Score mappings for English
const ENGLISH_SCORE_MAP = {
  // X / bullseye
  'x': 'X',
  'bullseye': 'X',
  'bull': 'X',
  'center': 'X',

  // Number scores
  'ten': '10',
  'nine': '9',
  'eight': '8',
  'seven': '7',
  'six': '6',
  'five': '5',
  'four': '4',
  'three': '3',
  'two': '2',
  'one': '1',

  // Miss
  'miss': 'M',
  'missed': 'M',
  'zero': 'M',
}

/**
 * Initialize speech recognition
 * @param {string} language - 'fi' or 'en'
 * @param {function} onResult - callback(scoreValue) when a score is recognized
 * @param {function} onError - callback(errorMessage) when an error occurs
 * @returns {object} - { start, stop, isSupported }
 */
export function createVoiceRecognition(language = 'fi', onResult, onError) {
  // Check for Web Speech API support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

  if (!SpeechRecognition) {
    log.warn('[voice] Web Speech API not supported in this browser')
    return {
      isSupported: false,
      start: () => {},
      stop: () => {},
    }
  }

  const recognition = new SpeechRecognition()

  // Configure recognition
  recognition.continuous = true  // Keep listening
  recognition.interimResults = false  // Only final results
  recognition.maxAlternatives = 3  // Consider multiple interpretations
  recognition.lang = language === 'fi' ? 'fi-FI' : 'en-US'

  const scoreMap = language === 'fi' ? FINNISH_SCORE_MAP : ENGLISH_SCORE_MAP

  // Handle recognition results
  recognition.onresult = (event) => {
    const results = event.results[event.results.length - 1]

    // Try to match any of the alternatives
    for (let i = 0; i < results.length; i++) {
      const transcript = results[i].transcript.trim().toLowerCase()
      log.debug(`[voice] Heard: "${transcript}" (confidence: ${results[i].confidence.toFixed(2)})`)

      // Check if it matches any score pattern
      const scoreValue = scoreMap[transcript]
      if (scoreValue) {
        log.info(`[voice] Recognized score: ${scoreValue}`)
        onResult(scoreValue)
        return
      }

      // Try partial matches (e.g., "napa" in "napa kymmenen")
      for (const [key, value] of Object.entries(scoreMap)) {
        if (transcript.includes(key)) {
          log.info(`[voice] Recognized score (partial match): ${value}`)
          onResult(value)
          return
        }
      }
    }

    // No match found
    log.debug(`[voice] No score pattern matched in: "${results[0].transcript}"`)
  }

  recognition.onerror = (event) => {
    log.error('[voice] Recognition error:', event.error)

    // Provide user-friendly error messages
    let errorMsg = 'Voice recognition error'
    switch (event.error) {
      case 'no-speech':
        errorMsg = 'No speech detected'
        break
      case 'audio-capture':
        errorMsg = 'No microphone found'
        break
      case 'not-allowed':
        errorMsg = 'Microphone access denied'
        break
      case 'network':
        errorMsg = 'Network error'
        break
      default:
        errorMsg = `Voice error: ${event.error}`
    }

    onError(errorMsg)
  }

  recognition.onend = () => {
    log.debug('[voice] Recognition ended')
  }

  return {
    isSupported: true,
    start: () => {
      try {
        log.info('[voice] Starting voice recognition')
        recognition.start()
      } catch (err) {
        log.error('[voice] Failed to start:', err)
        onError('Failed to start voice recognition')
      }
    },
    stop: () => {
      try {
        log.info('[voice] Stopping voice recognition')
        recognition.stop()
      } catch (err) {
        log.error('[voice] Failed to stop:', err)
      }
    },
  }
}

/**
 * Speak text using Web Speech Synthesis API
 * @param {string} text - text to speak
 * @param {string} language - 'fi' or 'en'
 */
export function speak(text, language = 'fi') {
  if (!window.speechSynthesis) {
    log.warn('[voice] Web Speech Synthesis not supported')
    return
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language === 'fi' ? 'fi-FI' : 'en-US'
  utterance.rate = 0.9  // Slightly slower for clarity
  utterance.pitch = 1.0
  utterance.volume = 1.0

  log.debug(`[voice] Speaking: "${text}"`)
  window.speechSynthesis.speak(utterance)
}

/**
 * Get spoken form of a score value
 * @param {string} zone - score zone (X, 10, 9, ..., 1, M)
 * @param {string} language - 'fi' or 'en'
 * @returns {string} - spoken form
 */
export function getSpokenScore(zone, language = 'fi') {
  if (language === 'fi') {
    const fiMap = {
      'X': 'napa',
      '10': 'kymmenen',
      '9': 'yhdeksän',
      '8': 'kahdeksan',
      '7': 'seitsemän',
      '6': 'kuusi',
      '5': 'viisi',
      '4': 'neljä',
      '3': 'kolme',
      '2': 'kaksi',
      '1': 'yksi',
      'M': 'ohi',
    }
    return fiMap[zone] || zone
  } else {
    const enMap = {
      'X': 'bullseye',
      '10': 'ten',
      '9': 'nine',
      '8': 'eight',
      '7': 'seven',
      '6': 'six',
      '5': 'five',
      '4': 'four',
      '3': 'three',
      '2': 'two',
      '1': 'one',
      'M': 'miss',
    }
    return enMap[zone] || zone
  }
}

/**
 * Announce shot count
 * @param {number} count - number of shots
 * @param {string} language - 'fi' or 'en'
 */
export function announceShotCount(count, language = 'fi') {
  const text = language === 'fi'
    ? `${count} laukausta`
    : `${count} shots`
  speak(text, language)
}
