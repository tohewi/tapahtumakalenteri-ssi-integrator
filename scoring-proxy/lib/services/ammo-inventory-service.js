// ============================================================
// Ammo Inventory & CSV Export Service (Release 9.0 — R90)
// ============================================================

import crypto from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from '../logger.js'
import { AppError } from '../errors/AppError.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_PATH = path.resolve(__dirname, '..', '..', 'data', 'gun-inventory.json')

export function getDataFilePath() {
  return process.env.GUN_INVENTORY_FILE_PATH || DEFAULT_DATA_PATH
}

export function readInventoryData() {
  const filePath = getDataFilePath()
  if (!existsSync(filePath)) {
    return { guns: [], ammo: [] }
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
  if (!Array.isArray(parsed.ammo)) {
    parsed.ammo = []
  }
  return parsed
}

export function writeInventoryData(data) {
  const filePath = getDataFilePath()
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!Array.isArray(data.ammo)) {
    data.ammo = []
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

export function formatAmmoLabel(ammo) {
  if (!ammo) return ''
  return `${ammo.make} ${ammo.model} (${ammo.caliber})`.trim()
}

export function listAmmo() {
  const { ammo } = readInventoryData()
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

  const data = readInventoryData()
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

  writeInventoryData(data)
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

  const data = readInventoryData()
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

  writeInventoryData(data)
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
  const { guns } = readInventoryData()
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
  const { guns } = readInventoryData()
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
  const { ammo } = readInventoryData()
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
  const { ammo } = readInventoryData()
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
