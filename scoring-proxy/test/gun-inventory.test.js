import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ssiGetGroupMembers } from '../lib/ssi-core/management.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { createGunsRouter } from '../routes/guns.js'
import {
  loadGunInventoryConfig,
  verifyGunInventoryAdminAccess,
  clearGunAdminAccessCache,
  listGuns,
  createGun,
  updateGun,
  retireGun,
  checkoutGun,
  returnGun,
  returnAllGuns,
  recordGunMaintenance,
} from '../lib/services/gun-inventory-service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_INVENTORY_FILE = path.resolve(__dirname, '../data/test-gun-inventory.json')

const SAMPLE_GROUP_HTML = `
  <table>
    <thead>
      <tr><th></th><th>Actions</th><th>Name</th><th>Contact</th><th>Officials</th><th>Role</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><input type="checkbox" value="501" /></td>
        <td>Edit</td>
        <td>Tommi Wiren</td>
        <td>tommi@example.com +358401234567</td>
        <td>MD</td>
        <td>admin</td>
      </tr>
      <tr>
        <td><input type="checkbox" value="502" /></td>
        <td>Edit</td>
        <td>Matti Staff</td>
        <td>matti.staff@example.com</td>
        <td>RO</td>
        <td>staff</td>
      </tr>
    </tbody>
  </table>
`

beforeEach(() => {
  clearGunAdminAccessCache()
  delete process.env.SSI_GUN_INVENTORY_GROUP_ID
  process.env.GUN_INVENTORY_FILE_PATH = TEST_INVENTORY_FILE
  rmSync(TEST_INVENTORY_FILE, { force: true })
})

afterEach(() => {
  rmSync(TEST_INVENTORY_FILE, { force: true })
  delete process.env.GUN_INVENTORY_FILE_PATH
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('R90-GUN1: SSI Group 25874 Admin Access Control', () => {
  it('loads default groupId 25874 and allows SSI_GUN_INVENTORY_GROUP_ID override', () => {
    const cfg = loadGunInventoryConfig()
    expect(cfg.accessControl.groupId).toBe('25874')
    expect(cfg.accessControl.requiredRole).toBe('admin')
    expect(cfg.defaults.cartridgesGiven).toBe(100)

    process.env.SSI_GUN_INVENTORY_GROUP_ID = '99999'
    const overridden = loadGunInventoryConfig()
    expect(overridden.accessControl.groupId).toBe('99999')
  })

  it('scrapes group members and roles from /groups/25874/', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SAMPLE_GROUP_HTML,
    }))

    const members = await ssiGetGroupMembers('25874', { sessionid: 'abc' })
    expect(members).toHaveLength(2)
    expect(members[0]).toMatchObject({
      userId: '501',
      name: 'Tommi Wiren',
      email: 'tommi@example.com',
      role: 'admin',
    })
    expect(members[1]).toMatchObject({
      userId: '502',
      name: 'Matti Staff',
      email: 'matti.staff@example.com',
      role: 'staff',
    })
  })

  it('grants access only to group members with role admin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SAMPLE_GROUP_HTML,
    }))

    const adminRes = await verifyGunInventoryAdminAccess({
      userEmail: 'tommi@example.com',
      cookies: { sessionid: 'abc' },
    })
    expect(adminRes.allowed).toBe(true)
    expect(adminRes.userRole).toBe('admin')

    const staffRes = await verifyGunInventoryAdminAccess({
      userEmail: 'matti.staff@example.com',
      cookies: { sessionid: 'abc' },
    })
    expect(staffRes.allowed).toBe(false)
    expect(staffRes.reason).toBe('insufficient_role')

    const outsiderRes = await verifyGunInventoryAdminAccess({
      userEmail: 'outsider@example.com',
      cookies: { sessionid: 'abc' },
    })
    expect(outsiderRes.allowed).toBe(false)
    expect(outsiderRes.reason).toBe('not_in_group')

    // Regression: substring email (e.g. "mmi@example.com" inside "tommi@example.com") must NOT match
    const substringRes = await verifyGunInventoryAdminAccess({
      userEmail: 'mmi@example.com',
      cookies: { sessionid: 'abc' },
    })
    expect(substringRes.allowed).toBe(false)
    expect(substringRes.reason).toBe('not_in_group')
  })
})

describe('R90-GUN2..GUN5: Gun Inventory CRUD, Checkout + Cartridges, Return & Maintenance', () => {
  it('creates, updates, lists, and retires guns in JSON store', () => {
    const gun = createGun({
      make: 'CZ',
      model: 'Shadow 2',
      serialNumber: 'CZ-1001',
      acquisitionYear: 2024,
    })
    expect(gun.state).toBe('in_gun_safe')
    expect(gun.timesUsedTotal).toBe(0)
    expect(gun.cartridgesIssuedTotal).toBe(0)

    const updated = updateGun(gun.id, { model: 'Shadow 2 OR' })
    expect(updated.model).toBe('Shadow 2 OR')
    expect(listGuns()).toHaveLength(1)

    retireGun(gun.id)
    expect(listGuns()).toHaveLength(0)
    expect(listGuns({ includeRetired: true })).toHaveLength(1)
  })

  it('tracks Laina-ase checkouts with 100 and 0 cartridges, returns to safe, and resets since-maintenance counters', () => {
    const g1 = createGun({ make: 'Glock', model: '17 Gen5', serialNumber: 'GL-01', acquisitionYear: 2022 })
    const g2 = createGun({ make: 'CZ', model: 'P-10F', serialNumber: 'CZ-02', acquisitionYear: 2023 })

    // Checkout g1 with 100 cartridges (standard Kupittaa Laina-ase)
    const afterCheckout1 = checkoutGun({
      gunId: g1.id,
      shooterName: 'Matti Meikäläinen',
      shooterEmail: 'matti@example.com',
      cupId: '160',
      cupName: 'TurRes Kupittaa CUP',
      cartridgesGiven: 100,
      checkedOutBy: 'tommi@example.com',
    })
    expect(afterCheckout1.state).toBe('in_range_use')
    expect(afterCheckout1.timesUsedTotal).toBe(1)
    expect(afterCheckout1.timesUsedSinceMaintenance).toBe(1)
    expect(afterCheckout1.cartridgesIssuedTotal).toBe(100)
    expect(afterCheckout1.cartridgesSinceMaintenance).toBe(100)
    expect(afterCheckout1.currentCheckout.shooterName).toBe('Matti Meikäläinen')

    // Return g1 and check out again with 0 cartridges (shooter has ammo purchase permit)
    const afterReturn1 = returnGun({ gunId: g1.id, returnedBy: 'tommi@example.com' })
    expect(afterReturn1.state).toBe('in_gun_safe')
    expect(afterReturn1.currentCheckout).toBeNull()

    const afterCheckout2 = checkoutGun({
      gunId: g1.id,
      shooterName: 'Teppo Testaaja',
      cupId: '160',
      cartridgesGiven: 0,
      checkedOutBy: 'tommi@example.com',
    })
    expect(afterCheckout2.timesUsedTotal).toBe(2)
    expect(afterCheckout2.timesUsedSinceMaintenance).toBe(2)
    expect(afterCheckout2.cartridgesIssuedTotal).toBe(100)
    expect(afterCheckout2.cartridgesSinceMaintenance).toBe(100)

    // Checkout g2 as well, then bulk return all guns for cup 160
    checkoutGun({
      gunId: g2.id,
      shooterName: 'Outi Odottaja',
      cupId: '160',
      cartridgesGiven: 100,
      checkedOutBy: 'tommi@example.com',
    })
    const bulk = returnAllGuns({ cupId: '160', returnedBy: 'tommi@example.com' })
    expect(bulk.returnedCount).toBe(2)
    expect(listGuns().every(g => g.state === 'in_gun_safe')).toBe(true)

    // Record cleaning/maintenance on g1 -> resets since-maintenance counters while keeping totals
    const afterMaint = recordGunMaintenance({
      gunId: g1.id,
      notes: 'Puhdistettu ja öljytty',
      performedBy: 'tommi@example.com',
    })
    expect(afterMaint.timesUsedTotal).toBe(2)
    expect(afterMaint.cartridgesIssuedTotal).toBe(100)
    expect(afterMaint.timesUsedSinceMaintenance).toBe(0)
    expect(afterMaint.cartridgesSinceMaintenance).toBe(0)
    expect(afterMaint.maintenanceHistory).toHaveLength(1)
    expect(afterMaint.maintenanceHistory[0].timesUsedBeforeReset).toBe(2)
    expect(afterMaint.maintenanceHistory[0].cartridgesBeforeReset).toBe(100)
  })
})

describe('R90-GUN3..GUN5: /api/v1/guns Express Route Integration', () => {
  function buildApp(userEmail = 'tommi@example.com') {
    const app = express()
    app.use(express.json())
    const requireAuth = () => (req, _res, next) => {
      req.ssiSession = {
        userId: userEmail,
        _userId: userEmail,
        ssiCookies: { sessionid: 'mock-session' },
      }
      next()
    }
    app.use('/api/v1/guns', createGunsRouter({ requireAuth }))
    app.use(errorHandler)
    return app
  }

  async function callApp(app, method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
      const server = app.listen(0, '127.0.0.1', async () => {
        try {
          const { port } = server.address()
          const resp = await originalFetch(`http://127.0.0.1:${port}${urlPath}`, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
          })
          const data = await resp.json()
          server.close(() => resolve({ status: resp.status, data }))
        } catch (err) {
          server.close(() => reject(err))
        }
      })
    })
  }

  const originalFetch = globalThis.fetch

  it('blocks non-admin group members with 403 and allows group 25874 admins to perform full lifecycle', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      if (String(url).startsWith('http://127.0.0.1:')) {
        return originalFetch(url, opts)
      }
      return {
        ok: true,
        status: 200,
        text: async () => SAMPLE_GROUP_HTML,
      }
    }))

    // Non-admin (role=staff in group 25874) -> 403
    const staffApp = buildApp('matti.staff@example.com')
    const denied = await callApp(staffApp, 'GET', '/api/v1/guns')
    expect(denied.status).toBe(403)
    expect(denied.data.groupId).toBe('25874')

    // Admin (role=admin in group 25874) -> 201 create -> checkout -> maintenance -> return
    const adminApp = buildApp('tommi@example.com')
    const created = await callApp(adminApp, 'POST', '/api/v1/guns', {
      make: 'Walther',
      model: 'PDP',
      serialNumber: 'WP-555',
      acquisitionYear: 2024,
    })
    expect(created.status).toBe(201)
    const gunId = created.data.gun.id

    const checkedOut = await callApp(adminApp, 'POST', `/api/v1/guns/${gunId}/checkout`, {
      shooterName: 'Matti Meikäläinen',
      cupId: '160',
      cartridgesGiven: 100,
    })
    expect(checkedOut.status).toBe(200)
    expect(checkedOut.data.gun.state).toBe('in_range_use')
    expect(checkedOut.data.gun.cartridgesIssuedTotal).toBe(100)

    const returned = await callApp(adminApp, 'POST', '/api/v1/guns/return-all', { cupId: '160' })
    expect(returned.status).toBe(200)
    expect(returned.data.returnedCount).toBe(1)

    const maint = await callApp(adminApp, 'POST', `/api/v1/guns/${gunId}/maintenance`, {
      notes: 'Puhdistettu',
    })
    expect(maint.status).toBe(200)
    expect(maint.data.gun.timesUsedSinceMaintenance).toBe(0)
    expect(maint.data.gun.cartridgesSinceMaintenance).toBe(0)
  })
})
