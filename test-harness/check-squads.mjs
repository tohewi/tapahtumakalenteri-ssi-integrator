#!/usr/bin/env node
// Quick script to check squad config in the TEST SRA template seed snapshot

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001'
const EMAIL = 'tohewi@gmail.com'
const PASSWORD = 'H3it0tt0r00!'
const TENANT_ID = 'ten_666e216286d04d8d'

let sessionCookie = ''

async function api(method, path) {
  const url = `${BASE_URL}/api/v1/platform${path}`
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
  })
  return resp.json()
}

async function main() {
  // Login
  const loginResp = await fetch(`${BASE_URL}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: 'manual',
  })
  const setCookie = loginResp.headers.getSetCookie?.() || loginResp.headers.get('set-cookie')?.split(',') || []
  const sidMatch = setCookie.join(';').match(/platform_sid=([^;]+)/)
  if (!sidMatch) throw new Error('Login failed')
  sessionCookie = `platform_sid=${sidMatch[1]}`

  // Get templates
  const data = await api('GET', `/tenants/${TENANT_ID}/templates`)
  const testSra = data.templates.find(t => t.name === 'TEST SRA')
  if (!testSra) { console.log('TEST SRA template not found'); return }

  const snapshot = testSra.ssiSeedSnapshot
  if (!snapshot) { console.log('No seed snapshot'); return }

  console.log('=== TEST SRA Seed Snapshot ===')
  console.log('isCup:', snapshot.isCup)
  console.log('rule:', snapshot.rule)
  console.log('squads count:', snapshot.squads?.length || 0)
  console.log('')

  if (snapshot.squads) {
    for (const sq of snapshot.squads) {
      console.log(`Squad: "${sq.name}"`)
      console.log(`  maxCompetitors: ${sq.maxCompetitors}`)
      console.log(`  registration: ${sq.registration}`)
      console.log(`  All fields:`, JSON.stringify(sq, null, 4))
      console.log('')
    }
  }

  // Also check matches if any
  if (snapshot.matches) {
    for (const m of snapshot.matches) {
      console.log(`Match: "${m.name}" — ${m.squads?.length || 0} squads`)
      for (const sq of m.squads || []) {
        console.log(`  Squad: "${sq.name}" maxCompetitors=${sq.maxCompetitors} registration=${sq.registration || 'N/A'}`)
      }
    }
  }

  // Print top-level settings
  console.log('\n=== Snapshot Settings ===')
  console.log(JSON.stringify(snapshot.settings, null, 2))
}

main().catch(err => console.error(err.message))
