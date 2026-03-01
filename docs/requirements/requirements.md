# Requirements

## Release 1.0 - SSI Cup Automation (Complete)

| # | Requirement | Status |
|---|-------------|--------|
| 1 | It must be possible to specify match date as parameter | ✅ |
| 2 | Date format is dd-mm-yyyy | ✅ |
| 3 | Default start time is 09.00 | ✅ |
| 4 | Default end time is 12.00 | ✅ |
| 5 | A RESUL CUP is created for provided date | ✅ |
| 6 | Cup scoring_mode should be "series-points is same as component-match points" (pts) | ✅ |
| 7 | Cup and Match max competitors is 25 | ✅ |
| 8 | Cup allowed categories is 'Open' | ✅ |
| 9 | Cup results are shown only to participants | ✅ |
| 10 | Cup competitor will be automatically registered to all Cup Matches | ✅ |
| 11 | Registration will start one week before the Cup | ✅ |
| 12 | For each Cup, three matches are created: "Tarkkuus", "Pika", "Kuvio" | ✅ |
| 13 | Individual matches are type 25m Pistooli Kuvio | ✅ |
| 14 | Match name is in format "Kupittaa dd.mm.yyyy <name>" | ✅ |
| 15 | Matches belong to the Cup event | ✅ |
| 16 | Result verification should not be required | ✅ |
| 17 | There are three squads per match - Oma ase 1, Oma ase 2, Laina-ase | ✅ |
| 18 | Oma ase 1 and 2 have max 9 shooters. Laina-ase has max 7 shooters | ✅ |
| 19 | Squad names and maximum shooters are defined in a configuration file | ✅ |
| 20 | Match registration will start at the same time with the Cup | ✅ |
| 21 | Cup is managed by group id 25874 | ✅ |
| 22 | Match is managed by group id 25874 | ✅ |
| 23 | Cup has a description (max 300 chars) defined in configuration file | ✅ |
| 24-26 | Match descriptions defined in configuration file | ✅ |
| 27 | Duplicate name check for cups and matches before creation | ✅ |
| 28 | Cup registration ends 12 hours before the Cup start time | ✅ |
| 29-30 | Match registration/end date/time synced with Cup | ✅ |
| 31 | Cup has a Web Address with URL and description "Lisätietoa" | ✅ |
| 32-33 | Squading schedule synced with registration | ✅ |
| 34 | Match has a location "Kupittaan urheiluhalli, Tahkonkuja 5, 20520 TURKU" | ✅ |
| 35 | Auto-approve pending registrations | ⏸️ On hold |
| 36 | Copy shooter squadding from Match #1 to Matches #2 and #3 | ⏸️ On hold |
| 37 | Login with username/password instead of manual sessionid cookie | ✅ |

## Release 2.0 - WordPress Integration (Complete)

| # | Requirement | Status |
|---|-------------|--------|
| 38 | **Tapahtumakalenteri Integration**: Create WordPress calendar event when Cup is created. Event as draft, Cup URL in content, permalink includes Cup ID. Single config file for both SSI and WordPress. | ✅ |
| 39 | Mock testing capability | ⬚ Pending |
| 40 | Upfront authentication for both SSI and WordPress | ✅ |
| 41 | PowerShell secrets management | ⏸️ Parked (OTP required) |
| 42 | Modularize for different event types | ⬚ Pending |
| 43 | **Statistics Update**: Update shots fired (participants × 100) in calendar event after Cup completion | ✅ |
| 44 | **Auto-Publish**: Validate URLs and publish calendar event after successful creation | ✅ |
| 45 | **Batch Creation**: Create multiple events from date list file, sequential processing, skip existing | ✅ |
| 46 | **Single Authentication**: One-time auth with session reuse for batch processing | ✅ |

## Release 3.0 - Scoring Application

### Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| S1 | Login with SSI credentials (email, password, API key) via proxy | ✅ v1.0.0 |
| S2 | Search cups by name, sorted by proximity to today | ✅ v1.0.0 |
| S3 | Browse cup → match → squad → shooter hierarchy | ✅ v1.0.0 |
| S4 | Enter scores per series using zone-tap buttons (X, 10–1, M) | ✅ v1.0.0 |
| S5 | Submit scores to SSI via Django form POST through proxy | ✅ v1.0.0 |
| S6 | Read-back verification of submitted scores via GraphQL | ✅ v1.0.0 |
| S7 | Double-series mode (navigate 6 series per shooter) | ✅ v1.0.0 |
| S8 | After score submit, return to shooter list — unscored shooters are visually highlighted, user picks who to score next | ✅ v1.1.0 |
| S9 | Build/release details displayed at top of every page in very small font | ✅ v1.1.0 |
| S10 | Match list in Cup preserves SSI component order (1-Tarkkuus, 2-Pika, 3-Kuvio) | ✅ v1.2.0 |

### Persistence Requirements

| # | Requirement | Status |
|---|-------------|--------|
| P1 | Remember me: securely store credentials on device (AES-GCM encrypted in localStorage). On refresh, auto-login and restore previous navigation state. Falls back to pre-filled login screen if auto-login fails | ✅ v1.2.0 |
| P2 | Auto-restore login session on app reopen | ❌ Removed (replaced by P1 rework) |
| P3 | Persist navigation state (cup, match, squad, series) in localStorage | ✅ v1.0.0 |
| P4 | Persist in-progress scores in localStorage | ✅ v1.0.0 |

### Mobile & PWA Requirements

| # | Requirement | Status |
|---|-------------|--------|
| M1 | PWA installable (manifest, service worker, icons) | ✅ v1.0.0 |
| M2 | Touch-optimized scoring buttons (large tap targets) | ✅ v1.0.0 |
| M3 | Responsive layout for mobile scoring at the range | ✅ v1.0.0 |

### Build & Deploy Requirements

| # | Requirement | Status |
|---|-------------|--------|
| B1 | GitHub Actions CI/CD (test, audit, build, deploy) | ✅ v1.0.0 |
| B2 | Render hosting (single process: proxy + static UI) | ✅ v1.0.0 |
| B3 | Build version badge visible in UI | ✅ v1.0.0 |
| B4 | Node.js v24 LTS pinned in engines | ✅ v1.0.0 |

### Security Requirements

| # | Requirement | Status |
|---|-------------|--------|
| SEC1 | Multi-user session isolation — per-user JWT + cookies in server-side Map, HttpOnly session cookie | ✅ v1.1.0 |
| SEC2 | JWT token auto-refresh on expiry (transparent to user) | ✅ v1.1.0 |
| SEC3 | CORS locked to production origin (APP_URL env var) | ✅ v1.1.0 |
| SEC4 | Login rate limiting — max 10 attempts per 15 min per IP | ✅ v1.1.0 |
| SEC5 | Session expiry and cleanup — 8h TTL, 15-min sweep | ✅ v1.1.0 |
| SEC6 | Helmet security headers (HSTS, X-Frame-Options, etc.) | ✅ v1.1.0 |
| SEC7 | Production log sanitization — no credentials or tokens in logs | ✅ v1.1.0 |
| SEC8 | SSI base URL configurable via environment variable | ✅ v1.1.0 |
| SEC9 | Server-side logout endpoint to destroy proxy session | ✅ v1.1.0 |
| SEC10 | Health check endpoint (`GET /api/health`) | ✅ v1.1.0 |
| SEC11 | Study: Google authentication support — SSI supports Google login; investigate if OAuth flow can be extended to scoring proxy so users who sign in to SSI with Google identity can also use this app without separate SSI credentials | ⬚ Pending |

## Release 4.0 - Kupittaa Cup registration Frontend

### Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| R1 | Public registration page accessible without SSI login (`#/register`) | ✅ |
| R2 | Human verification (math captcha) before showing any data. Server-side verification before proceeding | ✅ |
| R3 | List future Cups open for registration with capacity (registered/max). Open cups shown first, upcoming cups shown greyed out | ✅ |
| R4 | Show squads per Cup with current/max capacity and full indicator (TÄYNNÄ). Full squads disabled | ✅ |
| R5 | Shooter enters SSI email, selects Cup and Squad, submits registration. Summary shown before submit | ✅ |
| R6 | Backend registers shooter to Cup and assigns selected squad in all matches via SSI admin web scraping. NDJSON streaming progress | ✅ |
| R7 | If email not found in SSI, inform shooter and provide direct SSI registration link | ✅ |
| R8 | On success, display confirmation with Cup, date, squad, and email. Re-registration shows "Squad päivitetty!" | ✅ |
| R9 | Individual matches hidden from shooter — Cup enrollment auto-enrolls all matches | ✅ |
| R10 | Finnish language UI throughout | ✅ |
| R11 | **Re-registration**: If shooter is already registered in CUP, allow squad change instead of blocking. UI shows "Squad päivitetty!" for re-registration | ✅ |
| R12 | **Registered count**: Cup list and cup detail show actual approved shooter count derived from match squad competitor data (not SSI `number_of_prematch_competitors_registered` which is for pre-matches, not applicable to Kupittaa) | ✅ |
| R13 | **CUP approval via toggle-status**: CUP participant approval uses SSI toggle-status URL. The CUP participant edit form (CT=137) silently ignores status changes — only toggle-status works. Match competitor edit form (CT=93) does support status via edit form | ✅ |
| R14 | **Post-registration confirmation email**: After successful registration and squadding, shooter receives an email listing CUP name, all matches with squad assignment per match, instructions for changing squad (re-register at registration app URL), and instructions for withdrawing (SSI My Registrations). Sent via Resend API from `no-reply@ssi.towi.me`. Non-blocking — email failure does not fail registration | ✅ |

### Registration Security Requirements

| # | Requirement | Status |
|---|-------------|--------|
| RSEC1 | **No user enumeration**: Registration endpoints must never expose whether a given email exists in SSI. Error responses must be generic. The only signal is "registration succeeded" or "email not found in SSI — please register on SSI first". No user lists, names, or profile data are ever returned | ✅ |
| RSEC2 | **Minimal API surface**: Registration backend exposes only the endpoints strictly necessary for cup selection, squad selection, and registration submission. No admin, user search, participant listing, or other SSI functionality is exposed through registration APIs | ✅ |
| RSEC3 | **Strict input validation**: All registration endpoint inputs are validated against a strict schema — `cupId` must be a positive integer string, `squadNumber` a small positive integer, `email` a valid email format (max 254 chars), `captchaId` a UUID, `captchaAnswer` a small integer. Reject any request that does not match. No free-form text fields are accepted | ✅ |
| RSEC4 | **Request size limits**: Enforce maximum request body size (e.g. 1 KB) on registration endpoints to prevent buffer/payload attacks | ✅ |
| RSEC5 | **No code injection**: All inputs are treated as opaque strings — never interpolated into HTML, SQL, shell commands, or GraphQL queries without parameterization. GraphQL uses parameterized variables only. Web scraping form POSTs use `URLSearchParams` (auto-escaped). Email templates use HTML escaping | ✅ |
| RSEC6 | **Rate limiting**: Registration submission limited to 5 attempts per 10 min per IP. Captcha: 30/10min. Reads: 60/10min. Login: 10/15min. `trust proxy` enabled for Render reverse proxy | ✅ |
| RSEC7 | **Admin credentials isolation**: SSI admin credentials used by registration backend are stored in server-side environment variables only, never exposed to the client. Admin session is server-side singleton, not tied to any user request | ✅ |
| RSEC8 | **No SSI internals leakage**: Error responses from SSI admin operations are sanitized before returning to client. Internal SSI URLs, participant IDs, squad IDs, and debug details are never returned in production responses | ✅ |
| RSEC9 | **Captcha anti-replay**: Each captcha challenge is single-use and time-limited (15 min TTL). Expired or already-used captchas are rejected. On expiry, UI preserves selections and auto-loads new captcha | ✅ |
| RSEC10 | **Helmet + CORS**: Registration endpoints inherit the same Helmet security headers and CORS policy as the scoring application. CSP disabled for Tailwind inline styles (accepted trade-off) | ✅ |
| RSEC11 | **Rate limit logging**: When an IP is rate-limited (429), log the IP, limiter name, and timestamp. Dump all currently throttled IPs with first-throttled time. Auto-cleanup after 15 min. Applied to all 4 rate limiters | ✅ |

## Release 6.0 - Match Management & UI Consolidation

### Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| MG1 | **Match Management UI** (`#/manage`): Password-protected (SSI login). After login, pick an active Kupittaa cup. Shows consolidated squadding overview — per-squad cross-match table, unsquadded shooters, CUP/match membership mismatches | ✅ |
| MG2 | **Cup list sorting**: Sort cups ascending by proximity to today (closest first). Applies to all cup lists (register, manage, scoring) | ⬚ Pending ➜ R7.6 (R76-MG2) |
| MG3 | **Scoring route change**: Move scoring app from `#/` to `#/scoring`. Root URL (`#/`) becomes a front page with static links to the three main features: Scoring, Registration, Management | ⬚ Pending ➜ R7.6 (R76-MG3) |
| MG4 | **Shared UI components**: Extract and share common components (LoginScreen, CupList, visual design) between scoring, registration, and management features | ⬚ Pending ➜ R7.6 (R76-MG4) |
| MG5 | **Manage cup list**: Reuse the same CUP list component as Registration. Only change text from "ilmoittautuminen" to "hallitse" | ⬚ Pending ➜ R7.6 (R76-MG5) |

### Shooter Identification Requirements (Critical)

| # | Requirement | Status |
|---|-------------|--------|
| MG-ID1 | **Email as Primary Identifier**: Email address MUST be the PRIMARY identifier for all shooter operations. Rationale: SSI supports wildcard/partial name searches which return ambiguous results (searching "Ari" returns both "Ari Virtanen" and "Jari Virtanen"). Email-based identification eliminates ambiguity. All GraphQL queries fetch email addresses. Backend uses `firstName\|\|\|lastName\|\|\|email` composite keys | ✅ |
| MG-ID2 | **Exact Match Required**: When using participant IDs from GraphQL, ONLY exact ID matches are permitted. Name-based fallback matching is PROHIBITED in production flows. Rationale: SSI wildcard name search can return unrelated participants with similar names, causing state changes on wrong individuals (e.g., approving "Ari" when searching for "Jari"). State functions accept optional `participantId` parameter (5th param). When provided, use ID directly with no name search. Backend validates `cupParticipantId` exists before calling CUP state functions | ✅ |
| MG-ID3 | **Fail-Safe on Ambiguity**: If exact match cannot be found via participant ID, operation MUST fail with clear error message. Never proceed with ambiguous or partial matches. Rationale: Incorrect operations (approving/deleting wrong shooter) cause data integrity issues. Backend returns HTTP 400 with descriptive error if `participantId` missing. Frontend displays error alert. Error messages: "Cannot approve in CUP: shooter is not pending in CUP (only in matches)" | ✅ |
| MG-ID4 | **UI Visibility**: UI MUST clearly indicate when operations cannot be performed. Hide approve/remove buttons for match-only pending shooters. Show "(Vain osakilpailuissa)" label instead. Display email addresses for all shooters. Show "🚨 Sähköposti puuttuu" for missing emails | ✅ |
| MG-ID5 | **Unique Keys for Missing Emails**: When email is missing, generate unique error keys (e.g., `ERROR_NO_EMAIL_abc123`) to prevent false matches between shooters with same name but no email | ✅ |

### Design Principles

**Email First, Name Second:** Always use email as primary key. Names are for display only.
**Explicit over Implicit:** Require explicit participant IDs. No silent fallbacks to name-based matching.
**Fail Loudly:** Alert users immediately when exact match fails. Never guess.
**Prevent Ambiguity:** Unique keys for missing emails prevent false positives.
**Defensive Programming:** Validate inputs, log warnings, return clear errors.

## Release 3.1 - Data Integrity (Planned)

| # | Requirement | Status |
|---|-------------|--------|
| 47 | **Data Integrity Check**: Modular integrity verification between SSI and WordPress. (1) List all Cups owned by SSI login and verify each has a corresponding Tapahtumakalenteri event. (2) Validate date list file against both systems - all dates should have SSI Cup and WordPress event. (3) Verify cross-references: WordPress permalink contains Cup ID, WordPress content links to SSI Cup URL. Configurable by event type (e.g., Kupittaa Cup) and date list file parameter. | ⬚ Pending |
| 48| Design automation architecture with following assumptions: Continue with web scraping (Tapahtumakalenteri and SSI API access will not happen shortly). It is going to be possible to programmatically access mailbox to read OTP. Automation architecture should utilize agents and workflows. Tech preference Azure and MS Foundry. Agentic workflows should keep up to date with Tapahtumakalenteri events and perform reporting and data integrity tasks when needed. i.e. after an event. Agentic workflow should handle a batch request for new events or updating existing events. If this requirement is too large, split it into smaller requirements and into multiple versions to achieve suitable increments of functionality. Always make sure documentation and test automation is in place and adds value to users and developers, agentig or human.| ⬚ Pending |
||| ⬚ Pending |

## Release 7.0 - Authentication and Session Handling

### Authentication Requirements

| # | Requirement | Status |
|---|-------------|--------|
| AUTH1 | **Dual-Session Architecture**: Implement secure impersonation with user session + admin SSI delegation. Each user session must contain both user's SSI token and admin SSI token for impersonation. | ✅ Implemented |
| AUTH2 | **User Session Persistence**: Sessions must persist across server restarts using Redis store with 8-hour TTL. Session data includes user ID, user SSI token, admin SSI token, scope, and metadata. | ✅ Implemented |
| AUTH3 | **SSI Token Validation**: User's SSI token must be validated on each API request. If user SSI token is expired, API access is denied even if proxy session is valid. | ✅ Implemented |
| AUTH4 | **Automatic SSI Token Refresh**: User's SSI token must be automatically refreshed in background when expiring within 10 minutes. Admin SSI token refreshed independently. | ✅ Implemented |
| AUTH5 | **Secure Impersonation**: All SSI operations must use admin SSI token but be bound to valid user session. Admin token cannot be accessed without valid user authentication. | ✅ Implemented |
| AUTH6 | **Session Isolation**: Each user gets isolated session with their own admin delegation. No shared admin state between users. | ✅ Implemented |
| AUTH7 | **Audit Trail**: Every SSI operation must log which user performed the action, including timestamp, operation type, and success/failure status. | ✅ Implemented |
| AUTH8 | **State Restoration**: User navigation state must be fully restored after session expiry and re-authentication. State preserved for 30 minutes post-expiry. | ✅ Implemented |
| AUTH9 | **Cross-Feature Authentication**: Single login works across scoring, management, and reporting features. No separate logins required. | ✅ Implemented |
| AUTH10 | **Registration Security**: Registration endpoints must require user authentication before using admin SSI operations. Fix current vulnerability. | ⬚ Pending ➜ R7.6 (R76-AUTH10) |

### Session Management Requirements

| # | Requirement | Status |
|---|-------------|--------|
| SES1 | **Redis Session Store**: Use express-session with connect-redis for persistent session storage. Sessions survive server restarts and deployments. | ✅ Implemented |
| SES2 | **Session TTL Configuration**: User sessions expire after 8 hours of inactivity. Configurable via environment variable. | ✅ Implemented |
| SES3 | **Session Cleanup**: Automatic cleanup of expired sessions. Redis handles TTL-based expiration. | ✅ Implemented |
| SES4 | **Session Security**: HttpOnly, Secure, SameSite=Lax cookies. Session fixation prevention. CSRF protection. | ✅ Implemented |
| SES5 | **Concurrent Sessions**: Support multiple sessions per user (different devices). Each device gets separate session ID. | ✅ Implemented |
| SES6 | **Session Revocation**: Immediate session revocation on logout, password change, or security events. | ✅ Implemented |
| SES7 | **Session Monitoring**: Track active sessions per user, last activity, and device information. | ⬚ Pending ➜ R7.6 (R76-SES7) |

### Security Requirements

| # | Requirement | Status |
|---|-------------|--------|
| SEC1 | **OWASP Compliance**: Session handling must follow OWASP Session Management Cheat Sheet guidelines. | ⬚ Pending ➜ R7.6 (R76-SEC1) |
| SEC2 | **Impersonation Security**: Admin SSI token must never be accessible without valid user session context. | ✅ Implemented |
| SEC3 | **Token Validation**: Both user and admin SSI tokens must be validated before use in SSI operations. | ✅ Implemented |
| SEC4 | **Rate Limiting**: Authentication endpoints rate limited (10 attempts/15min per IP). Session refresh limited (30/10min). | ✅ Implemented |
| SEC5 | **Audit Logging**: All authentication events, session operations, and SSI impersonation must be logged. | ✅ Implemented |
| SEC6 | **Error Handling**: Authentication errors must be generic to prevent user enumeration. | ✅ Implemented |
| SEC7 | **Secure Storage**: SSI tokens stored encrypted in Redis. Session keys use cryptographic randomness. | ⬚ Pending ➜ R7.6 (R76-SEC7) |

### Testing Requirements

| # | Requirement | Status |
|---|-------------|--------|
| TEST1 | **Unit Tests**: 90% coverage for session management, token validation, and impersonation logic. | ⬚ Pending ➜ R7.6 (R76-TEST1) |
| TEST2 | **Integration Tests**: Test complete authentication flows with Redis, SSI token refresh, and session isolation. | ⬚ Pending ➜ R7.6 (R76-TEST2) |
| TEST3 | **Security Tests**: Test impersonation security, privilege escalation prevention, and session hijacking scenarios. | ⬚ Pending ➜ R7.6 (R76-TEST3) |
| TEST4 | **Reliability Tests**: Test Redis failure scenarios, session recovery, and SSI token expiry handling. | ⬚ Pending ➜ R7.6 (R76-TEST4) |
| TEST5 | **Performance Tests**: Session lookup latency <50ms p95. Support 100 concurrent users. | ⬚ Pending ➜ R7.6 (R76-TEST5) |
| TEST6 | **E2E Tests**: Complete user journeys through login, session expiry, re-authentication, and state restoration. | ⬚ Pending |
| TEST7 | **Penetration Tests**: Simulate attacks on session management, token theft, and impersonation bypass. | ⬚ Pending ➜ R7.6 (R76-TEST7) |
| TEST8 | **Load Tests**: Session store performance under load with concurrent authentication and SSI operations. | ⬚ Pending |

## Release 7.1 — Management Availability

| # | Requirement | Status | Tokens (est.) |
|---|-------------|--------|---------------|
| MGMT1 | **Management Independent of Registration**: Kupittaa Cup Hallinta must keep cups available for management independent of registration status, once registration start date has passed and while the cup is still active. Management is available until the cup's end date and time (`ends`), or `starts + 24h` fallback. Cups with no `registration_starts` are excluded. Uses dedicated `/api/manage/cups` endpoint. | ✅ Implemented | ~14,000 |

## Release 7.3 — Refactoring Analysis (Complete)

| # | Requirement | Status |
|---|-------------|--------|
| RFA1 | **Refactoring analysis**: Review architecture-review.md, old refactoring docs, and current codebase. Identify what's done, what's outdated, what's still needed. Remove outdated docs, update requirements with actionable plan | ✅ Implemented |

Analysis completed 2026-02-20. Reviewed `docs/design/architecture-review.md` (2026-02-19), five outdated refactoring docs from `docs/Implementation/` (2026-02-08), and the current codebase. The old refactoring docs (`refactoring-plan.md`, `refactoring-executive-summary.md`, `refactoring-visual-summary.md`, `remediation-plan.md`, `test-refactoring-plan.md`) were removed — their Phase 1 recommendations (route splitting, scripts archival, Redis sessions) are already implemented. The architecture review remains the authoritative reference.

## Release 7.4 — Refactoring Implementation

### Codebase Snapshot (Feb 2026)

| Area | File | Lines | Issue |
|------|------|------:|-------|
| Backend | `lib/ssi-core/client.js` | 1,474 | **#1 risk**: 29 functions, all domains in one file |
| Backend | `routes/management.js` | 890 | Inline business logic in 9 route handlers |
| Backend | `routes/staffing.js` | 430 | No unit tests |
| Backend | `routes/scoring.js` | 332 | No unit tests |
| Backend | `routes/reports.js` | 206 | No unit tests |
| Frontend | `ManagePage.jsx` | 959 | 8 inline sub-components |
| Frontend | `App.jsx` | 645 | Entire scoring flow as single state machine |
| Frontend | `TabletScoringView.jsx` | 586 | Large but well-structured |
| Tests | Backend | 134 | Good coverage for management, auth, sessions |
| Tests | Frontend | 160 | Good coverage for API, shared, register-api |
| Tests | SSI client | 3 | **Critical gap**: 1,474-line core has ~3 tests |

### What's Already Done (from old refactoring plan Phase 1)

- ✅ `server.js` split into route modules (387 lines, was 900)
- ✅ `scripts/` archived to `archive/scripts-legacy/`
- ✅ `lib/ssi-core/` created with barrel export
- ✅ `lib/ssi-client.js` backward-compat shim in place
- ✅ Redis-backed session store (`lib/session/`)
- ✅ Dual-session architecture (user + admin)
- ✅ Audit logging for SSI operations
- ✅ Configurable log verbosity (`LOG_LEVEL`)

### What's Still Needed

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| RFR1 | **Split `ssi-core/client.js` by domain**: Created `graphql.js`, `scoring.js`, `participants.js`, `management.js`, `http-helpers.js` as domain re-export modules. Updated `index.js` barrel to export from domain modules instead of monolithic `client.js`. Actual code movement deferred to Phase 2 | HIGH | ✅ Implemented |
| RFR2 | **Add SSI client unit tests with HTML fixtures**: 26 tests across 10 describe blocks covering staff page parsing, participant page parsing, cup status parsing, scoring page extraction, and redirect-based actions. 5 HTML fixture files. Kept lightweight — SSI moving to GraphQL, scraping will be phased out | HIGH | ✅ Implemented |
| RFR3 | **Migrate route imports from compat shim**: All 6 route files + `server.js` migrated from `lib/ssi-client.js` to domain-specific imports (`graphql.js`, `scoring.js`, `participants.js`, `management.js`, `http-helpers.js`). Test mock updated. Compat shim retained for any external consumers | MEDIUM | ✅ Implemented |
| RFR4 | **Extract management route business logic**: Extracted `buildSquaddingOverview`, `attachCupStatuses`, `getIncludedMatchIds`, `filterManageableCups` into `lib/services/cup-manage.js` (356 lines). `routes/management.js` reduced from 1,009 → 546 lines. Route handlers are now thin dispatchers. 4 duplicated component_matches extraction patterns replaced with shared `getIncludedMatchIds` | MEDIUM | ✅ Implemented |
| RFR5 | **Add cup-manage service tests**: 20 unit tests in `test/cup-manage.test.js` covering `filterManageableCups` (8 tests), `getIncludedMatchIds` (2), `buildSquaddingOverview` (5), `attachCupStatuses` (2), `makeShooterKey` (2). Pure business logic tests — no HTTP mocking needed. Route-level tests deferred (existing `management.test.js` covers HTTP contract) | MEDIUM | ✅ Implemented |
| RFR6 | **Extract `useAuthenticatedPage` hook**: Created `hooks/useAuthenticatedPage.js` encapsulating auth state, session expiry, login/logout, `withSessionCheck` wrapper, and remember-me. Migrated ReportPage, SummaryReportPage, ManagePage (removed ~70 lines of duplicated auth boilerplate per page). StaffingPage skipped — different pattern (no view state machine) | MEDIUM | ✅ Implemented |
| RFR7 | **Split `ManagePage.jsx`**: Extracted 5 sub-components into `components/manage/` with barrel export: `ActionButton`, `ShooterActions`, `SquadPickerSheet`, `SectionHeader`, `SquadCard`. ManagePage reduced from 967 → 689 lines | LOW | ✅ Implemented |
| RFR8 | **Add file size guidelines to AGENTS.md**: Added to Code Style section in both `AGENTS.md` and `.github/copilot-instructions.md`: ~500 line guideline, routes extract to `lib/services/`, React pages extract to `components/<page>/`, shared hooks to `hooks/` | LOW | ✅ Implemented |

### Refactoring Phases

| Phase | Work | Effort | Impact |
|-------|------|--------|--------|
| **Phase 1** | RFR1: Split `ssi-core/client.js` into domain modules | 2-3 h | HIGH — eliminates #1 conflict hotspot |
| **Phase 2** | RFR2: Add SSI client unit tests with HTML fixtures | 3-4 h | HIGH — catches SSI HTML changes |
| **Phase 3** | RFR3 + RFR4: Migrate imports, extract management service layer | 2-3 h | MEDIUM — reduces route file sizes |
| **Phase 4** | RFR5: Add missing route tests (scoring, reports, staffing) | 3-4 h | MEDIUM — closes coverage gaps |
| **Phase 5** | RFR6 + RFR7: Extract auth hook, split ManagePage | 2-3 h | MEDIUM — reduces UI duplication |
| **Phase 6** | RFR8: Add file size guidelines | 0.5 h | LOW — prevents future growth |

**Total estimated effort:** ~15 hours across 6 phases.

### Design Decisions

- **No microservices**: The Feb 2026 refactoring plan evaluated microservices (Alternative 2) and rejected it — overkill for current scale, adds Docker/K8s complexity. Monolithic consolidation is the right approach.
- **Barrel export for backward compat**: Keep `ssi-core/index.js` re-exporting all domain modules so existing imports don't break during migration. Remove compat shim (`lib/ssi-client.js`) only after all routes are migrated.
- **Fixture-based testing**: SSI HTML parsing is the highest-risk untested code. HTML fixtures (saved SSI page snapshots) enable fast, deterministic tests that catch SSI UI changes immediately.
- **No shared constants package**: Score zones are duplicated in UI and proxy but they're small (12 values). A shared NPM package adds build complexity. Keep them in sync manually until R8.1 restructures the app.

## Release 8.0 — Tablet Scoring UI

### Tablet Scoring Requirements

| # | Requirement | Status |
|---|-------------|--------|
| TS1 | **Tablet UI Mode**: Tablet-optimized scoring interface with all elements visible simultaneously (shooters, score track, number pad) accessible via `#/scoring-tablet` route | ✅ Implemented |
| TS2 | **Breadcrumb Navigation**: Clickable breadcrumb trail (Cup › Match › Squad) in header for navigating back to any level | ✅ Implemented |
| TS3 | **User Identity Display**: Display logged-in SSI user name (first + last) and email in header, fetched from GraphQL `{ me { email first_name last_name } }` | ✅ Implemented |
| TS4 | **Fixed-Height Score Bars**: Score track uses CSS Grid with fixed min-height (120px per string card) to prevent layout shifts when scores are added | ✅ Implemented |
| TS5 | **Long-Press Score Deletion**: Single-gesture score removal via 750ms long-press with visual progress feedback (red border animation). Supports both touch and mouse input | ✅ Implemented |
| TS6 | **Touch Target Compliance**: All interactive elements meet accessibility standards (56×56px score buttons, 88px number pad buttons, exceeding 44×44px minimum) | ✅ Implemented |
| TS7 | **Viewport-Fitted Layout**: UI scales to fit within screen bounds (`h-screen` with `overflow-hidden`) without requiring page-level scrolling. Individual panels scroll internally as needed | ✅ Implemented |
| TS8 | **Responsive Breakpoints**: Adaptive sizing for mobile (<1024px), tablet landscape (≥1024px), and desktop (≥1280px) using Tailwind breakpoints | ✅ Implemented |
| TS9 | **Read-Only for Completed Matches**: When match status is 'cp' (completed), scoring UI becomes read-only: number pad buttons disabled, save button shows "Match Completed" (Finnish: "Ottelu valmis"), long-press deletion disabled, green "Completed" (Finnish: "Valmis") badge shown in header. Users can browse scores but cannot edit or save | ✅ Implemented |
| TS10 | **Session Continuity for Long Competitions**: Scoring API authentication must refresh SSI user JWT before rejecting requests when token is expired or within refresh window, so active tablet sessions remain logged in during multi-hour matches | ✅ Implemented |
| TS11 | **Preserve Unsaved Local Scores on Re-Login**: Tablet scoring view must not overwrite restored local `ssi_scores` state with SSI baseline data on mount. Local in-progress edits (including `M` misses) remain visible after forced re-login/remount | ✅ Implemented |
| TS12 | **Long-Run Regression Coverage**: Automated tests must simulate long-duration scoring behavior (~3 hours) and verify no forced session drop / local-score overwrite regressions in middleware and tablet UI remount flow | ✅ Implemented |

### Rationale for TS9 (Completed Match Protection)

**Business Rule**: Completed matches ('cp' status) indicate scoring is finalized and approved by shooters with no protests. Once a match reaches 'cp' status, scores become official competition results that must be protected from accidental or unauthorized modification.

**Finnish Translation**: "Completed" = "Valmis" (indicating scoring is completed and approved)

**UI Behavior**:
- Number pad buttons: Greyed out (`disabled` state) when match is completed
- Save button: Shows "Ottelu valmis" / "Match Completed" instead of "Tallenna tulokset" / "Save Scores"
- Long-press deletion: Disabled (event handlers return early if `isMatchCompleted`)
- Header badge: Green "Valmis" / "Completed" badge appears next to match name in breadcrumb trail
- Browsing: Users can still navigate, view scores, and switch between shooters

**Implementation**: Check `match.status === 'cp'` and disable all score modification operations while preserving read-only browsing capability.

## Release 8.1 — Match Management Platform (Phase 0: Auth & Tenancy)

Self-service account onboarding: sign up, sign in, create and manage tenants. This is the foundation for the match management platform described in `docs/design/match-management-design.md`.

### Platform Auth Requirements

| # | Requirement | Status |
|---|-------------|--------|
| PA1 | **Account Sign-Up**: Self-service registration with email, password (bcrypt, 12 rounds), name, and organization name. Creates account + first tenant with 30-day free trial. Email uniqueness enforced (case-insensitive). Rate limited: 5/hr per IP | ✅ Implemented |
| PA2 | **Account Sign-In**: Email + password authentication. Returns account profile + tenant list. Separate session cookie (`platform_sid`) from SSI auth. Rate limited: 10/15min per IP | ✅ Implemented |
| PA3 | **Platform Session Management**: 24-hour sessions stored in Redis (same instance as SSI sessions). Session cookie is HttpOnly, SameSite=Lax, Secure in production. Sliding expiry on each request | ✅ Implemented |
| PA4 | **Platform Session Status**: `GET /api/v1/platform/status` returns auth state + account profile + tenant list without creating a session. Used by frontend for session restoration on mount | ✅ Implemented |
| PA5 | **Tenant Creation**: Authenticated accounts can create additional tenants. Each tenant starts with a 30-day free trial. Tenant data: name, subscription, SSI credentials (placeholder), calendar config (placeholder), disciplines | ✅ Implemented |
| PA6 | **Tenant CRUD**: List, get, and update tenants. Ownership verified — accounts can only access their own tenants. Update supports name, SSI credentials, calendar config, disciplines | ✅ Implemented |
| PA7 | **Platform Auth Middleware**: `requirePlatformAuth()` middleware validates platform session, loads account profile into `req.account`, rejects expired/missing sessions. Independent from SSI auth middleware | ✅ Implemented |
| PA8 | **Welcome/Sign-Up UI**: Landing page at `#/platform` with feature overview (Templates, Scheduling, Roster), sign-up form, and sign-in link. TailwindCSS, responsive, matches design prototype | ✅ Implemented |
| PA9 | **Sign-In UI**: Separate sign-in page with email/password form, error handling, link to sign-up | ✅ Implemented |
| PA10 | **Dashboard UI**: Post-login view showing tenant cards with subscription status, trial countdown, and quick action placeholders (templates, scheduling, roster — coming soon) | ✅ Implemented |
| PA11 | **Tenant Creation UI**: Wizard with organization name input, SSI/calendar placeholder steps (configure after creation), trial info badge. Creates tenant via API | ✅ Implemented |
| PA12 | **Platform API Client**: Frontend `platform-api.js` module with typed fetch wrapper, credential inclusion, error handling with `platformSessionExpired` flag for session restore | ✅ Implemented |
| PA13 | **Platform Store Tests**: 288 backend tests (incl. 46 platform-specific) covering account CRUD, tenant CRUD, platform sessions, transaction atomicity, SSI credential encryption (6 tests), and field-guard SQL injection prevention. Uses in-memory Redis fallback | ✅ Implemented |
| PA14 | **Tenant Detail UI**: Clicking a tenant card navigates to a settings page with sections for General (name edit, subscription info), SSI Credentials, and Calendar Config. Back button returns to dashboard with refreshed tenant list. Header shows account avatar and sign-out | ✅ Implemented |
| PA15 | **SSI Credential Configuration Form**: SSI email, password, and API key fields with show/hide toggles. Saves encrypted via PATCH endpoint. Connection status indicator (configured/not configured). Clear credentials button. Form validation — requires at least email + password | ✅ Implemented |
| PA16 | **Platform Data Hardening**: Atomic `createAccountWithTenant` (PostgreSQL transaction), row-level locking on `createTenant` (`SELECT ... FOR UPDATE`), AES-256-GCM encryption for SSI credentials (random IV per write), field allowlist guards on `updateAccount` and `updateTenant`, structured logging in platform-auth middleware | ✅ Implemented |
| PA17 | **Account Settings UI**: Account profile editing (name, email with normalization) and password change (verify current, bcrypt new). `PATCH /api/v1/platform/account` and `POST /api/v1/platform/account/change-password` endpoints. Dashboard header avatar clickable → account settings page → back to dashboard. 8 new tests (4 backend, 4 frontend) | ✅ Implemented |
| PA19 | **Match Templates (Phase 2)**: Full CRUD for match templates — event blueprints tied to disciplines. PostgreSQL `match_templates` table with JSONB columns for `overrides`, `calendar_template`, `staffing_rules`, and `ssi_seed_snapshot`. Backend: `createMatchTemplate`, `getMatchTemplate`, `listDisciplineTemplates`, `listTenantTemplates`, `updateMatchTemplate`, `deleteMatchTemplate` in platform-store.js with field allowlist guard. 5 REST endpoints nested under `/tenants/:tenantId/templates` with tenant ownership verification and discipline cross-check on create. Frontend: TemplatesSection in TenantDetailPage with discipline selector, SSI seed event ID input, expandable detail view (overrides/calendar/staffing JSON), inline edit/delete. 14 backend + 5 frontend tests. | ✅ Implemented |
| PA20 | **Tenant Roles (RBAC)**: Role-based access control for tenant operations. 6 roles: `owner` (billing, SSI credentials, full admin), `tenant_admin` (manage members/roles, all operational permissions except billing/SSI), `discipline_admin` (CRUD disciplines), `instructor_admin` (manage & approve instructors), `match_admin` (CRUD templates, schedule matches), `instructor` (read-only, self-register as match staff). PostgreSQL `tenant_members` table with `roles TEXT[]`, `status`, `invited_by`. Auto-owner membership on tenant creation (same transaction). `requireTenantRole(...roles)` middleware replaces `requireTenantOwnership` — checks membership + role satisfaction with implicit escalation (owner→all, tenant_admin→all except owner-only). Field-level permission on PATCH tenant (SSI creds = owner-only). SSI credentials masked for non-owners on GET. Last-owner protection (cannot remove/demote last owner). Member management API: 4 endpoints under `/tenants/:tenantId/members` (list, add, update roles, remove). Backward compatibility for pre-RBAC tenants. `listAccountTenants` queries via membership JOIN. Design documented in `platform-data-model.md` §2.6 with full permission matrix. 25 backend tests (hasRequiredRole pure function, auto-owner creation, membership CRUD, last-owner protection, dual-owner demotion, membership-based tenant listing). | ✅ Implemented |
| PA21 | **Email Invitation Links**: Tenant admins (owner or tenant_admin) can invite people by sending a one-time registration link to a specified email address. **Link properties**: (1) bound to the recipient email — only that email can use it, (2) single-use — consumed on first successful registration, (3) time-limited expiry (e.g., 7 days). **Flow**: Admin enters email + roles → system generates a secure token → sends email with link `#/platform/invite/{token}` → recipient clicks link → pre-filled email (read-only) → sets password + name → account created + membership with pre-assigned roles added atomically. **Storage**: `tenant_invitations` table with `token` (crypto random, hashed for storage), `email`, `tenant_id`, `roles[]`, `invited_by`, `expires_at`, `used_at`, `status` (pending/accepted/expired/revoked). **Security**: Token is hashed (SHA-256) in DB — plaintext only in the email link. Expired/used tokens rejected. Rate-limited invitation creation. **Email**: Sent via Resend API (existing `lib/email.js`). **Admin UI**: MembersPage component in sidebar with member list (role badges, inline role editor, remove), pending invitations with revoke, and invite form with email + role picker. **Accept UI**: JoinInvitePage at `#/platform/invite/:token` handles both logged-in acceptance and new account creation. | ✅ Implemented |
| PA18 | **Multi-Factor Authentication (MFA)**: TOTP-based MFA (RFC 6238) for platform owner accounts. Tenant owners hold encrypted SSI credentials and manage organization settings — account compromise could lead to unauthorized event creation, credential theft, or data manipulation. **Setup flow**: QR code generation (otpauth:// URI), manual secret entry fallback, 6-digit code verification, 10 single-use recovery codes (bcrypt-hashed). **Login enforcement**: After MFA is enabled, login requires email + password + TOTP code. Session creation blocked until MFA challenge is passed. **Sensitive operation protection**: Re-verify MFA before changing password, updating SSI credentials, or disabling MFA. **Account recovery**: Recovery codes displayed once at setup (user must save). Each code is single-use. If all codes exhausted and authenticator lost, manual account recovery via support. **Storage**: `mfa_secret` (encrypted, AES-256-GCM like SSI credentials), `mfa_enabled` boolean, `mfa_recovery_codes` (bcrypt-hashed array) in accounts table. **UI**: MFA section in Account Settings page with enable/disable toggle, QR code display, recovery code download. **Dependencies**: `otpauth` npm package for TOTP generation/verification, `qrcode` for QR rendering. **Backend**: 4 routes — `/mfa/verify` (login challenge), `/account/mfa/setup` (initiate), `/account/mfa/confirm` (enable), `/account/mfa/disable` (password-protected). MFA-pending sessions (5 min TTL) block protected routes via auth middleware. `upgradeMfaSession` promotes to full session after verification. **Frontend**: MfaChallengePage (TOTP/recovery code input after login), MfaSection in AccountSettingsPage (3-step setup with QR + recovery codes + confirm, password-protected disable). | ✅ Implemented |

### Design Decisions (PA1–PA21)

- **Separate from SSI auth**: Platform accounts have their own identity system. SSI credentials are per-tenant, not per-account. An account may have tenants that use different SSI accounts.
- **Redis storage (temporary)**: Currently uses Redis with `platform:` key prefix. Will migrate to PostgreSQL for persistent data — see `docs/design/platform-data-model.md` for storage strategy.
- **bcrypt for passwords**: Industry standard, 12 rounds. No plaintext storage.
- **Session cookie isolation**: `platform_sid` cookie is separate from the SSI `ssi_session` cookie. Both can coexist — a user could be logged into both the platform and SSI scoring simultaneously.
- **Free trial by default**: Every new tenant gets 30 days of full functionality. Payment integration (Stripe) is deferred to a later phase.
- **Frontend route**: `#/platform` — keeps the existing scoring/register/manage routes unchanged.
- **Data model**: See `docs/design/platform-data-model.md` for entity definitions, relationships, lifecycles, and storage strategy.
- **SSI credential encryption**: AES-256-GCM with fresh random IV per write. Key from `PLATFORM_CREDENTIALS_KEY` env var (64 hex chars). Decrypted transparently on read by `rowToTenant()`. See `platform-store.js` for implementation.
- **Atomic account creation**: `createAccountWithTenant()` uses PostgreSQL transaction — if tenant creation fails, account is rolled back. Prevents orphaned accounts.
- **Tenant detail navigation**: Dashboard → Tenant Detail is state-based (not URL-based). Back navigation refreshes tenant list to pick up renames.
- **MFA rationale**: Platform owner accounts are high-value targets — they hold encrypted SSI credentials for one or more organizations, control tenant settings, and manage personnel. TOTP (authenticator app) was chosen over SMS because: (a) no phone number required, (b) no SMS delivery cost, (c) resistant to SIM-swap attacks, (d) works offline. Recovery codes provide a fallback when the authenticator device is lost.

## Release 7.4.1 — Authentication UX Hardening

Patch release focused on authentication UX consistency across protected feature domains and documentation consolidation.

| # | Requirement | Status |
|---|-------------|--------|
| AUTH-UX1 | **Mount-time auth bootstrap**: Protected feature entry must call `/api/auth/status` on mount and decide between restore or login without creating a new session | ✅ Implemented |
| AUTH-UX2 | **Restoring auth gate**: Protected features must render a neutral `restoring`/loading state while auth bootstrap runs, instead of showing login first | ✅ Implemented |
| AUTH-UX3 | **No auto-login on mount**: Reload restoration must not call `/api/auth/login`; explicit user login remains required to create sessions | ✅ Implemented |
| AUTH-UX4 | **Architecture baseline update**: Session handling documentation must define Auth Bootstrap + Auth Gate as the default pattern for all protected domains (`scoring`, `manage`, `reporting`) | ✅ Implemented |
| AUTH-UX5 | **Authentication UAT coverage**: Add a concise UAT test plan covering login, reload with/without session, expiry, scope mismatch, restore-after-login, and logout persistence | ✅ Implemented |

## Release 7.2 — Kupittaa Cup Management

| # | Requirement | Status |
|---|-------------|--------|
| CUP1 | **Move Shooter Between Squads**: In the "Squadit" section, it must be possible to move a shooter from one squad to another. The UI must show the same `→ S?` button as in the "Ei Squadeissa" section and function identically (squad picker dialog, SSI sync). Move is only allowed within the same match via Squadit. | 📋 Specified ➜ R7.6 (R76-CUP1) |
| CUP2 | **Set Shooter as DNS (Did Not Start)**: SSI calls this "Did Not Show". Setting DNS must be applied at the **cup level** and on **all matches** in the cup. The button must appear next to every shooter regardless of which section they are in. Clicking it shows a confirmation dialog: "Set N.N as DNS?" / "Aseta Etu Suku DNS?" (fi/en). It must be possible to **undo** (reverse) DNS if set by accident. SSI endpoints: `GET /event/participant/{ct}/{id}/set-did-not-show/` (set) and `GET /event/participant/{ct}/{id}/undo-did-not-show/` (undo), applied to cup + each match. | ✅ Implemented |
| CUP3 | **Mark Payment Received**: Per-competitor paid toggle at the **cup level only**. UI shows a button next to each shooter. When paid, the button must be **solid green** (high contrast) so it is immediately obvious who has paid when scanning the list. When unpaid, the button is gray/muted. State is stored in SSI via `GET /event/participant/{ct}/{id}/toggle-paid/`. Must reflect current paid status from SSI and allow toggling. | ✅ Implemented |

### Design Decisions (CUP1–CUP3)

- **All features** are added to the existing **Hallinta** page (`SquadManagementPage` component). No new pages needed.
- **CUP1**: Move is performed only within Squadit (not across matches). Strict capacity enforcement — cannot move into a full squad. Same `→ S?` button and squad picker as "Ei Squadeissa" section.
- **CUP2**: DNS is set on cup **and** all matches in the cup in a single action. Reversible — undo removes DNS from cup and all matches. DNS status must be visually distinct (e.g., strikethrough or badge). Confirmation dialog is bilingual (fi/en).
- **CUP3**: Paid status is read from and written to SSI at **cup level only**. No local persistence — SSI is the source of truth.
- **SSI integration**: CUP2 and CUP3 use **web scraping** (admin cookies) for both reading and writing state. SSI GraphQL does not support write operations reliably. Endpoints: `set-did-not-show`, `undo-did-not-show`, `toggle-paid` via `GET /event/participant/{ct}/{id}/...`. Reading paid/DNS status also requires scraping the participant page since GraphQL does not expose these fields.

## Release 7.5 — Architecture V2 Foundation

Establish architectural patterns and foundations for future scalability while maintaining simplicity. This release focuses on modular monolith patterns, centralized error handling, API versioning preparation, and service layer completion.

| # | Requirement | Status |
|---|-------------|--------|
| ARCH1 | **Centralized Error Handling**: Implement Express error handling middleware with custom error classes. Consistent error responses across all endpoints with proper logging and operational vs. programming error distinction | ✅ Implemented |
| ARCH2 | **API Versioning Structure**: Add `/api/v1/` base path for current endpoints. Prepare versioning strategy to support shooting disciplines (e.g., `/api/v2/sra/`, `/api/v2/resul/`). Update all frontend API calls to use versioned paths | ✅ Implemented |
| ARCH3 | **Service Layer Completion**: Extract business logic from remaining routes into service modules: `scoring-service.js`, `registration-service.js`, `report-service.js`. Routes become thin dispatchers focusing on HTTP contract only | 📋 Specified ➜ R7.6 (R76-ARCH3) |
| ARCH4 | **Module Boundary Enforcement**: Add ESLint rules to prevent architectural drift. Define and document allowed import patterns: routes → domain modules → services, no cross-domain imports in ssi-core, no barrel imports that create hidden coupling | 📋 Specified ➜ R7.6 (R76-ARCH4) |
| ARCH5 | **Architecture Documentation**: Update architecture-review.md with target modular monolith patterns, module boundaries, and migration progress. Document explicit import rules and anti-patterns to prevent | ✅ Implemented |

### Design Decisions (ARCH1-ARCH5)

- **Modular Monolith Target**: Keep single deployment but enforce clear module boundaries. This provides simplicity while enabling future microservice extraction when multi-tenancy is needed
- **Error Pattern**: Custom `AppError` class + centralized middleware. Operational errors (validation, auth) return user-friendly messages; programming errors return generic 500 with stack only in dev
- **Versioning Strategy**: URL-based versioning (`/api/v1/`) with discipline-specific paths in future versions. Maintain backward compatibility during transition
- **Service Extraction**: Pure business logic functions without Express dependencies. Enables unit testing without HTTP mocking
- **Import Rules**: Enforced via ESLint to prevent re-coupling. Domain modules in ssi-core/ may only import http-helpers; routes must import specific domain modules, not barrel exports

## Release 7.9 — GraphQL Cup Management

Migrate Cup creation and maintenance from web scraping to SSI GraphQL API. The legacy `New-KupittaaCup.ps1` script uses web scraping (CSRF tokens, form POSTs, HTML parsing) which is fragile and breaks when SSI updates their UI. The GraphQL `create_event` mutation is now confirmed working (Feb 2026) and should be the primary method.

| # | Requirement | Status |
|---|-------------|--------|
| GQL1 | **Update SSI-GraphQL.psm1**: Fix `New-SSIResulCup` and `New-SSIResulMatch` to use correct `form_input` fields (`count` not `match_count`, `reg_start_date`/`reg_start_time`, `has_accepted_event_data_ass_agreement`, `weapon_groups`/`categories`/`competence_classes` arrays). Update `New-SSIEvent` to pass array fields correctly in JSON | ⬚ Pending |
| GQL2 | **Update GraphQL Tests**: Fix `SSI-GraphQL.Tests.ps1` Event Creation tests to use correct form fields and valid enum values. All tests must pass including cup creation, match creation, cup-match linking, and squad creation | ⬚ Pending |
| GQL3 | **GraphQL Cup Creation Script**: Create `New-KupittaaCup-GraphQL.ps1` that replaces web scraping with GraphQL for Cup creation, Match creation, and Cup-Match linking. Squads may still require web scraping if GraphQL squad creation is not available. Load settings from `config/kupittaa-cup-config.yml` | ⬚ Pending |
| GQL4 | **GraphQL Batch Creation**: Create `New-KupittaaCupBatch-GraphQL.ps1` for batch Cup creation from date list file, replacing the web scraping batch script | ⬚ Pending |
| GQL5 | **Form Field Discovery Automation**: Create a PowerShell function `Get-SSIFormFields` that logs in via web scraping, fetches a create-event form, and returns all field names, required status, and valid enum values. Use this to detect SSI form changes proactively | ⬚ Pending |
| GQL6 | **Deprecate Web Scraping Scripts**: Mark `archive/scripts-legacy/New-KupittaaCup.ps1` and `New-KupittaaCupBatch.ps1` as deprecated once GraphQL equivalents are validated. Keep in archive for reference | ⬚ Pending |
| GQL7 | **GraphQL Event Creation Viability Test (JS)**: The current `event-creation-service.js` uses web scraping (CSRF tokens, form POSTs) because SSI GraphQL was too broken at the time of `New-KupittaaCup.ps1`. SSI has reportedly made GraphQL fixes since then. **Test scope**: (1) Authenticate via GraphQL `token_auth` mutation, (2) Test `create_event` mutation for Cup (CT 136) with full `form_input` JSON — verify all required fields and correct response, (3) Test `create_event` for Match (CT 91) with discipline-specific fields, (4) Test Cup↔Match linking via `add_component_event` or equivalent mutation, (5) Test squad creation via GraphQL (may not exist — verify), (6) Test event read-back via `event(content_type, id)` query to confirm structure. **Deliverables**: A JS test script (`test-harness/test-graphql-event-creation.mjs`) that runs each operation against a real SSI test account and reports pass/fail per operation. Based on results, decide migration path: (a) full GraphQL migration if all operations work, (b) hybrid (GraphQL for cups/matches, web scraping for squads/linking), or (c) keep web scraping if GraphQL is still unreliable. **Context**: Web scraping is fragile — SSI UI changes break it. GraphQL would be more stable and maintainable. The `form_input` JSON scalar is opaque (fields not in schema), so the test must discover required fields empirically. | ⬚ Pending |

### Design Decisions (GQL1–GQL7)

- **GraphQL is primary, web scraping is fallback**: Use GraphQL for all operations where it works. Fall back to web scraping only for operations not yet supported (e.g., squad creation if `create_squad` mutation doesn't exist).
- **Form field discovery**: SSI's `form_input` is an opaque `JSON` scalar — required fields are not in the GraphQL schema. Use web scraping to discover fields (see AGENTS.md § "SSI GraphQL — Discovering Form Fields").
- **Config compatibility**: GraphQL scripts must use the same `kupittaa-cup-config.yml` as the legacy scripts. Field name mapping (e.g., `matchCount` → `count`) is handled in the script, not in the config.
- **WordPress integration**: Calendar event creation (Tapahtumakalenteri) remains web scraping — WordPress REST API requires separate auth. This is out of scope for R7.9.
- **Offline-capable**: Design for intermittent connectivity at shooting ranges. Critical paths (scoring) must work offline with sync.

## Release 8.2 — Platform Authorization & Workflows

Strengthen the RBAC model to enforce hierarchical role assignment rules: higher-privilege roles must not be assignable by lower-privilege actors. This release also covers match event workflows (MP5–MP7, deferred from R8.1).

### Authorization Requirements

| # | Requirement | Status |
|---|-------------|--------|
| RBAC1 | **Hierarchical Role Assignment Authorization**: Enforce strict rules on which roles each actor can assign to other members (via invitation or role update). The assignment matrix defines a ceiling — no actor can grant a privilege they do not themselves hold. The matrix must be enforced in **both** the invitation creation endpoint (`POST /tenants/:tenantId/invitations`) and the member role update endpoint (`PATCH /tenants/:tenantId/members/:id`). **Backend**: `ROLE_ASSIGNMENT_MATRIX` constant + `validateRoleAssignment()` + `getAssignableRoles()` in platform-store.js. Enforced in 3 routes: invitation creation, add member, update member roles. `GET /members` response includes `assignableRoles` for the actor. **Frontend**: Invite modal only shows roles the actor can assign. Inline role editor shows all roles but disables (greyed out) ones the actor cannot assign. | ✅ Implemented |

#### Role Assignment Matrix

Who can assign whom — each row is the **actor's highest role**, each column is the **target role** being assigned. ✅ = can assign, ❌ = cannot assign.

| Actor Role ↓ \ Target Role → | owner | tenant_admin | discipline_admin | instructor_admin | match_admin | instructor |
|-------------------------------|:-----:|:------------:|:----------------:|:----------------:|:-----------:|:----------:|
| **owner**                     | ✅    | ✅           | ✅               | ✅               | ✅          | ✅         |
| **tenant_admin**              | ❌    | ❌           | ✅               | ✅               | ✅          | ✅         |
| **instructor_admin**          | ❌    | ❌           | ❌               | ❌               | ✅          | ✅         |
| **discipline_admin**          | ❌    | ❌           | ❌               | ❌               | ❌          | ❌         |
| **match_admin**               | ❌    | ❌           | ❌               | ❌               | ❌          | ❌         |
| **instructor**                | ❌    | ❌           | ❌               | ❌               | ❌          | ❌         |

#### Invitation Permission (who can invite)

| Actor Role | Can Invite? | Assignable Roles in Invitation |
|------------|:-----------:|-------------------------------|
| **owner**           | ✅ | Any role |
| **tenant_admin**    | ✅ | discipline_admin, instructor_admin, match_admin, instructor |
| **instructor_admin**| ✅ | match_admin, instructor |
| **discipline_admin**| ❌ | — |
| **match_admin**     | ❌ | — |
| **instructor**      | ❌ | — |

#### Design Notes

- **Implicit escalation preserved**: The existing `hasRequiredRole` logic (owner satisfies all, tenant_admin satisfies all except owner-only) continues to work for **resource access**. The assignment matrix is a **separate concern** — it controls role propagation, not resource access.
- **Multi-role actors**: If an actor holds multiple roles (e.g., `[tenant_admin, instructor_admin]`), the assignable set is the **union** of all their role assignment rights.
- **Self-role protection**: An actor cannot remove their own last `owner` role (existing PA20 protection). An actor also cannot demote themselves below the level needed to manage the tenant.
- **Extensibility**: The `ROLE_ASSIGNMENT_MATRIX` is a data structure, not hard-coded if/else logic. Adding new roles or adjusting permissions requires only updating the matrix constant. The matrix should live in `platform-store.js` alongside the existing `TENANT_ROLES` constant.
- **Current gap**: Today, the only assignment check is in the invitation route: "Only an owner can invite another owner." RBAC1 generalizes this to a full matrix enforced on both invitations and role updates.

### Account Management Requirements

| # | Requirement | Status |
|---|-------------|--------|
| ACCT1 | **Password Reset (Forgot Password)**: Users who have lost their password can reset it from the Sign In page. **Also includes auto-accept pending invitations on login** — when a user logs in (or completes MFA), any pending invitations matching their email are automatically accepted, creating memberships immediately. **Flow**: (1) User clicks "Forgot password?" link on the Sign In page. *(continued below)* | ✅ Implemented |

Full ACCT1 flow: (1) User clicks "Forgot password?" link on the Sign In page. (2) Enters their email address. (3) Backend looks up the account — if found, generates a single-use, time-limited reset token (e.g., 1 hour expiry), hashes it (SHA-256) and stores in a `password_reset_tokens` table with `account_id`, `token_hash`, `expires_at`, `used_at`. Sends an email with a reset link `#/platform/reset-password/:token`. If email not found, still returns success (no user enumeration). (4) User clicks the link, enters a new password (min 8 chars) + confirmation. (5) Backend verifies the token (not expired, not used), updates the password (bcrypt), marks the token as used, and invalidates all existing platform sessions for that account (force re-login). **Security**: Token is crypto-random (32 bytes hex), hashed in DB. One active reset token per account (creating a new one revokes the previous). Rate-limited: 3 reset requests per hour per email. **Email**: Sent via Resend API (existing `lib/email.js`). Includes account email (read-only), expiry notice, and a note that the link can only be used once. **UI**: ForgotPasswordPage (email input form), ResetPasswordPage (new password + confirm form). Both are full-page views (no sidebar, no auth required). **MFA interaction**: If MFA is enabled, password reset does NOT bypass MFA — user must still complete MFA challenge on next login after resetting. | ⬜ Design |

### Match Event Workflow Requirements

| # | Requirement | Status |
|---|-------------|--------|
| MP5 | **Event Execution Workflow**: Execute a planned scheduled event — create cup/matches/squads in SSI from template + overrides. Status transitions: `planned` → `creating` → `ssi_created` (success) or `failed` (error with retry). Progress tracking per sub-operation | ⬜ Design |
| MP6 | **Event Status Dashboard**: Visual status indicators for each scheduled event (planned, creating, active, completed, cancelled). Batch status view for upcoming week/month | ⬜ Design |
| MP7 | **Event Cancellation**: Cancel a scheduled event — optionally delete from SSI if already created. Status: `ssi_created` → `cancelled`. Requires confirmation dialog with impact summary | ⬜ Design |

## Regulatory Requirements — SaaS Platform (EU/Finland)

This section covers the key regulatory obligations for operating a self-service SaaS platform in the EU (Finland) that processes personal data and handles payments. These apply to the Match Management Platform (R8.1) once it becomes a commercial multi-tenant service.

### GDPR — EU General Data Protection Regulation (2016/679)

The platform processes personal data of platform owners, tenant admins, match directors, and instructors (names, email addresses, phone numbers, SSI identities, event participation history).

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| REG1 | **Lawful basis for processing**: Identify and document the lawful basis for each category of personal data. Instructor roster data = legitimate interest or consent. Billing data = contractual necessity. SSI credentials = contractual necessity | ⬚ Design | Art. 6 GDPR |
| REG2 | **Privacy policy**: Publish a clear privacy policy describing what data is collected, why, how long it's retained, who it's shared with (sub-processors), and data subject rights | ⬚ Design | Art. 13–14 GDPR |
| REG3 | **Data subject rights**: Implement mechanisms for data access (Art. 15), rectification (Art. 16), erasure / "right to be forgotten" (Art. 17), data portability (Art. 20), and objection (Art. 21). The "Export Data" feature in billing partially covers portability | ⬚ Design | Art. 15–22 GDPR |
| REG4 | **Data Processing Agreement (DPA)**: Execute DPAs with all sub-processors: hosting (Render), email (Resend), payment (Stripe), SSI (ShootNScoreIt). The platform acts as data controller; sub-processors are data processors | ⬚ Design | Art. 28 GDPR |
| REG5 | **Data minimization**: Collect only data necessary for the service. The "minimal data" design principle already aligns with this. Avoid storing data that SSI or calendar backends already hold | ⬚ Design | Art. 5(1)(c) GDPR |
| REG6 | **Data retention & deletion**: Define retention periods per data category. Delete personal data when tenant is cancelled (after the 30-day grace period). Billing records must be retained per bookkeeping law (see REG16) | ⬚ Design | Art. 5(1)(e) GDPR |
| REG7 | **Breach notification**: Implement a process to detect, document, and report personal data breaches to the Finnish DPA (Tietosuojavaltuutettu) within 72 hours and to affected data subjects without undue delay if high risk | ⬚ Design | Art. 33–34 GDPR |
| REG8 | **Privacy by design & default**: Build data protection into the architecture. Multi-tenancy isolation, encrypted credentials, minimal data storage, and role-based access are examples. New features must consider privacy impact | ⬚ Design | Art. 25 GDPR |
| REG9 | **Record of processing activities (ROPA)**: Maintain an internal register documenting all processing activities, purposes, data categories, recipients, and retention periods | ⬚ Design | Art. 30 GDPR |
| REG10 | **Data transfers**: Ensure all personal data stays within the EU/EEA, or if transferred outside (e.g., US-based sub-processors), appropriate safeguards are in place (EU–US Data Privacy Framework, SCCs). Render deployment is Frankfurt (EU) | ⬚ Design | Art. 44–49 GDPR. Check each sub-processor |

### Finnish Data Protection Act (Tietosuojalaki 1050/2018)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| REG11 | **Supervisory authority**: The Finnish Data Protection Ombudsman (Tietosuojavaltuutettu) is the supervisory authority. Include contact details in the privacy policy | ⬚ Design | Supplements GDPR |
| REG12 | **National ID / SSN**: If the system ever needs to handle Finnish national identifiers (henkilötunnus), additional restrictions apply (§29 Tietosuojalaki). Currently not applicable — SSI email is the identity key | ⬚ N/A | Monitor if scope changes |

### ePrivacy — Cookies & Electronic Communications

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| REG13 | **Cookie consent**: Strictly necessary cookies (session cookies) don't require consent. Analytics or tracking cookies (if added later) require informed consent with opt-in. Implement a cookie banner if non-essential cookies are used | ⬚ Design | ePrivacy Directive + Finnish SVPL (917/2014) |
| REG14 | **Session security**: Session cookies must be httpOnly, secure, sameSite. Already implemented in V7.0 auth. Ensure this extends to the platform-level auth | ✅ Implemented | Current V7 session already compliant |

### Consumer Protection (Kuluttajansuojalaki 38/1978)

Applies if tenants are consumers or non-commercial associations (e.g., shooting clubs registered as yhdistys). Even B2B, best practice is to follow these.

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| REG15 | **Transparent pricing**: Display all prices including VAT. Subscription terms (monthly/annual, auto-renewal) must be clearly communicated before purchase. No hidden fees | ⬚ Design | Ch. 2 §6–7 KSL |
| REG16 | **Right of withdrawal (cooling-off)**: For distance sales to consumers, 14-day right of withdrawal from the date of contract. If the service starts during the withdrawal period with consumer's explicit consent, the right may be limited but must be communicated | ⬚ Design | Ch. 6 §14 KSL. Free trial naturally covers this |
| REG17 | **Cancellation process**: Cancellation must be as easy as sign-up (no dark patterns). Provide clear confirmation of cancellation date, what happens to data, and any remaining billing obligations | ⬚ Design | Ch. 6 §14 KSL |
| REG18 | **Terms of Service**: Publish ToS covering: service description, subscription terms, payment terms, liability limitations, governing law (Finland), dispute resolution. Must be accepted at sign-up | ⬚ Design | General contract law + KSL |

### Payment Regulation (PSD2 / Maksulaitoslaki)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| REG19 | **PCI DSS delegation**: Never handle raw card numbers. Delegate payment processing to a PCI DSS-compliant provider (Stripe, Paytrail, etc.). Store only tokenized references and last-4 digits | ⬚ Design | PSD2 + PCI DSS. Stripe Checkout/Elements handles this |
| REG20 | **Strong Customer Authentication (SCA)**: Payment provider must support SCA (3D Secure) for EU card payments. Stripe handles this automatically | ⬚ Design | PSD2 Art. 97 |
| REG21 | **Invoicing & bookkeeping**: Issue proper invoices/receipts per Finnish Bookkeeping Act (Kirjanpitolaki 1336/1997). Retain financial records for 6 years (10 years for accounting books). This applies even after tenant cancellation | ⬚ Design | Kirjanpitolaki §2:10 |

### Accessibility — European Accessibility Act (EAA / Directive 2019/882)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| REG22 | **WCAG 2.1 AA compliance**: The EAA (effective June 28, 2025) requires digital services to meet EN 301 549 / WCAG 2.1 Level AA. Applies to new products and services offered to consumers in the EU. Key areas: keyboard navigation, screen reader support, color contrast, form labels, error messages | ⬚ Design | Directive 2019/882. Scoring UI already had a WCAG pass (R8.0) |
| REG23 | **Accessibility statement**: Publish an accessibility statement describing compliance level, known limitations, and contact for accessibility issues | ⬚ Design | EN 301 549 §12 |

### Summary of Regulatory Applicability

| Regulation | Applies when | Priority |
|-----------|-------------|----------|
| **GDPR + Finnish DPA** | Immediately — personal data is processed from day one | Critical |
| **ePrivacy (cookies)** | At launch — session cookies already compliant, watch for analytics | Low (currently) |
| **Consumer protection** | When charging money / offering trials to end users | High at billing launch |
| **PSD2 / PCI DSS** | When accepting payments — delegated to Stripe | Medium (Stripe handles most) |
| **Bookkeeping** | When issuing invoices | Medium |
| **EAA / WCAG** | Effective now (June 2025) — new digital services must comply | High |

### Key Actions Before Launch

1. **Draft privacy policy** — data collected, purposes, sub-processors, retention, rights
2. **Draft Terms of Service** — subscription terms, liability, governing law
3. **Execute DPAs** with Render, Resend, Stripe, and ShootNScoreIt
4. **Verify EU data residency** for all sub-processors (Render = Frankfurt ✅)
5. **Implement data export** (JSON/CSV) for portability and cancellation
6. **Implement data deletion** workflow triggered on tenant cancellation + grace period
7. **WCAG 2.1 AA audit** of all new platform views
8. **Set up Stripe** (or Paytrail for Finnish market) — never touch raw card data

## Summary

- **Release 1.0** (SSI Cup Automation): 37 requirements — 35 ✅, 2 on hold (35, 36)
- **Release 2.0** (WordPress Integration): 9 requirements — 6 ✅, 1 on hold (41), 2 pending (39, 42)
- **Release 3.0** (Scoring Application): 21 requirements — 20 ✅, 1 pending (SEC11)
- **Release 3.1** (Data Integrity): 2 requirements — 2 pending (47, 48)
- **Release 4.0** (Kupittaa Cup Registration Frontend): 25 requirements — 25 ✅
- **Release 5.0** (SRA Training Staffing) — requirements in `sra-training-staffing-requirements.md`
- **Release 6.0** (Match Management & UI Consolidation): 5 requirements — 1 ✅, 4 pending ➜ R7.6 (MG2–MG5)
- **Release 7.0** (Authentication & Session Handling): 25 requirements — 19 ✅, 6 pending ➜ R7.6 (AUTH10, SES7, SEC1, SEC7, TEST1–5/7), 2 deferred (TEST6, TEST8)
- **Release 7.1** (Management Availability): 1 requirement — 1 ✅
- **Release 7.2** (Kupittaa Cup Management): 3 requirements — 2 ✅ (CUP2, CUP3), 1 📋 ➜ R7.6 (CUP1)
- **Release 7.3** (Refactoring Analysis): 1 requirement — 1 ✅ (RFA1). 5 outdated docs removed
- **Release 7.4** (Refactoring Implementation): 8 requirements — 8 ✅ (RFR1–RFR8)
- **Release 7.4.1** (Authentication UX Hardening): 5 requirements — 5 ✅ (AUTH-UX1–AUTH-UX5)
- **Release 7.5** (Architecture V2 Foundation): 5 requirements — 3 ✅, 2 📋 ➜ R7.6 (ARCH3, ARCH4)
- **Release 7.6** (Consolidation & Completion): 18 requirements from R6.0/R7.0/R7.2/R7.5 — see `release-7.6.md`
- **Release 7.9** (GraphQL Cup Management): 7 requirements — 0 ✅, 7 pending (GQL1–GQL7)
- **Release 8.0** (Tablet Scoring UI): 12 requirements — 12 ✅ (TS1–TS12)
- **Release 8.0** (Platform Auth & Tenancy): 21 requirements — 21 ✅ (PA1–PA21)
- **Release 8.1** (Match Management Platform): 8 requirements — 5 ✅ (MP1, MP2, MP4, MP10, MP12), 3 design phase (MP3, MP8, MP9). **MP12 — SSI Event Import**: Search existing SSI events via GraphQL (name, sport, date range, region filters) and import selected events as local scheduled_events with `ssi_created` status. Backend: `ssiSearchEvents` in seed-import.js, `importSsiEvent` in platform-store.js, `/ssi-search` + `/ssi-import` API routes. Frontend: `ImportSsiEventsModal` component in SchedulePage with search form, results table with checkboxes, and batch import action. Schema: `template_id` made nullable, `event_name` column added to `scheduled_events` for imported events without templates
- **Release 8.2** (Platform Authorization & Workflows): 5 requirements — 2 ✅ (ACCT1, RBAC1), 3 design phase (MP5, MP6, MP7)
- **Release 8.3** (Calendar Integration): 1 requirement — 0 ✅, 1 design phase (MP11)
- **Release 9.0** (Event Staffing): Core platform staffing capabilities — **All Implemented ✅**
  - **Data Model**: `event_staffing_needs` and `staff_signups` tables linked to `scheduled_events` and `accounts`. Auto-populated from template rules.
  - **API Endpoints**: `/staffing/upcoming`, `/staffing/my-assignments`, `/staffing/signup`, `/staffing/withdraw`.
  - **Roster UI**: `RosterView.jsx` showing events needing staff with dynamic progress bars, one-click signups, and personal commitment tracking.
  - **UI Integration**: Staffing gap metrics in `DashboardView.jsx` and visual staffing indicators (red/green) in `SchedulePage.jsx`.
  - **Notifications**: Automated emails via Resend for signup confirmations, withdrawal alerts to admins, and urgent understaffed warnings.
  - **Testing**: E2E UAT script `test-staffing-e2e.mjs` verifying the full end-to-end scheduling and staffing flow.
- **Regulatory** (SaaS Platform EU/Finland): 23 requirements — 1 ✅ (REG14), 1 N/A (REG12), 21 design phase (REG1–REG23)


## Configuration Files

| File | Purpose |
|------|---------|
| `config/kupittaa-cup-config.yml` | All SSI and WordPress settings |
| `config/kupittaa-cup-dates.txt` | Date list for batch creation |

## Scripts

| Script | Purpose |
|--------|---------|
| `New-KupittaaCup.ps1` | Main script - creates Cup, Matches, Squads, Calendar Event |
| `New-KupittaaCupBatch.ps1` | Batch creation from date list |
| `Connect-SSI.ps1` | SSI authentication |
| `Connect-WordPress.ps1` | WordPress authentication with 2FA |
| `New-TapahtumakalenteriEvent.ps1` | Calendar event creation |
| `Update-TapahtumakalenteriEvent.ps1` | Statistics update |
| `Test-EventIntegrity.ps1` | Data integrity check between SSI and WordPress |

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/user-guide.md` | Scoring and registration app user guide |
| `docs/installation-guide.md` | Render, Resend, and GitHub deployment guide |
| `docs/RELEASE-NOTES.md` | Version history and changelog |
| `docs/registration-flow.md` | Backend sequence diagrams and SSI state machine |
| `docs/scoring-architecture.md` | Proxy architecture, session management, scoring flow |
| `docs/ssi-admin-operations.md` | Web scraping endpoints and form field reference |
| `docs/README.md` | Cup creation scripts reference (PowerShell) |
| `docs/developer-guide.md` | Cup creation process technical details |
