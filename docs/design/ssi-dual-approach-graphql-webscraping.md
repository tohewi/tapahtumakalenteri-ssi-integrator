# SSI Dual Approach: GraphQL + Web Scraping

**Last Updated**: 2026-02-10
**Status**: Production Implementation

---

## Executive Summary

The SSI integration uses a **hybrid approach** combining GraphQL (for reads) and web scraping (for writes). This document explains:

1. **Why both approaches are needed** (GraphQL mutations are broken server-side)
2. **How email handling differs** between approaches (GraphQL has it, web scraping doesn't)
3. **Authentication differences** (JWT for GraphQL, session cookies for web scraping)
4. **How we safely bridge the two** approaches

---

## The Core Problem

The SSI (ShootNScoreIt) platform provides two APIs, but **neither is complete**:

### GraphQL API (Read Operations)
- ✅ **Authentication**: JWT tokens via `token_auth` mutation
- ✅ **Email Available**: `competitors { email }` and `shooter { email }` fields exist
- ✅ **Reliable reads**: Queries work perfectly
- ❌ **Mutations Broken**: `create_event` fails server-side with `'NoneType' object has no attribute '_meta'`
- ❌ **Cannot write**: Event creation, squad assignment, match management all broken

### Web Scraping API (Write Operations)
- ✅ **Authentication**: Session cookies via traditional login form POST
- ✅ **Reliable writes**: Form submissions work for all operations
- ❌ **Email NOT Available**: HTML pages only show first/last names, no email fields
- ❌ **Name-only matching**: Must search/identify users by name (ambiguous)

**Conclusion**: We must use **both approaches together** to get a complete API.

---

## Detailed Comparison

### Authentication Methods

| Aspect | GraphQL (JWT) | Web Scraping (Cookies) |
|--------|---------------|------------------------|
| **Login endpoint** | `/graphql` → `token_auth` mutation | `/login/` → POST form |
| **Credentials format** | JSON: `{email, password}` | Form: `username=email&password=...` |
| **Auth token type** | JWT (stateless, signed) | Session cookie (stateful, server-side) |
| **Token storage** | In-memory on client | Browser cookie + server Map |
| **Token refresh** | `refresh_token` mutation | Re-login required (no refresh) |
| **Used for** | GraphQL queries | HTTP form POSTs, HTML scraping |
| **Scope** | API operations only | Full web app access |

**Important**: These are **separate authentication systems**. A JWT token cannot be used for web scraping, and session cookies cannot be used for GraphQL.

### Email Field Availability

| Data Source | Email Available? | How Retrieved | Example |
|-------------|------------------|---------------|---------|
| **GraphQL: CUP competitors** | ✅ YES (with fallback) | `c.email` or `c.shooter.email` | `competitors { email shooter { email } }` |
| **GraphQL: Match competitors** | ✅ YES | `c.email` or `first_name/last_name` | `competitors { email first_name last_name }` |
| **GraphQL: Squad members** | ✅ YES | `c.shooter.email` | `competitors { shooter { email first_name last_name } }` |
| **Web scraping: Any page** | ❌ NO | Not rendered in HTML | Only `<td>John</td><td>Doe</td>` visible |

**Why this matters**:
- GraphQL gives us **email for unique identification** (primary key)
- Web scraping gives us **only names** (non-unique, ambiguous)
- We must **fetch emails via GraphQL first**, then use names for web scraping operations

### Typical Workflow Pattern

```javascript
// STEP 1: Use GraphQL to get competitor data (WITH email)
const cupData = await graphqlWithRefresh(session, `
  query GetCup($id: String!) {
    event(content_type: 136, id: $id) {
      ... on NordicSerieNode {
        competitors {
          id
          status
          email                    # ← EMAIL AVAILABLE
          shooter {
            first_name
            last_name
            email                  # ← FALLBACK EMAIL
          }
        }
      }
    }
  }
`, { id: cupId })

// Extract competitor with email
const competitor = cupData.event.competitors[0]
const email = competitor.email || competitor.shooter?.email  // Email-first
const name = `${competitor.shooter.first_name} ${competitor.shooter.last_name}`

// STEP 2: Use web scraping for write operation (REQUIRES session cookies)
// Note: Web scraping search uses email if available, but HTML response
// contains only names, so we verify match by name
const result = await ssiSearchAndAddParticipant(
  eventContentType,
  eventId,
  email,           // Search by email (preferred)
  cookies,         // Session cookies (NOT JWT)
  { firstName: competitor.shooter.first_name, lastName: competitor.shooter.last_name }
)

// STEP 3: Web scraping function internally does:
// POST search form with email → HTML response with name-only table
// Find row matching firstName/lastName → Extract SSI user ID from link
// POST add form with user ID → Success/failure
```

---

## Authentication Flow Details

### Dual-Session Architecture

The system maintains **TWO separate sessions** per user:

```javascript
// Server-side session storage (scoring-proxy/server.js)
const sessions = new Map() // sessionId → session object

// Session object structure:
{
  jwt: string,              // ← JWT token for GraphQL queries
  refreshToken: string,     // ← JWT refresh token
  apiKey: string | null,    // Optional API key
  ssiCookies: string,       // ← Session cookies for web scraping
  scope: string,            // Feature scope (scoring, manage, staffing, reporting)
  createdAt: number,
  lastUsed: number
}
```

**Key point**: Each session contains **BOTH** authentication credentials:
- `jwt` + `refreshToken` → Used for GraphQL operations
- `ssiCookies` → Used for web scraping operations

### Login Process (Dual Authentication)

When a user logs in, the backend performs **TWO SSI authentications**:

```javascript
// File: scoring-proxy/routes/auth.js
router.post('/login', async (req, res) => {
  const { email, password, apiKey, scope } = req.body

  // 1. GraphQL authentication (get JWT)
  const jwtResult = await ssiGraphQL(null, `
    mutation Login($email: String!, $password: String!) {
      token_auth(email: $email, password: $password) {
        token { token }
        refresh_token { token }
      }
    }
  `, { email, password })

  const jwt = jwtResult.token_auth.token.token
  const refreshToken = jwtResult.token_auth.refresh_token.token

  // 2. Web scraping authentication (get session cookies)
  const loginResult = await ssiLogin(email, password)
  const ssiCookies = loginResult.cookies

  // 3. Create unified session with BOTH credentials
  const sessionId = crypto.randomUUID()
  sessions.set(sessionId, {
    jwt,
    refreshToken,
    apiKey,
    ssiCookies,    // ← Now we can do web scraping
    scope,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  })

  // 4. Return session cookie to client
  res.cookie(SESSION_COOKIE, sessionId, { httpOnly: true, ... })
  res.json({ success: true })
})
```

**Result**: One user login = two SSI authentications = unified session with both capabilities.

### Why This Works

- **User perspective**: Single login, seamless experience
- **Backend perspective**: Can use both APIs transparently
- **Security**: Both credentials stored server-side, never exposed to client
- **Expiry**: Session timeout applies to both (when session expires, both credentials are dropped)

---

## Email Handling Strategy

### The Email Availability Problem

**GraphQL competitor objects** can have email in two places:

```graphql
{
  competitors {
    id: "12345"
    status: "a"
    email: "john.doe@example.com"        # ← Direct competitor email (sometimes present)
    shooter {
      first_name: "John"
      last_name: "Doe"
      email: "john.doe@example.com"      # ← Shooter profile email (usually present)
    }
  }
}
```

**Important**:
- **CUP-level competitors**: Email is often in `c.shooter.email` (nested)
- **Match-level competitors**: Email can be in `c.email` (direct) OR `c.first_name/last_name` (name-only)
- **Squad members**: Email is in `c.shooter.email` (nested)

### Email Fallback Pattern

**Always use this pattern** when reading competitor data:

```javascript
// Correct: Check both locations
const email = competitor.email || competitor.shooter?.email

// Also correct: Primary + fallback
const email = competitor.shooter?.email || competitor.email

// Wrong: Only check one location
const email = competitor.email  // ❌ May be undefined
```

This is documented in memory: **"GraphQL email fields: All GraphQL queries for competitors must fetch email at both competitor level (c.email) and shooter level (c.shooter.email)."**

### Email as Primary Identifier

Since email is unique in SSI, we use it as the **primary key** for shooter identification:

```javascript
// File: scoring-proxy/routes/management.js

// Create shooter map keyed by email (not name)
const getShooterKey = (firstName, lastName, email) => {
  if (!email) {
    // If email missing, create unique error key to prevent false matches
    return `${firstName}|||${lastName}|||ERROR_NO_EMAIL_${Math.random()}`
  }
  return `${firstName}|||${lastName}|||${email.toLowerCase()}`
}

const shooterMap = new Map()
for (const competitor of competitors) {
  const email = competitor.email || competitor.shooter?.email
  const key = getShooterKey(
    competitor.shooter.first_name,
    competitor.shooter.last_name,
    email
  )
  shooterMap.set(key, { email, name: ..., ... })
}
```

**Benefits**:
- Handles name ambiguity (multiple "John Smith" entries)
- Prevents false matches when email is missing
- Aligns with SSI's internal user identification

### Web Scraping Email Usage

Web scraping functions **accept email as a parameter** but **cannot verify it** from HTML:

```javascript
// File: scoring-proxy/lib/ssi-core/client.js

export async function ssiSearchAndAddParticipant(
  eventContentType,
  eventId,
  email,           // ← Email passed in (if known)
  cookies,
  { firstName, lastName } = {}
) {
  // Build search form data
  const formData = new URLSearchParams()
  formData.append('email', email || '')           // Search by email if available
  formData.append('last_name', lastName || '')
  formData.append('first_name', firstName || '')

  // POST search form
  const searchResp = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  })

  const html = await searchResp.text()

  // ⚠️ HTML DOES NOT CONTAIN EMAIL
  // We can only parse: <td>John</td><td>Doe</td><td><a href="/add/...">Add</a></td>
  // Email is NOT rendered in the table!

  // So we match by name (ambiguous, but best we can do)
  const rows = parseHTMLTable(html)
  const match = rows.find(r =>
    r.firstName === firstName && r.lastName === lastName
  )

  if (!match) {
    // Log email for debugging (but we can't verify it from HTML)
    console.warn(`User not found: ${firstName} ${lastName} (email: ${email})`)
    return { success: false, message: 'User not found' }
  }

  // Extract add link and POST it
  const addLink = match.addLink
  // ... continue with add operation
}
```

**Key insight**: Email is used for **searching** (SSI backend uses it), but we **cannot verify** the match from HTML. We must trust name-based matching.

---

## User Management: Why Both Approaches Needed

### Scenario: Adding a Shooter to Match

**Requirements**:
1. Know the shooter's email (for unique identification)
2. Add the shooter to a match (write operation)
3. Verify they were added successfully (read operation)

**Implementation**:

```javascript
// STEP 1: GraphQL - Get shooter email from CUP
const cupData = await graphqlWithRefresh(session, `
  query GetCup($id: String!) {
    event(content_type: 136, id: $id) {
      ... on NordicSerieNode {
        competitors {
          email
          shooter { first_name last_name email }
        }
      }
    }
  }
`, { id: cupId })

const shooter = cupData.event.competitors.find(c =>
  (c.email || c.shooter?.email) === targetEmail
)

// STEP 2: Web scraping - Add shooter to match (GraphQL mutation doesn't work)
const addResult = await ssiSearchAndAddParticipant(
  91,                           // Match content type
  matchId,
  shooter.email || shooter.shooter?.email,  // Email for search
  session.ssiCookies,           // Session cookies (NOT JWT)
  {
    firstName: shooter.shooter.first_name,
    lastName: shooter.shooter.last_name,
  }
)

// STEP 3: GraphQL - Verify shooter was added
const matchData = await graphqlWithRefresh(session, `
  query GetMatch($id: String!) {
    event(content_type: 91, id: $id) {
      ... on NordicMatchNode {
        competitors {
          email
          first_name
          last_name
        }
      }
    }
  }
`, { id: matchId })

const added = matchData.event.competitors.find(c =>
  c.email === targetEmail ||
  (c.first_name === shooter.shooter.first_name &&
   c.last_name === shooter.shooter.last_name)
)

if (added) {
  console.log('Shooter successfully added and verified')
} else {
  console.error('Shooter add operation failed')
}
```

**Why this demonstrates the need for both**:
- ✅ GraphQL provides email for accurate identification
- ✅ Web scraping provides write capability (add operation)
- ✅ GraphQL confirms the write succeeded (verification)

---

## Security Implications

### Session Cookie Security

Web scraping requires session cookies, which have **broader access** than JWT:

| Security Aspect | JWT (GraphQL) | Session Cookies (Web Scraping) |
|-----------------|---------------|--------------------------------|
| **Access scope** | GraphQL API only | Full SSI web application |
| **Capabilities** | Read operations | Read + write + admin functions |
| **Expiry** | Refreshable (long-lived) | Fixed timeout (short-lived) |
| **Storage** | Server-side in session | Server-side in session |
| **Client exposure** | Never sent to client | Never sent to client |
| **Revocation** | Via session deletion | Via session deletion |

**Mitigation**:
- Both credentials stored **server-side only** (never sent to browser)
- Session timeout applies to both (when session expires, both are dropped)
- HttpOnly cookies prevent JavaScript access
- Scope restrictions prevent cross-feature access

### Authentication Flow Security

```javascript
// Client-side (scoring-ui/src/api.js)
export async function login(email, password, apiKey, scope) {
  const resp = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, apiKey, scope }),
    credentials: 'include',  // Allow cookies
  })

  // ⚠️ JWT is NOT returned to client
  // ⚠️ Session cookies are NOT accessible via JavaScript
  // ✅ Client only gets HttpOnly session cookie
  // ✅ All SSI credentials stay server-side

  return await resp.json()
}

// Server-side (scoring-proxy/server.js)
// Client calls /api/manage/cup/:id
function requireAuth(scope) {
  return (req, res, next) => {
    const sessionId = req.cookies[SESSION_COOKIE]
    const session = sessions.get(sessionId)

    if (!session) {
      return res.status(401).json({ sessionExpired: true })
    }

    // Attach BOTH credentials to request
    req.ssiSession = {
      jwt: session.jwt,             // ← For GraphQL
      ssiCookies: session.ssiCookies,  // ← For web scraping
      // ... other fields
    }

    next()
  }
}

// Route handler can now use both APIs
router.get('/cup/:id', requireAuth('manage'), async (req, res) => {
  // Use GraphQL (with JWT)
  const cupData = await graphqlWithRefresh(req.ssiSession, query, vars)

  // Use web scraping (with cookies)
  const addResult = await ssiSearchAndAddParticipant(
    contentType, id, email, req.ssiSession.ssiCookies, { firstName, lastName }
  )
})
```

**Security benefits**:
- ✅ Client never sees SSI credentials
- ✅ Single session controls both APIs
- ✅ Session expiry drops both credentials
- ✅ Scope restrictions apply to both
- ✅ No credential leakage to browser

---

## Common Patterns and Best Practices

### Pattern 1: Email-First Identification

**Always fetch email via GraphQL before doing web scraping operations:**

```javascript
// ✅ CORRECT: Fetch email first
const cupData = await graphqlWithRefresh(session, cupQuery, { id: cupId })
const shooter = cupData.event.competitors[0]
const email = shooter.email || shooter.shooter?.email

await ssiSearchAndAddParticipant(matchId, email, cookies, {
  firstName: shooter.shooter.first_name,
  lastName: shooter.shooter.last_name,
})

// ❌ WRONG: Web scraping without email
await ssiSearchAndAddParticipant(matchId, null, cookies, {
  firstName: 'John',  // ← Ambiguous! Which John?
  lastName: 'Smith',
})
```

### Pattern 2: GraphQL Query Email Fields

**Always query both email locations:**

```javascript
// ✅ CORRECT: Fetch both email fields
const query = `
  query GetCompetitors($id: String!) {
    event(content_type: 136, id: $id) {
      ... on NordicSerieNode {
        competitors {
          id
          status
          email                    # ← Direct email
          shooter {
            first_name
            last_name
            email                  # ← Nested email
          }
        }
      }
    }
  }
`

// ❌ WRONG: Only fetch one email location
const query = `
  query GetCompetitors($id: String!) {
    event(content_type: 136, id: $id) {
      ... on NordicSerieNode {
        competitors {
          id
          email   # ← May be undefined!
          shooter { first_name last_name }
        }
      }
    }
  }
`
```

### Pattern 3: Error Handling for Missing Email

**Handle missing email gracefully:**

```javascript
// ✅ CORRECT: Validate email exists
const email = competitor.email || competitor.shooter?.email
if (!email) {
  console.warn(`Competitor ${name} has no email, cannot perform operation`)
  return { success: false, message: 'Email required' }
}

await ssiSearchAndAddParticipant(matchId, email, cookies, ...)

// ❌ WRONG: Assume email exists
const email = competitor.email  // ← May be undefined
await ssiSearchAndAddParticipant(matchId, email, ...)  // ← Breaks
```

### Pattern 4: Verification After Write

**Always verify web scraping operations via GraphQL:**

```javascript
// ✅ CORRECT: Verify write succeeded
const addResult = await ssiSearchAndAddParticipant(matchId, email, cookies, ...)

const verifyData = await graphqlWithRefresh(session, `
  query VerifyMatch($id: String!) {
    event(content_type: 91, id: $id) {
      ... on NordicMatchNode {
        competitors { email first_name last_name }
      }
    }
  }
`, { id: matchId })

const found = verifyData.event.competitors.find(c =>
  c.email === email ||
  (c.first_name === firstName && c.last_name === lastName)
)

if (!found) {
  throw new Error('Add operation appeared to succeed but competitor not found')
}

// ❌ WRONG: Trust web scraping return value only
const addResult = await ssiSearchAndAddParticipant(matchId, email, cookies, ...)
if (addResult.success) {
  return { success: true }  // ← No verification!
}
```

---

## Troubleshooting

### "Email is undefined"

**Problem**: GraphQL query returns competitors without email field.

**Solution**:
1. Check that you're querying both `email` and `shooter { email }`
2. Use fallback: `const email = c.email || c.shooter?.email`
3. If still undefined, check SSI data quality (some users may not have email)

**Example**:
```javascript
// Add this to your query
competitors {
  email                    # ← Add this
  shooter {
    email                  # ← And this
    first_name
    last_name
  }
}
```

### "Web scraping finds wrong person"

**Problem**: Multiple people with same name, wrong one selected.

**Solution**:
1. Always pass email to web scraping functions (for search)
2. Log warnings when multiple matches found
3. Consider adding middle name or other distinguishing info

**Example**:
```javascript
// Pass email to narrow search
await ssiSearchAndAddParticipant(
  matchId,
  'john.smith@example.com',  // ← Narrows search
  cookies,
  { firstName: 'John', lastName: 'Smith' }
)
```

### "Session cookies expired but JWT still valid"

**Problem**: GraphQL works but web scraping fails with 401/403.

**Solution**: Session cookies have shorter lifetime than JWT. Re-login to refresh both.

**Detection**:
```javascript
// Check session status
const status = await fetch('/api/auth/status', { credentials: 'include' })
const data = await status.json()

if (data.hasJwt && !data.hasSession) {
  console.error('JWT valid but session cookies expired - re-login needed')
}
```

### "GraphQL has email but web scraping doesn't find user"

**Problem**: Email in GraphQL doesn't match SSI search results.

**Causes**:
1. Email typo in SSI database
2. User registered with different email than profile shows
3. User account deactivated

**Debugging**:
```javascript
// Enable debug mode in ssi-core/client.js
const debug = true  // Set to true
console.log(`Searching for: ${email}`)
// Check server logs for actual search results
```

---

## Summary

### The Hybrid Approach

| Component | GraphQL | Web Scraping |
|-----------|---------|--------------|
| **Authentication** | JWT tokens | Session cookies |
| **Primary use** | Read operations | Write operations |
| **Email available** | ✅ YES | ❌ NO (HTML only has names) |
| **Reliability** | ✅ HIGH | ✅ HIGH (for writes) |
| **Mutations** | ❌ BROKEN | ✅ WORKS |
| **When to use** | All reads, verification | All writes (add, remove, assign) |

### Key Principles

1. **Use GraphQL for reads** - Get accurate data with email
2. **Use web scraping for writes** - Only way to modify data
3. **Pass email to web scraping** - Enables better search results
4. **Verify writes with GraphQL** - Confirm operations succeeded
5. **Always query both email fields** - `c.email` and `c.shooter.email`
6. **Store both credentials server-side** - One session, two APIs
7. **Never expose credentials to client** - Security through server-side storage

### This Approach Is Solid Because

✅ **Email identification works** - GraphQL provides emails, we pass them to web scraping
✅ **Write operations work** - Web scraping handles all mutations
✅ **Read operations work** - GraphQL provides fast, reliable queries
✅ **Verification works** - GraphQL confirms writes succeeded
✅ **Authentication unified** - One login, two credentials, seamless usage
✅ **Security maintained** - All credentials server-side, proper scope isolation
✅ **Well documented** - This document + code comments explain the approach

### Future Improvements

When SSI fixes GraphQL mutations (tracked via Pester tests in `scripts-graphql/tests/`):

1. Replace web scraping write operations with GraphQL mutations
2. Keep dual authentication (may still need cookies for some operations)
3. Continue using email-first identification pattern
4. Update this document to reflect the transition

Until then, **the hybrid approach is the correct and only way** to achieve full SSI integration.

---

## References

- **SSI API Limitations**: `.github/agents/ssi-api-limitations.md`
- **GraphQL Findings**: `docs/design/ssi-graphql-findings.md`
- **Session Handling**: `docs/design/session-handling.md`
- **SSI Client Implementation**: `scoring-proxy/lib/ssi-core/client.js`
- **Management Routes**: `scoring-proxy/routes/management.js` (demonstrates email-first pattern)
- **Staffing Routes**: `scoring-proxy/routes/staffing.js` (demonstrates email usage in GraphQL)
- **Email Identification Memory**: Repository memory states email is primary key
