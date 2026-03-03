// Debug: check squad data after a signup to understand why TC-11 fails
import 'dotenv/config'

const BASE = process.env.BASE_URL || 'https://turres-ssi-tools-pr-138.onrender.com'
const EMAIL = process.env.PLATFORM_EMAIL

async function main() {
  const loginRes = await fetch(`${BASE}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: process.env.PLATFORM_PASSWORD }),
  })
  const cookie = loginRes.headers.get('set-cookie')?.match(/platform_sid=([^;]+)/)?.[1]
  if (!cookie) { console.error('Login failed'); return }

  const statusRes = await fetch(`${BASE}/api/v1/platform/status`, { headers: { Cookie: `platform_sid=${cookie}` } })
  const status = await statusRes.json()
  const tenantId = status.tenants?.[0]?.id

  // Find SRA event
  const upRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/staffing/upcoming`, { headers: { Cookie: `platform_sid=${cookie}` } })
  const upcoming = await upRes.json()
  const sra = upcoming.find(i => (i.event.eventName || '').includes('TR-SRA'))
  if (!sra) { console.error('No SRA event found'); return }
  console.log('SRA Event:', sra.event.eventName, sra.event.id)

  // Check squad data BEFORE signup
  const sqBefore = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/events/${sra.event.id}/test/ssi-squads`, { headers: { Cookie: `platform_sid=${cookie}` } })
  const sqBeforeData = await sqBefore.json()
  console.log('\nStaffSquadName:', sqBeforeData.staffSquadName)
  console.log('Squads:')
  for (const sq of sqBeforeData.squads) {
    const myEntries = sq.competitors.filter(c => c.email?.toLowerCase() === EMAIL.toLowerCase())
    console.log(`  Squad ${sq.number} (${sq.label}): ${sq.competitors.length} competitors`)
    if (myEntries.length > 0) {
      console.log(`    *** MY ENTRIES:`, myEntries.map(c => `id=${c.id} status=${c.status} email=${c.email} name=${c.name}`))
    }
  }

  // Find all my entries across all squads
  const allMyEntries = sqBeforeData.squads.flatMap(sq => 
    sq.competitors.filter(c => c.email?.toLowerCase() === EMAIL.toLowerCase()).map(c => ({ ...c, squadNum: sq.number, squadLabel: sq.label }))
  )
  console.log('\nAll my entries across squads:', allMyEntries.length)
  for (const e of allMyEntries) {
    console.log(`  Squad ${e.squadNum}: id=${e.id} status=${e.status} email=${e.email}`)
  }
}

main().catch(console.error)
