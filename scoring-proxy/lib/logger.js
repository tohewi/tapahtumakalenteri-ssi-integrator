/**
 * Simple log-level utility.
 *
 * LOG_LEVEL env var controls verbosity (default: 'info' in production, 'debug' otherwise).
 * Levels: error < warn < info < debug < verbose
 *
 * Usage:
 *   import { log } from '../lib/logger.js'
 *   log.info('[staffing] something happened')
 *   log.debug('[staffing] detailed info', someData)
 *   log.verbose('[staffing] very detailed trace', bigObject)
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, verbose: 4 }
const IS_PROD = process.env.NODE_ENV === 'production'

// Default: 'info' in prod, 'debug' in dev — override with LOG_LEVEL env var
const configuredLevel = (process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug')).toLowerCase()
const threshold = LEVELS[configuredLevel] ?? LEVELS.info

function shouldLog(level) {
  return (LEVELS[level] ?? LEVELS.info) <= threshold
}

export const log = {
  error:   (...args) => shouldLog('error')   && console.error(...args),
  warn:    (...args) => shouldLog('warn')     && console.warn(...args),
  info:    (...args) => shouldLog('info')     && console.log(...args),
  debug:   (...args) => shouldLog('debug')    && console.log(...args),
  verbose: (...args) => shouldLog('verbose')  && console.log(...args),
  /** Current effective level */
  level: configuredLevel,
}
