#!/usr/bin/env node
// Test Kupittaa Cup creation via GraphQL WITHOUT cleanup.
// Creates a cup + component matches, verifies, then STOPS for manual SSI check.

const BASE_URL = 'https://turres-ssi-tools-pr-138.onrender.com'
const EMAIL = 'tohewi@gmail.com'
const PASSWORD = 'H3it0tt0r00!'
const TENANT_ID = 'ten_666e216286d04d8d'
const TEMPLATE_ID = 'tpl_1ebfd2dfeb14466b' // Kupittaa Cup

let sessionCookie = ''

async function api(method, path, body = null) {
  const url = `${BASE_URL}/api/v1/platform${path}`
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
  }
  if (body) opts.body = JSON.stringify(body)
  const resp = await fetch(url, opts)
  const data = await resp.json().catch(() => ({}))
  return { status: resp.status, data }
}

function getFutureDate(offsetDays) {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function main() {
  // Login
  console.log(`[auth] Logging in...`)
  const loginResp = await fetch(`${BASE_URL}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: 'manual',
  })
  const setCookie = loginResp.headers.getSetCookie?.() || loginResp.headers.get('set-cookie')?.split(',') || []
  const sidMatch = setCookie.join(';').match(/platform_sid=([^;]+)/)
  if (!sidMatch) throw new Error(`Login failed (${loginResp.status})`)
  sessionCookie = `platform_sid=${sidMatch[1]}`
  console.log(`[auth] Login successful`)

  // Get template info
  const tplResp = await api('GET', `/tenants/${TENANT_ID}/templates`)
  const template = tplResp.data.templates?.find(t => t.id === TEMPLATE_ID)
  if (!template) throw new Error('Kupittaa Cup template not found')
  console.log(`\n[template] "${template.name}" — ${template.ssiSeedSnapshot?.matches?.length || 0} matches, isCup=${template.ssiSeedSnapshot?.isCup}`)

  const testDate = getFutureDate(60)
  console.log(`[test] Date: ${testDate}`)

  // Step 1: Schedule
  console.log(`\n[1/3] Scheduling event...`)
  const schedule = await api('POST', `/tenants/${TENANT_ID}/events`, {
    templateId: TEMPLATE_ID,
    dates: [testDate],
  })
  if (schedule.status !== 201) {
    console.log(`  FAIL: ${schedule.status} ${schedule.data.error || JSON.stringify(schedule.data)}`)
    process.exit(1)
  }
  const eventId = schedule.data.event?.id
  console.log(`  OK: ${eventId}`)

  // Step 2: Execute SSI creation
  console.log(`[2/3] Executing SSI creation (GraphQL cup + matches + web linking + squads)...`)
  const exec = await api('POST', `/tenants/${TENANT_ID}/events/${eventId}/execute`)
  if (exec.status !== 200) {
    console.log(`  FAIL: ${exec.status} ${exec.data.error || JSON.stringify(exec.data)}`)
    console.log(`  Event ID for cleanup: ${eventId}`)
    process.exit(1)
  }
  console.log(`  OK: SSI creation successful`)

  // Step 3: Verify
  console.log(`[3/3] Verifying SSI references...`)
  const refs = exec.data.ssiReferences
  if (!refs) {
    console.log(`  FAIL: No ssiReferences`)
    process.exit(1)
  }

  console.log(`  Cup: ${refs.cupUrl} (ID: ${refs.cupId})`)
  console.log(`  Cup Name: ${refs.cupName}`)
  console.log(`  Matches: ${refs.matches?.length || 0}`)
  for (const m of refs.matches || []) {
    console.log(`    - ${m.name} → ${m.url} (ID: ${m.id})`)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`CUP CREATED — VERIFY ON SSI:`)
  console.log(`  Cup URL: https://shootnscoreit.com/event/${refs.cupTypeId}/${refs.cupId}/`)
  console.log(`  Platform Event ID: ${eventId}`)
  console.log('='.repeat(60))
  console.log(`\nTo clean up: node cleanup-event.mjs --event-id ${eventId}`)
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`)
  process.exit(1)
})
