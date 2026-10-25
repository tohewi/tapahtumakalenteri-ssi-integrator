// ============================================================
// Gun Inventory Service — Access Control & Inventory Management
// ============================================================

import crypto from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { ssiGetGroupMembers } from '../ssi-core/management.js'
import { log } from '../logger.js'
import { AppError } from '../errors/AppError.js'
import {
  readGunInventoryData,
  writeGunInventoryData,
  readAmmoInventoryData,
  writeAmmoInventoryData,
  formatAmmoLabel,
  listAmmo,
  addAmmoPurchase,
  recordAmmoStocktake,
  buildGunsCsv,
  buildGunEventsCsv,
  buildAmmoCsv,
  buildAmmoEventsCsv,
} from './ammo-inventory-service.js'

export {
  listAmmo,
  addAmmoPurchase,
  recordAmmoStocktake,
  buildGunsCsv,
  buildGunEventsCsv,
  buildAmmoCsv,
  buildAmmoEventsCsv,
}

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

  const cacheKey = `${groupId}:${requiredRole}:${normalizedEmail}:${normalizedName}`
  const cached = accessCache.get(cacheKey)
  if (cached && Date.now() - cached.checkedAt < ACCESS_CACHE_TTL_MS) {
    return cached.result
  }

  const members = await ssiGetGroupMembers(groupId, cookies)
  const matchingMember = members.find(m => {
    if (normalizedEmail && m.email) {
      return m.email === normalizedEmail
    }
    if (normalizedName) {
      return String(m.name || '').trim().toLowerCase() === normalizedName
    }
    return false
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

// ============================================================
// Gun Inventory CRUD, Checkout, Return & Maintenance Logic
// ============================================================

function resolveAmmoSelection(ammoList, { defaultAmmoId, ammoMake }) {
  if (defaultAmmoId) {
    const linked = (ammoList || []).find(a => a.id === defaultAmmoId)
    if (linked) {
      return {
        defaultAmmoId: linked.id,
        ammoMake: linked.make,
        defaultAmmoLabel: formatAmmoLabel(linked),
      }
    }
  }
  const cleanAmmoMake = String(ammoMake || '').trim()
  return {
    defaultAmmoId: null,
    ammoMake: cleanAmmoMake,
    defaultAmmoLabel: cleanAmmoMake,
  }
}

export function listGuns({ includeRetired = false } = {}) {
  const { guns } = readGunInventoryData()
  return includeRetired ? guns : guns.filter(g => g.state !== 'retired')
}

export function createGun({ make, model, serialNumber, acquisitionYear, defaultAmmoId = null, ammoMake = '' }) {
  const cleanMake = String(make || '').trim()
  const cleanModel = String(model || '').trim()
  const cleanSerial = String(serialNumber || '').trim()
  const yearNum = Number(acquisitionYear)

  if (!cleanMake || !cleanModel || !cleanSerial) {
    throw new AppError('make, model, and serialNumber are required', 400, 'VALIDATION_ERROR')
  }
  if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
    throw new AppError('acquisitionYear must be a valid year (1900-2100)', 400, 'VALIDATION_ERROR')
  }

  const data = readGunInventoryData()
  if (data.guns.some(g => g.state !== 'retired' && g.serialNumber.toLowerCase() === cleanSerial.toLowerCase())) {
    throw new AppError(`Gun with serial number "${cleanSerial}" already exists`, 409, 'CONFLICT')
  }

  const { ammo } = readAmmoInventoryData()
  const ammoMeta = resolveAmmoSelection(ammo, { defaultAmmoId, ammoMake })

  const gun = {
    id: crypto.randomUUID(),
    make: cleanMake,
    model: cleanModel,
    serialNumber: cleanSerial,
    acquisitionYear: yearNum,
    ...ammoMeta,
    state: 'in_gun_safe',
    timesUsedTotal: 0,
    timesUsedSinceMaintenance: 0,
    cartridgesIssuedTotal: 0,
    cartridgesSinceMaintenance: 0,
    lastMaintenanceAt: null,
    lastMaintenanceBy: null,
    currentCheckout: null,
    maintenanceHistory: [],
    usageHistory: [],
    createdAt: new Date().toISOString(),
  }

  data.guns.push(gun)
  writeGunInventoryData(data)
  return gun
}

export function updateGun(gunId, { make, model, serialNumber, acquisitionYear, defaultAmmoId, ammoMake }) {
  const data = readGunInventoryData()
  const gun = data.guns.find(g => g.id === gunId)
  if (!gun) {
    throw new AppError('Gun not found', 404, 'NOT_FOUND')
  }

  if (make !== undefined) {
    const cleanMake = String(make).trim()
    if (!cleanMake) throw new AppError('make cannot be empty', 400, 'VALIDATION_ERROR')
    gun.make = cleanMake
  }
  if (model !== undefined) {
    const cleanModel = String(model).trim()
    if (!cleanModel) throw new AppError('model cannot be empty', 400, 'VALIDATION_ERROR')
    gun.model = cleanModel
  }
  if (serialNumber !== undefined) {
    const cleanSerial = String(serialNumber).trim()
    if (!cleanSerial) throw new AppError('serialNumber cannot be empty', 400, 'VALIDATION_ERROR')
    if (data.guns.some(g => g.id !== gunId && g.state !== 'retired' && g.serialNumber.toLowerCase() === cleanSerial.toLowerCase())) {
      throw new AppError(`Gun with serial number "${cleanSerial}" already exists`, 409, 'CONFLICT')
    }
    gun.serialNumber = cleanSerial
  }
  if (acquisitionYear !== undefined) {
    const yearNum = Number(acquisitionYear)
    if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
      throw new AppError('acquisitionYear must be a valid year (1900-2100)', 400, 'VALIDATION_ERROR')
    }
    gun.acquisitionYear = yearNum
  }
  if (defaultAmmoId !== undefined || ammoMake !== undefined) {
    const { ammo } = readAmmoInventoryData()
    Object.assign(gun, resolveAmmoSelection(ammo, {
      defaultAmmoId: defaultAmmoId !== undefined ? defaultAmmoId : gun.defaultAmmoId,
      ammoMake: ammoMake !== undefined ? ammoMake : gun.ammoMake,
    }))
  }

  writeGunInventoryData(data)
  return gun
}

export function retireGun(gunId) {
  const data = readGunInventoryData()
  const gun = data.guns.find(g => g.id === gunId)
  if (!gun) {
    throw new AppError('Gun not found', 404, 'NOT_FOUND')
  }
  if (gun.state === 'in_range_use') {
    throw new AppError('Cannot retire a gun while it is in range use', 409, 'CONFLICT')
  }

  gun.state = 'retired'
  gun.currentCheckout = null
  writeGunInventoryData(data)
  return gun
}

export function checkoutGun({
  gunId,
  shooterName,
  shooterEmail = '',
  cupId = null,
  cupName = '',
  cartridgesGiven,
  ammoId = null,
  checkedOutBy = 'unknown',
}) {
  const cleanShooter = String(shooterName || '').trim()
  if (!cleanShooter) {
    throw new AppError('shooterName is required', 400, 'VALIDATION_ERROR')
  }

  const cfg = loadGunInventoryConfig()
  const rounds = cartridgesGiven === undefined || cartridgesGiven === null
    ? cfg.defaults.cartridgesGiven
    : Number(cartridgesGiven)

  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 5000) {
    throw new AppError('cartridgesGiven must be an integer between 0 and 5000', 400, 'VALIDATION_ERROR')
  }

  const data = readGunInventoryData()
  const gun = data.guns.find(g => g.id === gunId)
  if (!gun) {
    throw new AppError('Gun not found', 404, 'NOT_FOUND')
  }
  if (gun.state !== 'in_gun_safe') {
    throw new AppError(`Gun is not available in gun safe (current state: ${gun.state})`, 409, 'CONFLICT')
  }

  const ammoData = readAmmoInventoryData()
  const resolvedAmmoId = ammoId || gun.defaultAmmoId || null
  let ammoItem = resolvedAmmoId ? ammoData.ammo.find(a => a.id === resolvedAmmoId) : null
  if (!ammoItem && gun.ammoMake) {
    ammoItem = ammoData.ammo.find(a => a.make.toLowerCase() === gun.ammoMake.toLowerCase()) || null
  }

  if (rounds > 0 && ammoItem) {
    ammoItem.calculatedStock = (ammoItem.calculatedStock || 0) - rounds
    ammoItem.totalIssued = (ammoItem.totalIssued || 0) + rounds
    writeAmmoInventoryData(ammoData)
  }

  const nowIso = new Date().toISOString()
  const checkoutRecord = {
    id: crypto.randomUUID(),
    checkedOutAt: nowIso,
    returnedAt: null,
    shooterName: cleanShooter,
    shooterEmail: String(shooterEmail || '').trim(),
    cupId: cupId != null ? String(cupId) : null,
    cupName: String(cupName || '').trim(),
    cartridgesGiven: rounds,
    ammoId: ammoItem?.id || null,
    ammoMake: ammoItem?.make || gun.ammoMake || '',
    ammoLabel: ammoItem ? formatAmmoLabel(ammoItem) : (gun.defaultAmmoLabel || gun.ammoMake || ''),
    checkedOutBy,
  }

  gun.state = 'in_range_use'
  gun.timesUsedTotal = (gun.timesUsedTotal || 0) + 1
  gun.timesUsedSinceMaintenance = (gun.timesUsedSinceMaintenance || 0) + 1
  gun.cartridgesIssuedTotal = (gun.cartridgesIssuedTotal || 0) + rounds
  gun.cartridgesSinceMaintenance = (gun.cartridgesSinceMaintenance || 0) + rounds
  gun.currentCheckout = checkoutRecord
  gun.usageHistory = [checkoutRecord, ...(gun.usageHistory || [])]

  writeGunInventoryData(data)
  return gun
}

export function returnGun({ gunId, returnedBy = 'unknown' }) {
  const data = readGunInventoryData()
  const gun = data.guns.find(g => g.id === gunId)
  if (!gun) {
    throw new AppError('Gun not found', 404, 'NOT_FOUND')
  }
  if (gun.state !== 'in_range_use') {
    throw new AppError('Gun is not currently in range use', 409, 'CONFLICT')
  }

  const nowIso = new Date().toISOString()
  if (gun.currentCheckout && Array.isArray(gun.usageHistory)) {
    const histEntry = gun.usageHistory.find(h => h.id === gun.currentCheckout.id)
    if (histEntry) {
      histEntry.returnedAt = nowIso
      histEntry.returnedBy = returnedBy
    }
  }

  gun.state = 'in_gun_safe'
  gun.currentCheckout = null
  writeGunInventoryData(data)
  return gun
}

export function returnAllGuns({ cupId = null, returnedBy = 'unknown' } = {}) {
  const data = readGunInventoryData()
  const nowIso = new Date().toISOString()
  const returnedGuns = []

  for (const gun of data.guns) {
    if (gun.state !== 'in_range_use') continue
    if (cupId != null && String(gun.currentCheckout?.cupId || '') !== String(cupId)) {
      continue
    }

    if (gun.currentCheckout && Array.isArray(gun.usageHistory)) {
      const histEntry = gun.usageHistory.find(h => h.id === gun.currentCheckout.id)
      if (histEntry) {
        histEntry.returnedAt = nowIso
        histEntry.returnedBy = returnedBy
      }
    }

    gun.state = 'in_gun_safe'
    gun.currentCheckout = null
    returnedGuns.push(gun)
  }

  writeGunInventoryData(data)
  return { returnedCount: returnedGuns.length, guns: returnedGuns }
}

export function recordGunMaintenance({ gunId, notes = '', performedBy = 'unknown' }) {
  const data = readGunInventoryData()
  const gun = data.guns.find(g => g.id === gunId)
  if (!gun) {
    throw new AppError('Gun not found', 404, 'NOT_FOUND')
  }

  const nowIso = new Date().toISOString()
  const entry = {
    id: crypto.randomUUID(),
    timestamp: nowIso,
    performedBy,
    notes: String(notes || '').trim(),
    timesUsedBeforeReset: gun.timesUsedSinceMaintenance || 0,
    cartridgesBeforeReset: gun.cartridgesSinceMaintenance || 0,
  }

  gun.timesUsedSinceMaintenance = 0
  gun.cartridgesSinceMaintenance = 0
  gun.lastMaintenanceAt = nowIso
  gun.lastMaintenanceBy = performedBy
  gun.maintenanceHistory = [entry, ...(gun.maintenanceHistory || [])]

  writeGunInventoryData(data)
  return gun
}
