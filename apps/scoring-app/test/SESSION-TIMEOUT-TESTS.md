# Session Timeout Tests

This test file verifies the session handling security features:

## What is Tested

### Session Timeout (1 minute inactivity)
- ✅ Session is created on login
- ✅ Session is valid immediately after login
- ✅ Session remains valid with activity (requests reset the timer)
- ✅ Session expires after 1 minute of inactivity
- ✅ Expired sessions return 401 on all protected endpoints

### Multi-User Session Isolation
- ✅ Different sessions are isolated from each other
- ✅ Logout only affects the specific session
- ✅ Session IDs are unique UUIDs

### Session Security
- ✅ Cannot use protected endpoints without session cookie
- ✅ Cannot use invalid/fake session cookies
- ✅ Session cookies have proper security attributes (HttpOnly, SameSite, Path)

## Running the Tests

**Requirements:**
1. The proxy server must be running on `localhost:3001`
2. Valid SSI credentials must be set in environment variables:
   - `SSI_EMAIL`
   - `SSI_PASSWORD`
   - `SSI_API_KEY`

**Run command:**
```bash
# From scoring-proxy directory
node --test test/session-timeout.test.js
```

**Note:** These tests include deliberate delays (61 seconds) to verify session expiry.
The full test suite takes approximately 3-4 minutes to complete.

## Session Configuration

The session timeout is configured in `server.js`:

```javascript
// Session timeout: 1 minute for debugging. Change to 30 * 60 * 1000 (30 min) for production.
const SESSION_TTL = 1 * 60 * 1000 // 1 minute inactivity timeout
```

For production deployment, change this to a longer timeout (e.g., 30 minutes).
