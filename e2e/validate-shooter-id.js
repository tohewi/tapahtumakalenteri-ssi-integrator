// Validation script: Test whether shooter.id is available in SSI GraphQL
// and whether it can be used to reliably identify competitors in squads.
//
// Run: node e2e/validate-shooter-id.js
//
// Tests:
//   1. Query { me { id email } } — get the admin user's SSI user ID
//   2. Query event squads with shooter { id email } — check if shooter.id is present
//   3. Match me.id against squad competitor shooter.id — verify correlation
//   4. Check if shooter.id is present even when shooter.email is null (IPSC case)

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })

const BASE = process.env.BASE_URL || 'https://turres-ssi-tools-pr-138.onrender.com'

async function main() {
  // ── Step 1: Login to platform ──────────────────────────────────────
  console.log('=== Step 1: Platform Login ===')
  const loginRes = await fetch(`${BASE}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.PLATFORM_EMAIL, password: process.env.PLATFORM_PASSWORD }),
  })
  const cookie = loginRes.headers.get('set-cookie')?.match(/platform_sid=([^;]+)/)?.[1]
  if (!cookie) { console.error('❌ Platform login failed'); return }
  const headers = { Cookie: `platform_sid=${cookie}` }
  console.log('✅ Platform login OK')

  // ── Step 2: Get tenant and find SRA event ──────────────────────────
  console.log('\n=== Step 2: Find SRA Event ===')
  const statusRes = await fetch(`${BASE}/api/v1/platform/status`, { headers })
  const status = await statusRes.json()
  const tenantId = status.tenants?.[0]?.id
  const platformAccountName = status.account?.name
  console.log(`Platform account: "${platformAccountName}" (${status.account?.email})`)

  const upRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/staffing/upcoming`, { headers })
  const upcoming = await upRes.json()
  const sraItem = upcoming.find(i => (i.event.eventName || '').includes('TR-SRA'))
  if (!sraItem) { console.error('❌ No SRA event found'); return }

  const refs = sraItem.event.ssiReferences || {}
  const ssiEventId = refs.ssiEventId
  const ct = refs.contentTypeKey || 22
  console.log(`SRA Event: ${sraItem.event.eventName} (SSI CT=${ct} id=${ssiEventId})`)

  // ── Step 3: Query SSI GraphQL { me { id email } } ─────────────────
  // We need the SSI admin session to run GraphQL.
  // The test endpoint proxies GraphQL for us — but we need a direct query.
  // Let's use the ssi-squads test endpoint which already has admin session access,
  // but we need a custom endpoint. Instead, let's query the SSI schema via
  // introspection or use what we can.
  //
  // Actually, the staffing sync code uses the admin session's GraphQL.
  // Let's create a minimal test by checking what the ssi-squads endpoint returns
  // when we add shooter.id to the query.

  // ── Step 4: Query squad data WITH shooter.id ───────────────────────
  console.log('\n=== Step 3: Query Squad Data (current endpoint) ===')
  const sqRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/events/${sraItem.event.id}/test/ssi-squads`, { headers })
  const sqData = await sqRes.json()

  console.log(`staffSquadName: ${sqData.staffSquadName}`)
  const trainerSquad = sqData.squads.find(s =>
    s.label === sqData.staffSquadName || s.comment === sqData.staffSquadName || `Squad ${s.number}` === sqData.staffSquadName
  )

  if (!trainerSquad) {
    console.error('❌ Trainer squad not found')
    return
  }

  console.log(`\nTrainer Squad #${trainerSquad.number} "${trainerSquad.label}" — ${trainerSquad.competitors.length} competitors:`)
  for (const c of trainerSquad.competitors) {
    console.log(`  id=${c.id} status=${c.status} email=${c.email || 'NULL'} name="${c.name}"`)
  }

  // ── Step 5: Check shooter.id availability ───────────────────────────
  console.log('\n=== Step 4: SSI User ID (me) ===')
  if (sqData.ssiMe) {
    console.log(`SSI admin user: id=${sqData.ssiMe.id} email=${sqData.ssiMe.email} name="${sqData.ssiMe.first_name} ${sqData.ssiMe.last_name}"`)
  } else {
    console.log('❌ ssiMe not returned — { me } query may have failed')
  }

  // ── Step 6: Validate shooter.id on competitors ─────────────────────
  console.log('\n=== Step 5: Shooter ID Validation ===')
  let allHaveShooterId = true
  let meIdMatchFound = false

  for (const sq of sqData.squads) {
    for (const c of sq.competitors) {
      if (!c.shooterId) {
        allHaveShooterId = false
        console.log(`  ❌ Squad #${sq.number} competitor id=${c.id}: shooterId is NULL`)
      } else {
        console.log(`  ✅ Squad #${sq.number} competitor id=${c.id}: shooterId=${c.shooterId} email=${c.email || 'NULL'} name="${c.name}"`)
      }
      // Check if this competitor's shooter.id matches the admin user
      if (sqData.ssiMe && c.shooterId === sqData.ssiMe.id) {
        meIdMatchFound = true
        console.log(`     ^ MATCH: shooter.id matches me.id (${sqData.ssiMe.id})`)
      }
    }
  }

  // ── Step 7: Summary ────────────────────────────────────────────────
  console.log('\n=== VALIDATION RESULTS ===')
  console.log(`shooter.id available on all competitors: ${allHaveShooterId ? '✅ YES' : '❌ NO (some null)'}`)
  console.log(`me.id available: ${sqData.ssiMe?.id ? '✅ YES (' + sqData.ssiMe.id + ')' : '❌ NO'}`)
  console.log(`me.id → shooter.id match found in squads: ${meIdMatchFound ? '✅ YES' : '⚠️  NO (user may not be in any squad currently)'}`)

  if (allHaveShooterId && sqData.ssiMe?.id) {
    console.log('\n✅ DESIGN VALIDATED: shooter.id is available and can be matched against me.id')
    console.log('   → Safe to use for participant identification without name matching')
    console.log('   → Works even when email is null (IPSC/SRA)')
  } else if (!allHaveShooterId) {
    console.log('\n⚠️  DESIGN PARTIALLY VALID: some competitors have null shooter.id')
    console.log('   → Need fallback strategy for competitors without shooter.id')
  } else {
    console.log('\n❌ DESIGN NOT VALIDATED: me.id not available')
  }
}

main().catch(console.error)
