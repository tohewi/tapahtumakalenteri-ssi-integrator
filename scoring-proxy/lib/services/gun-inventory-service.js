// ============================================================
// Gun Inventory Service — Access Control & Inventory Management
// ============================================================

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { ssiGetGroupMembers } from '../ssi-core/management.js'
import { log } from '../logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'gun-inventory-config.yml')

const DEFAULT_CONFIG = {
  accessControl: {
    groupId: '25874',
    groupUrl: 'https://shootnscoreit.com/groups/25874/',
    requiredRole: 'admin',
  },
  defaults: {
    cartridgesGiven: 100,
  },
}

const accessCache = new Map()
const ACCESS_CACHE_TTL_MS = 10 * 60 * 1000

export function loadGunInventoryConfig() {
  let fileConfig = {}
  if (existsSync(CONFIG_PATH)) {
    try {
      fileConfig = parse(readFileSync(CONFIG_PATH, 'utf8')) || {}
    } catch (err) {
      log.warn('[guns] Failed to parse gun-inventory-config.yml, using defaults:', err.message)
    }
  }

  const groupId = String(
    process.env.SSI_GUN_INVENTORY_GROUP_ID
    || fileConfig?.accessControl?.groupId
    || DEFAULT_CONFIG.accessControl.groupId
  ).trim()

  const requiredRole = String(
    process.env.SSI_GUN_INVENTORY_REQUIRED_ROLE
    || fileConfig?.accessControl?.requiredRole
    || DEFAULT_CONFIG.accessControl.requiredRole
  ).trim().toLowerCase()

  return {
    accessControl: {
      groupId,
      groupUrl: `https://shootnscoreit.com/groups/${groupId}/`,
      requiredRole,
    },
    defaults: {
      cartridgesGiven: Number.isInteger(fileConfig?.defaults?.cartridgesGiven)
        ? fileConfig.defaults.cartridgesGiven
        : DEFAULT_CONFIG.defaults.cartridgesGiven,
    },
  }
}

export function clearGunAdminAccessCache() {
  accessCache.clear()
}

export async function verifyGunInventoryAdminAccess({
  userEmail,
  userName = '',
  cookies,
  groupId: groupIdOverride = null,
}) {
  const cfg = loadGunInventoryConfig()
  const groupId = String(groupIdOverride || cfg.accessControl.groupId)
  const requiredRole = cfg.accessControl.requiredRole
  const normalizedEmail = String(userEmail || '').trim().toLowerCase()
  const normalizedName = String(userName || '').trim().toLowerCase()

  if (!normalizedEmail && !normalizedName) {
    return { allowed: false, groupId, requiredRole, reason: 'missing_user_identity' }
  }
  if (!cookies || Object.keys(cookies).length === 0) {
    return { allowed: false, groupId, requiredRole, reason: 'missing_ssi_cookies' }
  }

  const cacheKey = `${groupId}:${requiredRole}:${normalizedEmail || normalizedName}`
  const cached = accessCache.get(cacheKey)
  if (cached && Date.now() - cached.checkedAt < ACCESS_CACHE_TTL_MS) {
    return cached.result
  }

  const members = await ssiGetGroupMembers(groupId, cookies)
  const matchingMember = members.find(m => {
    const emailMatches = normalizedEmail && (
      m.email === normalizedEmail ||
      String(m.contact || '').toLowerCase().includes(normalizedEmail)
    )
    const nameMatches = normalizedName && String(m.name || '').trim().toLowerCase() === normalizedName
    return emailMatches || nameMatches
  })

  const allowed = Boolean(matchingMember && matchingMember.role === requiredRole)
  const result = {
    allowed,
    groupId,
    requiredRole,
    userRole: matchingMember?.role || null,
    reason: allowed ? 'authorized' : (matchingMember ? 'insufficient_role' : 'not_in_group'),
  }

  accessCache.set(cacheKey, { checkedAt: Date.now(), result })
  return result
}
