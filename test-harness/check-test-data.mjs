#!/usr/bin/env node
// Quick check: list all tenants and accounts via platform API
// Usage: node check-test-data.mjs [base-url]

const BASE = process.argv[2] || 'https://turres-ssi-tools-pr-138.onrender.com'

async function main() {
  console.log(`\n=== Checking test data on ${BASE} ===\n`)

  // Login as test user
  const loginRes = await fetch(`${BASE}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'tohewi@gmail.com', password: 'H3it0tt0r00!' }),
  })
  const cookie = loginRes.headers.get('set-cookie')?.match(/platform_sid=([^;]+)/)?.[1]
  if (!cookie) {
    console.log('Login failed:', loginRes.status, await loginRes.text())
    return
  }
  const loginData = await loginRes.json()
  console.log('Logged in as:', loginData.account?.email, '(' + loginData.account?.name + ')')
  console.log('Account ID:', loginData.account?.id)
  console.log('MFA enabled:', loginData.account?.mfaEnabled)
  console.log('')

  // List tenants
  console.log('=== Tenants ===')
  for (const t of loginData.tenants || []) {
    console.log(`  ${t.id}  ${t.name}  slug=${t.slug || 'N/A'}  created=${new Date(t.createdAt).toISOString().slice(0, 10)}`)
  }
  console.log(`Total: ${loginData.tenants?.length || 0} tenant(s)\n`)

  // Try admin endpoint (may not have ADMIN_API_KEY set)
  const adminRes = await fetch(`${BASE}/api/v1/admin/overview`, {
    headers: { 'Authorization': 'Bearer admin-test-key' },
  })
  if (adminRes.ok) {
    const data = await adminRes.json()
    console.log('=== Admin Overview ===')
    console.log('Tenants:', data.tenants?.length || 0)
    console.log('Accounts:', data.accounts?.length || 0)
    console.log('SSI Sessions:', data.sessionCount || 0)
    console.log('')
    for (const t of data.tenants || []) {
      console.log(`  Tenant: ${t.name} (${t.id}) — owner: ${t.ownerEmail}, members: ${t.memberCount}`)
    }
    console.log('')
    for (const a of data.accounts || []) {
      console.log(`  Account: ${a.email} (${a.id}) — name: ${a.name}, tenants: ${a.tenantCount}, mfa: ${a.mfaEnabled}`)
    }
  } else {
    console.log('Admin endpoint:', adminRes.status, '(ADMIN_API_KEY not configured or wrong key)')
  }

  // Logout
  await fetch(`${BASE}/api/v1/platform/logout`, {
    method: 'POST',
    headers: { 'Cookie': `platform_sid=${cookie}` },
  })
}

main().catch(err => console.error('Error:', err.message))
