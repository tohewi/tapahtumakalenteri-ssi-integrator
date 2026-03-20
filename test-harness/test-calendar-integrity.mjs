#!/usr/bin/env node
// ============================================================
// Calendar Integrity Check E2E Test (BLD-3)
//
// Tests the calendar data integrity check endpoint (CAL-6).
//
// Usage:
//   node test-calendar-integrity.mjs --email <email> --password <password> \
//     --tenant-id <id> [--base-url <url>] [--live-check]
//
// Exit codes: 0 = pass, 1 = integrity issues found, 2 = script error
// ============================================================

const args = process.argv.slice(2)
function getArg(name, envName) {
  const idx = args.indexOf('--' + name)
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]
  return process.env[envName] || null
}

const BASE_URL = getArg('base-url', 'PLATFORM_BASE_URL') || 'http://localhost:3001'
const EMAIL = getArg('email', 'PLATFORM_EMAIL')
const PASSWORD = getArg('password', 'PLATFORM_PASSWORD')
const TENANT_ID = getArg('tenant-id', 'PLATFORM_TENANT_ID')
const LIVE_CHECK = args.includes('--live-check')

if (!EMAIL || !PASSWORD || !TENANT_ID) {
  console.error('Usage: node test-calendar-integrity.mjs --email <email> --password <password> --tenant-id <id>')
  process.exit(2)
}

async function apiCall(method, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (opts.cookie) headers['Cookie'] = opts.cookie
  const fetchOpts = { method, headers }
  if (opts.body) fetchOpts.body = JSON.stringify(opts.body)
  const resp = await fetch(BASE_URL + path, fetchOpts)
  const setCookie = resp.headers.getSetCookie ? resp.headers.getSetCookie() : []
  const sidMatch = setCookie.join(';').match(/platform_sid=([^;]+)/)
  const data = resp.headers.get('content-type')?.includes('json') ? await resp.json() : {}
  return { status: resp.status, data, cookie: sidMatch ? 'platform_sid=' + sidMatch[1] : opts.cookie }
}

async function main() {
  console.log('\n--- Calendar Integrity Check E2E ---')
  console.log('Target:', BASE_URL)
  console.log('Tenant:', TENANT_ID)
  console.log('Live WP check:', LIVE_CHECK ? 'YES' : 'NO (DB only)')
  console.log('')

  // 1. Login
  const loginRes = await apiCall('POST', '/api/v1/platform/login', { body: { email: EMAIL, password: PASSWORD } })
  if (loginRes.status !== 200 || !loginRes.cookie) {
    console.error('Login failed:', loginRes.status, loginRes.data)
    process.exit(2)
  }
  console.log('Logged in as', EMAIL)

  // 2. Run integrity check
  const res = await apiCall('POST', '/api/v1/platform/tenants/' + TENANT_ID + '/events/integrity-check', {
    cookie: loginRes.cookie,
    body: { liveCheck: LIVE_CHECK },
  })

  if (res.status !== 200) {
    console.error('Integrity check failed:', res.status, res.data)
    process.exit(2)
  }

  const r = res.data
  const s = r.summary || {}
  console.log('\n--- Results ---')
  console.log('Status:', s.passed ? 'PASSED' : 'FAILED')
  console.log('Issues:', s.issueCount || 0, '(' + (s.errorCount || 0) + ' errors, ' + (s.warningCount || 0) + ' warnings)')
  console.log('Events checked:', s.totalEvents || 0)
  if (r.wpAuthError) console.log('WP auth:', r.wpAuthError)

  if (r.issues && r.issues.length > 0) {
    console.log('\nIssues:')
    for (const issue of r.issues) {
      const icon = issue.severity === 'error' ? 'x' : '!'
      console.log('  [' + icon + '] ' + issue.type + ': ' + issue.message)
      if (issue.details) console.log('      Details:', JSON.stringify(issue.details))
    }
  }

  console.log('')
  process.exit(s.passed ? 0 : 1)
}

main().catch(err => { console.error('Script error:', err.message); process.exit(2) })
