#!/usr/bin/env node
// ============================================================
// E2E UAT: Event Creation across ALL disciplines and templates
//
// Tests the full event lifecycle for every template in the tenant:
//   1. Login to platform
//   2. List all templates
//   3. For each template with a seed snapshot:
//      a. Schedule a TEST event (future date)
//      b. Execute SSI creation
//      c. Verify ssiReferences exist
//      d. Delete event (cascading SSI delete)
//   4. Report results
//
// Event names MUST include 'TEST' (enforced by template name).
// All events are cleaned up after test, even on failure.
//
// Usage:
//   node test-event-creation.mjs --base-url http://localhost:3001 \
//     --email user@test.com --password secret --tenant-id ten_xxx
//
// Environment variables (alternative to CLI args):
//   PLATFORM_BASE_URL, PLATFORM_EMAIL, PLATFORM_PASSWORD,
//   PLATFORM_TENANT_ID
// ============================================================

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
  console.error('Usage: node test-event-creation.mjs --base-url <url> --email <email> --password <password> --tenant-id <id>')
  console.error('  Or set PLATFORM_BASE_URL, PLATFORM_EMAIL, PLATFORM_PASSWORD, PLATFORM_TENANT_ID')
  process.exit(1)
}

// ---- HTTP helpers ----

let sessionCookie = ''

async function api(method, path, body = null) {
  const url = `${BASE_URL}/api/v1/platform${path}`
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie,
    },
  }
  if (body) opts.body = JSON.stringify(body)
  const resp = await fetch(url, opts)
  const data = await resp.json().catch(() => ({}))
  return { status: resp.status, data }
}

async function login() {
  console.log(`\n[auth] Logging in as ${EMAIL} to ${BASE_URL}...`)
  const resp = await fetch(`${BASE_URL}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: 'manual',
  })

  const setCookie = resp.headers.getSetCookie?.() || resp.headers.get('set-cookie')?.split(',') || []
  const sidMatch = setCookie.join(';').match(/platform_sid=([^;]+)/)
  if (!sidMatch) {
    const body = await resp.text()
    throw new Error(`Login failed (${resp.status}): ${body}`)
  }

  sessionCookie = `platform_sid=${sidMatch[1]}`
  console.log(`[auth] Login successful`)
}

// ---- Date helpers ----

// Generate a future date that won't conflict with existing events
// Uses dates far in the future (2027) to avoid collisions
function getFutureDate(offsetDays) {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() + 1) // next year
  d.setUTCDate(d.getUTCDate() + offsetDays)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---- Test runner ----

const results = []
const createdEvents = [] // track for cleanup

async function cleanup() {
  if (createdEvents.length === 0) return
  console.log(`\n[cleanup] Deleting ${createdEvents.length} test event(s)...`)
  for (const { eventId, templateName } of createdEvents) {
    try {
      const del = await api('DELETE', `/tenants/${TENANT_ID}/events/${eventId}`)
      if (del.status === 200) {
        console.log(`  ✓ Deleted: ${templateName} (${eventId})`)
      } else {
        console.log(`  ✗ Delete failed for ${templateName} (${eventId}): ${del.status} ${del.data.error || ''}`)
      }
    } catch (err) {
      console.log(`  ✗ Delete error for ${templateName} (${eventId}): ${err.message}`)
    }
  }
}

async function testTemplate(template, dateOffset) {
  const tplName = template.name || template.id
  const testDate = getFutureDate(dateOffset)
  console.log(`\n[test] Template: "${tplName}" (${template.id})`)
  console.log(`       Discipline: ${template.disciplineId || '(none)'}`)
  console.log(`       Seed snapshot: ${template.ssiSeedSnapshot ? 'yes' : 'NO'}`)
  console.log(`       isCup: ${template.ssiSeedSnapshot?.isCup !== false}`)
  console.log(`       Date: ${testDate}`)

  if (!template.ssiSeedSnapshot) {
    console.log(`  ⏭ SKIP — no seed snapshot`)
    results.push({ template: tplName, status: 'skipped', reason: 'no seed snapshot' })
    return
  }

  // Verify the template name includes TEST (safety check)
  if (!tplName.toUpperCase().includes('TEST')) {
    console.log(`  ⏭ SKIP — template name does not contain 'TEST' (safety: ${tplName})`)
    results.push({ template: tplName, status: 'skipped', reason: 'name missing TEST' })
    return
  }

  // Step 1: Schedule event
  console.log(`  [1/4] Scheduling event...`)
  const schedule = await api('POST', `/tenants/${TENANT_ID}/events`, {
    templateId: template.id,
    dates: [testDate],
  })
  if (schedule.status !== 201) {
    console.log(`  ✗ Schedule failed: ${schedule.status} ${schedule.data.error || JSON.stringify(schedule.data)}`)
    results.push({ template: tplName, status: 'FAIL', step: 'schedule', error: schedule.data.error })
    return
  }
  const eventId = schedule.data.event?.id
  if (!eventId) {
    console.log(`  ✗ No event ID in response`)
    results.push({ template: tplName, status: 'FAIL', step: 'schedule', error: 'no event ID' })
    return
  }
  createdEvents.push({ eventId, templateName: tplName })
  console.log(`  ✓ Scheduled: ${eventId}`)

  // Step 2: Execute SSI creation
  console.log(`  [2/4] Executing SSI creation...`)
  const exec = await api('POST', `/tenants/${TENANT_ID}/events/${eventId}/execute`)
  if (exec.status !== 200) {
    console.log(`  ✗ Execute failed: ${exec.status} ${exec.data.error || JSON.stringify(exec.data)}`)
    results.push({ template: tplName, status: 'FAIL', step: 'execute', error: exec.data.error })
    return
  }
  console.log(`  ✓ SSI creation successful`)

  // Step 3: Verify SSI references
  console.log(`  [3/4] Verifying SSI references...`)
  const refs = exec.data.ssiReferences
  if (!refs) {
    console.log(`  ✗ No ssiReferences in response`)
    results.push({ template: tplName, status: 'FAIL', step: 'verify', error: 'no ssiReferences' })
    return
  }

  const isCup = template.ssiSeedSnapshot.isCup !== false
  if (isCup) {
    if (!refs.cupId || !refs.cupUrl) {
      console.log(`  ✗ Missing cupId/cupUrl: ${JSON.stringify(refs)}`)
      results.push({ template: tplName, status: 'FAIL', step: 'verify', error: 'missing cup refs' })
      return
    }
    console.log(`  ✓ Cup: ${refs.cupUrl} (ID: ${refs.cupId})`)
    console.log(`    Matches: ${refs.matches?.length || 0}`)
    for (const m of refs.matches || []) {
      console.log(`    - ${m.name} → ${m.url}`)
    }
  } else {
    // Standalone match
    if (!refs.cupId && !refs.id) {
      console.log(`  ✗ Missing event ID in refs: ${JSON.stringify(refs)}`)
      results.push({ template: tplName, status: 'FAIL', step: 'verify', error: 'missing event refs' })
      return
    }
    console.log(`  ✓ Match: ${refs.cupUrl || refs.url} (ID: ${refs.cupId || refs.id})`)
  }

  // Step 4: Delete event (cascading SSI delete)
  console.log(`  [4/4] Deleting event (cascading SSI delete)...`)
  const del = await api('DELETE', `/tenants/${TENANT_ID}/events/${eventId}`)
  if (del.status !== 200) {
    console.log(`  ✗ Delete failed: ${del.status} ${del.data.error || ''}`)
    results.push({ template: tplName, status: 'FAIL', step: 'delete', error: del.data.error })
    return
  }

  // Remove from cleanup list since we already deleted
  const idx = createdEvents.findIndex(e => e.eventId === eventId)
  if (idx !== -1) createdEvents.splice(idx, 1)

  console.log(`  ✓ Deleted from SSI and local DB`)
  results.push({ template: tplName, status: 'PASS' })
}

// ---- Main ----

async function main() {
  const startTime = Date.now()

  try {
    await login()

    // List all templates for the tenant
    console.log(`\n[setup] Fetching templates for tenant ${TENANT_ID}...`)
    const tplResp = await api('GET', `/tenants/${TENANT_ID}/templates`)
    if (tplResp.status !== 200) {
      throw new Error(`Failed to list templates: ${tplResp.status} ${tplResp.data.error || ''}`)
    }
    const templates = tplResp.data.templates || []
    console.log(`[setup] Found ${templates.length} template(s)`)

    if (templates.length === 0) {
      console.log('\n⚠ No templates found — nothing to test')
      process.exit(0)
    }

    // List disciplines for context
    const discResp = await api('GET', `/tenants/${TENANT_ID}/disciplines`)
    const disciplines = discResp.data.disciplines || []
    console.log(`[setup] Found ${disciplines.length} discipline(s):`)
    for (const d of disciplines) {
      console.log(`  - ${d.name} (${d.id}) ssiCreateUrl=${d.ssiCreateUrl || '(none)'}`)
    }

    // Test each template with a unique future date
    for (let i = 0; i < templates.length; i++) {
      await testTemplate(templates[i], 30 + i * 7) // spread dates 7 days apart
    }

  } catch (err) {
    console.error(`\n💥 FATAL: ${err.message}`)
    results.push({ template: '(setup)', status: 'FAIL', error: err.message })
  } finally {
    // Always clean up any remaining events
    await cleanup()
  }

  // ---- Report ----
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const skipped = results.filter(r => r.status === 'skipped').length

  console.log('\n' + '='.repeat(60))
  console.log(`EVENT CREATION UAT RESULTS (${elapsed}s)`)
  console.log('='.repeat(60))
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭'
    const detail = r.error ? ` — ${r.step}: ${r.error}` : r.reason ? ` — ${r.reason}` : ''
    console.log(`  ${icon} ${r.template}${detail}`)
  }
  console.log(`\n  Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`)
  console.log('='.repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

main()
