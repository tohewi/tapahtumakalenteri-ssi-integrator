# SSI Scoring — Enhancement Plan

**Date**: 2026-02-06
**Current version**: 1.1.0

---

## 1. Security Enhancements (Priority: Critical)

### 1.1 Security Posture (as of v1.1.0)

The following risks were identified in v1.0.0 and resolved in v1.1.0:

| Risk | Severity | Status | Resolution |
|---|---|---|---|
| **In-memory plaintext credentials** | 🔴 High | ✅ Fixed | Credentials isolated per session in `Map<sessionId, {...}>` |
| **Single-user server state** | 🔴 High | ✅ Fixed | Per-session isolation via `ssi_session` HttpOnly cookie |
| **Credentials in transit to proxy** | 🟡 Medium | ✅ Mitigated | HTTPS in production (Render), credentials never logged |
| **No token expiry handling** | 🟡 Medium | ✅ Fixed | `graphqlWithRefresh()` auto-refreshes JWT on 401/expiry |
| **Proxy logs credentials context** | 🟢 Low | ✅ Fixed | Production logs sanitized via log levels (`LOG_LEVEL=info` in production) |
| **CORS wide open** | 🟡 Medium | ✅ Fixed | Locked to `APP_URL` origin in production |
| **No rate limiting** | 🟡 Medium | ✅ Fixed | Login endpoint: max 10 attempts per 15 min per IP |

#### Remaining risks

| Risk | Severity | Description |
|---|---|---|
| **In-memory session store** | 🟡 Medium | Sessions are lost on server restart. Acceptable for current scale. Consider Redis for high availability. |
| **No structured logging** | 🟢 Low | `console.log` used directly. Consider `pino` for production-grade logging. |

### 1.2 Proposed Security Fixes

#### S-1: Per-session credential isolation (High Priority)

**Problem**: Server holds one global JWT/session — multi-user unsafe.

**Solution**: Issue a session token (random UUID) to each browser after login. Store JWT + cookies in a server-side `Map` keyed by session token. Browser sends session token as a cookie or header on each request.

```
Browser → POST /api/auth/login → Proxy creates session { jwt, cookies }
Browser ← Set-Cookie: ssi_session=<uuid>
Browser → GET /api/cups (Cookie: ssi_session=<uuid>) → Proxy looks up session
```

**Benefit**: Multi-user safe, credentials scoped per session, session can expire independently.

#### S-2: JWT token refresh (High Priority)

**Problem**: JWT expires, all requests fail until re-login.

**Solution**: On 401 from SSI GraphQL, use `jwtRefreshToken` to obtain a new JWT transparently. Implement in `ssiGraphQL()`:

```javascript
// On 401 or "token expired" error:
const newToken = await refreshJWT(session.refreshToken)
session.jwt = newToken
// Retry original request
```

#### S-3: Lock down CORS in production (Medium Priority)

**Problem**: Any origin can call the API.

**Solution**:
```javascript
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? [process.env.APP_URL || 'https://ssi-scoring.onrender.com']
  : true
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))
```

#### S-4: Rate-limit login endpoint (Medium Priority)

**Problem**: No brute-force protection.

**Solution**: Use `express-rate-limit`:
```javascript
import rateLimit from 'express-rate-limit'
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })
app.post('/api/auth/login', loginLimiter, async (req, res) => { ... })
```

#### S-5: Session expiry and cleanup (Medium Priority)

**Problem**: Sessions live forever in memory.

**Solution**: Set a TTL (e.g., 8 hours) on each session. Run a cleanup interval every 15 minutes. Expired sessions are removed from the map.

#### S-6: Sanitize production logs (Low Priority)

**Problem**: `console.log` outputs operational details.

**Solution**: Use centralized `LOG_LEVEL`-based logging (`scoring-proxy/lib/logger.js`). Keep production default at `LOG_LEVEL=info` (Render config), while local development defaults to `debug` when `LOG_LEVEL` is unset. Never log cookie values or tokens.

#### S-7: Helmet security headers (Low Priority)

**Solution**: Add `helmet` middleware for standard security headers (CSP, HSTS, X-Frame-Options, etc.):
```javascript
import helmet from 'helmet'
app.use(helmet())
```

### 1.3 Security Implementation Roadmap

| Phase | Items | Effort |
|---|---|---|
| **Phase 1** (v1.1) | S-1 (per-session), S-3 (CORS), S-7 (helmet) | 1 day |
| **Phase 2** (v1.2) | S-2 (JWT refresh), S-4 (rate limit), S-5 (session expiry) | 1 day |
| **Phase 3** (v1.3) | S-6 (structured logging) | 0.5 day |

---

## 2. Functional Enhancements

### 2.1 Scoring UX Improvements

| # | Enhancement | Priority | Effort |
|---|---|---|---|
| F-1 | **Undo last action** — Undo button to revert last zone tap | Medium | 2h |
| F-2 | **Score confirmation dialog** — Confirm before submitting (prevent accidental taps) | Medium | 1h |
| F-3 | **Shooter score summary** — Show all 6 series totals for current shooter before save | Medium | 2h |
| F-4 | **Squad completion indicator** — Show overall squad progress across all series | Low | 1h |
| F-5 | **Offline score queue** — Queue score submissions when offline, sync when back online | High | 4h |
| F-6 | **Sound/haptic feedback** — Vibrate on zone tap for tactile confirmation | Low | 1h |

### 2.2 Navigation Improvements

| # | Enhancement | Priority | Effort |
|---|---|---|---|
| N-1 | **Recent cups** — Show last 3-5 cups on the search screen without searching | Medium | 2h |
| N-2 | **Pull-to-refresh** — Refresh match/squad data with pull gesture | Low | 2h |
| N-3 | **Deep linking** — URL-based navigation (e.g., `/cup/123/match/456`) | Low | 4h |

### 2.3 Data & Reporting

| # | Enhancement | Priority | Effort |
|---|---|---|---|
| D-1 | **Score verification** — Read-back and compare submitted scores with SSI response | High | 2h |
| D-2 | **Scoring audit log** — Record who scored what and when (local + server) | Medium | 3h |
| D-3 | **Export scores** — Download squad scores as CSV/PDF for paper backup | Low | 4h |

---

## 3. Technical Enhancements

### 3.1 Architecture

| # | Enhancement | Priority | Effort |
|---|---|---|---|
| T-1 | **Environment config** — Move hardcoded SSI URL, ports to env variables | High | 1h |
| T-2 | **Error boundary** — React error boundary to prevent white screens | Medium | 1h |
| T-3 | **Loading skeletons** — Replace spinners with skeleton screens for perceived speed | Low | 2h |
| T-4 | **Structured API errors** — Consistent error response format with error codes | Medium | 2h |

### 3.2 Testing

| # | Enhancement | Priority | Effort |
|---|---|---|---|
| Q-1 | **E2E tests** — Playwright tests for full login → score → submit flow | High | 4h |
| Q-2 | **Proxy unit tests** — Mock SSI responses for proxy endpoint testing | Medium | 3h |
| Q-3 | **Crypto module tests** — Test encrypt/decrypt roundtrip, key generation | Medium | 1h |
| Q-4 | **CI test coverage** — Add coverage reporting to GitHub Actions | Low | 1h |

### 3.3 DevOps

| # | Enhancement | Priority | Effort |
|---|---|---|---|
| O-1 | **Health check endpoint** — `GET /api/health` for Render monitoring | High | 0.5h |
| O-2 | **Build from CI artifacts** — Deploy pre-built dist from GH Actions instead of rebuilding on Render | Medium | 2h |
| O-3 | **Staging environment** — Separate Render service for pre-production testing | Low | 1h |

---

## 4. Recommended Next Release (v1.1)

Focus: **Proxy security hardening**

| Item | Type | Priority |
|---|---|---|
| S-1 | Per-session credential isolation | 🔴 High |
| S-3 | Lock down CORS in production | 🟡 Medium |
| S-7 | Helmet security headers | 🟢 Low |
| T-1 | Environment config for SSI URL | 🔴 High |
| O-1 | Health check endpoint | 🔴 High |
| S-2 | JWT token refresh | 🔴 High |
| S-4 | Rate-limit login | 🟡 Medium |

Estimated effort: **2 days**

---

## 5. Long-term Considerations

### Direct SSI API Access

Currently the proxy exists because:
1. SSI requires server-side session cookies for score writes (CORS blocks browser-direct)
2. The SSI GraphQL API doesn't support CORS for browser origins

If SSI adds CORS headers or a public API with token-based writes, the proxy could be eliminated — the React app would call SSI directly. This would simplify the architecture significantly but is dependent on SSI platform changes.

### Alternative Hosting

Render free tier has cold-start delays (~30s after idle). For a better mobile experience:
- **Render paid tier** — Always-on, no cold starts
- **Fly.io** — Free tier with always-on option
- **Railway** — Similar to Render with better cold-start behavior

### Multi-tenant Support

Currently one proxy instance = one concurrent user session (until S-1 is implemented). For a club with multiple scorers at the same event, S-1 (per-session isolation) is essential.
