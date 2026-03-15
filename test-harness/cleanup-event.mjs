#!/usr/bin/env node
// Delete a specific event by ID

const args = process.argv.slice(2)
function getArg(name, envName) {
  const idx = args.indexOf(`--${name}`)
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]
  return process.env[envName] || null
}

const BASE_URL = getArg('base-url', 'PLATFORM_BASE_URL') || 'http://localhost:3001'
const EMAIL = getArg('email', 'PLATFORM_EMAIL') || 'tohewi@gmail.com'
const PASSWORD = getArg('password', 'PLATFORM_PASSWORD') || 'H3it0tt0r00!'
const TENANT_ID = getArg('tenant-id', 'PLATFORM_TENANT_ID') || 'ten_666e216286d04d8d'
const EVENT_ID = getArg('event-id', null)

if (!EVENT_ID) {
  console.error('Usage: node cleanup-event.mjs --event-id <evt_xxx>')
  process.exit(1)
}

async function main() {
  const loginResp = await fetch(`${BASE_URL}/api/v1/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: 'manual',
  })
  const setCookie = loginResp.headers.getSetCookie?.() || loginResp.headers.get('set-cookie')?.split(',') || []
  const sidMatch = setCookie.join(';').match(/platform_sid=([^;]+)/)
  if (!sidMatch) throw new Error('Login failed')
  const cookie = `platform_sid=${sidMatch[1]}`

  const del = await fetch(`${BASE_URL}/api/v1/platform/tenants/${TENANT_ID}/events/${EVENT_ID}`, {
    method: 'DELETE',
    headers: { 'Cookie': cookie },
  })
  const data = await del.json().catch(() => ({}))
  console.log(`Delete ${EVENT_ID}: ${del.status}`, JSON.stringify(data))
}

main().catch(err => console.error(err.message))
