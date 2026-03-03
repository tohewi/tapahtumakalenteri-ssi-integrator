// Diagnostic: trace SSI GraphQL squad → competitor → shooter → email
// Run: node e2e/debug-graphql-squads.js
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })

const BASE = process.env.BASE_URL || 'https://turres-ssi-tools-pr-138.onrender.com'

async function main() {
  // Step 1: Login to platform
  const loginRes = await fetch(`${BASE}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.PLATFORM_EMAIL, password: process.env.PLATFORM_PASSWORD }),
  })
  const cookie = loginRes.headers.get('set-cookie')?.match(/platform_sid=([^;]+)/)?.[1]
  if (!cookie) { console.error('Login failed'); return }
  const headers = { Cookie: `platform_sid=${cookie}` }

  // Step 2: Get tenant
  const statusRes = await fetch(`${BASE}/api/v1/platform/status`, { headers })
  const status = await statusRes.json()
  const tenantId = status.tenants?.[0]?.id
  console.log('Tenant:', tenantId)

  // Step 3: Find an SRA event
  const upRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/staffing/upcoming`, { headers })
  const upcoming = await upRes.json()
  const sraItem = upcoming.find(i => (i.event.eventName || '').includes('TR-SRA'))
  if (!sraItem) { console.error('No SRA event found'); return }
  console.log('SRA Event:', sraItem.event.id, sraItem.event.eventName)
  console.log('SSI References:', JSON.stringify(sraItem.event.ssiReferences, null, 2))

  // Step 4: Get squad data via the test endpoint (which uses GraphQL internally)
  const sqRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/events/${sraItem.event.id}/test/ssi-squads`, { headers })
  const sqData = await sqRes.json()
  console.log('\nstaffSquadName:', sqData.staffSquadName)

  console.log('\n=== ALL SQUADS ===')
  for (const sq of sqData.squads) {
    console.log(`\nSquad #${sq.number} "${sq.label}" (${sq.competitors.length} competitors):`)
    for (const c of sq.competitors) {
      console.log(`  - id=${c.id} status=${c.status} email=${c.email || 'NULL'} name="${c.name}"`)
    }
  }

  // Step 5: Now query GraphQL directly to see raw __typename and field availability
  // We need the SSI event ID and content type from the references
  const refs = sraItem.event.ssiReferences || {}
  const ssiEventId = refs.eventId || refs.matchId
  const ct = refs.contentType || (refs.isCup ? 136 : 91)
  console.log(`\n=== DIRECT GraphQL: event(content_type: ${ct}, id: "${ssiEventId}") ===`)

  // Step 5a: Query with __typename on squads AND competitors
  const gqlRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/events/${sraItem.event.id}/test/ssi-squads`, { headers })
  // The test endpoint already includes __typename from our diagnostic logging
  // But let's also look at the raw GraphQL via a custom query if we can

  // Step 6: Check if the test endpoint returns the data we need
  console.log('\n=== SUMMARY ===')
  const trainerSquad = sqData.squads.find(s => 
    s.label === sqData.staffSquadName || s.comment === sqData.staffSquadName || `Squad ${s.number}` === sqData.staffSquadName
  )
  if (trainerSquad) {
    console.log(`Trainer squad: #${trainerSquad.number} "${trainerSquad.label}"`)
    console.log(`Total competitors: ${trainerSquad.competitors.length}`)
    const withEmail = trainerSquad.competitors.filter(c => c.email)
    const withoutEmail = trainerSquad.competitors.filter(c => !c.email)
    console.log(`With email: ${withEmail.length}`)
    withEmail.forEach(c => console.log(`  ✅ ${c.email} (status=${c.status})`))
    console.log(`Without email (NULL): ${withoutEmail.length}`)
    withoutEmail.forEach(c => console.log(`  ❌ name="${c.name}" id=${c.id} (status=${c.status})`))
  }
}

main().catch(console.error)
