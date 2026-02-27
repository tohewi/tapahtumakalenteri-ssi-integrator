#!/usr/bin/env node
// ============================================================
// Automated Seed Import Test
//
// Logs into the platform, triggers seed import, reports result.
// Usage:
//   node test-seed-import.mjs --base-url https://turres-ssi-tools-pr-138.onrender.com \
//     --email user@test.com --password secret \
//     --tenant-id ten_xxx --template-id tpl_xxx
//
// Environment variables (alternative to CLI args):
//   PLATFORM_BASE_URL, PLATFORM_EMAIL, PLATFORM_PASSWORD,
//   PLATFORM_TENANT_ID, PLATFORM_TEMPLATE_ID
// ============================================================

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
  console.error('Usage: node test-seed-import.mjs --email <email> --password <password>')
  console.error('  Or set PLATFORM_EMAIL and PLATFORM_PASSWORD environment variables')
  process.exit(1)
}

async function login() {
  console.log(`[test] Logging in as ${EMAIL} to ${BASE_URL}...`)
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

  console.log(`[test] Login successful — got session cookie`)
  return `platform_sid=${sidMatch[1]}`
}

async function triggerImport(cookie) {
  const url = `${BASE_URL}/api/v1/platform/tenants/${TENANT_ID}/templates/${TEMPLATE_ID}/import-seed`
  console.log(`[test] Triggering seed import: POST ${url}`)

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
    },
  })

  const data = await resp.json()
  return { status: resp.status, data }
}

// Main
try {
  const cookie = await login()
  const result = await triggerImport(cookie)

  if (result.status === 200 && result.data.success) {
    console.log('\n✅ SEED IMPORT SUCCESSFUL!')
    console.log(`   Event: "${result.data.snapshot?.name}"`)
    console.log(`   Matches: ${result.data.snapshot?.matchCount || 0}`)
    console.log(`   Squads: ${result.data.snapshot?.squads?.length || 0}`)
    if (result.data.snapshot?.matches) {
      for (const m of result.data.snapshot.matches) {
        console.log(`   - Match: "${m.name}" (${m.squads?.length || 0} squads)`)
      }
    }
    process.exit(0)
  } else {
    console.log('\n❌ SEED IMPORT FAILED')
    console.log(`   Status: ${result.status}`)
    console.log(`   Error: ${result.data.error || JSON.stringify(result.data)}`)
    process.exit(1)
  }
} catch (err) {
  console.error(`\n💥 SCRIPT ERROR: ${err.message}`)
  process.exit(2)
}
