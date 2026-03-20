// Update template staffing rules with staffSquadName and SSI role mappings
import 'dotenv/config'

const BASE = process.env.BASE_URL || 'http://localhost:3001'

async function main() {
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

  // SRA templates: add staffSquadName and SSI role mappings
  const sraTemplates = ['tpl_013c739e4e27498c', 'tpl_1701ab13cc724a41'] // Temppeli Oldies + TEST SRA
  for (const tplId of sraTemplates) {
    const res = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/templates/${tplId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `platform_sid=${cookie}` },
      body: JSON.stringify({
        staffingRules: {
          staffSquadName: 'Squad 5',
          roles: [
            { key: 'ro', max: 6, min: 4, label: 'Range Officer', ssiOfficialCode: 'RO', ssiMgmtRole: '1' },
            { key: 'md', max: 1, min: 1, label: 'Match Director', ssiOfficialCode: 'MD', ssiMgmtRole: '1' },
            { key: 'qm', max: 1, min: 1, label: 'Quarter Master', ssiOfficialCode: 'QM', ssiMgmtRole: '1' },
          ]
        }
      }),
    })
    const body = await res.json()
    console.log(`Updated ${tplId}:`, res.status, body.success ? 'OK' : body.error)
  }

  // Kupittaa Cup template: SSI role mappings (no trainer squad for cups)
  const cupTplId = 'tpl_1ebfd2dfeb14466b'
  const cupRes = await fetch(`${BASE}/api/v1/platform/tenants/${tenantId}/templates/${cupTplId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `platform_sid=${cookie}` },
    body: JSON.stringify({
      staffingRules: {
        roles: [
          { key: 'md', max: 2, min: 1, label: 'Match Director', ssiOfficialCode: 'MD', ssiMgmtRole: '1' },
        ],
        requiredRoles: ['lead'],
        maxInstructors: 2,
        minInstructors: 1,
      }
    }),
  })
  const cupBody = await cupRes.json()
  console.log(`Updated ${cupTplId}:`, cupRes.status, cupBody.success ? 'OK' : cupBody.error)

  console.log('\nDone. Templates updated with SSI role mappings.')
}

main().catch(console.error)
