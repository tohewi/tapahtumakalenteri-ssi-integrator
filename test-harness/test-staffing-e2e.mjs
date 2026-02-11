#!/usr/bin/env node
/**
 * SSI Staffing End-to-End Test
 *
 * Tests the core staff management flow: signup → verify SSI state → resign → verify cleanup.
 * Covers all 3 roles and the Squad 5 fallback path for already-registered participants.
 *
 * This is the authoritative test for staffing SSI integration.
 *
 * Usage:
 *   node --env-file=scoring-proxy/.env test-harness/test-staffing-e2e.mjs [eventId]
 *
 * Env vars (from scoring-proxy/.env):
 *   SSI_ADMIN_EMAIL, SSI_ADMIN_PASSWORD, SSI_ADMIN_API_KEY
 *
 * Defaults:
 *   eventId   = 27394 (TEST TR-SRAN 10.03.2026)
 *   testEmail = turreskuko1@foo.bar
 */

import {
  ssiLogin,
  ssiRegisterToTrainerSquad,
  ssiGetMatchGroupId,
  ssiGetMatchOfficials,
  ssiAddToMatchManagement,
  ssiRemoveFromMatchManagement,
  ssiSetParticipantSquad,
  ssiDeleteMatchParticipant,
  ssiGraphQL,
  ssiFetchPage,
} from '../scoring-proxy/lib/ssi-core/client.js'

// ── Configuration ────────────────────────────────────────────────────
const ADMIN_EMAIL    = process.env.SSI_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.SSI_ADMIN_PASSWORD
const ADMIN_API_KEY  = process.env.SSI_ADMIN_API_KEY
const EVENT_ID       = process.argv[2] || '27394'
const TEST_EMAIL     = 'turreskuko1@foo.bar'
const CONTENT_TYPE   = 22          // SRA/IPSC
const PARTICIPANT_CT = 23          // IPSC participant content type
const STAFF_SQUAD    = 'Squad 5'
const STAFF_SQUAD_NUM = 5

const SSI_ROLE_MAP = {
  staff:            { role: '1', officials: [] },
  leadInstructor:   { role: '1', officials: ['MD'] },
  equipmentManager: { role: '1', officials: ['QM'] },
}

// ── Test infrastructure ──────────────────────────────────────────────
const results = []   // { name, pass, detail }

function assert(name, condition, detail = '') {
  results.push({ name, pass: !!condition, detail })
  const icon = condition ? '✓' : '✗'
  const color = condition ? '\x1b[32m' : '\x1b[31m'
  console.log(`  ${color}${icon}\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
  return !!condition
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Find user in Squad N via GraphQL. Returns { competitorId, squadNum } or null. */
async function findInSquadViaGraphQL(jwt, email) {
  const data = await ssiGraphQL(jwt, `
    query ($ct: Int!, $id: String!) {
      event(content_type: $ct, id: $id) {
        squads {
          number
          ... on IpscSquadNode { competitors { id status shooter { email } } }
        }
      }
    }
  `, { ct: CONTENT_TYPE, id: EVENT_ID })
  for (const sq of data.event?.squads || []) {
    const comp = (sq.competitors || []).find(c => c.shooter?.email === email)
    if (comp) return { competitorId: comp.id, squadNum: sq.number, status: comp.status }
  }
  return null
}

/** Find participant ID on the participants web page (handles unassigned participants). */
async function findParticipantOnPage(cookies, userName) {
  const html = await ssiFetchPage(`/event/${CONTENT_TYPE}/${EVENT_ID}/participants/`, cookies)
  const allParts = [...html.matchAll(/\/event\/participant\/(\d+)\/(\d+)\/[^"]*"[^>]*>([^<]*)</gi)]
  const match = allParts.find(m => m[3].trim().toLowerCase() === userName.toLowerCase())
  if (match) return { participantCT: match[1], participantId: match[2], name: match[3].trim() }
  return null
}

/** Check staff page for user and their officials. */
async function getStaffPageEntry(cookies, userName) {
  const officials = await ssiGetMatchOfficials(CONTENT_TYPE, EVENT_ID, cookies)
  return officials.find(o => o.name.toLowerCase() === userName.toLowerCase()) || null
}

// ── Main test ────────────────────────────────────────────────────────
async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Missing SSI_ADMIN_EMAIL / SSI_ADMIN_PASSWORD. Run with --env-file=scoring-proxy/.env')
    process.exit(1)
  }

  console.log('='.repeat(60))
  console.log('  SSI STAFFING END-TO-END TEST')
  console.log('='.repeat(60))
  console.log(`  Event:      ${EVENT_ID} (content type ${CONTENT_TYPE})`)
  console.log(`  Test user:  ${TEST_EMAIL}`)
  console.log(`  Squad:      ${STAFF_SQUAD} (#${STAFF_SQUAD_NUM})`)
  console.log(`  Roles:      ${Object.keys(SSI_ROLE_MAP).join(', ')}`)

  // ── STEP 0: Admin login & JWT ──────────────────────────────────────
  section('STEP 0 — Admin Login')
  const cookies = await ssiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)
  assert('Admin web login', cookies, 'got session cookies')

  const auth = await ssiGraphQL(null, `
    mutation ($e: String!, $p: String!) {
      token_auth(email: $e, password: $p) {
        token { token } refresh_token { token }
      }
    }
  `, { e: ADMIN_EMAIL, p: ADMIN_PASSWORD }, ADMIN_API_KEY)
  const jwt = auth.token_auth.token.token
  assert('Admin JWT acquired', jwt)

  // Known display name for test user (turreskuko1@foo.bar)
  const TEST_USER_NAME = 'Turresku Tuloskone 1'

  // ── STEP 1: Verify event exists ────────────────────────────────────
  section('STEP 1 — Verify Event')
  const evData = await ssiGraphQL(jwt, `
    query ($ct: Int!, $id: String!) {
      event(content_type: $ct, id: $id) { name }
    }
  `, { ct: CONTENT_TYPE, id: EVENT_ID })
  assert('Event exists', evData.event?.name, evData.event?.name)

  // ── STEP 2: Pre-test cleanup ───────────────────────────────────────
  section('STEP 2 — Pre-test Cleanup')
  // Remove from management group (ignore errors if not there)
  try {
    const groupId = await ssiGetMatchGroupId(CONTENT_TYPE, EVENT_ID, cookies)
    await ssiRemoveFromMatchManagement(groupId, CONTENT_TYPE, EVENT_ID, TEST_EMAIL, cookies)
    console.log('  (cleaned management group)')
  } catch { console.log('  (management group: nothing to clean)') }

  // Remove from trainer squad if present
  const preSquad = await findInSquadViaGraphQL(jwt, TEST_EMAIL)
  if (preSquad) {
    try {
      await ssiDeleteMatchParticipant(EVENT_ID, preSquad.competitorId, TEST_USER_NAME, cookies, PARTICIPANT_CT)
      console.log(`  (cleaned Squad ${preSquad.squadNum}, competitor ${preSquad.competitorId})`)
    } catch (e) { console.log(`  (squad cleanup: ${e.message})`) }
  } else {
    // May be unassigned — check participants page
    const prePart = await findParticipantOnPage(cookies, TEST_USER_NAME)
    if (prePart) {
      try {
        await ssiDeleteMatchParticipant(EVENT_ID, prePart.participantId, TEST_USER_NAME, cookies, parseInt(prePart.participantCT))
        console.log(`  (cleaned unassigned participant ${prePart.participantId})`)
      } catch (e) { console.log(`  (participant cleanup: ${e.message})`) }
    } else {
      console.log('  (no pre-existing participant to clean)')
    }
  }

  // Wait for SSI to propagate
  await sleep(2000)

  // Verify clean state
  const cleanSquad = await findInSquadViaGraphQL(jwt, TEST_EMAIL)
  const cleanStaff = await getStaffPageEntry(cookies, TEST_USER_NAME)
  assert('Pre-test: not in any squad', !cleanSquad, cleanSquad ? `still in Squad ${cleanSquad.squadNum}` : 'clean')
  assert('Pre-test: not on staff page', !cleanStaff, cleanStaff ? `still on staff page` : 'clean')

  // ══════════════════════════════════════════════════════════════════
  //  TEST EACH ROLE: signup → verify → resign → verify
  // ══════════════════════════════════════════════════════════════════
  for (const role of ['staff', 'leadInstructor', 'equipmentManager']) {
    const ssiRole = SSI_ROLE_MAP[role]
    const expectedOfficials = ssiRole.officials
    const officialStr = expectedOfficials.length ? expectedOfficials.join(',') : 'none'

    section(`ROLE: ${role} (officials: ${officialStr})`)

    // ── 3a. Signup: register to trainer squad ────────────────────────
    console.log('\n  → Signup: Trainer Squad')
    let squadOk = false
    try {
      const sqResult = await ssiRegisterToTrainerSquad(CONTENT_TYPE, EVENT_ID, TEST_EMAIL, STAFF_SQUAD, cookies)

      if (sqResult.message?.includes('Already registered')) {
        // Fallback: find participant and set squad
        const inSquad = await findInSquadViaGraphQL(jwt, TEST_EMAIL)
        if (inSquad && inSquad.squadNum === STAFF_SQUAD_NUM) {
          squadOk = assert(`${role}: trainer squad`, true, 'already in Squad 5')
        } else if (inSquad) {
          await ssiSetParticipantSquad(inSquad.competitorId, STAFF_SQUAD_NUM, cookies, 'a', PARTICIPANT_CT)
          squadOk = assert(`${role}: trainer squad`, true, `moved from Squad ${inSquad.squadNum} to ${STAFF_SQUAD_NUM}`)
        } else {
          // Unassigned participant — scrape participants page
          const part = await findParticipantOnPage(cookies, TEST_USER_NAME)
          if (part) {
            await ssiSetParticipantSquad(part.participantId, STAFF_SQUAD_NUM, cookies, 'a', parseInt(part.participantCT))
            squadOk = assert(`${role}: trainer squad`, true, `assigned unassigned participant ${part.participantId} to Squad ${STAFF_SQUAD_NUM}`)
          } else {
            squadOk = assert(`${role}: trainer squad`, false, 'already registered but not found anywhere')
          }
        }
      } else if (sqResult.success !== false) {
        squadOk = assert(`${role}: trainer squad`, true, sqResult.message)
      } else {
        squadOk = assert(`${role}: trainer squad`, false, sqResult.message)
      }
    } catch (e) {
      squadOk = assert(`${role}: trainer squad`, false, e.message)
    }

    // ── 3b. Signup: add to management group ──────────────────────────
    console.log('\n  → Signup: Management Group')
    let mgmtOk = false
    try {
      const groupId = await ssiGetMatchGroupId(CONTENT_TYPE, EVENT_ID, cookies)
      const mgmtResult = await ssiAddToMatchManagement(groupId, CONTENT_TYPE, EVENT_ID, TEST_EMAIL, ssiRole.role, ssiRole.officials, cookies)
      mgmtOk = assert(`${role}: management group`, true, mgmtResult.message)
    } catch (e) {
      mgmtOk = assert(`${role}: management group`, false, e.message)
    }

    // ── 3c. Verify: Squad 5 ─────────────────────────────────────────
    console.log('\n  → Verify: Squad 5')
    await sleep(1000)
    const inSquad = await findInSquadViaGraphQL(jwt, TEST_EMAIL)
    assert(`${role}: in Squad ${STAFF_SQUAD_NUM}`, inSquad?.squadNum === STAFF_SQUAD_NUM,
      inSquad ? `Squad ${inSquad.squadNum}, status=${inSquad.status}` : 'not found')

    // ── 3d. Verify: Staff page officials ────────────────────────────
    console.log('\n  → Verify: Staff Page Officials')
    const staffEntry = await getStaffPageEntry(cookies, TEST_USER_NAME)
    assert(`${role}: on staff page`, !!staffEntry, staffEntry ? `officials: [${staffEntry.officials.join(',')}]` : 'not found')

    if (staffEntry && expectedOfficials.length > 0) {
      const hasExpected = expectedOfficials.every(o => staffEntry.officials.includes(o))
      assert(`${role}: correct officials`, hasExpected,
        `expected [${officialStr}], got [${staffEntry.officials.join(',')}]`)
    } else if (staffEntry && expectedOfficials.length === 0) {
      assert(`${role}: no officials (staff role)`, staffEntry.officials.length === 0,
        `expected none, got [${staffEntry.officials.join(',')}]`)
    }

    // ── 3e. Resign: remove from management group ────────────────────
    console.log('\n  → Resign: Management Group')
    try {
      const groupId = await ssiGetMatchGroupId(CONTENT_TYPE, EVENT_ID, cookies)
      const removeResult = await ssiRemoveFromMatchManagement(groupId, CONTENT_TYPE, EVENT_ID, TEST_EMAIL, cookies)
      assert(`${role}: resign management`, true, removeResult.message)
    } catch (e) {
      assert(`${role}: resign management`, false, e.message)
    }

    // ── 3f. Resign: remove from trainer squad ───────────────────────
    console.log('\n  → Resign: Trainer Squad')
    const postResignSquad = await findInSquadViaGraphQL(jwt, TEST_EMAIL)
    if (postResignSquad) {
      try {
        await ssiDeleteMatchParticipant(EVENT_ID, postResignSquad.competitorId, TEST_USER_NAME, cookies, PARTICIPANT_CT)
        assert(`${role}: resign trainer squad`, true, `deleted competitor ${postResignSquad.competitorId}`)
      } catch (e) {
        assert(`${role}: resign trainer squad`, false, e.message)
      }
    } else {
      // Try participants page fallback
      const part = await findParticipantOnPage(cookies, TEST_USER_NAME)
      if (part) {
        try {
          await ssiDeleteMatchParticipant(EVENT_ID, part.participantId, TEST_USER_NAME, cookies, parseInt(part.participantCT))
          assert(`${role}: resign trainer squad`, true, `deleted unassigned participant ${part.participantId}`)
        } catch (e) {
          assert(`${role}: resign trainer squad`, false, e.message)
        }
      } else {
        assert(`${role}: resign trainer squad`, true, 'already removed')
      }
    }

    // ── 3g. Verify: fully cleaned up ────────────────────────────────
    console.log('\n  → Verify: Cleanup')
    await sleep(1500)
    const finalSquad = await findInSquadViaGraphQL(jwt, TEST_EMAIL)
    const finalStaff = await getStaffPageEntry(cookies, TEST_USER_NAME)
    assert(`${role}: not in squad after resign`, !finalSquad, finalSquad ? `still in Squad ${finalSquad.squadNum}` : 'clean')
    assert(`${role}: not on staff page after resign`, !finalStaff, finalStaff ? 'still on staff page' : 'clean')

    // Small delay between roles
    await sleep(2000)
  }

  // ══════════════════════════════════════════════════════════════════
  //  EDGE CASE: Re-signup after full resign (tests fresh registration)
  // ══════════════════════════════════════════════════════════════════
  section('EDGE CASE — Re-signup After Full Resign (staff role)')

  console.log('\n  → Signup: Trainer Squad (fresh)')
  try {
    const sqResult = await ssiRegisterToTrainerSquad(CONTENT_TYPE, EVENT_ID, TEST_EMAIL, STAFF_SQUAD, cookies)
    // May be "Already registered" if SSI still holds the participant, or fresh register
    if (sqResult.message?.includes('Already registered')) {
      // Apply fallback
      const part = await findParticipantOnPage(cookies, TEST_USER_NAME)
      if (part) {
        await ssiSetParticipantSquad(part.participantId, STAFF_SQUAD_NUM, cookies, 'a', parseInt(part.participantCT))
        assert('re-signup: trainer squad (fallback)', true, `assigned participant ${part.participantId}`)
      } else {
        const inSq = await findInSquadViaGraphQL(jwt, TEST_EMAIL)
        if (inSq?.squadNum === STAFF_SQUAD_NUM) {
          assert('re-signup: trainer squad', true, 'already in Squad 5')
        } else {
          assert('re-signup: trainer squad', false, 'already registered but not findable')
        }
      }
    } else {
      assert('re-signup: trainer squad', sqResult.success !== false, sqResult.message)
    }
  } catch (e) {
    assert('re-signup: trainer squad', false, e.message)
  }

  await sleep(1000)
  const reSq = await findInSquadViaGraphQL(jwt, TEST_EMAIL)
  assert('re-signup: in Squad 5', reSq?.squadNum === STAFF_SQUAD_NUM,
    reSq ? `Squad ${reSq.squadNum}` : 'not found')

  // Final cleanup
  console.log('\n  → Final cleanup')
  try {
    const groupId = await ssiGetMatchGroupId(CONTENT_TYPE, EVENT_ID, cookies)
    await ssiRemoveFromMatchManagement(groupId, CONTENT_TYPE, EVENT_ID, TEST_EMAIL, cookies).catch(() => {})
  } catch {}
  if (reSq) {
    try { await ssiDeleteMatchParticipant(EVENT_ID, reSq.competitorId, TEST_USER_NAME, cookies, PARTICIPANT_CT) } catch {}
  }

  // ══════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(60))
  console.log('  SUMMARY')
  console.log('='.repeat(60))

  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass).length
  const total = results.length

  for (const r of results) {
    if (!r.pass) {
      console.log(`  \x1b[31m✗ FAIL: ${r.name}\x1b[0m — ${r.detail}`)
    }
  }

  const color = failed === 0 ? '\x1b[32m' : '\x1b[31m'
  console.log(`\n  ${color}${passed}/${total} passed, ${failed} failed\x1b[0m`)
  console.log('='.repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
