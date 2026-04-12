import { readFileSync } from 'fs'
import { parse } from 'yaml'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'kupittaa-induction-waitlist-config.yml')

let cachedConfig = null

function getConfigPath() {
  return process.env.KUPITTAA_INDUCTION_WAITLIST_CONFIG_PATH || DEFAULT_CONFIG_PATH
}

export function validateConfig(config) {
  const errors = []

  if (!Array.isArray(config.adminAllowlist)) errors.push('adminAllowlist must be an array')

  if (!config.ssiUserValidation?.groupId) {
    errors.push('ssiUserValidation.groupId is required')
  }

  const threshold = config.induction?.threshold
  if (!Number.isInteger(threshold) || threshold < 1) {
    errors.push('induction.threshold must be a positive integer')
  }

  if (!config.routes?.publicPath) errors.push('routes.publicPath is required')
  if (!config.routes?.adminPath) errors.push('routes.adminPath is required')

  const langs = config.notifications?.supportedLanguages
  if (!Array.isArray(langs) || langs.length === 0) {
    errors.push('notifications.supportedLanguages must be a non-empty array')
  }

  if (errors.length > 0) {
    throw new Error(`Wait list config validation failed:\n  ${errors.join('\n  ')}`)
  }
}

export function loadConfig() {
  if (cachedConfig) return cachedConfig

  const raw = readFileSync(getConfigPath(), 'utf8')
  const config = parse(raw)
  validateConfig(config)
  cachedConfig = config
  return config
}

export function reloadConfig() {
  cachedConfig = null
  return loadConfig()
}

export function isAdminEmail(email) {
  if (!email) return false
  const config = loadConfig()
  return config.adminAllowlist.some(allowed => allowed.toLowerCase() === String(email).toLowerCase())
}

export function getInductionThreshold() {
  return loadConfig().induction.threshold
}

export function getSupportedLanguages() {
  return loadConfig().notifications.supportedLanguages
}

export function getValidationGroupId() {
  return loadConfig().ssiUserValidation.groupId
}
