# Session Handling Implementation

This document describes the session handling implementation for the SSI Scoring system.

## Overview

The system implements **inactivity-based session timeout** with multi-user isolation. Sessions expire after a configurable period of inactivity, ensuring that users must re-authenticate after being idle.

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

### 3. Automatic Session Cleanup
- Background job runs every 30 seconds
- Removes expired sessions from memory
- Prevents memory leaks from abandoned sessions

### 4. Graceful Expiry Handling
- Backend returns `401 Unauthorized` with `sessionExpired: true` flag
- Frontend detects expired sessions via `SessionExpiredError`
- User is redirected to the login page with a clear message
- "Remember me" credentials are preserved
- User must click "Login" to re-authenticate

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
  createdAt: number,        // Timestamp (ms)
  lastUsed: number          // Timestamp (ms) - updated on each request
}
```

### Authentication Middleware (server.js)

```javascript
function requireAuth(req, res, next) {
  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ 
      error: 'Session expired. Please login again.',
      sessionExpired: true 
    })
  }
  req.ssiSession = session
  next()
}
```

The middleware:
1. Reads session ID from cookie
2. Looks up session in the Map
3. Checks if session has expired (current time - lastUsed > TTL)
4. **Updates `lastUsed` to current time** (renews session)
5. Attaches session to `req.ssiSession` for route handlers

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

async function handleResponse(resp) {
  const data = await resp.json()
  if (resp.status === 401 && data.sessionExpired) {
    throw new SessionExpiredError(data.error)
  }
  // ... handle other errors
}
```

All API functions use `handleResponse` to automatically detect session expiry.

### Session Expiry Handling (Component Pattern)

Each feature component (App.jsx, ManagePage.jsx, ReportPage.jsx, SummaryReportPage.jsx) implements:

```javascript
// State
const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)

// Handler
const handleSessionExpired = useCallback(() => {
  setSessionExpiredMessage('Session expired. Please login again.')
  setView('login') // or setAuthed(false)
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
    throw err
  }
}, [handleSessionExpired])

// Usage
const handleAction = async () => {
  try {
    await withSessionCheck(async () => {
      const data = await api.someApiCall()
      // process data
    })
  } catch (err) {
    if (!(err instanceof api.SessionExpiredError)) {
      setError(err.message)
    }
  }
}
```

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

The following features require authentication and are subject to session timeout:

1. **Scoring** (`#/scoring`) - App.jsx
2. **Manage** (`#/manage`) - ManagePage.jsx
3. **Report** (`#/report`) - ReportPage.jsx
4. **Summary** (`#/summary`) - SummaryReportPage.jsx

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
- ✅ Session creation on login
- ✅ Session validity immediately after login
- ✅ Session renewal with activity
- ✅ Session expiry after inactivity (waits 61 seconds)
- ✅ 401 responses on all protected endpoints
- ✅ Multi-user session isolation
- ✅ Unique session IDs
- ✅ Session security attributes

## Troubleshooting

### Session expires too quickly
- Check `SESSION_TTL` value in `server.js`
- Ensure API requests are updating `lastUsed` (verify `getSession` is called)

### Session doesn't expire
- Check if cleanup interval is running
- Verify `Date.now() - session.lastUsed > SESSION_TTL` logic

### User not redirected to login on expiry
- Check browser console for `SessionExpiredError`
- Verify `handleResponse` is detecting `sessionExpired: true`
- Ensure component has `withSessionCheck` wrapper

### Multiple tabs interfere with each other
- Each tab should have its own session cookie
- Logout from one tab should not affect others
- If issues occur, check cookie `Path` and `SameSite` settings

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
