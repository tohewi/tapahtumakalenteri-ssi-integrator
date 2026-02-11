#!/usr/bin/env node
/**
 * SSI Staffing Integration Diagnostic Test
 * 
 * Tests each SSI staffing operation step-by-step to identify integration issues.
 * 
 * Usage: node test-staffing-integration.mjs <email> <password> <apiKey> <eventId>
 * 
 * Example:
 *   node test-staffing-integration.mjs turreskuko1@foo.bar mypass mykey 27391
 * 
 * This will:
 * 1. Login to SSI and save cookies
 * 2. Verify the event exists and get its details
 * 3. Test accessing the participant-search-and-add page (trainer squad)
 * 4. Test accessing the staff page (management group)
 * 5. Test extracting the management group ID
 * 6. Test the actual registration operations
 */

import { 
  ssiLogin, 
  ssiRegisterToTrainerSquad, 
  ssiGetMatchGroupId, 
  ssiAddToMatchManagement,
  ssiGraphQL,
  ssiFetchPage
} from '../scoring-proxy/lib/ssi-core/client.js'

const args = process.argv.slice(2)
if (args.length < 4) {
  console.error('Usage: node test-staffing-integration.mjs <email> <password> <apiKey> <eventId>')
  console.error('Example: node test-staffing-integration.mjs turreskuko1@foo.bar mypass mykey 27391')
  process.exit(1)
}

const [email, password, apiKey, eventId] = args
const contentType = 22 // SRA/IPSC match content type
const trainerSquadName = 'Squad 5'

console.log('\n' + '='.repeat(60))
console.log('SSI STAFFING INTEGRATION DIAGNOSTIC TEST')
console.log('='.repeat(60))
console.log(`\nTest User: ${email}`)
console.log(`Event ID: ${eventId}`)
console.log(`Content Type: ${contentType}`)
console.log(`Trainer Squad: ${trainerSquadName}`)
console.log('\n' + '='.repeat(60) + '\n')

let cookies = null
let jwtToken = null
let groupId = null

// ============================================================
// Step 1: Login
// ============================================================

async function testLogin() {
  console.log('📝 STEP 1: LOGIN TO SSI')
  console.log('-'.repeat(60))
  
  try {
    cookies = await ssiLogin(email, password, apiKey)
    console.log('✅ Login successful')
    console.log(`   Cookies received: ${Object.keys(cookies).join(', ')}`)
    
    // Extract JWT token for GraphQL
    const csrftoken = cookies['csrftoken']
    const sessionid = cookies['sessionid']
    
    if (!csrftoken || !sessionid) {
      console.warn('⚠️  Missing expected cookies (csrftoken or sessionid)')
    }
    
    return true
  } catch (e) {
    console.error('❌ Login FAILED')
    console.error(`   Error: ${e.message}`)
    return false
  }
}

// ============================================================
// Step 2: Verify Event Exists
// ============================================================

async function testEventAccess() {
  console.log('\n📝 STEP 2: VERIFY EVENT ACCESS')
  console.log('-'.repeat(60))
  
  try {
    // Try to fetch the event page
    const eventPath = `/event/${contentType}/${eventId}/`
    console.log(`   Fetching: ${eventPath}`)
    
    const html = await ssiFetchPage(eventPath, cookies)
    
    if (html.includes('404') || html.includes('not found')) {
      console.error('❌ Event page returned 404')
      console.error(`   URL: https://shootnscoreit.com${eventPath}`)
      return false
    }
    
    // Check for access denied
    if (html.includes('permission denied') || html.includes('no permission')) {
      console.error('❌ Access denied to event')
      return false
    }
    
    // Extract event name
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/)
    const eventName = titleMatch ? titleMatch[1].trim() : 'Unknown'
    
    console.log('✅ Event accessible')
    console.log(`   Event name: ${eventName}`)
    
    return true
  } catch (e) {
    console.error('❌ Event access FAILED')
    console.error(`   Error: ${e.message}`)
    return false
  }
}

// ============================================================
// Step 3: Test Participant Search Page
// ============================================================

async function testParticipantSearchPage() {
  console.log('\n📝 STEP 3: TEST PARTICIPANT SEARCH PAGE')
  console.log('-'.repeat(60))
  
  try {
    const searchPath = `/event/${contentType}/${eventId}/participant-search-and-add/`
    console.log(`   Fetching: ${searchPath}`)
    
    const html = await ssiFetchPage(searchPath, cookies)
    
    if (html.includes('404') || html.includes('not found')) {
      console.error('❌ Participant search page returned 404')
      console.error(`   URL: https://shootnscoreit.com${searchPath}`)
      console.error('   Possible causes:')
      console.error('   - Event ID does not exist')
      console.error('   - Content type is incorrect (should be 22 for SRA/IPSC)')
      console.error('   - User does not have admin access to this event')
      return false
    }
    
    // Check for permission issues
    if (html.includes('permission denied') || html.includes('no permission')) {
      console.error('❌ No permission to access participant search')
      console.error('   User must be event admin to access this page')
      return false
    }
    
    // Look for the search form
    if (!html.includes('email') || !html.includes('first_name') || !html.includes('last_name')) {
      console.error('⚠️  Page loaded but search form not found')
      console.error('   This might indicate the page structure has changed')
    }
    
    console.log('✅ Participant search page accessible')
    return true
  } catch (e) {
    console.error('❌ Participant search page FAILED')
    console.error(`   Error: ${e.message}`)
    return false
  }
}

// ============================================================
// Step 4: Test Staff Page
// ============================================================

async function testStaffPage() {
  console.log('\n📝 STEP 4: TEST STAFF PAGE ACCESS')
  console.log('-'.repeat(60))
  
  try {
    const staffPath = `/event/${contentType}/${eventId}/staff/`
    console.log(`   Fetching: ${staffPath}`)
    
    const html = await ssiFetchPage(staffPath, cookies)
    
    if (html.includes('404') || html.includes('not found')) {
      console.error('❌ Staff page returned 404')
      console.error(`   URL: https://shootnscoreit.com${staffPath}`)
      return false
    }
    
    if (html.includes('permission denied') || html.includes('no permission')) {
      console.error('❌ No permission to access staff page')
      return false
    }
    
    console.log('✅ Staff page accessible')
    
    // Try to extract group ID
    const groupMatch = html.match(/\/groups\/(\d+)\//)
    if (groupMatch) {
      groupId = groupMatch[1]
      console.log(`   Management group ID: ${groupId}`)
    } else {
      console.warn('⚠️  Could not find management group ID on staff page')
      console.warn('   This might indicate the event has no management group')
    }
    
    return true
  } catch (e) {
    console.error('❌ Staff page access FAILED')
    console.error(`   Error: ${e.message}`)
    return false
  }
}

// ============================================================
// Step 5: Test Management Group Search
// ============================================================

async function testManagementGroupSearch() {
  console.log('\n📝 STEP 5: TEST MANAGEMENT GROUP SEARCH')
  console.log('-'.repeat(60))
  
  if (!groupId) {
    console.error('❌ Skipping - no group ID found in previous step')
    return false
  }
  
  try {
    const searchPath = `/groups/${groupId}/role/search/`
    console.log(`   Fetching: ${searchPath}`)
    
    const html = await ssiFetchPage(searchPath, cookies)
    
    if (html.includes('404') || html.includes('not found')) {
      console.error('❌ Management group search page returned 404')
      console.error(`   URL: https://shootnscoreit.com${searchPath}`)
      console.error(`   Group ID: ${groupId}`)
      console.error('   Possible causes:')
      console.error('   - Group ID extracted incorrectly')
      console.error('   - User does not have access to this group')
      return false
    }
    
    if (html.includes('permission denied') || html.includes('no permission')) {
      console.error('❌ No permission to access management group search')
      return false
    }
    
    console.log('✅ Management group search page accessible')
    return true
  } catch (e) {
    console.error('❌ Management group search FAILED')
    console.error(`   Error: ${e.message}`)
    return false
  }
}

// ============================================================
// Step 6: Test Trainer Squad Registration
// ============================================================

async function testTrainerSquadRegistration() {
  console.log('\n📝 STEP 6: TEST TRAINER SQUAD REGISTRATION')
  console.log('-'.repeat(60))
  
  try {
    console.log(`   Registering ${email} to ${trainerSquadName}...`)
    
    const result = await ssiRegisterToTrainerSquad(
      contentType,
      eventId,
      email,
      trainerSquadName,
      cookies
    )
    
    console.log('✅ Trainer squad registration completed')
    console.log(`   Success: ${result.success}`)
    console.log(`   Message: ${result.message}`)
    
    return result.success
  } catch (e) {
    console.error('❌ Trainer squad registration FAILED')
    console.error(`   Error: ${e.message}`)
    
    if (e.message.includes('HTTP 404')) {
      console.error('\n   DIAGNOSIS:')
      console.error('   The participant-search-and-add endpoint returned 404.')
      console.error('   This usually means:')
      console.error('   1. The event does not exist')
      console.error('   2. The content type is wrong')
      console.error('   3. The user lacks admin access to the event')
    }
    
    return false
  }
}

// ============================================================
// Step 7: Test Management Group Registration
// ============================================================

async function testManagementGroupRegistration() {
  console.log('\n📝 STEP 7: TEST MANAGEMENT GROUP REGISTRATION')
  console.log('-'.repeat(60))
  
  if (!groupId) {
    console.error('❌ Skipping - no group ID available')
    return false
  }
  
  try {
    console.log(`   Adding ${email} to management group ${groupId}...`)
    console.log('   Role: Admin')
    console.log('   Officials: MD (Match Director)')
    
    const result = await ssiAddToMatchManagement(
      groupId,
      contentType,
      eventId,
      email,
      'Admin',
      ['MD'],
      cookies
    )
    
    console.log('✅ Management group registration completed')
    console.log(`   Success: ${result.success}`)
    console.log(`   Message: ${result.message}`)
    
    return result.success
  } catch (e) {
    console.error('❌ Management group registration FAILED')
    console.error(`   Error: ${e.message}`)
    
    if (e.message.includes('HTTP 404')) {
      console.error('\n   DIAGNOSIS:')
      console.error('   The management group search endpoint returned 404.')
      console.error('   This usually means:')
      console.error('   1. The group ID is incorrect')
      console.error('   2. The user lacks access to the management group')
    }
    
    return false
  }
}

// ============================================================
// Main Test Runner
// ============================================================

async function runTests() {
  const results = {
    login: false,
    eventAccess: false,
    participantSearch: false,
    staffPage: false,
    managementSearch: false,
    trainerSquad: false,
    managementGroup: false
  }
  
  // Run tests in sequence
  results.login = await testLogin()
  if (!results.login) {
    console.log('\n❌ Cannot continue - login failed')
    return results
  }
  
  results.eventAccess = await testEventAccess()
  results.participantSearch = await testParticipantSearchPage()
  results.staffPage = await testStaffPage()
  
  if (groupId) {
    results.managementSearch = await testManagementGroupSearch()
  }
  
  // Only try actual registration if diagnostic tests pass
  if (results.participantSearch) {
    results.trainerSquad = await testTrainerSquadRegistration()
  }
  
  if (results.staffPage && groupId) {
    results.managementGroup = await testManagementGroupRegistration()
  }
  
  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('TEST SUMMARY')
  console.log('='.repeat(60))
  
  const passed = Object.values(results).filter(v => v).length
  const total = Object.keys(results).length
  
  for (const [test, passed] of Object.entries(results)) {
    const icon = passed ? '✅' : '❌'
    console.log(`${icon} ${test}`)
  }
  
  console.log(`\nPassed: ${passed}/${total}`)
  
  if (passed === total) {
    console.log('\n🎉 All tests passed!')
  } else {
    console.log('\n⚠️  Some tests failed. See output above for details.')
  }
  
  console.log('\n' + '='.repeat(60) + '\n')
  
  return results
}

// Run the tests
runTests().catch(e => {
  console.error('\n💥 FATAL ERROR:', e.message)
  console.error(e.stack)
  process.exit(1)
})
