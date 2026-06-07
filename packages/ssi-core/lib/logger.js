/**
 * Simple log-level utility.
 *
 * LOG_LEVEL env var controls verbosity.
 * If LOG_LEVEL is not set, default is 'debug'.
 * Invalid LOG_LEVEL values fall back to 'info'.
 * Levels: error < warn < info < debug < verbose
 *
 * Usage:
 *   import { log } from '@ssi-tools/core/logger'
 *   log.info('[staffing] something happened')
 *   log.debug('[staffing] detailed info', someData)
 *   log.verbose('[staffing] very detailed trace', bigObject)
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, verbose: 4 }
const DEFAULT_LEVEL = 'debug'
const FALLBACK_LEVEL = 'info'

const requestedLevel = (process.env.LOG_LEVEL || DEFAULT_LEVEL).toLowerCase()
const configuredLevel = LEVELS[requestedLevel] !== undefined ? requestedLevel : FALLBACK_LEVEL
const threshold = LEVELS[configuredLevel]

function isEnabled(level) {
  return (LEVELS[level] ?? LEVELS.info) <= threshold
}

export const log = {
  error:   (...args) => isEnabled('error')   && console.error(...args),
  warn:    (...args) => isEnabled('warn')     && console.warn(...args),
  info:    (...args) => isEnabled('info')     && console.log(...args),
  debug:   (...args) => isEnabled('debug')    && console.log(...args),
  verbose: (...args) => isEnabled('verbose')  && console.log(...args),
  isEnabled,
  /** Current effective level */
  level: configuredLevel,
}
