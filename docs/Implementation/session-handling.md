# Session Handling Implementation

This document describes the comprehensive session handling implementation for the SSI Scoring system, including inactivity-based timeout, feature-specific isolation, explicit authentication, and automatic state restoration.

## Overview

The system implements **inactivity-based session timeout** with **multi-user isolation**, **feature-specific scope restrictions**, **explicit authentication requirements**, and **automatic state restoration after re-login**. Sessions expire after a configurable period of inactivity, ensuring users must explicitly re-authenticate.

## Key Features

### 1. Inactivity-Based Timeout
- Sessions have a Time-To-Live (TTL) measured from the **last activity**
- Each API request updates the `lastUsed` timestamp
- Sessions automatically expire after the TTL without activity
- Default: **1 minute** for debugging, **30 minutes** recommended for production

### 2. Multi-User Session Isolation
- Each login creates a unique session with a UUID-based session ID
- Sessions are stored server-side in memory (Map structure)
- Session ID is passed via HttpOnly cookie (`ssi_session`)
- Sessions are NOT tied to IP address (supports mobile networks, VPNs)

### 3. Feature-Specific Session Scoping (NEW)
- Each session has a `scope` field that restricts access to specific features
- **Scoring**: scope='scoring' - isolated to scoring feature
- **Manage**: scope='manage' - isolated to management feature
- **Reporting**: scope='reporting' - shared between Report and Summary pages
- Cross-scope access returns `403 Forbidden` with `scopeMismatch: true`
- Users must login separately for each feature (except Report/Summary)

### 4. Explicit Authentication Requirement (SECURITY FIX)
- **No auto-login** - Sessions never created automatically on component mount
- **Remember me only pre-fills** - Stored credentials populate form but don't trigger login
- **User must click Login** - Explicit button click required to authenticate
- **Prevents session re-establishment** - Sessions truly expire and cannot be recreated automatically
- Solves critical issue where auto-login was bypassing session timeout

### 5. Automatic State Restoration (UX ENHANCEMENT)
- Navigation state automatically saved to localStorage during user interactions
- After session expiry and re-login, users return to their previous page
- **No data loss** - Entered data (like scores) preserved across session expiry
- Implementation per feature:
  - **Scoring**: Restores exact view, cup, match, squad, shooter, series, and all scores
  - **Manage**: Restores to cup overview if user was viewing one
  - **Report/Summary**: Restores search view with search text preserved

### 6. Automatic Session Cleanup
- Background job runs every 30 seconds
- Removes expired sessions from memory
- Prevents memory leaks from abandoned sessions

### 7. Graceful Expiry Handling
- Backend returns `401 Unauthorized` with `sessionExpired: true` flag
- Frontend detects expired sessions via `SessionExpiredError`
- User is redirected to the login page with a clear message
- "Remember me" credentials are preserved (for form pre-fill only)
- User must click "Login" to explicitly re-authenticate
- After re-login, previous state is automatically restored

## Backend Implementation

### Session Store (server.js)

```javascript
const sessions = new Map() // sessionId → session data
const SESSION_TTL = 1 * 60 * 1000 // 1 minute (configurable)

// Session structure:
{
  jwt: string,              // SSI API JWT token
  refreshToken: string,     // JWT refresh token
  apiKey: string | null,    // Optional API key
  ssiCookies: string,       // SSI session cookies
  scope: string,            // Feature scope: 'scoring' | 'manage' | 'reporting'
  createdAt: number,        // Timestamp (ms)
  lastUsed: number          // Timestamp (ms) - updated on each request
}
```

### Authentication Middleware (server.js)

```javascript
function requireAuth(scope) {
  return (req, res, next) => {
    const session = getSession(req)
    if (!session) {
      return res.status(401).json({ 
        error: 'Session expired. Please login again.',
        sessionExpired: true 
      })
    }
    
    // Check scope if required
    if (scope && session.scope !== scope) {
      // Special case: /api/matches accepts both 'scoring' and 'reporting'
      const allowedScopes = Array.isArray(scope) ? scope : [scope]
      if (!allowedScopes.includes(session.scope)) {
        return res.status(403).json({
          error: 'Please login to access this feature.',
          scopeMismatch: true,
          requiredScope: scope,
          currentScope: session.scope
        })
      }
    }
    
    req.ssiSession = session
    next()
  }
}
```

The middleware:
1. Reads session ID from cookie
2. Looks up session in the Map
3. Checks if session has expired (current time - lastUsed > TTL)
4. **Validates session scope** matches endpoint requirements (NEW)
5. **Updates `lastUsed` to current time** (renews session)
6. Attaches session to `req.ssiSession` for route handlers

### Auth Status Endpoint (routes/auth.js)

```javascript
GET /api/auth/status
Response: {
  authenticated: boolean,
  hasJwt: boolean,
  hasSession: boolean,
  remainingMs: number  // Time until expiry (0 if expired)
}
```

## Frontend Implementation

### Session Expiry Detection (api.js)

```javascript
export class SessionExpiredError extends Error {
  constructor(message = 'Session expired') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

export class ScopeMismatchError extends Error {
  constructor(message, requiredScope, currentScope) {
    super(message)
    this.name = 'ScopeMismatchError'
    this.requiredScope = requiredScope
    this.currentScope = currentScope
  }
}

async function handleResponse(resp) {
  const data = await resp.json()
  if (resp.status === 401 && data.sessionExpired) {
    throw new SessionExpiredError(data.error)
  }
  if (resp.status === 403 && data.scopeMismatch) {
    throw new ScopeMismatchError(data.error, data.requiredScope, data.currentScope)
  }
  // ... handle other errors
}
```

All API functions use `handleResponse` to automatically detect session expiry and scope mismatches.

### Session Expiry Handling (Component Pattern)

Each feature component (App.jsx, ManagePage.jsx, ReportPage.jsx, SummaryReportPage.jsx) implements:

```javascript
// State
const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)

// Handler - preserves navigation state for restoration after re-login
const handleSessionExpired = useCallback(() => {
  setSessionExpiredMessage('Session expired. Please login again.')
  // Navigation state is already saved in localStorage via useEffect
  // It will be restored after successful re-login
  setView('login') // or setAuthed(false)
}, [])

// Handler for scope mismatch
const handleScopeMismatch = useCallback(() => {
  setSessionExpiredMessage('Please login to access this feature.')
  setView('login')
}, [])

// Wrapper for API calls
const withSessionCheck = useCallback(async (fn) => {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof api.SessionExpiredError) {
      handleSessionExpired()
      throw err
    }
    if (err instanceof api.ScopeMismatchError) {
      handleScopeMismatch()
      throw err
    }
    throw err
  }
}, [handleSessionExpired, handleScopeMismatch])

// Usage
const handleAction = async () => {
  try {
    await withSessionCheck(async () => {
      const data = await api.someApiCall()
      // process data
    })
  } catch (err) {
    if (!(err instanceof api.SessionExpiredError) && 
        !(err instanceof api.ScopeMismatchError)) {
      setError(err.message)
    }
  }
}
```

### No Auto-Login Pattern (CRITICAL SECURITY)

Components DO NOT automatically log in on mount. Credentials are only loaded for form pre-fill:

```javascript
// On mount: load saved credentials for pre-fill ONLY (no auto-login)
useEffect(() => {
  const loadSavedCreds = async () => {
    const raw = localStorage.getItem(LS_KEYS.CREDS)
    if (!raw) return
    const creds = await decryptData(raw)
    if (creds) {
      setSavedCreds(creds) // pre-fill form only
    } else {
      lsRemove(LS_KEYS.CREDS) // corrupted data
    }
  }
  loadSavedCreds()
}, [])
```

**Why this matters:**
- Previous implementation had auto-login on mount
- This was recreating sessions after expiry/logout
- Sessions appeared to never truly clear
- Now user MUST click Login button to create session
- This ensures session timeout actually works

### Mount-Time Session Bootstrap Pattern (RELOAD UX)

To avoid dropping users to login on browser reload when the session cookie is still valid,
feature entry components should run a mount-time auth bootstrap:

```javascript
useEffect(() => {
  let isActive = true

  const bootstrapFromActiveSession = async () => {
    try {
      const status = await api.getAuthStatus()
      if (!isActive) return

      const canRestore = status?.authenticated && (!status.scope || status.scope === 'scoring')
      if (canRestore) {
        await restoreNavState()
      }
    } catch {
      // keep explicit login as fallback
    }
  }

  bootstrapFromActiveSession()
  return () => { isActive = false }
}, [restoreNavState])
```

Important constraints:

- This **does not call** `/api/auth/login` and therefore is **not auto-login**.
- It only reads existing session state from `/api/auth/status` and restores local UI state.
- Scope must match the feature (`scoring` for `App.jsx` and `TabletApp.jsx`).
- If status check fails or scope does not match, stay on login view.

### State Restoration Pattern (UX ENHANCEMENT)

Components save navigation state during user interactions and restore it after re-login:

```javascript
// Save navigation state on changes (App.jsx example)
useEffect(() => {
  if (view === 'login') return // Don't save login view
  localStorage.setItem(LS_KEYS.NAV, JSON.stringify({
    view,
    cupId: selectedCup?.id,
    matchId: selectedMatch?.id,
    squadId: selectedSquad?.id,
    shooterId: selectedShooterId,
    activeSeries,
  }))
}, [view, selectedCup, selectedMatch, selectedSquad, selectedShooterId, activeSeries])

// Restore state after login (App.jsx example)
const handleLogin = async (email, password, apiKey, rememberMe) => {
  // ... handle login ...
  await api.login(email, password, apiKey, 'scoring') // Pass scope
  // ... save credentials if rememberMe ...
  
  // Restore previous navigation state
  await restoreNavState()
}

const restoreNavState = async () => {
  const nav = localStorage.getItem(LS_KEYS.NAV)
  if (!nav) {
    setView('cup') // Default view
    return
  }
  
  const state = JSON.parse(nav)
  // Restore cup, match, squad, etc.
  // Load necessary data from API
  // Set view to previous state
}
```

**Benefits:**
- User doesn't lose their place after session timeout
- Entered data (like scores) preserved across expiry
- Seamless workflow - login interruption is minimized
- Better UX - no need to re-navigate after re-authentication

### Login Screen Updates

When session expires, the login screen shows a yellow warning banner:

```jsx
{sessionExpiredMessage && (
  <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
    <p className="text-yellow-800 text-sm font-medium">{sessionExpiredMessage}</p>
  </div>
)}
```

## Protected Features

The following features require authentication and are subject to session timeout and scope validation:

1. **Scoring** (`#/scoring`) - App.jsx
   - Scope: `'scoring'`
   - Isolated from other features
   - State restoration: Full navigation tree, all scores

2. **Manage** (`#/manage`) - ManagePage.jsx
   - Scope: `'manage'`
   - Isolated from other features  
   - State restoration: Cup overview if viewing one

3. **Report** (`#/report`) - ReportPage.jsx
   - Scope: `'reporting'` (shared with Summary)
   - Can access Summary without re-login
   - State restoration: Search view with search text

4. **Summary** (`#/summary`) - SummaryReportPage.jsx
   - Scope: `'reporting'` (shared with Report)
   - Can access Report without re-login
   - State restoration: Search view with search text

**Note:** Users must log in separately for each isolated feature (scoring, manage). Report and Summary share a session scope.

## Session Security

### Cookie Configuration

```javascript
res.cookie(SESSION_COOKIE, sessionId, {
  httpOnly: true,        // Not accessible via JavaScript
  sameSite: 'lax',       // CSRF protection
  secure: IS_PROD,       // HTTPS only in production
  path: '/api',          // Only sent to /api/* endpoints
  maxAge: SESSION_TTL,   // Browser-side timeout
})
```

### Session ID Format
- UUID v4 format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
- Generated with `crypto.randomUUID()` (cryptographically secure)
- 128-bit entropy, collision-resistant

### IP Address Independence
Sessions are **not** tied to IP addresses, which:
- ✅ Supports mobile networks (IP changes on cell tower handoff)
- ✅ Supports VPNs and proxies
- ✅ Supports load-balanced environments
- ⚠️ Slightly less secure (session hijacking risk if cookie is stolen)

The trade-off is acceptable because:
- Cookies are HttpOnly (not accessible to XSS)
- Cookies have SameSite=Lax (CSRF protection)
- Sessions expire quickly (1-30 minutes)
- HTTPS in production (cookie theft requires MITM)

## Configuration

### Adjusting Session Timeout

Edit `scoring-proxy/server.js`:

```javascript
// Development/debugging: 1 minute
const SESSION_TTL = 1 * 60 * 1000

// Production: 30 minutes (recommended)
const SESSION_TTL = 30 * 60 * 1000

// Adjust cleanup interval if needed (defaults to 30 seconds)
setInterval(() => {
  // cleanup logic
}, 30 * 1000)
```

### Testing Session Timeout

Run the comprehensive test suite:

```bash
cd scoring-proxy
node --test test/session-timeout.test.js
```

Tests verify:
- ✅ Session creation on login with scope
- ✅ Session validity immediately after login
- ✅ Session renewal with activity
- ✅ Session expiry after inactivity (waits 61 seconds)
- ✅ 401 responses on all protected endpoints
- ✅ 403 responses on cross-scope access
- ✅ Multi-user session isolation
- ✅ Unique session IDs
- ✅ Session security attributes (HttpOnly, SameSite, etc.)

Frontend tests (`scoring-ui/src/test/`):
- ✅ 160 component and integration tests
- ✅ No auto-login behavior
- ✅ Explicit authentication flows
- ✅ Error handling for SessionExpiredError and ScopeMismatchError

## Complete Session Lifecycle

See `docs/session-lifecycle.md` for detailed state charts and analysis.

### Normal Flow (Happy Path)

1. **User navigates to feature** (e.g., #/scoring)
2. **Login screen displayed** - Credentials pre-filled if "remember me" was used
3. **User clicks "Login" button** - Explicit action required
4. **Backend creates session** with appropriate scope ('scoring', 'manage', or 'reporting')
5. **Session cookie set** - HttpOnly, secure in production
6. **Navigation state saved** - Continuously as user works
7. **User works in feature** - Each API call renews session (updates lastUsed)
8. **Session expires after 1 min inactivity** - No API calls for 60+ seconds
9. **Next API call returns 401** - Session expired
10. **Frontend shows message** - "Session expired. Please login again."
11. **User clicks "Login"** - Re-authenticates with same or different credentials
12. **State restored** - User returns to exact page with preserved data

### Cross-Feature Access (Scope Validation)

1. **User logs into scoring** - Session created with scope='scoring'
2. **User navigates to manage** - Tries to access management feature
3. **API call returns 403** - Scope mismatch (has 'scoring', needs 'manage')
4. **Frontend shows message** - "Please login to access this feature."
5. **User clicks "Login"** - Must authenticate for 'manage' scope
6. **New session created** - Separate session with scope='manage'

**Exception:** Report and Summary share 'reporting' scope - can access both freely.

### Logout Flow

1. **User clicks "Sign out"** - In any feature
2. **Backend deletes session** - Session removed from Map
3. **Cookie cleared** - Session cookie deleted
4. **Redirect to login** - User sees login screen
5. **No auto-login** - User must click "Login" to create new session
6. **Credentials still available** - If "remember me" was used (form pre-fill only)

### Security Notes

- **No auto-login** - Sessions never created automatically
- **Explicit authentication** - User must click Login button
- **Session truly expires** - Cannot be recreated without explicit action
- **Feature isolation** - Each feature requires separate login (except Report/Summary)
- **State preservation** - Work is not lost, but requires re-authentication

## Troubleshooting

### Session expires too quickly
- Check `SESSION_TTL` value in `server.js`
- Ensure API requests are updating `lastUsed` (verify `getSession` is called)
- Verify cleanup interval isn't too aggressive

### Session doesn't expire
- Check if cleanup interval is running
- Verify `Date.now() - session.lastUsed > SESSION_TTL` logic
- Check for auto-login code that might be recreating sessions

### User not redirected to login on expiry
- Check browser console for `SessionExpiredError`
- Verify `handleResponse` is detecting `sessionExpired: true`
- Ensure component has `withSessionCheck` wrapper
- Check that API calls are using the wrapper

### Auto-login is occurring (SECURITY ISSUE)
- **This should NEVER happen** - auto-login was removed for security
- Check for `tryAutoLogin` or similar functions in components
- Verify no `useEffect` is calling `api.login()` on mount
- Remember me should only pre-fill form, not trigger login

### Cross-feature access not blocked
- Check scope parameter in `api.login()` call
- Verify `requireAuth(scope)` middleware is used on endpoints
- Check backend returns 403 with `scopeMismatch: true`
- Verify frontend catches `ScopeMismatchError`

### State not restored after re-login
- Check `localStorage` for saved state keys (LS_KEYS.NAV, LS_MANAGE_STATE, etc.)
- Verify `restoreNavState` or similar function is called after login
- Check browser console for errors during state restoration
- Ensure state is saved before session expires (useEffect dependencies)

### Multiple tabs interfere with each other
- Each tab should have its own session cookie
- Logout from one tab should not affect others (unless explicitly designed to)
- If issues occur, check cookie `Path` and `SameSite` settings
- Sessions are per-cookie, not per-browser

## Future Enhancements

Potential improvements for production:

1. **Persistent Session Store**
   - Use Redis or database instead of in-memory Map
   - Survives server restarts
   - Supports horizontal scaling

2. **Session Warning**
   - Show countdown timer before expiry
   - "Your session will expire in 1 minute" warning
   - Automatic session renewal on user activity

3. **Sliding Window**
   - Current: fixed window from last activity
   - Alternative: sliding window with hard maximum (e.g., 8 hours max regardless of activity)

4. **Session Logging**
   - Log session creation, expiry, logout
   - Useful for security audits and troubleshooting

5. **Rate Limiting by Session**
   - Prevent abuse by limiting requests per session
   - Currently only IP-based rate limiting exists
