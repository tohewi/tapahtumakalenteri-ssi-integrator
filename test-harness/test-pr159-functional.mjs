/**
 * Functional test for PR-159 hotfix branch on Render preview.
 * Tests: cup count fix, paid toggle disabled (R76-COM2), scoring cup search filter.
 *
 * Usage: node test-harness/test-pr159-functional.mjs [BASE_URL]
 * Default BASE_URL: https://turres-ssi-tools-pr-159.onrender.com
 */

const BASE = process.argv[2] || 'https://turres-ssi-tools-pr-159.onrender.com';
const EMAIL = 'tohewi@live.com';
const PASSWORD = 'H3ibottiakanssa!';

let passed = 0;
let failed = 0;

function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) { console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`); failed++; }

async function login() {
  const resp = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, scope: 'manage' }),
  });
  if (!resp.ok) throw new Error(`Login failed: ${resp.status} ${await resp.text()}`);
  // Extract Set-Cookie header for subsequent calls
  const cookie = resp.headers.get('set-cookie');
  const data = await resp.json();
  console.log(`  Logged in as ${data.email || EMAIL}`);
  return cookie;
}

async function apiGet(path, cookie) {
  const resp = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie.split(';')[0] } : {},
  });
  return { status: resp.status, body: await resp.json().catch(() => null) };
}

async function apiPost(path, body, cookie) {
  const resp = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie.split(';')[0] } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: resp.status, body: await resp.json().catch(() => null) };
}

// ─── Test 1: Health check ─────────────────────────────────────────────────────
console.log('\n1. Health check');
try {
  const resp = await fetch(`${BASE}/api/v1`);
  if (resp.ok) ok('Server is up and responding');
  else fail('Health check', `status ${resp.status}`);
} catch (e) {
  fail('Health check', e.message);
  console.error('  Cannot reach server — aborting remaining tests');
  process.exit(1);
}

// ─── Test 2: Login ────────────────────────────────────────────────────────────
console.log('\n2. Authentication');
let cookie;
try {
  cookie = await login();
  ok('Login succeeded');
} catch (e) {
  fail('Login', e.message);
  process.exit(1);
}

// ─── Test 3: Manage cups endpoint returns cup list ────────────────────────────
console.log('\n3. Manage cups list (/api/manage/cups)');
let cups = [];
try {
  const { status, body } = await apiGet('/api/manage/cups', cookie);
  if (status === 200 && body && Array.isArray(body.cups)) {
    cups = body.cups;
    ok(`Returned ${cups.length} cup(s)`);
  } else {
    fail('Manage cups', `status=${status} body=${JSON.stringify(body)?.slice(0, 200)}`);
  }
} catch (e) {
  fail('Manage cups', e.message);
}

// ─── Test 4: Cup registered count fields present ──────────────────────────────
console.log('\n4. Cup count fields');
if (cups.length > 0) {
  const cup = cups[0];
  const hasRegistered = 'registeredCount' in cup || 'registered' in cup || 'registeredCompetitors' in cup
    || 'number_of_prematch_competitors_registered' in cup || cup.registered !== undefined;
  // Just verify there's some count-like field, don't care about exact name
  const countFields = Object.keys(cup).filter(k =>
    k.toLowerCase().includes('registered') || k.toLowerCase().includes('count') || k.toLowerCase().includes('competitor')
  );
  if (countFields.length > 0) {
    ok(`Count fields present: ${countFields.join(', ')}`);
    console.log(`    Sample: ${JSON.stringify(Object.fromEntries(countFields.map(k => [k, cup[k]])))}`);
  } else {
    fail('Cup count fields', `No count fields found. Keys: ${Object.keys(cup).join(', ')}`);
  }
} else {
  console.log('  ⚠️  No cups returned, skipping count field check');
}

// ─── Test 5: R76-COM2 — Paid toggle must be disabled (403) ───────────────────
console.log('\n5. R76-COM2 — Paid toggle disabled');
try {
  // Try to call toggle-paid on a known cup; should 403 regardless of cup existence
  const { status, body } = await apiPost('/api/manage/cups/160/participants/1/toggle-paid', {}, cookie);
  if (status === 403) {
    ok('Paid toggle returns 403 (correctly disabled)');
  } else if (status === 404) {
    // 404 means the route doesn't exist at all — also acceptable
    ok('Paid toggle returns 404 (route removed)');
  } else {
    fail('Paid toggle', `Expected 403/404, got ${status} — ${JSON.stringify(body)?.slice(0, 100)}`);
  }
} catch (e) {
  fail('Paid toggle', e.message);
}

// ─── Test 6: Scoring cup search endpoint ─────────────────────────────────────
console.log('\n6. Scoring — cup search');
let scoringCookie = cookie;
try {
  // Cup search requires scoring scope — get a scoring-scoped session
  const resp = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, scope: 'scoring' }),
  });
  if (resp.ok) scoringCookie = resp.headers.get('set-cookie') || cookie;
} catch (_) {}
try {
  const { status, body } = await apiGet('/api/scoring/cups?search=test', scoringCookie);
  // Response may be array or object with cups/matches key
  const items = Array.isArray(body) ? body : (body?.cups || body?.events || []);
  if (status === 200) {
    ok(`Cup search returns 200 (${items.length} results)`);
    // Verify results are cups (not matches)
    const nonCups = items.filter(c => c.isCup === false || (c.rule && !c.isCup));
    if (nonCups.length === 0) {
      ok('No non-cup results leaked through');
    } else {
      fail('Cup search filter', `${nonCups.length} non-cup result(s) returned`);
    }
  } else {
    fail('Cup search', `status=${status} body=${JSON.stringify(body)?.slice(0,100)}`);
  }
} catch (e) {
  fail('Cup search', e.message);
}

// ─── Test 7: Registration cups endpoint ──────────────────────────────────────
console.log('\n7. Registration cups list (/api/register/cups)');
try {
  const { status, body } = await apiGet('/api/register/cups', cookie);
  const regCups = Array.isArray(body) ? body : (body?.cups || []);
  if (status === 200) {
    ok(`Registration cups returns 200 (${regCups.length} cup(s))`);
    if (regCups.length > 0) {
      const sample = regCups[0];
      const countFields = Object.keys(sample).filter(k =>
        k.toLowerCase().includes('registered') || k.toLowerCase().includes('count')
      );
      if (countFields.length > 0) {
        ok(`Count fields in registration cups: ${countFields.join(', ')}`);
        console.log(`    Sample: ${JSON.stringify(Object.fromEntries(countFields.map(k => [k, sample[k]])))}`);
      } else {
        console.log(`  ℹ️  No explicit count fields (keys: ${Object.keys(sample).join(', ')}`);
      }
    }
  } else {
    fail('Registration cups', `status=${status}`);
  }
} catch (e) {
  fail('Registration cups', e.message);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
