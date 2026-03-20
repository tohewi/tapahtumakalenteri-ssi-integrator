#!/usr/bin/env node
// Runs event creation UAT steps 1-3 (schedule, execute, verify) WITHOUT cleanup.
// User must manually trigger cleanup later.

const args = process.argv.slice(2)
function getArg(name, envName) {
  const idx = args.indexOf(`--${name}`)
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]
  return process.env[envName] || null
}

const BASE_URL = getArg('base-url', 'PLATFORM_BASE_URL') || 'http://localhost:3001'
const EMAIL = getArg('email', 'PLATFORM_EMAIL')
const PASSWORD = getArg('password', 'PLATFORM_PASSWORD')
const TENANT_ID = getArg('tenant-id', 'PLATFORM_TENANT_ID')

if (!EMAIL || !PASSWORD || !TENANT_ID) {
  console.error('Usage: node test-no-cleanup.mjs --base-url <url> --email <email> --password <password> --tenant-id <id>')
  process.exit(1)
}

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
  console.log(`\n[auth] Logging in as ${EMAIL} to ${BASE_URL}...`)
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

  // List templates
  const tplResp = await api('GET', `/tenants/${TENANT_ID}/templates`)
  const templates = tplResp.data.templates || []
  console.log(`[setup] Found ${templates.length} template(s)`)

  const createdEvents = []

  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i]
    const tplName = tpl.name || tpl.id
    const testDate = getFutureDate(30 + i * 7)

    if (!tpl.ssiSeedSnapshot) {
      console.log(`\n  ⏭ SKIP "${tplName}" — no seed snapshot`)
      continue
    }
    if (!tplName.toUpperCase().includes('TEST')) {
      console.log(`\n  ⏭ SKIP "${tplName}" — name missing TEST`)
      continue
    }

    console.log(`\n[test] Template: "${tplName}" (${tpl.id})`)
    console.log(`       isCup: ${tpl.ssiSeedSnapshot?.isCup !== false}`)
    console.log(`       Date: ${testDate}`)

    // Step 1: Schedule
    console.log(`  [1/3] Scheduling event...`)
    const schedule = await api('POST', `/tenants/${TENANT_ID}/events`, {
      templateId: tpl.id,
      dates: [testDate],
    })
    if (schedule.status !== 201) {
      console.log(`  ✗ Schedule failed: ${schedule.status} ${schedule.data.error || ''}`)
      continue
    }
    const eventId = schedule.data.event?.id
    console.log(`  ✓ Scheduled: ${eventId}`)
    createdEvents.push({ eventId, templateName: tplName })

    // Step 2: Execute
    console.log(`  [2/3] Executing SSI creation...`)
    const exec = await api('POST', `/tenants/${TENANT_ID}/events/${eventId}/execute`)
    if (exec.status !== 200) {
      console.log(`  ✗ Execute failed: ${exec.status} ${exec.data.error || ''}`)
      continue
    }
    console.log(`  ✓ SSI creation successful`)

    // Step 3: Verify
    console.log(`  [3/3] Verifying SSI references...`)
    const refs = exec.data.ssiReferences
    if (!refs) {
      console.log(`  ✗ No ssiReferences`)
      continue
    }
    const isCup = tpl.ssiSeedSnapshot.isCup !== false
    if (isCup) {
      console.log(`  ✓ Cup: ${refs.cupUrl} (ID: ${refs.cupId})`)
      for (const m of refs.matches || []) {
        console.log(`    - ${m.name} → ${m.url}`)
      }
    } else {
      console.log(`  ✓ Match: ${refs.cupUrl || refs.url} (ID: ${refs.cupId || refs.id})`)
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`CREATED EVENTS (NOT deleted — verify on SSI):`)
  console.log('='.repeat(60))
  for (const { eventId, templateName } of createdEvents) {
    console.log(`  ${templateName}: ${eventId}`)
  }
  console.log(`\nTo clean up later, delete these event IDs via the platform API.`)
}

main().catch(err => {
  console.error(`\n💥 FATAL: ${err.message}`)
  process.exit(1)
})
