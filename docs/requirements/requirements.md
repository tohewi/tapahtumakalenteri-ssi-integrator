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
| MGMT1 | **Management Independent of Registration**: Kupittaa Cup Hallinta must keep cups available for management independent of registration status, once registration start date has passed and while the cup is still active. Management is available until 24h after the cup's end date (`ends + 24h` grace period), or `starts + 48h` fallback when `ends` is null. The grace period ensures cups remain manageable on event day regardless of timezone. Cups with no `registration_starts` are excluded. Uses dedicated `/api/manage/cups` endpoint. | ✅ Implemented | ~14,000 |

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

## Release 7.7 — QR Code Login for Scoring

Quick-login for scoring devices (tablets, smartphones) at the range via QR codes. Eliminates manual credential entry on shared devices. Tokens are managed on the `#/manage` page and scoped to scoring only.

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| QR1 | **Device Token Model**: Server-side device tokens stored in Redis with AES-256-GCM encryption of SSI credentials. Token hash (SHA-256, timing-safe comparison) for validation. Configurable TTL (1–30 days, default 5). Uses session secret for encryption key (dev fallback via sessionConfig). | ✅ Implemented | `lib/device-tokens.js`. Encrypted raw token also stored for QR regeneration. |
| QR2 | **Token CRUD API**: `POST /auth/device-tokens` (create, manage scope required), `GET /auth/device-tokens` (list with raw tokens for QR, manage scope), `DELETE /auth/device-tokens/:id` (revoke, manage scope). Rate-limited via loginLimiter. | ✅ Implemented | `routes/auth-v7.js` |
| QR3 | **Token Login Endpoint**: `POST /auth/token-login` — validates token hash, decrypts SSI credentials, authenticates with SSI (GraphQL + web login), creates scoring session with device metadata. Distinguishes 401 (auth) from 500 (internal) errors. | ✅ Implemented | `routes/auth-v7.js` |
| QR4 | **QR Code Management UI**: `DeviceTokens` component on `#/manage` page (below cup list). Create tokens with SSI email/password/label. Dual QR codes per token (📱 mobile `#/scoring`, 📋 tablet `#/scoring-tablet`). Print layout with both codes. QR codes persist via server-side encrypted token storage — device-independent. Revoke with confirmation. | ✅ Implemented | `components/DeviceTokens.jsx`. Uses `qrcode` npm package. |
| QR5 | **Scoring App Token Detection**: Both `App.jsx` (mobile) and `TabletApp.jsx` (tablet) detect `?token=` in URL hash on bootstrap. Auto-login via `tokenLogin()` API. URL cleared after login attempt. Hash-based router strips query params for route matching. | ✅ Implemented | `main.jsx` `hashPath()`, `App.jsx`, `TabletApp.jsx` |
| QR6 | **Security**: AES-256-GCM encryption at rest (credentials + raw token). Timing-safe hash comparison. Scope locked to scoring. Token TTL validated (1–30 days). XSS protection in print window (`escapeHtml`). Popup-blocked null check. `e2e/.env` credential leak found and scrubbed from git history. `.gitignore` broadened to global `.env`. | ✅ Implemented | Copilot review: 7/21 findings fixed. |

### Release 7.7.1 — Management Page Hotfix

| # | Fix | Status |
|---|-----|--------|
| QR-FIX1 | **Cup list visibility**: DeviceTokens rendered above CupList, pushing cups below fold. Moved below. | ✅ Fixed |
| QR-FIX2 | **Cup auto-restore on login**: localStorage manage state not cleared on logout — next login skipped cup selection. Now cleared on logout/session expiry. | ✅ Fixed |
| QR-FIX3 | **Same-day cup filtering**: `filterManageableCups` compared `ends` (midnight UTC) against current time — cups disappeared by afternoon. Added 24h management grace period after `ends`. | ✅ Fixed |
| QR-FIX4 | **Squad move audit logging**: `assign-squad` and `fix-squad` routes had only debug-level logging (suppressed in production). Added info-level audit trail: user, shooter, target squad, per-match results, summary. | ✅ Implemented |

## Release 7.8 — Kupittaa Reservilaisammunta Induction Wait List

Public wait list for Kupittaa Reservilaisammunta induction. People join the list with captcha verification, exact SSI email validation, association details, and equipment choice. Administrators can log in with approved SSI accounts, form arbitrary induction groups from the wait list, track status changes, and mark participants as having completed induction.

| # | Requirement | Status |
|---|-------------|--------|
| WL1 | **Public wait list form**: Provide a public mobile-friendly wait list page accessible without SSI login. The form collects first name, last name, email address (the same one used in SSI), association/club (`yhdistys`), and exactly one equipment choice: `Need club .22 pistol` or `Have own pistol`. Ammo is always the participant's own responsibility. Public user-facing wait list pages must be available in both Finnish and English. | ⬚ Pending |
| WL2 | **Human verification**: Wait list registration must require the existing math captcha style verification with server-side validation before any wait list entry is accepted. Captcha TTL, anti-replay, and rate limiting follow the established registration pattern unless Release 7.8 defines stricter limits. | ⬚ Pending |
| WL3 | **Hard SSI identity validation**: Registration must hard-validate that the submitted email exists in SSI before creating a wait list entry. Guidance text in the UI must explicitly tell the user to use the same email address they use in SSI. If the email does not exist in SSI, the entry is rejected with a user-facing error. | ⬚ Pending |
| WL4 | **Unique active registration**: Only one active wait list entry per email is allowed. A person with status `waiting` or `selected` cannot create a duplicate registration. Re-registration is only allowed after the previous active entry has been completed, withdrawn, or removed. | ⬚ Pending |
| WL5 | **Wait list confirmation email**: On successful registration, the system sends a confirmation email stating that the person is on the wait list. Use the existing email sending capability. Registration must fail atomically if the confirmation email cannot be sent; the person is not added to the wait list when email delivery fails. | ⬚ Pending |
| WL6 | **Admin view with SSI login**: Provide an admin wait list view where users authenticate with SSI login. Access is limited to an exact email allowlist defined in configuration. Being able to authenticate with SSI is not sufficient on its own; the user's SSI email must also match the configured allowlist. | ⬚ Pending |
| WL7 | **Admin wait list operations**: The admin view shows active and historical wait list entries with at least first name, last name, email, association/club, equipment choice, created timestamp, current status, and audit metadata. Admins can manually select arbitrary participants from the wait list into an induction group; selection is not FIFO-only because availability depends on the specific induction date. | ⬚ Pending |
| WL8 | **Joined induction completion**: From the admin view it must be possible to select one or more participants and mark them as `joined induction` when they have completed induction. Completed participants are removed from the active wait list and remain visible in history. | ⬚ Pending |
| WL9 | **Cancellation and removal**: A participant must be able to cancel their own wait list registration, and an admin must be able to cancel or remove an entry from the admin view. Cancellation/removal must move the entry out of the active wait list while preserving enough history for operational tracing. | ⬚ Pending |
| WL10 | **State change notifications**: The system sends email notifications not only on initial registration but also when the wait list status changes. At minimum this covers registration confirmation, admin selection into an induction group, cancellation/withdrawal, and completion (`joined induction`). Use the existing email sending service. | ⬚ Pending |
| WL11 | **Operational threshold visibility**: The system must make it visible to admins when the wait list has reached the induction planning threshold. The default threshold is 5 active waiting participants, because inductions are typically organized at that point. Threshold value should be configurable. | ⬚ Pending |
| WL12 | **Audit trail and lifecycle states**: Wait list entries must support explicit lifecycle states at minimum `waiting`, `selected`, `completed`, and `withdrawn`. All admin-driven state changes record who performed the change and when. | ⬚ Pending |
| WL13 | **Existing architecture and website integration**: The induction wait list must be implemented inside the existing scoring proxy and website architecture, not as a separate standalone system. Public wait list pages and admin pages should follow the same application structure and UX conventions as the existing Kupittaa Cup registration flow, including routing, shared components, authentication patterns, API versioning, and i18n support. | ⬚ Pending |

### Wait List Security Requirements

| # | Requirement | Status |
|---|-------------|--------|
| WL-SEC1 | **Minimal API surface**: Expose only the wait list endpoints needed for public registration, self-cancellation, admin listing, admin selection, admin completion, and admin cancellation/removal. Do not expose general SSI search, profile browsing, or unrelated admin capabilities through wait list APIs. | ⬚ Pending |
| WL-SEC2 | **Strict input validation**: Validate all public and admin inputs against explicit schemas. `firstName`, `lastName`, and `association` have bounded lengths; `email` must be a valid email address; `equipmentChoice` is a strict enum; captcha values are validated; status changes accept only supported transitions; batch/group selection accepts only arrays of known entry identifiers. | ⬚ Pending |
| WL-SEC3 | **Request size limits**: Apply request body size limits appropriate to the small wait list payloads so oversized bodies are rejected before business logic runs. | ⬚ Pending |
| WL-SEC4 | **Rate limiting**: Public wait list registration, self-cancellation, captcha generation, and admin mutation endpoints must be rate-limited. Wait list routes inherit Render-aware proxy handling and log throttling events similarly to the existing registration flow. | ⬚ Pending |
| WL-SEC5 | **Allowlist enforcement**: Admin wait list actions must require both a valid SSI-authenticated session and exact email allowlist membership. Non-allowlisted authenticated users must be denied all wait list admin operations. | ⬚ Pending |
| WL-SEC6 | **No internal data leakage**: Public errors and admin errors must not expose internal SSI responses, internal route details, mail provider secrets, or storage internals. Only operationally useful user-facing messages are returned. | ⬚ Pending |
| WL-SEC7 | **Escaping and safe templating**: User-provided fields such as names and association/club must be treated as opaque strings, safely escaped in emails, HTML, logs, and any admin rendering. | ⬚ Pending |

### Wait List Configuration & Persistence Requirements

| # | Requirement | Status |
|---|-------------|--------|
| WL-CFG1 | **Configuration-driven behavior**: Wait list admin allowlist, induction threshold, notification sender settings, and any public page labels or routing toggles specific to the feature must be defined in repository configuration rather than hardcoded in route or component code. | ⬚ Pending |
| WL-CFG2 | **Persistent storage**: Wait list entries, lifecycle state, audit trail, and induction group assignments must be stored in persistent server-side storage that survives application restarts and deployments. In-memory-only storage is not acceptable for wait list data. | ⬚ Pending |
| WL-CFG3 | **Stable identifiers and timestamps**: Each wait list entry and each induction group/batch must have stable identifiers plus created/updated timestamps so notifications, admin actions, and history views can refer to the same records safely. | ⬚ Pending |

### Wait List Admin Planning Requirements

| # | Requirement | Status |
|---|-------------|--------|
| WL-OPS1 | **Induction group records**: Admin selection must create or update an explicit induction group/batch record rather than only flipping entry status. An induction group stores at minimum the selected participant set, a planned induction date or label, current batch status, and audit metadata. | ⬚ Pending |
| WL-OPS2 | **Admin operational visibility**: The admin view must distinguish active waiting entries, selected entries grouped for a future induction, completed entries, and withdrawn/removed entries. Admins must be able to review induction groups together with the participants assigned to each group. | ⬚ Pending |
| WL-OPS3 | **Planning summaries**: The admin view must provide counts useful for planning an induction, including total active waiting participants and a breakdown of equipment choice so organizers can see how many participants need a club .22 pistol versus bringing their own pistol. | ⬚ Pending |

### Wait List UX & Localization Requirements

| # | Requirement | Status |
|---|-------------|--------|
| WL-UX1 | **Bilingual user experience**: Public wait list pages, admin wait list pages, validation messages, and wait list notification emails must all be available in Finnish and English. The feature must reuse the existing website i18n model rather than introducing a separate translation mechanism. | ⬚ Pending |
| WL-UX2 | **Website-native routing and navigation**: The wait list feature must appear as part of the existing website navigation and routing model, with public and admin entry points discoverable similarly to the current Kupittaa Cup registration feature. New wait list pages must not break or bypass the current application shell, hash routing, or shared UI patterns. | ⬚ Pending |

### Wait List Testing Requirements

| # | Requirement | Status |
|---|-------------|--------|
| WL-TEST1 | **Public flow tests**: Add route-level and UI tests covering captcha validation, SSI email existence validation, unique active registration enforcement, bilingual public rendering, and atomic failure when confirmation email sending fails. | ⬚ Pending |
| WL-TEST2 | **Admin authorization tests**: Add tests proving that only SSI-authenticated users whose email is in the configured allowlist can access admin wait list endpoints and pages. Authenticated but non-allowlisted users must be denied. | ⬚ Pending |
| WL-TEST3 | **Lifecycle and grouping tests**: Add tests covering induction group creation, manual selection of arbitrary participants, valid status transitions (`waiting`, `selected`, `completed`, `withdrawn`), self-cancellation, admin cancellation/removal, and completed-entry history visibility. | ⬚ Pending |
| WL-TEST4 | **Notification and audit tests**: Add tests covering registration confirmation, state-change emails, audit metadata capture, and idempotent behavior so retries do not create duplicate entries or duplicate state transitions. | ⬚ Pending |

### Design Decisions (WL1–WL13)

- **SSI identity is authoritative**: Wait list registration is only valid for people whose email can be found in SSI.
- **Exact email uniqueness**: Active entries are unique by email to avoid duplicate planning and duplicate notifications.
- **Manual grouping over FIFO**: Admins choose arbitrary groups because induction dates depend on participant availability, not queue order alone.
- **Allowlist-based admin access**: SSI authentication proves identity; config allowlist grants wait list admin rights.
- **Reuse existing architecture**: Wait list functionality extends the current website and proxy architecture similarly to the existing `#/register` feature rather than introducing a separate app.
- **Operational model**: Reaching five active waiting participants indicates that a new induction should typically be organized, but the system does not assume automatic scheduling.

## Release 7.9 — GraphQL Cup Management

> **Note**: This release MUST be developed as an **exploratory branch**. SSI's GraphQL API currently has significant limitations (e.g. `form_input` opaque scalar, missing mutations for squads) which means many tasks still require hybrid web-scraping fallbacks. Initial work should focus on mapping capabilities and confirming which legacy operations can be reliably replaced.

Migrate Cup creation and maintenance from web scraping to SSI GraphQL API. The legacy `New-KupittaaCup.ps1` script uses web scraping (CSRF tokens, form POSTs, HTML parsing) which is fragile and breaks when SSI updates their UI. The GraphQL `create_event` mutation is now confirmed working (Feb 2026) and should be the primary method.

| # | Requirement | Status |
|---|-------------|--------|
| GQL1 | **Update SSI-GraphQL.psm1**: Fix `New-SSIResulCup` and `New-SSIResulMatch` to use correct `form_input` fields (`count` not `match_count`, `reg_start_date`/`reg_start_time`, `has_accepted_event_data_ass_agreement`, `weapon_groups`/`categories`/`competence_classes` arrays). Update `New-SSIEvent` to pass array fields correctly in JSON | ⬚ Pending |
| GQL2 | **Update GraphQL Tests**: Fix `SSI-GraphQL.Tests.ps1` Event Creation tests to use correct form fields and valid enum values. All tests must pass including cup creation, match creation, cup-match linking, and squad creation | ⬚ Pending |
| GQL3 | **GraphQL Cup Creation Script**: Create `New-KupittaaCup-GraphQL.ps1` that replaces web scraping with GraphQL for Cup creation, Match creation, and Cup-Match linking. Squads may still require web scraping if GraphQL squad creation is not available. Load settings from `config/kupittaa-cup-config.yml` | ⬚ Pending |
| GQL4 | **GraphQL Batch Creation**: Create `New-KupittaaCupBatch-GraphQL.ps1` for batch Cup creation from date list file, replacing the web scraping batch script | ⬚ Pending |
| GQL5 | **Form Field Discovery Automation**: Create a PowerShell function `Get-SSIFormFields` that logs in via web scraping, fetches a create-event form, and returns all field names, required status, and valid enum values. Use this to detect SSI form changes proactively | ⬚ Pending |
| GQL6 | **Deprecate Web Scraping Scripts**: Mark `archive/scripts-legacy/New-KupittaaCup.ps1` and `New-KupittaaCupBatch.ps1` as deprecated once GraphQL equivalents are validated. Keep in archive for reference | ⬚ Pending |

### Design Decisions (GQL1–GQL6)

- **GraphQL is primary, web scraping is fallback**: Use GraphQL for all operations where it works. Fall back to web scraping only for operations not yet supported (e.g., squad creation if `create_squad` mutation doesn't exist).
- **Form field discovery**: SSI's `form_input` is an opaque `JSON` scalar — required fields are not in the GraphQL schema. Use web scraping to discover fields (see AGENTS.md § "SSI GraphQL — Discovering Form Fields").
- **Config compatibility**: GraphQL scripts must use the same `kupittaa-cup-config.yml` as the legacy scripts. Field name mapping (e.g., `matchCount` → `count`) is handled in the script, not in the config.
- **WordPress integration**: Calendar event creation (Tapahtumakalenteri) remains web scraping — WordPress REST API requires separate auth. This is out of scope for R7.9.

## Release 8.1 — Match Management Platform (Roadmap)

Vision: Transform the current "link collection" home page into a structured match management platform. This requires significant UI design and architecture work before implementation.

| # | Requirement | Status |
|---|-------------|--------|
| MP1 | **UI Architecture Design**: Design the overall application navigation and information architecture. Replace the current static link collection with a structured app shell supporting the functional areas below. Mobile-first, responsive design. Define navigation patterns, page hierarchy, and user flows | ⬚ Design |
| MP2 | **Training Type Definitions**: Define and manage training types (e.g., Kupittaa CUP, SRA Training) — how they map to SSI event structures (Cup/Match/Squad hierarchy) and to Tapahtumakalenteri calendar events. Configuration-driven, not hardcoded | ⬚ Design |
| MP3 | **Match Personnel Management**: Extend the existing staffing MVP (SRA Training staffing) into a general-purpose match personnel system. Define roles per training type, manage availability, handle signup/resign workflows. Personnel assignments visible in match event context | ⬚ Design |
| MP4 | **Match Event Management**: Unified interface for creating, viewing, and managing match events. Covers the full lifecycle: create Cup+Matches+Squads → open registration → manage registrations and squadding → run scoring → close and report. Integrates with SSI (GraphQL + web scraping) and Tapahtumakalenteri | ⬚ Design |
| MP5 | **Registration Management**: Consolidate the existing registration helper (`#/register`) into the match event context. View registrations, manage squad assignments, handle re-registrations and withdrawals — all within the match event view | ⬚ Design |
| MP6 | **Scoring Integration**: Integrate tablet scoring (`#/scoring-tablet`) and mobile scoring (`#/scoring`) into the match event context. Scoring is launched from within a match event, not as a separate top-level feature | ⬚ Design |
| MP7 | **Reporting**: Post-match reporting — results summary, statistics (shots fired, participation), export for Tapahtumakalenteri update. Consolidate the existing summary report functionality | ⬚ Design |

### Design Principles (v8.1)

- **Event-centric navigation**: Everything revolves around match events. Users navigate to an event and access all related functions (personnel, registration, scoring, reporting) from there.
- **Training type as template**: Training types define the structure (how many matches, what disciplines, squad configuration, personnel roles). Creating a new event from a training type pre-fills all settings.
- **Progressive disclosure**: Show simple views by default, reveal complexity on demand. A range officer sees different things than an administrator.
- **Offline-capable**: Design for intermittent connectivity at shooting ranges. Critical paths (scoring) must work offline with sync.

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
- **Release 7.7** (QR Code Login for Scoring): 6 requirements — 6 ✅ (QR1–QR6). Device token auth for tablets/phones at the range. **7.7.1 hotfix**: 4 fixes (cup list visibility, auto-restore, same-day filtering, squad audit logging)
- **Release 7.8** (Kupittaa Reservilaisammunta Induction Wait List): 13 requirements — 0 ✅, 13 pending (WL1–WL13)
- **Release 7.9** (GraphQL Cup Management): 6 requirements — 0 ✅, 6 pending (GQL1–GQL6)
- **Release 8.0** (Tablet Scoring UI): 12 requirements — 12 ✅ (TS1–TS12)
- **Release 8.1** (Match Management Platform): 7 requirements — 0 ✅, 7 design phase (MP1–MP7)


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
