import { readFileSync } from 'fs'
import { parse } from 'yaml'
import path from 'path'
import { fileURLToPath } from 'url'
import { getStaffSite, isDbAvailable } from '../db/client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'sra-training-config.yml')

let cachedConfig = null
let cacheSource = null // 'database' or 'yaml'

/**
 * Load and validate the SRA training staffing configuration.
 * Prefers database if available, falls back to YAML file.
 * Caches after first load. Call reload() to force re-read.
 *
 * @param {string} siteKey - Site key to load (default: 'sra-training')
 * @returns {Promise<object>} Parsed and validated config
 */
export async function loadConfig(siteKey = 'sra-training') {
  // Return cached if available and from same source
  if (cachedConfig && cacheSource === (isDbAvailable() ? 'database' : 'yaml')) {
    return cachedConfig
  }

  let config

  // Try database first
  if (isDbAvailable()) {
    try {
      const site = await getStaffSite(siteKey)
      if (site) {
        config = site.config
        cacheSource = 'database'
        console.log(`[config-loader] Loaded config from database (site: ${siteKey})`)
      } else {
        console.warn(`[config-loader] Site '${siteKey}' not found in database, falling back to YAML`)
      }
    } catch (err) {
      console.error('[config-loader] Error loading from database, falling back to YAML:', err)
    }
  }

  // Fall back to YAML if database failed or not available
  if (!config) {
    const raw = readFileSync(CONFIG_PATH, 'utf8')
    config = parse(raw)
    cacheSource = 'yaml'
    console.log('[config-loader] Loaded config from YAML file')
  }

  validate(config)
  cachedConfig = config
  return config
}

/**
 * Force reload config from source.
 * @param {string} siteKey - Site key to load (default: 'sra-training')
 * @returns {Promise<object>} Parsed and validated config
 */
export async function reloadConfig(siteKey = 'sra-training') {
  cachedConfig = null
  cacheSource = null
  return loadConfig(siteKey)
}

/**
 * Check if an email is in the admin allowlist.
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isAdminEmail(email) {
  const config = await loadConfig()
  return config.adminAllowlist.some(
    allowed => allowed.toLowerCase() === email.toLowerCase()
  )
}

/**
 * Check if an email is a service account (automation identity, not a real instructor).
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isServiceAccount(email) {
  const config = await loadConfig()
  const list = config.serviceAccounts || []
  return list.some(sa => sa.toLowerCase() === email.toLowerCase())
}

/**
 * Get training type config by key or by matching event name.
 * @param {string} nameOrKey — training type key ("oldies"/"newbie") or event name to match
 * @returns {Promise<{ key: string, config: object } | null>}
 */
export async function getTrainingType(nameOrKey) {
  const config = await loadConfig()
  const types = config.trainingTypes

  // Direct key match
  if (types[nameOrKey]) {
    return { key: nameOrKey, config: types[nameOrKey] }
  }

  // Match by search string in event name
  const nameLower = nameOrKey.toLowerCase()
  for (const [key, typeConfig] of Object.entries(types)) {
    const searchStr = config.eventDiscovery.searchStrings.find(
      s => nameLower.includes(s.toLowerCase())
    )
    if (searchStr && key.toLowerCase().includes(searchStr.toLowerCase())) {
      return { key, config: typeConfig }
    }
  }

  return null
}

/**
 * Get notification template for a given key and language.
 * @param {string} templateKey
 * @param {string} lang — "fi" or "en"
 * @returns {Promise<{ subject: string, body: string } | null>}
 */
export async function getNotificationTemplate(templateKey, lang = 'fi') {
  const config = await loadConfig()
  const template = config.notifications?.templates?.[templateKey]
  if (!template) return null

  return {
    subject: template.subject?.[lang] || template.subject?.fi || '',
    body: template.body?.[lang] || template.body?.fi || '',
  }
}

/**
 * Get role config by key.
 * @param {string} roleKey
 * @returns {Promise<object | null>}
 */
export async function getRoleConfig(roleKey) {
  const config = await loadConfig()
  return config.roles?.[roleKey] || null
}

/**
 * Get all required roles.
 * @returns {Promise<Array<{ key: string, config: object }>>}
 */
export async function getRequiredRoles() {
  const config = await loadConfig()
  return Object.entries(config.roles)
    .filter(([, rc]) => rc.required)
    .map(([key, rc]) => ({ key, config: rc }))
}

function validate(config) {
  const errors = []

  if (!config.organization?.name) errors.push('organization.name is required')
  if (!config.organization?.timezone) errors.push('organization.timezone is required')
  if (!Array.isArray(config.adminAllowlist)) errors.push('adminAllowlist must be an array')
  if (!config.eventDiscovery?.searchStrings?.length) errors.push('eventDiscovery.searchStrings is required')
  if (!config.trainingTypes || Object.keys(config.trainingTypes).length === 0) {
    errors.push('At least one trainingType is required')
  }
  if (!config.roles) errors.push('roles section is required')
  if (!config.notifications?.templates) errors.push('notifications.templates is required')

  for (const [key, tt] of Object.entries(config.trainingTypes || {})) {
    if (!tt.maxSquads) errors.push(`trainingTypes.${key}.maxSquads is required`)
    if (!tt.minShootersPerSquad) errors.push(`trainingTypes.${key}.minShootersPerSquad is required`)
    if (!tt.staffSquad) errors.push(`trainingTypes.${key}.staffSquad is required`)
  }

  if (errors.length > 0) {
    throw new Error(`SRA training config validation failed:\n  ${errors.join('\n  ')}`)
  }
}
