#!/usr/bin/env node
// Dump the Kupittaa Cup (TEST) seed snapshot for analysis

const BASE_URL = process.env.BASE_URL || 'https://turres-ssi-tools-pr-138.onrender.com'
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

  const data = await api('GET', `/tenants/${TENANT_ID}/templates`)
  
  // Find Kupittaa Cup template (the TEST one)
  const cupTemplate = data.templates.find(t => t.name?.includes('Kupittaa'))
  if (!cupTemplate) {
    console.log('Available templates:', data.templates.map(t => t.name))
    throw new Error('Kupittaa Cup template not found')
  }

  console.log('=== Template ===')
  console.log('Name:', cupTemplate.name)
  console.log('ID:', cupTemplate.id)
  console.log('Discipline ID:', cupTemplate.disciplineId)
  console.log('Overrides:', JSON.stringify(cupTemplate.overrides, null, 2))

  const snapshot = cupTemplate.ssiSeedSnapshot
  if (!snapshot) { console.log('No seed snapshot'); return }

  console.log('\n=== Seed Snapshot (top level) ===')
  console.log('name:', snapshot.name)
  console.log('isCup:', snapshot.isCup)
  console.log('rule:', snapshot.rule)
  console.log('subRule:', snapshot.subRule)
  console.log('serieType:', snapshot.serieType)
  console.log('venue:', snapshot.venue)
  console.log('description:', snapshot.description?.substring(0, 100))
  console.log('information:', snapshot.information?.substring(0, 100))

  console.log('\n=== Settings ===')
  console.log(JSON.stringify(snapshot.settings, null, 2))

  console.log('\n=== Matches ===')
  if (snapshot.matches) {
    for (const m of snapshot.matches) {
      console.log(`\nMatch: "${m.name}"`)
      console.log('  rule:', m.rule)
      console.log('  subRule:', m.subRule)
      console.log('  serieType:', m.serieType)
      console.log('  contentTypeKey:', m.contentTypeKey)
      console.log('  squads:', m.squads?.length || 0)
      console.log('  settings:', JSON.stringify(m.settings, null, 2))
      if (m.squads) {
        for (const sq of m.squads) {
          console.log(`    Squad: "${sq.name}" maxCompetitors=${sq.maxCompetitors} registration=${sq.registration}`)
        }
      }
    }
  }

  console.log('\n=== Squads (top level) ===')
  if (snapshot.squads) {
    for (const sq of snapshot.squads) {
      console.log(`  Squad: "${sq.name}" maxCompetitors=${sq.maxCompetitors} registration=${sq.registration}`)
    }
  } else {
    console.log('  (none)')
  }

  // Also fetch the discipline
  const discResp = await api('GET', `/tenants/${TENANT_ID}/disciplines`)
  const disc = discResp.disciplines?.find(d => d.id === cupTemplate.disciplineId)
  if (disc) {
    console.log('\n=== Discipline ===')
    console.log(JSON.stringify(disc, null, 2))
  }
}

main().catch(err => console.error(err.message))
