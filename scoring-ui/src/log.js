/**
 * Frontend log-level utility.
 *
 * Mirrors the backend pattern (scoring-proxy/lib/logger.js).
 * Debug output is gated by localStorage so production browsers stay clean
 * while field debugging remains possible without code changes.
 *
 * Enable:  localStorage.setItem('LOG_LEVEL', 'debug')  — then refresh
 * Disable: localStorage.removeItem('LOG_LEVEL')         — then refresh
 *
 * Levels: error < warn < info < debug
 *
 * Usage:
 *   import { log } from '../log'
 *   log.debug('[tablet] loaded scores', data)
 *   log.warn('[tablet] fallback used')
 *   log.error('[tablet] save failed', err)
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }

// Default to 'warn' (errors + warnings only) unless overridden via localStorage
function getLevel() {
  try {
    const stored = localStorage.getItem('LOG_LEVEL')
    if (stored && LEVELS[stored.toLowerCase()] !== undefined) {
      return stored.toLowerCase()
    }
  } catch { /* SSR / test env — no localStorage */ }
  return 'warn'
}

const configuredLevel = getLevel()
const threshold = LEVELS[configuredLevel] ?? LEVELS.warn

function isEnabled(level) {
  return (LEVELS[level] ?? LEVELS.warn) <= threshold
}

export const log = {
  error:   (...args) => isEnabled('error') && console.error(...args),
  warn:    (...args) => isEnabled('warn')  && console.warn(...args),
  info:    (...args) => isEnabled('info')  && console.log(...args),
  debug:   (...args) => isEnabled('debug') && console.log(...args),
  isEnabled,
  /** Current effective level */
  level: configuredLevel,
}
