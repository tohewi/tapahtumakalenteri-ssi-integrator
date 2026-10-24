import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ssiGetGroupMembers } from '../lib/ssi-core/management.js'
import {
  loadGunInventoryConfig,
  verifyGunInventoryAdminAccess,
  clearGunAdminAccessCache,
} from '../lib/services/gun-inventory-service.js'

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
})

afterEach(() => {
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
  })
})
