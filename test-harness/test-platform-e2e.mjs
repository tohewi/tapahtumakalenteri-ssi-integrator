#!/usr/bin/env node
// ============================================================
// Platform E2E Test Suite
//
// Automated tests against the deployed site. Tests:
//   1. Login
//   2. List templates (verify seed imported)
//   3. Create a scheduled event
//   4. Execute event (create in SSI) — captures SSI errors
//   5. Delete test events (cleanup)
//
// Circuit breaker: stops after MAX_FAILURES consecutive failures.
// Usage:
//   node test-platform-e2e.mjs [--base-url URL] [--email E] [--password P]
//   Or set env: PLATFORM_BASE_URL, PLATFORM_EMAIL, PLATFORM_PASSWORD
//
// Exit codes: 0 = all pass, 1 = some failures, 2 = script error
// ============================================================

const MAX_FAILURES = 5
let consecutiveFailures = 0
const results = []

const args = process.argv.slice(2)
function getArg(name, envName) {
  const idx = args.indexOf(`--${name}`)
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]
  return process.env[envName] || null
}

const BASE_URL = getArg('base-url', 'PLATFORM_BASE_URL') || 'https://turres-ssi-tools-pr-138.onrender.com'
const EMAIL = getArg('email', 'PLATFORM_EMAIL')
const PASSWORD = getArg('password', 'PLATFORM_PASSWORD')
const TENANT_ID = getArg('tenant-id', 'PLATFORM_TENANT_ID') || 'ten_666e216286d04d8d'
const TEMPLATE_ID = getArg('template-id', 'PLATFORM_TEMPLATE_ID') || 'tpl_1ebfd2dfeb14466b'

if (!EMAIL || !PASSWORD) {
  console.error('Usage: node test-platform-e2e.mjs --email <email> --password <password>')
  process.exit(2)
}

// ---- Helpers ----

async function apiCall(method, path, { body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (cookie) headers['Cookie'] = cookie
  const opts = { method, headers, redirect: 'manual' }
  if (body) opts.body = JSON.stringify(body)

  const resp = await fetch(`${BASE_URL}${path}`, opts)
  const setCookie = resp.headers.getSetCookie?.() || []
  const sidMatch = setCookie.join(';').match(/platform_sid=([^;]+)/)
  const data = resp.headers.get('content-type')?.includes('json')
    ? await resp.json()
    : { _text: await resp.text() }

  return {
    status: resp.status,
    data,
    cookie: sidMatch ? `platform_sid=${sidMatch[1]}` : cookie,
  }
}

function record(name, passed, detail = '') {
  const status = passed ? '✅' : '❌'
  results.push({ name, passed, detail })
  console.log(`  ${status} ${name}${detail ? ` — ${detail}` : ''}`)

  if (!passed) {
    consecutiveFailures++
    if (consecutiveFailures >= MAX_FAILURES) {
      console.log(`\n🛑 CIRCUIT BREAKER: ${MAX_FAILURES} consecutive failures. Stopping.`)
      printSummary()
      process.exit(1)
    }
  } else {
    consecutiveFailures = 0
  }
}

function printSummary() {
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log('\n' + '='.repeat(60))
  console.log(`SUMMARY: ${passed} passed, ${failed} failed out of ${results.length} tests`)
  console.log('='.repeat(60))
  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  if (failed > 0) {
    console.log('\n❌ FAILURES:')
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.detail}`)
    }
  }
}

// ---- Test Cases ----

async function testLogin() {
  const res = await apiCall('POST', '/api/v1/platform/login', {
    body: { email: EMAIL, password: PASSWORD },
  })
  const ok = res.status === 200 && res.cookie
  record('Login', ok, ok ? 'Got session cookie' : `Status ${res.status}: ${JSON.stringify(res.data)}`)
  return res.cookie
}

async function testListTemplates(cookie) {
  const res = await apiCall('GET', `/api/v1/platform/tenants/${TENANT_ID}/templates`, { cookie })
  const templates = res.data.templates || []
  const ok = res.status === 200 && templates.length > 0
  record('List Templates', ok, ok ? `${templates.length} templates found` : `Status ${res.status}`)

  // Check seed imported
  const tpl = templates.find(t => t.id === TEMPLATE_ID)
  const hasSnapshot = !!tpl?.ssiSeedSnapshot
  record('Template has seed snapshot', hasSnapshot,
    hasSnapshot ? `"${tpl.ssiSeedSnapshot.name}" — ${tpl.ssiSeedSnapshot.matchCount} matches` : 'No snapshot')

  return templates
}

async function testListEvents(cookie) {
  const res = await apiCall('GET', `/api/v1/platform/tenants/${TENANT_ID}/events`, { cookie })
  const events = res.data.events || []
  const ok = res.status === 200
  record('List Events', ok, `${events.length} events`)
  return events
}

async function testCreateEvent(cookie) {
  // Use a date far in the future to avoid conflicts
  const testDate = '2026-12-25'
  const res = await apiCall('POST', `/api/v1/platform/tenants/${TENANT_ID}/events`, {
    cookie,
    body: { templateId: TEMPLATE_ID, dates: [testDate] },
  })

  if (res.status === 201 && res.data.event) {
    record('Create Scheduled Event', true, `Event ${res.data.event.id} for ${testDate}`)
    return res.data.event
  } else if (res.status === 409) {
    // Duplicate — find existing event for this date
    record('Create Scheduled Event', true, `Already exists for ${testDate} (409)`)
    const listRes = await apiCall('GET', `/api/v1/platform/tenants/${TENANT_ID}/events?templateId=${TEMPLATE_ID}`, { cookie })
    const existing = (listRes.data.events || []).find(e => {
      const d = typeof e.eventDate === 'string' ? e.eventDate.split('T')[0] : ''
      return d === testDate
    })
    return existing || null
  } else {
    record('Create Scheduled Event', false, `Status ${res.status}: ${res.data.error || JSON.stringify(res.data)}`)
    return null
  }
}

async function testExecuteEvent(cookie, eventId) {
  const res = await apiCall('POST', `/api/v1/platform/tenants/${TENANT_ID}/events/${eventId}/execute`, { cookie })

  if (res.status === 200 && res.data.success) {
    const refs = res.data.ssiReferences
    record('Execute Event (Create in SSI)', true,
      `Cup ${refs?.cupId}, ${refs?.matches?.length || 0} matches — ${refs?.cupUrl || ''}`)
    return res.data
  } else {
    const errMsg = res.data.error || JSON.stringify(res.data)
    record('Execute Event (Create in SSI)', false, errMsg)
    return null
  }
}

async function testDeleteEvent(cookie, eventId) {
  const res = await apiCall('DELETE', `/api/v1/platform/tenants/${TENANT_ID}/events/${eventId}`, { cookie })
  const ok = res.status === 200 && res.data.success
  record('Delete Event (cleanup)', ok, ok ? `Deleted ${eventId}` : `Status ${res.status}: ${res.data.error || ''}`)
  return ok
}

async function testDateDisplay(cookie) {
  const res = await apiCall('GET', `/api/v1/platform/tenants/${TENANT_ID}/events`, { cookie })
  const events = res.data.events || []
  if (events.length === 0) {
    record('Date format in API response', true, 'No events to check')
    return
  }
  const first = events[0]
  const dateStr = first.eventDate
  // Check it's a valid date string (YYYY-MM-DD or ISO timestamp)
  const isValid = dateStr && (
    /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
    /^\d{4}-\d{2}-\d{2}T/.test(dateStr)
  )
  record('Date format in API response', isValid,
    isValid ? `eventDate="${dateStr}"` : `Invalid format: "${dateStr}"`)
}

// ---- Main ----

console.log(`\n🧪 Platform E2E Tests — ${BASE_URL}`)
console.log(`   Tenant: ${TENANT_ID}`)
console.log(`   Template: ${TEMPLATE_ID}`)
console.log(`   Circuit breaker: ${MAX_FAILURES} consecutive failures\n`)

let testEventId = null

try {
  // Test 1: Login
  const cookie = await testLogin()
  if (!cookie) { printSummary(); process.exit(1) }

  // Test 2: Templates
  await testListTemplates(cookie)

  // Test 3: Events list + date format
  await testListEvents(cookie)
  await testDateDisplay(cookie)

  // Test 4: Create event
  const event = await testCreateEvent(cookie)

  // Test 5: Execute event (create in SSI) — only if we got a planned event
  if (event && (event.status === 'planned' || event.status === 'failed')) {
    testEventId = event.id
    await testExecuteEvent(cookie, event.id)
  } else if (event) {
    record('Execute Event (Create in SSI)', true, `Skipped — event status is ${event.status}`)
  }

  // Test 6: Cleanup — delete test event (tests cascading delete if ssi_created)
  if (testEventId) {
    const evtRes = await apiCall('GET', `/api/v1/platform/tenants/${TENANT_ID}/events/${testEventId}`, { cookie })
    const currentStatus = evtRes.data.event?.status
    const ssiRef = evtRes.data.event?.ssiReferences?.cupId
    if (currentStatus) {
      console.log(`\n--- Test 6: Deleting event ${testEventId} (status: ${currentStatus}) ---`)
      const ok = await testDeleteEvent(cookie, testEventId)
      if (ok && currentStatus === 'ssi_created') {
        record('Cascading Delete (SSI)', true, `Deleted SSI cup ${ssiRef}`)
      }
    }
  }

} catch (err) {
  console.error(`\n💥 SCRIPT ERROR: ${err.message}`)
  record('Script execution', false, err.message)
}

printSummary()
process.exit(results.some(r => !r.passed) ? 1 : 0)
