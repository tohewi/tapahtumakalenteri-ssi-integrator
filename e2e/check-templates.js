// Diagnostic: check template staffing rules and update them with staffSquadName
import 'dotenv/config'

const BASE = process.env.BASE_URL || 'https://turres-ssi-tools-pr-138.onrender.com'

async function main() {
  // Login
  const loginRes = await fetch(`${BASE}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.PLATFORM_EMAIL, password: process.env.PLATFORM_PASSWORD }),
  })
  const cookie = loginRes.headers.get('set-cookie')?.match(/platform_sid=([^;]+)/)?.[1]
  if (!cookie) { console.error('Login failed'); return }

  const statusRes = await fetch(`${BASE}/api/v1/platform/status`, {
    headers: { Cookie: `platform_sid=${cookie}` },
  })
  const status = await statusRes.json()
  const tenantId = status.tenants?.[0]?.id
  console.log('Tenant:', tenantId)

  // Get templates
  const tplRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/templates`, {
    headers: { Cookie: `platform_sid=${cookie}` },
  })
  const tplBody = await tplRes.json()
  console.log('Templates response type:', typeof tplBody, Array.isArray(tplBody) ? 'array' : '')
  console.log('Templates response keys:', Object.keys(tplBody))
  const templates = Array.isArray(tplBody) ? tplBody : (tplBody.templates || tplBody.data || [])
  
  for (const tpl of templates) {
    console.log(`\n=== Template: ${tpl.name} (${tpl.id}) ===`)
    console.log('  Discipline:', tpl.disciplineId)
    console.log('  Staffing rules:', JSON.stringify(tpl.staffingRules, null, 2))
  }
}

main().catch(console.error)
