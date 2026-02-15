import { readFileSync } from 'fs'
import { parse } from 'yaml'
import path from 'path'
import { fileURLToPath } from 'url'
import { getStaffSite, isDbAvailable } from '../db/client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'sra-training-config.yml')
export const DEFAULT_SITE_KEY = 'sra-training'

const configCache = new Map()
let yamlTemplateCache = null

function normalizeSiteKey(siteKey) {
  if (!siteKey || typeof siteKey !== 'string') return DEFAULT_SITE_KEY
  const normalized = siteKey.trim().toLowerCase()
  if (!normalized) return DEFAULT_SITE_KEY
  return /^[a-z0-9-]+$/.test(normalized) ? normalized : DEFAULT_SITE_KEY
}

function deepClone(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function mergeConfig(baseValue, overrideValue) {
  if (overrideValue === undefined) return deepClone(baseValue)

  if (Array.isArray(overrideValue)) {
    return deepClone(overrideValue)
  }

  if (overrideValue === null || typeof overrideValue !== 'object') {
    return overrideValue
  }

  const baseObject = (baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue))
    ? baseValue
    : {}

  const merged = {}
  const keys = new Set([...Object.keys(baseObject), ...Object.keys(overrideValue)])

  for (const key of keys) {
    merged[key] = mergeConfig(baseObject[key], overrideValue[key])
  }

  return merged
}

function loadYamlTemplate() {
  if (yamlTemplateCache) {
    return deepClone(yamlTemplateCache)
  }

  console.log(`[config-loader] Loading config template from YAML file: ${CONFIG_PATH}`)
  const raw = readFileSync(CONFIG_PATH, 'utf8')
  const parsed = parse(raw)
  validate(parsed)

  yamlTemplateCache = parsed
  return deepClone(yamlTemplateCache)
}

function buildSiteConfigFromDatabase(site, baseTemplate) {
  const merged = mergeConfig(baseTemplate, site?.config || {})

  const mergedOrg = merged.organization || {}
  merged.organization = {
    ...(baseTemplate.organization || {}),
    ...mergedOrg,
    name: site.organizationName || mergedOrg.name || baseTemplate.organization?.name,
    range: site.organizationRange ?? mergedOrg.range ?? baseTemplate.organization?.range,
    timezone: site.timezone || mergedOrg.timezone || baseTemplate.organization?.timezone,
  }

  return merged
}

/**
 * Load and validate the SRA training staffing configuration.
 * Prefers database if available, falls back to YAML file.
 * Caches after first load. Call reload() to force re-read.
 *
 * @param {string} siteKey - Site key to load (default: 'sra-training')
 * @returns {Promise<object>} Parsed and validated config
 */
export async function loadConfig(siteKey = 'sra-training') {
  const normalizedSiteKey = normalizeSiteKey(siteKey)

  // Return cached site config if available.
  for (const source of ['database', 'yaml']) {
    const cacheKey = `${source}:${normalizedSiteKey}`
    if (configCache.has(cacheKey)) {
      console.log(`[config-loader] Using cached config from ${source} (site: ${normalizedSiteKey})`)
      return deepClone(configCache.get(cacheKey))
    }
  }

  const baseTemplate = loadYamlTemplate()
  let config = null
  let source = 'yaml'

  // Try database first
  if (isDbAvailable()) {
    console.log(`[config-loader] Database available, attempting to load config for site: ${normalizedSiteKey}`)
    try {
      const site = await getStaffSite(normalizedSiteKey)
      if (site) {
        config = buildSiteConfigFromDatabase(site, baseTemplate)
        source = 'database'
        console.log(`[config-loader] ✓ Loaded config from database (site: ${normalizedSiteKey})`)
        console.log(`[config-loader]   Organization: ${config?.organization?.name || 'N/A'}`)
        console.log(`[config-loader]   Training types: ${Object.keys(config?.trainingTypes || {}).join(', ')}`)
        console.log(`[config-loader]   Admin allowlist: ${config?.adminAllowlist?.length || 0} users`)
      } else {
        console.warn(`[config-loader] ⚠️  Site '${normalizedSiteKey}' not found in database, falling back to YAML template`)
      }
    } catch (err) {
      console.error('[config-loader] ✗ Error loading from database, falling back to YAML template:', err.message)
    }
  } else {
    console.log('[config-loader] Database not available (DATABASE_URL not set or not initialized)')
  }

  // Fall back to YAML template if database failed or not available
  if (!config) {
    config = deepClone(baseTemplate)
    source = 'yaml'
    console.log('[config-loader] ✓ Loaded config from YAML template')
    console.log(`[config-loader]   Organization: ${config?.organization?.name || 'N/A'}`)
    console.log(`[config-loader]   Training types: ${Object.keys(config?.trainingTypes || {}).join(', ')}`)
    console.log(`[config-loader]   Admin allowlist: ${config?.adminAllowlist?.length || 0} users`)
  }

  validate(config)
  configCache.set(`${source}:${normalizedSiteKey}`, deepClone(config))

  return deepClone(config)
}

/**
 * Force reload config from source.
 * @param {string} siteKey - Site key to load (default: 'sra-training')
 * @returns {Promise<object>} Parsed and validated config
 */
export async function reloadConfig(siteKey = null) {
  if (siteKey) {
    const normalizedSiteKey = normalizeSiteKey(siteKey)
    configCache.delete(`database:${normalizedSiteKey}`)
    configCache.delete(`yaml:${normalizedSiteKey}`)
    return loadConfig(normalizedSiteKey)
  }

  configCache.clear()
  return loadConfig(DEFAULT_SITE_KEY)
}

/**
 * Check if an email is in the admin allowlist.
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isAdminEmail(email, siteKey = DEFAULT_SITE_KEY) {
  const config = await loadConfig(siteKey)
  const allowlist = Array.isArray(config.adminAllowlist) ? config.adminAllowlist : []

  return allowlist.some(
    allowed => allowed.toLowerCase() === email.toLowerCase()
  )
}

/**
 * Check if an email is a service account (automation identity, not a real instructor).
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isServiceAccount(email, siteKey = DEFAULT_SITE_KEY) {
  const config = await loadConfig(siteKey)
  const list = config.serviceAccounts || []
  return list.some(sa => sa.toLowerCase() === email.toLowerCase())
}

/**
 * Get training type config by key or by matching event name.
 * @param {string} nameOrKey — training type key ("oldies"/"newbie") or event name to match
 * @returns {Promise<{ key: string, config: object } | null>}
 */
export async function getTrainingType(nameOrKey, siteKey = DEFAULT_SITE_KEY) {
  const config = await loadConfig(siteKey)
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
export async function getNotificationTemplate(templateKey, lang = 'fi', siteKey = DEFAULT_SITE_KEY) {
  const config = await loadConfig(siteKey)
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
export async function getRoleConfig(roleKey, siteKey = DEFAULT_SITE_KEY) {
  const config = await loadConfig(siteKey)
  return config.roles?.[roleKey] || null
}

/**
 * Get all required roles.
 * @returns {Promise<Array<{ key: string, config: object }>>}
 */
export async function getRequiredRoles(siteKey = DEFAULT_SITE_KEY) {
  const config = await loadConfig(siteKey)
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
