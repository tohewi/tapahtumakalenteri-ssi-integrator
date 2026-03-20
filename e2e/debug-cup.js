// Debug: check which cup event the test picks and test the SSI officials endpoint
import 'dotenv/config'

const BASE = process.env.BASE_URL || 'https://turres-ssi-tools-pr-138.onrender.com'

async function main() {
  const loginRes = await fetch(`${BASE}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.PLATFORM_EMAIL, password: process.env.PLATFORM_PASSWORD }),
  })
  const cookie = loginRes.headers.get('set-cookie')?.match(/platform_sid=([^;]+)/)?.[1]
  if (!cookie) { console.error('Login failed'); return }

  const statusRes = await fetch(`${BASE}/api/v1/platform/status`, { headers: { Cookie: `platform_sid=${cookie}` } })
  const status = await statusRes.json()
  const tenantId = status.tenants?.[0]?.id

  // Get upcoming staffing
  const upRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/staffing/upcoming`, { headers: { Cookie: `platform_sid=${cookie}` } })
  const upcoming = await upRes.json()

  // Find all cup events
  for (const item of upcoming) {
    const name = item.event.eventName || ''
    if (!name.includes('Kupittaa')) continue
    
    const refs = item.event.ssiReferences || {}
    console.log(`\n=== ${name} (${item.event.id}) ===`)
    console.log('  cupId:', refs.cupId, 'cupTypeId:', refs.cupTypeId, 'isCup:', refs.isCup)
    console.log('  Expected URL: /event/' + (refs.cupTypeId || '?') + '/' + (refs.cupId || '?') + '/staff/')
    
    // Try the test/ssi-officials endpoint
    const offRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/events/${item.event.id}/test/ssi-officials`, {
      headers: { Cookie: `platform_sid=${cookie}` },
    })
    const offBody = await offRes.json()
    console.log('  Officials response:', offRes.status, JSON.stringify(offBody).substring(0, 200))
  }
}

main().catch(console.error)
