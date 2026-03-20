// Quick diagnostic script to check event staffing data
import 'dotenv/config'

const BASE = process.env.BASE_URL || 'https://turres-ssi-tools-pr-138.onrender.com'

async function main() {
  // Login
  const loginRes = await fetch(`${BASE}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.PLATFORM_EMAIL, password: process.env.PLATFORM_PASSWORD }),
  })
  const cookie = loginRes.headers.get('set-cookie')?.match(/platform_sid=([^;]+)/)?.[1]
  if (!cookie) { console.error('Login failed'); return }

  // Get status to find tenant
  const statusRes = await fetch(`${BASE}/api/v1/platform/status`, {
    headers: { Cookie: `platform_sid=${cookie}` },
  })
  const status = await statusRes.json()
  const tenantId = status.tenants?.[0]?.id
  console.log('Tenant:', tenantId)

  // Get upcoming staffing
  const upRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/staffing/upcoming`, {
    headers: { Cookie: `platform_sid=${cookie}` },
  })
  const upcoming = await upRes.json()
  
  for (const item of upcoming) {
    console.log('\n=== Event:', item.event.eventName, '===')
    console.log('  ID:', item.event.id)
    console.log('  SSI refs:', JSON.stringify(item.event.ssiReferences))
    console.log('  Template staffing rules:', JSON.stringify(item.event.templateStaffingRules, null, 2))
    console.log('  Needs:')
    for (const need of item.needs) {
      console.log(`    - ${need.roleKey} (${need.roleLabel}): ${need.signups?.length || 0} signups, min=${need.minCount}, max=${need.maxCount}`)
    }

    // Also get detailed staffing
    const detRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/events/${item.event.id}/staffing`, {
      headers: { Cookie: `platform_sid=${cookie}` },
    })
    const det = await detRes.json()
    console.log('  templateStaffingRules from detail:', JSON.stringify(det.templateStaffingRules, null, 2))
  }
}

main().catch(console.error)
