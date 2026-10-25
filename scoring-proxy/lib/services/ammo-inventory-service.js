// ============================================================
// Ammo Inventory, Separate File Storage, Schema Migration & CSV Service (R90)
// ============================================================

import crypto from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from '../logger.js'
import { AppError } from '../errors/AppError.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCAL_DATA_DIR = path.resolve(__dirname, '..', '..', 'data')
const RENDER_PERSISTENT_DIR = '/var/data'

export const GUN_SCHEMA_VERSION = 2
export const AMMO_SCHEMA_VERSION = 2

function resolveWritablePath(envPath, defaultFileName) {
  if (envPath) {
    const dir = path.dirname(envPath)
    if (existsSync(dir) || !envPath.startsWith(RENDER_PERSISTENT_DIR)) {
      return envPath
    }
  }
  const baseDir = existsSync(RENDER_PERSISTENT_DIR) ? RENDER_PERSISTENT_DIR : LOCAL_DATA_DIR
  return path.join(baseDir, defaultFileName)
}

export function getGunDataFilePath() {
  return resolveWritablePath(process.env.GUN_INVENTORY_FILE_PATH, 'gun-inventory.json')
}

export function getAmmoDataFilePath() {
  if (process.env.AMMO_INVENTORY_FILE_PATH) {
    return resolveWritablePath(process.env.AMMO_INVENTORY_FILE_PATH, 'ammo-inventory.json')
  }
  if (process.env.GUN_INVENTORY_FILE_PATH) {
    const gunPath = getGunDataFilePath()
    return path.join(path.dirname(gunPath), 'ammo-inventory.json')
  }
  return resolveWritablePath(null, 'ammo-inventory.json')
}

function atomicWriteJson(filePath, payload) {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const content = JSON.stringify(payload, null, 2)
  const tmpPath = `${filePath}.tmp`
  try {
    writeFileSync(tmpPath, content, 'utf8')
    renameSync(tmpPath, filePath)
  } catch {
    writeFileSync(filePath, content, 'utf8')
    rmSync(tmpPath, { force: true })
  }
}

function retainBackupFile(filePath, oldVersion) {
  const backupPath = `${filePath}.v${oldVersion}.bak.json`
  if (!existsSync(backupPath)) {
    copyFileSync(filePath, backupPath)
  }
  return backupPath
}

function normalizeGunRecord(g = {}) {
  return {
    id: g.id || crypto.randomUUID(),
    make: String(g.make || '').trim(),
    model: String(g.model || '').trim(),
    serialNumber: String(g.serialNumber || '').trim(),
    acquisitionYear: Number(g.acquisitionYear) || new Date().getFullYear(),
    defaultAmmoId: g.defaultAmmoId || null,
    ammoMake: String(g.ammoMake || '').trim(),
    defaultAmmoLabel: String(g.defaultAmmoLabel || g.ammoMake || '').trim(),
    state: g.state || 'in_gun_safe',
    timesUsedTotal: Number(g.timesUsedTotal || 0),
    timesUsedSinceMaintenance: Number(g.timesUsedSinceMaintenance || 0),
    cartridgesIssuedTotal: Number(g.cartridgesIssuedTotal || 0),
    cartridgesSinceMaintenance: Number(g.cartridgesSinceMaintenance || 0),
    lastMaintenanceAt: g.lastMaintenanceAt || null,
    lastMaintenanceBy: g.lastMaintenanceBy || null,
    currentCheckout: g.currentCheckout || null,
    maintenanceHistory: Array.isArray(g.maintenanceHistory) ? g.maintenanceHistory : [],
    usageHistory: Array.isArray(g.usageHistory) ? g.usageHistory : [],
    createdAt: g.createdAt || new Date().toISOString(),
  }
}

function normalizeAmmoRecord(a = {}) {
  const make = String(a.make || '').trim()
  const model = String(a.model || '').trim()
  const caliber = String(a.caliber || '').trim()
  return {
    id: a.id || crypto.randomUUID(),
    make,
    model,
    caliber,
    label: a.label || `${make} ${model} (${caliber})`.trim(),
    calculatedStock: Number(a.calculatedStock ?? 0),
    totalPurchased: Number(a.totalPurchased ?? 0),
    totalIssued: Number(a.totalIssued ?? 0),
    totalSpendEur: Number(a.totalSpendEur ?? 0),
    lastDiscrepancy: a.lastDiscrepancy !== undefined ? a.lastDiscrepancy : null,
    lastStocktakeAt: a.lastStocktakeAt || null,
    purchases: Array.isArray(a.purchases) ? a.purchases : [],
    stocktakes: Array.isArray(a.stocktakes) ? a.stocktakes : [],
    createdAt: a.createdAt || new Date().toISOString(),
  }
}

export function readGunInventoryData() {
  const filePath = getGunDataFilePath()
  if (!existsSync(filePath)) {
    return { schemaVersion: GUN_SCHEMA_VERSION, guns: [] }
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    log.error('[guns] Failed to read or parse existing gun-inventory.json:', err.message)
    throw new AppError('Gun inventory storage is unreadable', 500, 'STORAGE_READ_ERROR')
  }
  if (!Array.isArray(parsed?.guns)) {
    log.error('[guns] Malformed gun-inventory.json: missing guns array')
    throw new AppError('Gun inventory storage is malformed', 500, 'STORAGE_READ_ERROR')
  }

  const fileVersion = Number(parsed.schemaVersion || 1)
  if (fileVersion < GUN_SCHEMA_VERSION) {
    retainBackupFile(filePath, fileVersion)

    // If v1 gun-inventory.json had embedded ammo[], migrate it into separate ammo-inventory.json
    if (Array.isArray(parsed.ammo) && parsed.ammo.length > 0) {
      const ammoData = readAmmoInventoryData()
      const existingIds = new Set(ammoData.ammo.map(a => a.id))
      for (const legacyAmmo of parsed.ammo) {
        const normalized = normalizeAmmoRecord(legacyAmmo)
        if (!existingIds.has(normalized.id)) {
          ammoData.ammo.push(normalized)
          existingIds.add(normalized.id)
        }
      }
      writeAmmoInventoryData(ammoData)
    }

    const migrated = {
      schemaVersion: GUN_SCHEMA_VERSION,
      migratedFromVersion: fileVersion,
      migratedAt: new Date().toISOString(),
      guns: parsed.guns.map(normalizeGunRecord),
    }
    atomicWriteJson(filePath, migrated)
    return migrated
  }

  return parsed
}

export function writeGunInventoryData(data) {
  const filePath = getGunDataFilePath()
  atomicWriteJson(filePath, {
    schemaVersion: GUN_SCHEMA_VERSION,
    guns: Array.isArray(data.guns) ? data.guns : [],
  })
}

export function readAmmoInventoryData() {
  const filePath = getAmmoDataFilePath()
  if (!existsSync(filePath)) {
    return { schemaVersion: AMMO_SCHEMA_VERSION, ammo: [] }
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    log.error('[guns] Failed to read or parse existing ammo-inventory.json:', err.message)
    throw new AppError('Ammo inventory storage is unreadable', 500, 'STORAGE_READ_ERROR')
  }
  if (!Array.isArray(parsed?.ammo)) {
    log.error('[guns] Malformed ammo-inventory.json: missing ammo array')
    throw new AppError('Ammo inventory storage is malformed', 500, 'STORAGE_READ_ERROR')
  }

  const fileVersion = Number(parsed.schemaVersion || 1)
  if (fileVersion < AMMO_SCHEMA_VERSION) {
    retainBackupFile(filePath, fileVersion)
    const migrated = {
      schemaVersion: AMMO_SCHEMA_VERSION,
      migratedFromVersion: fileVersion,
      migratedAt: new Date().toISOString(),
      ammo: parsed.ammo.map(normalizeAmmoRecord),
    }
    atomicWriteJson(filePath, migrated)
    return migrated
  }

  return parsed
}

export function writeAmmoInventoryData(data) {
  const filePath = getAmmoDataFilePath()
  atomicWriteJson(filePath, {
    schemaVersion: AMMO_SCHEMA_VERSION,
    ammo: Array.isArray(data.ammo) ? data.ammo : [],
  })
}

export function formatAmmoLabel(ammo) {
  if (!ammo) return ''
  return `${ammo.make} ${ammo.model} (${ammo.caliber})`.trim()
}

export function listAmmo() {
  const { ammo } = readAmmoInventoryData()
  return ammo
}

export function addAmmoPurchase({
  make,
  model,
  caliber,
  count,
  price = 0,
  store = '',
  purchaseDate = null,
  purchasedBy = 'unknown',
}) {
  const cleanMake = String(make || '').trim()
  const cleanModel = String(model || '').trim()
  const cleanCaliber = String(caliber || '').trim()
  const countNum = Number(count)
  const priceNum = price === '' || price === null || price === undefined ? 0 : Number(price)

  if (!cleanMake || !cleanModel || !cleanCaliber) {
    throw new AppError('make, model, and caliber are required for ammo purchase', 400, 'VALIDATION_ERROR')
  }
  if (!Number.isInteger(countNum) || countNum <= 0 || countNum > 1000000) {
    throw new AppError('count must be a positive integer', 400, 'VALIDATION_ERROR')
  }
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    throw new AppError('price must be a non-negative number', 400, 'VALIDATION_ERROR')
  }

  const data = readAmmoInventoryData()
  let item = data.ammo.find(a =>
    a.make.toLowerCase() === cleanMake.toLowerCase() &&
    a.model.toLowerCase() === cleanModel.toLowerCase() &&
    a.caliber.toLowerCase() === cleanCaliber.toLowerCase()
  )

  const nowIso = new Date().toISOString()
  if (!item) {
    item = {
      id: crypto.randomUUID(),
      make: cleanMake,
      model: cleanModel,
      caliber: cleanCaliber,
      label: `${cleanMake} ${cleanModel} (${cleanCaliber})`,
      calculatedStock: 0,
      totalPurchased: 0,
      totalIssued: 0,
      totalSpendEur: 0,
      lastDiscrepancy: null,
      lastStocktakeAt: null,
      purchases: [],
      stocktakes: [],
      createdAt: nowIso,
    }
    data.ammo.push(item)
  }

  const purchaseRecord = {
    id: crypto.randomUUID(),
    make: item.make,
    model: item.model,
    caliber: item.caliber,
    count: countNum,
    price: Number(priceNum.toFixed(2)),
    store: String(store || '').trim(),
    purchaseDate: purchaseDate ? String(purchaseDate).trim() : nowIso.split('T')[0],
    purchasedBy: String(purchasedBy || 'unknown').trim(),
    createdAt: nowIso,
  }

  item.calculatedStock = (item.calculatedStock || 0) + countNum
  item.totalPurchased = (item.totalPurchased || 0) + countNum
  item.totalSpendEur = Number(((item.totalSpendEur || 0) + priceNum).toFixed(2))
  item.purchases = [purchaseRecord, ...(item.purchases || [])]

  writeAmmoInventoryData(data)
  return item
}

export function recordAmmoStocktake({
  ammoId,
  actualCount,
  notes = '',
  performedBy = 'unknown',
}) {
  const actualNum = Number(actualCount)
  if (!Number.isInteger(actualNum) || actualNum < 0) {
    throw new AppError('actualCount must be a non-negative integer', 400, 'VALIDATION_ERROR')
  }

  const data = readAmmoInventoryData()
  const item = data.ammo.find(a => a.id === ammoId)
  if (!item) {
    throw new AppError('Ammo item not found', 404, 'NOT_FOUND')
  }

  const nowIso = new Date().toISOString()
  const calculatedBefore = item.calculatedStock || 0
  const discrepancy = actualNum - calculatedBefore

  const stocktakeRecord = {
    id: crypto.randomUUID(),
    timestamp: nowIso,
    performedBy: String(performedBy || 'unknown').trim(),
    calculatedBefore,
    actualCount: actualNum,
    discrepancy,
    notes: String(notes || '').trim(),
  }

  item.calculatedStock = actualNum
  item.lastDiscrepancy = discrepancy
  item.lastStocktakeAt = nowIso
  item.stocktakes = [stocktakeRecord, ...(item.stocktakes || [])]

  writeAmmoInventoryData(data)
  return { ammo: item, stocktake: stocktakeRecord }
}

// ============================================================
// RFC 4180 CSV Export Builders (R90-GUN15 & R90-GUN16)
// ============================================================

function csvCell(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsv(headers, rows) {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map(r => r.map(csvCell).join(',')),
  ]
  return lines.join('\r\n') + '\r\n'
}

export function buildGunsCsv() {
  const { guns } = readGunInventoryData()
  const headers = [
    'id', 'make', 'model', 'serialNumber', 'acquisitionYear', 'state',
    'defaultAmmoId', 'ammoMake', 'defaultAmmoLabel',
    'timesUsedTotal', 'timesUsedSinceMaintenance',
    'cartridgesIssuedTotal', 'cartridgesSinceMaintenance',
    'lastMaintenanceAt', 'lastMaintenanceBy',
  ]
  const rows = guns.map(g => [
    g.id, g.make, g.model, g.serialNumber, g.acquisitionYear, g.state,
    g.defaultAmmoId || '', g.ammoMake || '', g.defaultAmmoLabel || '',
    g.timesUsedTotal || 0, g.timesUsedSinceMaintenance || 0,
    g.cartridgesIssuedTotal || 0, g.cartridgesSinceMaintenance || 0,
    g.lastMaintenanceAt || '', g.lastMaintenanceBy || '',
  ])
  return toCsv(headers, rows)
}

export function buildGunEventsCsv() {
  const { guns } = readGunInventoryData()
  const headers = [
    'eventType', 'eventId', 'timestamp', 'returnedAt',
    'gunId', 'gunMake', 'gunModel', 'serialNumber',
    'shooterName', 'shooterEmail', 'cupId', 'cupName',
    'cartridgesGiven', 'ammoMake', 'ammoLabel',
    'actor', 'notes',
  ]
  const rows = []
  for (const g of guns) {
    for (const u of (g.usageHistory || [])) {
      rows.push([
        'checkout', u.id, u.checkedOutAt, u.returnedAt || '',
        g.id, g.make, g.model, g.serialNumber,
        u.shooterName || '', u.shooterEmail || '', u.cupId || '', u.cupName || '',
        u.cartridgesGiven ?? 0, u.ammoMake || g.ammoMake || '', u.ammoLabel || g.defaultAmmoLabel || '',
        u.checkedOutBy || '', '',
      ])
    }
    for (const m of (g.maintenanceHistory || [])) {
      rows.push([
        'maintenance', m.id, m.timestamp, '',
        g.id, g.make, g.model, g.serialNumber,
        '', '', '', '',
        m.cartridgesBeforeReset ?? 0, '', '',
        m.performedBy || '', m.notes || '',
      ])
    }
  }
  return toCsv(headers, rows)
}

export function buildAmmoCsv() {
  const { ammo } = readAmmoInventoryData()
  const headers = [
    'id', 'make', 'model', 'caliber',
    'calculatedStock', 'totalPurchased', 'totalIssued',
    'totalSpendEur', 'lastDiscrepancy', 'lastStocktakeAt',
  ]
  const rows = ammo.map(a => [
    a.id, a.make, a.model, a.caliber,
    a.calculatedStock ?? 0, a.totalPurchased ?? 0, a.totalIssued ?? 0,
    a.totalSpendEur ?? 0, a.lastDiscrepancy ?? '', a.lastStocktakeAt || '',
  ])
  return toCsv(headers, rows)
}

export function buildAmmoEventsCsv() {
  const { ammo } = readAmmoInventoryData()
  const headers = [
    'eventType', 'eventId', 'timestamp',
    'ammoId', 'make', 'model', 'caliber',
    'count', 'priceEur', 'store', 'purchaseDate',
    'calculatedBefore', 'actualCount', 'discrepancy',
    'actor', 'notes',
  ]
  const rows = []
  for (const a of ammo) {
    for (const p of (a.purchases || [])) {
      rows.push([
        'purchase', p.id, p.createdAt,
        a.id, a.make, a.model, a.caliber,
        p.count ?? 0, p.price ?? 0, p.store || '', p.purchaseDate || '',
        '', '', '',
        p.purchasedBy || '', '',
      ])
    }
    for (const s of (a.stocktakes || [])) {
      rows.push([
        'stocktake', s.id, s.timestamp,
        a.id, a.make, a.model, a.caliber,
        '', '', '', '',
        s.calculatedBefore ?? 0, s.actualCount ?? 0, s.discrepancy ?? 0,
        s.performedBy || '', s.notes || '',
      ])
    }
  }
  return toCsv(headers, rows)
}
