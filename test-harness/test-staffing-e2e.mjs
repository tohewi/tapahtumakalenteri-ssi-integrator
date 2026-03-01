import fs from 'fs'
import path from 'path'
import url from 'url'
import crypto from 'crypto'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

// Usage: node test-staffing-e2e.mjs --base-url http://localhost:3001 --email your@email.com --password secret --tenant-id tnt_123 --template-id tpl_456

const args = process.argv.slice(2)
const config = {
  baseUrl: process.env.PLATFORM_BASE_URL || 'http://localhost:3001',
  email: process.env.PLATFORM_EMAIL,
  password: process.env.PLATFORM_PASSWORD,
  tenantId: process.env.PLATFORM_TENANT_ID,
  templateId: process.env.PLATFORM_TEMPLATE_ID
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base-url') config.baseUrl = args[++i]
  if (args[i] === '--email') config.email = args[++i]
  if (args[i] === '--password') config.password = args[++i]
  if (args[i] === '--tenant-id') config.tenantId = args[++i]
  if (args[i] === '--template-id') config.templateId = args[++i]
}

if (!config.email || !config.password || !config.tenantId || !config.templateId) {
  console.error('Usage: node test-staffing-e2e.mjs --base-url <url> --email <email> --password <password> --tenant-id <id> --template-id <id>')
  process.exit(1)
}

let cookieHeader = ''

async function apiFetch(endpoint, options = {}) {
  // Platform routes are mounted at /api/v1/platform (e.g. /api/v1/platform/login)
  // Staffing routes are mounted at /api/v1/staffing
  let basePath = '/api/v1/platform'
  if (endpoint.startsWith('/login') || endpoint.startsWith('/register')) {
    basePath = '/api/v1/platform'
  } else if (endpoint.includes('/staffing')) {
    // Actually the platform routes handle some staffing logic under /tenants/:id/events/:eventId/staffing/signup
    // and /api/v1/staffing handles upcoming needs and my assignments
    if (endpoint.startsWith('/staffing/upcoming') || endpoint.startsWith('/staffing/my-assignments')) {
      basePath = '/api/v1' // will be appended with /staffing/... 
    }
  }
  
  // Clean up double slashes
  const url = `${config.baseUrl}${basePath}${endpoint}`.replace(/([^:]\/)\/+/g, '$1')
  
  const fetchOptions = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { 'cookie': cookieHeader } : {}),
      ...(options.headers || {})
    }
  }

  const res = await fetch(url, fetchOptions)
  
  // Save cookies
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) {
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
    const platformCookie = cookies.find(c => c.startsWith('platform_sid='))
    if (platformCookie) {
      cookieHeader = platformCookie.split(';')[0]
    }
  }

  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch (e) {
    data = text
  }

  if (!res.ok) {
    throw new Error(`API Error ${res.status} at ${endpoint}: ${typeof data === 'object' ? JSON.stringify(data) : data}`)
  }

  return data
}

async function run() {
  console.log(`\n--- UAT Test: Event Staffing Flow ---`)
  console.log(`Testing against: ${config.baseUrl}`)
  console.log(`User: ${config.email}`)
  console.log(`Tenant: ${config.tenantId}`)
  console.log(`Template: ${config.templateId}\n`)

  let testEventId = null
  let needId = null
  let signupId = null

  try {
    // 1. Login
    console.log('1. Logging in...')
    const loginRes = await apiFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email: config.email, password: config.password })
    })
    console.log(`✅ Logged in as ${loginRes.account.name}`)

    // 2. Schedule a test event from the template (14 days in future)
    console.log('\n2. Scheduling test event...')
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + 14)
    const dateStr = targetDate.toISOString().split('T')[0]
    
    const scheduleRes = await apiFetch(`/tenants/${config.tenantId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        templateId: config.templateId,
        dates: [dateStr]
      })
    })
    
    if (scheduleRes.success && scheduleRes.event) {
      testEventId = scheduleRes.event.id
      console.log(`✅ Created test event: ${testEventId} on ${dateStr}`)
    } else if (scheduleRes.results && scheduleRes.results[0] && scheduleRes.results[0].success) {
      testEventId = scheduleRes.results[0].eventId
      console.log(`✅ Created test event (batch): ${testEventId} on ${dateStr}`)
    } else {
      throw new Error(`Failed to schedule event: ${JSON.stringify(scheduleRes)}`)
    }

    // 3. Verify staffing needs were auto-populated
    console.log('\n3. Verifying staffing needs...')
    // Note: the route is GET /api/v1/platform/tenants/:id/events/:eventId/staffing
    const staffingRes = await apiFetch(`/tenants/${config.tenantId}/events/${testEventId}/staffing`)
    
    if (!staffingRes || !staffingRes.needs || staffingRes.needs.length === 0) {
      throw new Error('No staffing needs auto-populated. Does the template have staffing_rules?')
    }
    console.log(`✅ Event has ${staffingRes.needs.length} staffing needs auto-populated from template`)
    console.table(staffingRes.needs.map(n => ({ Role: n.roleLabel, Min: n.minCount, Max: n.maxCount })))
    
    needId = staffingRes.needs[0].id
    const targetRoleLabel = staffingRes.needs[0].roleLabel

    // 4. Get upcoming staffing needs (Roster view)
    console.log('\n4. Fetching Roster view...')
    const upcomingRes = await apiFetch(`/tenants/${config.tenantId}/staffing/upcoming`)
    const targetEventRoster = upcomingRes.find(e => e.event.id === testEventId)
    
    if (!targetEventRoster) {
      throw new Error('Test event not found in upcoming staffing needs list')
    }
    console.log(`✅ Found test event in Roster. Is understaffed: ${targetEventRoster.isUnderstaffed}`)

    // 5. Sign up for a role
    console.log(`\n5. Signing up for role: ${targetRoleLabel}...`)
    // API is POST /api/v1/platform/tenants/:id/events/:eventId/staffing/signup
    const signupRes = await apiFetch(`/tenants/${config.tenantId}/events/${testEventId}/staffing/signup`, {
      method: 'POST',
      body: JSON.stringify({ needId, notes: 'UAT Test Signup' })
    })
    
    signupId = signupRes.signup.id
    console.log(`✅ Signed up successfully! Signup ID: ${signupId}`)

    // 6. Verify "My Assignments"
    console.log('\n6. Verifying "My Assignments"...')
    const myAssignmentsRes = await apiFetch(`/tenants/${config.tenantId}/staffing/my-assignments`)
    const myAssignment = myAssignmentsRes.find(a => a.signup.id === signupId)
    
    if (!myAssignment) {
      throw new Error('New signup not found in My Assignments list')
    }
    console.log(`✅ Found new assignment in My Assignments for ${myAssignment.event.eventDate}`)

    // 7. Withdraw from role
    console.log('\n7. Withdrawing from role...')
    await apiFetch(`/tenants/${config.tenantId}/events/${testEventId}/staffing/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ signupId })
    })
    console.log(`✅ Withdrawn successfully`)

    // 8. Verify withdrawal
    const myAssignmentsAfterRes = await apiFetch(`/tenants/${config.tenantId}/staffing/my-assignments`)
    const assignmentExists = myAssignmentsAfterRes.some(a => a.signup.id === signupId)
    if (assignmentExists) {
      throw new Error('Assignment still exists in My Assignments after withdrawal')
    }
    console.log(`✅ Verified assignment removed from My Assignments`)

    console.log(`\n🎉 All Staffing UAT tests passed successfully!`)

  } catch (err) {
    console.error(`\n❌ Test failed: ${err.message}`)
  } finally {
    // Cleanup
    if (testEventId) {
      console.log(`\nCleaning up: deleting test event ${testEventId}...`)
      try {
        await apiFetch(`/tenants/${config.tenantId}/events/${testEventId}`, { method: 'DELETE' })
        console.log('✅ Cleanup successful')
      } catch (e) {
        console.error('⚠️ Cleanup failed:', e.message)
      }
    }
  }
}

run()
