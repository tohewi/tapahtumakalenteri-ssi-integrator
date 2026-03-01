#!/usr/bin/env node
// ============================================================
// seed-uat-account.mjs — Create (or verify) the UAT owner account
//
// Usage:
//   node test-harness/seed-uat-account.mjs \
//     --base-url https://turres-ssi-tools-pr-42.onrender.com \
//     --email owner@example.com \
//     --password MyPassword123! \
//     --org "UAT Test Organisation"
//
//   Or set env vars: PLATFORM_BASE_URL, PLATFORM_EMAIL,
//                    PLATFORM_PASSWORD, PLATFORM_ORG
//
// Exit codes: 0 = success/already-exists, 1 = unrecoverable error
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
const ORG = getArg('org', 'PLATFORM_ORG') || 'UAT Test Organisation'

if (!EMAIL || !PASSWORD) {
  console.error('Usage: node seed-uat-account.mjs --email <email> --password <password>')
  console.error('  Or set PLATFORM_EMAIL and PLATFORM_PASSWORD env vars')
  process.exit(1)
}

console.log(`Seeding UAT owner account: ${EMAIL} @ ${BASE_URL}`)

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function seed() {
  // 1. Attempt to register the account
  const { status, data } = await post('/api/v1/platform/register', {
    email: EMAIL,
    password: PASSWORD,
    name: 'UAT Owner',
    organizationName: ORG,
  })

  if (status === 201) {
    console.log(`✅ Account created — tenant: ${data.tenantId || '(unknown)'}`)
    return
  }

  if (status === 409 || (data.error && data.error.toLowerCase().includes('already exists'))) {
    console.log('ℹ️  Account already exists — verifying login…')

    // 2. Verify we can log in
    const loginRes = await post('/api/v1/platform/login', { email: EMAIL, password: PASSWORD })
    if (loginRes.status === 200) {
      console.log('✅ Existing account verified — login succeeded')
      return
    }
    console.error(`❌ Account exists but login failed (HTTP ${loginRes.status}):`, loginRes.data)
    process.exit(1)
  }

  console.error(`❌ Registration failed (HTTP ${status}):`, data)
  process.exit(1)
}

seed().catch(err => {
  console.error('❌ Unexpected error:', err.message)
  process.exit(1)
})
