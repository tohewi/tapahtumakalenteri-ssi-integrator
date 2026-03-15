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
| 35 | Auto-approve pending registrations | ❌ Will Not Implement |
| 36 | Copy shooter squadding from Match #1 to Matches #2 and #3 | ❌ Will Not Implement |
| 37 | Login with username/password instead of manual sessionid cookie | ✅ |

## Release 2.0 - WordPress Integration (Complete)

| # | Requirement | Status |
|---|-------------|--------|
| 38 | **Tapahtumakalenteri Integration**: Create WordPress calendar event when Cup is created. Event as draft, Cup URL in content, permalink includes Cup ID. Single config file for both SSI and WordPress. | ✅ |
| 39 | Mock testing capability | 🚫 Superseded (covered by Vitest unit tests + E2E harness) |
| 40 | Upfront authentication for both SSI and WordPress | ✅ |
| 41 | PowerShell secrets management | 🚫 Superseded by CAL-2 (R8.3) |
| 42 | Modularize for different event types | 🚫 Superseded (Node.js platform fully modularised) |
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
| MG2 | **Cup list sorting**: Sort cups ascending by proximity to today (closest first). Applies to all cup lists (register, manage, scoring) | ✅ Implemented (`CupList` in `shared.jsx` sorts by proximity since R7.4) |
| MG3 | **Scoring route change**: Move scoring app from `#/` to `#/scoring`. Root URL (`#/`) becomes a front page with static links to the three main features: Scoring, Registration, Management | ✅ Implemented (`#/scoring` route + `HomePage` with feature links since R7.5) |
| MG4 | **Shared UI components**: Extract and share common components (LoginScreen, CupList, visual design) between scoring, registration, and management features | ✅ Implemented (`components/shared.jsx` exports `AppHeader`, `CupList`, `ErrorBanner`, `Spinner`, `BackButton`) |
| MG5 | **Manage cup list**: Reuse the same CUP list component as Registration. Only change text from "ilmoittautuminen" to "hallitse" | ✅ Implemented (`ManagePage` imports `CupList` from `./shared` with `allClickable` prop) |

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
| SES7 | **Session Monitoring**: Track active sessions per user, last activity, and device information. | ➜ Admin Site (moved to BL-3; belongs with admin dashboard, not R7.6) |

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
| CUP1 | **Move Shooter Between Squads**: In the "Squadit" section, it must be possible to move a shooter from one squad to another. The UI must show the same `→ S?` button as in the "Ei Squadeissa" section and function identically (squad picker dialog, SSI sync). Move is only allowed within the same match via Squadit. | ✅ Implemented (Kupittaa Match Management — `SquadManagementPage`, `fix-squad` endpoint) |
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

## Release 7.9 — GraphQL Cup Management (❌ Obsolete)

> **Obsolete (2026-03-12):** R7.9 targeted migrating PowerShell cup creation scripts from web scraping to GraphQL. This is now fully superseded by the Node.js Match Management Platform (R8.x): `event-creation-service.js` + `nordic-cup-graphql-builder.js` handle cup/match/squad creation via hybrid web POST + GraphQL. The PowerShell scripts in `archive/scripts-legacy/` are retained for reference only.

| # | Requirement | Status |
|---|-------------|--------|
| GQL1 | **Update SSI-GraphQL.psm1** | ❌ Obsolete — superseded by `lib/ssi-core/` Node.js modules |
| GQL2 | **Update GraphQL Tests** | ❌ Obsolete — superseded by `test/` Node.js test suite (870 tests) |
| GQL3 | **GraphQL Cup Creation Script** | ❌ Obsolete — superseded by `event-creation-service.js` + `nordic-cup-graphql-builder.js` |
| GQL4 | **GraphQL Batch Creation** | ❌ Obsolete — superseded by platform SchedulePage batch event creation |
| GQL5 | **Form Field Discovery Automation** | ❌ Obsolete — form field discovery built into `fetchFormPage()` in event builders |
| GQL6 | **Deprecate Web Scraping Scripts** | ❌ Obsolete — legacy scripts already in `archive/scripts-legacy/` |
| GQL7 | **GraphQL Event Creation Viability Test (JS)** | ❌ Obsolete — viability confirmed; hybrid web POST + GraphQL implemented in `nordic-cup-graphql-builder.js` |

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
| MP5 | **Event Execution Workflow**: Execute a planned scheduled event — create cup/matches/squads in SSI from template + overrides. Status transitions: `planned` → `creating` → `ssi_created` (success) or `failed` (error with retry). Progress tracking per sub-operation. **Bug fixes (R8.2):** Template-driven divisions/categories via `overrides.formFields`, web form POST for both cup + matches (GraphQL ignores multi-value fields), 40-char name limit enforcement | ✅ Implemented |
| MP6 | **Event Status Dashboard**: Visual status indicators for each scheduled event (planned, creating, active, completed, cancelled). Batch status view for upcoming week/month. **Implemented:** status summary strip (counts per status), time filter (Upcoming/Next 7d/Next 30d/Past/All), `cancelled` status with orange badge. | ✅ Implemented |
| MP7 | **Event Cancellation**: Cancel a scheduled event — optionally delete from SSI if already created. Status: `ssi_created` → `cancelled`. Requires confirmation dialog with impact summary. **Implemented:** `POST /events/:id/cancel` route, soft-cancel keeps DB record, `CancelEventModal` with SSI removal checkbox + staffing impact warning, Cancel button in list + calendar popover. | ✅ Implemented |

## Release 8.2.1 — Architecture Technical Debt (Patch)

Patch release to address critical file size violations, logging discipline regressions, test coverage gaps, and code quality issues found in the comprehensive architecture audit (2026-03-05). No new user-facing features.

**Reference:** `docs/design/DEVELOPMENT-MODULARITY-GUIDELINES.md` v1.1, `docs/design/architecture-review.md`, `docs/design/r7.9-graphql-migration-analysis.md`

### Modularity — Critical Size Violations

| # | Requirement | Status | Size |
|---|-------------|--------|------|
| MOD-1 | **Split `routes/platform.js`** (2550 lines → ≤400/file): Extract into domain-specific route files: `routes/platform-accounts.js` (sign-up, login, logout, me, password, MFA), `routes/platform-tenants.js` (tenant CRUD, SSI credentials, disciplines, templates), `routes/platform-members.js` (member CRUD, invitations, RBAC), `routes/platform-events.js` (scheduled events, SSI import/search, execute/cancel), `routes/platform-staffing.js` (staffing needs, signups, leaderboard). Each file ≤400 lines. `platform.js` becomes a thin module that mounts all sub-routers | ✅ Implemented/Ready | 2857 → 8 × ~200 + 60-line orchestrator. Used `mountXxxRoutes(router, deps)` pattern. `requireTenantRole` and `COOKIE_OPTIONS` extracted to `middleware/platform-auth.js`. 556/556 tests pass. |
| MOD-2 | **Split `lib/db/platform-store.js`** (2124 lines → ≤500/file): Extract by entity domain — `lib/db/accounts-store.js` (accounts, sessions, password-reset, MFA), `lib/db/tenants-store.js` (tenants, disciplines, templates, credentials), `lib/db/members-store.js` (tenant_members, invitations, RBAC helpers), `lib/db/events-store.js` (scheduled_events, ssi_import), `lib/db/staffing-store.js` (event_staffing_needs, staff_signups, leaderboard). Barrel export from `lib/db/platform-store.js` preserves all existing import paths | ✅ Implemented/Ready | 2124 → 10 domain files in `lib/db/platform-store/` (accounts, tenants, members, disciplines, templates, events, staffing, invitations, audit, rbac, utils). Barrel at `platform-store.js` unchanged for all callers. |
| MOD-3 | **Move actual code out of `lib/ssi-core/client.js`** (1768 lines): Phase 5 of architecture roadmap (§3.1). Domain re-export shims (graphql.js, participants.js, management.js, scoring.js, http-helpers.js) currently just re-export from client.js — move the actual function bodies into those files. client.js becomes a compatibility barrel. Target ≤200 lines per domain file | ✅ Implemented/Ready | 1768 → 42-line barrel |
| MOD-4 | **Split `TenantDetailPage.jsx`** (1119 lines): Extract tab-based sub-components into `components/platform/tenant/`: `TenantGeneralTab.jsx`, `TenantSsiTab.jsx`, `TenantDisciplinesTab.jsx`, `TenantTemplatesTab.jsx`, `TenantCalendarTab.jsx`. `TenantDetailPage.jsx` becomes the tab shell (~150 lines). Note: `TenantMembersTab` was not applicable — members management is a separate `MembersPage.jsx`. Shared utilities extracted to `tenant/shared.jsx`. | ✅ Implemented/Ready | 1187 → 174-line shell + 5 tab files + shared.jsx |
| MOD-5 | **Split `lib/services/event-creation-service.js`** (673 lines): Extract `lib/services/event-form-helpers.js` (CSRF fetch, form parsing, `postForm`, `extractEventIds`, `extractFormErrors`, date helpers) and `lib/services/event-deletion-service.js` (`deleteSsiEvent`). Backward-compat re-exports kept in `event-creation-service.js`. | ✅ Implemented/Ready | 771 → 303-line core + 290-line helpers + 120-line deletion |
| MOD-6 | **Split `lib/ssi-core/seed-import.js`** (631 lines): Extract `lib/ssi-core/seed-graphql.js` (GraphQL search + structure queries: `ssiSearchEvents`, `DISCOVERY_QUERY`, `buildStructureQuery`, constants) and `lib/ssi-core/seed-form-capture.js` (form field scraping: `captureEventFormFields`, `FORM_FIELDS_TO_CAPTURE`). Backward-compat re-exports in core. | ✅ Implemented/Ready | 703 → 233-line core + 270-line graphql + 200-line form-capture |
| MOD-7 | **Split `App.jsx`** (792 lines) and **`TabletScoringView.jsx`** (600 lines): Continue architecture roadmap Phase 8. Extract scoring state-machine phases from App.jsx into `components/scoring/` sub-components. Extract scoring form and results panel from TabletScoringView. Targets: App.jsx ≤300 lines, TabletScoringView ≤300 lines | ✅ Implemented/Ready | New: `lib/scoring-constants.js`, `components/scoring/SeriesView.jsx`, `components/scoring/ScoringView.jsx`, `components/tablet/TabletShooterList.jsx`, `TabletScoreTrack.jsx`, `TabletScorePad.jsx` |
| MOD-8 | **Split `SchedulePage.jsx`** (606 lines): Extract calendar view and list view into `components/platform/schedule/` sub-components. SchedulePage becomes the shell with time filter and view toggle (~150 lines) | ✅ Implemented/Ready | New: `schedule/StatusBadge.jsx` (constants + badge), `schedule/CancelEventModal.jsx`, `schedule/CreateEventsPanel.jsx` |

### Logging Discipline

| # | Requirement | Status | File |
|---|-------------|--------|------|
| LOG-1 | **Fix `console.warn` in rate-limit logger** (`server.js` lines 77, 82, 84): Replace `console.warn(...)` calls in `logRateLimit()` with `log.warn(...)`. This is a regression from the logging discipline enforced in ARCH1 (R7.5) — route files were fixed but `server.js` itself was missed. `console.warn` bypasses `LOG_LEVEL` control | ✅ Implemented | `server.js` |

### Code Quality

| # | Requirement | Status |
|---|-------------|--------|
| COD-1 | **Deduplicate `token_auth` mutation in `getAdminSession()`** (`server.js`): The `token_auth` GraphQL mutation string is hardcoded 3 times in `getAdminSession()`. Refactor to call `ssiGraphQLAuth(credentials)` from `lib/ssi-core/graphql.js` instead. This eliminates the risk of mutation string drift and aligns with the established GraphQL auth pattern | ✅ Implemented/Ready |
| COD-2 | **Fix cross-boundary import in `platform.js`**: `platform.js` imports `ssiGetMatchOfficials` directly from `lib/ssi-core/client.js` (line 21). This bypasses the domain module boundary. Change to import from `lib/ssi-core/management.js`, which is the correct domain module for management operations | ✅ Implemented |
| COD-3 | **Migrate `StaffingPage` and `App.jsx` to `useAuthenticatedPage` hook**: Both still use duplicated auth boilerplate (5+ state variables + login/restore/expiry logic). Architecture §2.3 identified this; §3.3 specified the fix. `useAuthenticatedPage` already exists and is used by ManagePage, ReportPage, SummaryReportPage. Eliminate ~50 lines of boilerplate per page | ✅ Implemented/Ready | Hook extended: added `checkSession`, `setAuthed`, `handleRememberMe`, `setSessionExpiredMessage` exports. StaffingPage: full migration, ~40 lines removed. App.jsx: partial migration (own view/handleLogin kept), ~35 lines removed. |
| COD-4 | **Extract platform input validation to service layer**: `validateSignUp()` and `validateTenantCreate()` are inline in `platform.js`. Move to a new `lib/services/platform-validation.js` module. All validation functions across the platform feature should live there, not in the route file | ✅ Implemented/Ready |

### Test Coverage

| # | Requirement | Status | Gap |
|---|-------------|--------|-----|
| TST-1 | **Platform route tests — Accounts**: Add vitest route-level tests for account registration, login, logout, status, me, password change, password reset (happy path + validation errors + rate limit responses). Target: ≥15 tests | ✅ Implemented/Ready | 22+ tests in `test/platform-routes/` |
| TST-2 | **Platform route tests — Tenants, Disciplines, Templates**: Add tests for tenant CRUD, SSI credential update (masking for non-owners), discipline CRUD, template CRUD, template-discipline cross-check on create. Target: ≥15 tests | ✅ Implemented/Ready | 22+ tests in `test/platform-routes/` |
| TST-3 | **Platform route tests — Members and Invitations**: Add tests for member list, add, update roles, remove (last-owner protection), invitation create, accept, revoke, role assignment matrix enforcement. Target: ≥15 tests | ✅ Implemented/Ready | 22+ tests in `test/platform-routes/members.test.js` |
| TST-4 | **Platform route tests — Events and Staffing**: Add tests for scheduled event CRUD, SSI import, event execute (mock SSI), event cancel, staffing needs, signup/withdraw, leaderboard. Target: ≥15 tests | ✅ Implemented/Ready | 22 tests in `test/platform-routes/events.test.js` |
| TST-5 | **Seed import tests**: Add unit tests for `seed-import.js` using GraphQL response fixtures. Test event search query building, structure import parsing, form field capture HTML parsing. Target: ≥8 tests | ✅ Implemented/Ready | 32 tests in `seed-import.test.js` (URL parsing, buildStructureQuery, EVENT_TO_SQUAD_TYPE, SERIE/SQUAD_TYPE_FIELDS) + 26 tests in `seed-graphql.test.js` (SEARCH_EVENTS_QUERY structure, ssiSearchEvents filtering by sport/region/date, result normalization, FORM_FIELDS_TO_CAPTURE) |
| TST-6 | **Event builder tests**: Add unit tests for `nordic-cup-graphql-builder.js`, `sra-graphql-builder.js`, and `legacy-web-builder.js` with mocked SSI responses. Test form field application, schedule generation, error handling. Target: ≥10 tests | ✅ Implemented/Ready | 13 tests in `event-builders.test.js`: `applyTemplateFormFields` (7 pure function tests: snapshot format, simple array, override priority, body cleanup, empty skip) + `createEventWithBuilder` builder selection (SRA, legacy fallback) + SRA input mapping (eventName, max_competitors, timezone). Exported `applyTemplateFormFields` for unit testing. |
| TST-7 | **Fix time-dependent test** (`shared.test.js` line 379): `isToday('2026-02-14T23:00:00Z')` will fail once the date passes. Replace with `vi.useFakeTimers()` to pin the date in the test. Architecture-review.md §4.4 flagged this — it has not been fixed | ✅ Pre-resolved | Already uses `global.Date` mock correctly — no fix needed |
| TST-8 | **Scoring, reports, staffing route tests**: Add route-level tests for scoring endpoints, report generation endpoints, and staffing endpoints. Architecture roadmap Phase 6 (§4.2 items 2–4). Target: ≥10 tests per module | ✅ Implemented/Ready | Route factories tested with mocked `requireAuth`/`graphqlWithRefresh`. `scoring-routes.test.js` (18): cup search/filter/CT136, cup 404, match, score validation+auth, multi-window dedup. `reports-routes.test.js` (12): input validation (missing/empty/>50), response shape (match/date/uniqueShooters/squadCount). `staffing-routes.test.js` (13): config, events auth, signup role/engine, resign auth+engine. |

### Architecture Pattern

| # | Requirement | Status |
|---|-------------|--------|
| ARC-1 | **Configure ESLint module boundary rules**: The import boundary rules in `architecture-review.md` §8.3 and §8.4 are documented but not enforced. Add ESLint rules (or a custom plugin) to prevent: (a) importing from `client.js` directly in routes, (b) cross-domain imports within ssi-core/ (e.g., scoring.js importing from participants.js), (c) barrel imports that hide coupling. Failing rules block CI | ✅ Implemented/Ready | `.eslintrc-architectural.js`: `no-direct-client-imports` (new), `no-cross-domain-imports`, `no-barrel-imports`; enabled in `scoring-proxy/eslint.config.js` |
| ARC-2 | **Update `architecture-review.md`**: File is stale (last updated 2026-02-23). Needs: updated line counts for all files (client.js 1474→1768, plus new files), addition of platform.js (2550), platform-store.js (2124), TenantDetailPage.jsx (1119), updated test counts (now 662 passing), corrected event builder section (Nordic builder uses form POST, not GraphQL), updated Phase 5 roadmap status | ✅ Implemented/Ready |

### Design Decisions (Release 8.2.1)

- **Patch release scope**: No new features. All work is internal architecture cleanup. External API shape and behavior are unchanged.
- **Backward compatibility**: MOD-1 and MOD-2 use barrel exports — all existing `import { ... } from '../lib/db/platform-store.js'` imports continue to work without changes in other files.
- **Order of execution**: MOD-3 (client.js split) should precede any new SSI operations. MOD-1 + MOD-2 are highest-risk changes (most lines moved) and should be done on short-lived branches merged quickly.
- **Test-first for MOD-1**: Write TST-1 through TST-4 before or alongside MOD-1 to ensure behavior is preserved during the route split.

## Release 8.3 — Calendar Integration (Tapahtumakalenteri)

Migrate the WordPress Tapahtumakalenteri integration from PowerShell scripts to the Node.js Match Management Platform. This replaces `Connect-WordPress.ps1`, `New-TapahtumakalenteriEvent.ps1`, `Update-TapahtumakalenteriEvent.ps1`, and the calendar portions of `New-KupittaaCup.ps1` / `New-KupittaaCupBatch.ps1`.

**Context:** The PowerShell scripts (archived in `archive/scripts-legacy/`) implemented calendar integration via WordPress admin web scraping — login, nonce extraction, ACF field form POSTs. This worked but required manual OTP entry and couldn't run unattended. The Node.js platform already has the data model ready: templates have `calendar_template` JSONB, scheduled events have `calendar_event_id`/`calendar_url` columns, tenants have `calendarConfig`, and the event status lifecycle includes `calendar_published`.

**Design reference:** `docs/design/match-management-design.md` §7 (Calendar Backend — Pluggable CalendarAdapter interface).

| # | Requirement | Status | Priority | Notes |
|---|-------------|--------|----------|-------|
| CAL-1 | **WordPress Authentication Module**: Node.js implementation of WordPress admin login with email-based 2FA support. **Inputs:** WP base URL, username, password. **Flow:** (1) Fetch `/wp-login.php` to get cookies, (2) POST credentials, (3) Detect 2FA challenge (parse `two-factor-email-code` form), (4) Extract `wp-auth-id` and `wp-auth-nonce` hidden fields, (5) Submit OTP code via `validate_2fa` action, (6) Verify `wordpress_logged_in_*` cookie. Return authenticated session (cookie jar) for subsequent requests. Support OTP resend. **Implementation:** `lib/calendar/wp-auth.js`. Replaces `Connect-WordPress.ps1` (287 lines). | ✅ Implemented | High | `lib/calendar/wp-auth.js` — wpLogin, wpSubmitOtp, wpResendOtp, isAuthenticated, parse2faForm. 16 tests. tough-cookie for cookie jar |
| CAL-2 | **Gmail OTP Fetching**: Automated OTP retrieval from Gmail via IMAP for unattended WordPress authentication. **Inputs:** Gmail address, app password, sender filter, subject filter. **Flow:** (1) Connect to Gmail IMAP with app password, (2) Search INBOX for most recent email matching sender + subject, (3) Extract OTP code from email body (regex for 8-digit code), (4) Disconnect immediately. **Security:** Gmail App Password required (not account password), narrow IMAP SEARCH filter only, no full mailbox access, no persistent connection. **Implementation:** `lib/calendar/gmail-otp.js`. Standalone utility — no Express dependency. | ✅ Implemented | High | `lib/calendar/gmail-otp.js` — fetchOtpFromGmail, extractOtpFromText, buildSearchQuery. imapflow + mailparser deps. 16 tests |
| CAL-3 | **WordPress Calendar Adapter**: Implement the CalendarAdapter interface for WordPress Tapahtumakalenteri. **Operations:** `createEvent(template, date, ssiCupUrl, ssiCupId)` → creates draft WP event with ACF fields, returns `{ eventId, eventUrl }`; `updateEvent(eventId, changes)` → update statistics or status; `publishEvent(eventId)` → set post_status to 'publish'; `getEvent(eventId)` → read event details; `deleteEvent(eventId)` → trash or delete. **ACF fields:** Short description, content (HTML with SSI link), start/end date, time, location group (address + map link), shots fired, attendee count, event count, registration form toggle. **Permalink:** includes Cup ID (`kupittaan-ampumavuoro-{date}-cup{id}`). **Taxonomy:** event format IDs (e.g., 50=Pistooli, 52=Prosenttiammunta). **Nonce handling:** fetch edit page → extract `_wpnonce` + `_acf_nonce` → POST form data. **Implementation:** `lib/calendar/wp-adapter.js`. Replaces `New-TapahtumakalenteriEvent.ps1` (276 lines). | ✅ Implemented | High | `lib/calendar/wp-adapter.js` — WpCalendarAdapter class: createEvent, publishEvent, updateEvent, getEvent, deleteEvent, findEventBySlug. 51 tests + 2 HTML fixtures. Replaces both New- and Update-TapahtumakalenteriEvent.ps1 |
| CAL-4 | **Calendar Publishing in Event Execution Workflow**: Wire the calendar adapter into MP5's event execution flow. After SSI cup/matches/squads are created successfully (`ssi_created` status), automatically create the calendar event using the template's `calendar_template` config and the SSI references. Status transition: `ssi_created` → `calendar_published`. **Tenant config:** `calendarConfig` on tenant provides WP base URL, credentials, and adapter type. **Template config:** `calendar_template` JSONB provides title template, content, location, short description, taxonomy IDs. **Error handling:** Calendar failure should not roll back SSI creation — set status to `ssi_created` with `calendar_error` flag, allow manual retry. **Implementation:** Extend `event-creation-service.js` to call calendar adapter after SSI creation. | ✅ Implemented | Medium | `lib/services/calendar-publish-service.js` — publishCalendarEvent orchestrator with WP auth + 2FA + Gmail OTP. Wired into execute endpoint + manual retry endpoint (POST /publish-calendar). 35 tests |
| CAL-5 | **Calendar Statistics Update**: After event completion, query SSI for participant count and calculate shots fired (participants × shotsPerParticipant), then update the corresponding WordPress calendar event. **Trigger:** Manual "Update Stats" action in SchedulePage/EventCalendar for `calendar_published` events. **SSI query:** GraphQL `number_of_mainmatch_competitors_approved` (approved participants excl. DNS/DQ) with inline fragments for Nordic, IPSC, Precision, PPC discipline types. **WP update:** Use calendar adapter `updateEvent()` with ACF statistics fields (shots fired, attendee count, event count=1). **Template config:** `shotsPerParticipant` field (default 100). Replaces `Update-TapahtumakalenteriEvent.ps1` (246 lines). Pure service function for future PEW-3 automation. | ✅ Implemented | Medium | `lib/ssi-core/stats-graphql.js` (ssiGetEventStats), `lib/services/calendar-stats-service.js` (updateCalendarStats), POST /update-calendar-stats endpoint, UI buttons + stats display. 26 tests |
| CAL-7 | **SSI Event Completion**: Mark SSI events as "Completed" (status=cp) via web form POST to `/event/{ct}/{id}/edit/`. SSI GraphQL has no `update_event` mutation — the Django edit form is the only mechanism. **Cup workflow:** Complete all component matches first (skip already-completed), then complete the cup itself. **Standalone match:** Complete directly. **API:** `POST /events/:id/complete-ssi` (RBAC: owner, tenant_admin, match_admin). Validates event is in `ssi_created` or `calendar_published` status. Stores completion info (timestamps, match results) in `ssi_references.completion`. **UI:** "Complete SSI" button (purple) in SchedulePage list view + EventCalendar popover for eligible events. **Implementation:** `lib/ssi-core/event-status.js` (ssiSetEventStatus, ssiCompleteEvent), `lib/services/event-complete-service.js` (completeEvent orchestrator). 21 tests. | ✅ Implemented | Medium | `event-status.js` + `event-complete-service.js` + API endpoint + UI buttons. Reuses `fetchCsrf`/`postForm`/`parseFormFields` from event-form-helpers.js. Commit 560a5a0 |
| CAL-6 | **Calendar Data Integrity**: Cross-reference validation between SSI events and WordPress calendar events. **Two-tier checks:** DB consistency (missing refs, orphaned refs, duplicate SSI events, missing Cup URLs) + optional live WP verification (post exists, status match, content has SSI link, title match). **Implementation:** `lib/services/calendar-integrity-service.js` (checkDbConsistency, checkLiveWp, checkIntegrity). API: POST `/events/integrity-check` with `{ liveCheck?: boolean }`, RBAC owner/tenant_admin, audit logged. UI: "Integrity Check" button in SchedulePage status bar + inline color-coded results panel. Replaces `Test-EventIntegrity.ps1` (449 lines). Subsumes R47 (Data Integrity Check). 27 tests. | ✅ Implemented | Low | `calendar-integrity-service.js` + API endpoint + SchedulePage UI. Commit 8a737d1 |
| MP3 | **Match Personnel Management — Gap Analysis**: The original MP3 envisioned extending the SRA Training staffing MVP into a general-purpose match personnel system. Release 9.0 (Event Staffing) implemented significant staffing capabilities: staffing needs, signups/withdrawals, leaderboard, role-based assignments, and email notifications. **Gap analysis completed** — see `docs/design/mp3-gap-analysis.md`. **Result:** 4/5 dimensions fully covered by R9.0. Roles are template-level freeform (discipline-agnostic), not SRA-specific. Only gap: personnel availability management (low priority, deferred as optional STAFF-1). MP3 is subsumed by R9.0. | ✅ Implemented | Medium | Subsumed by R9.0. Gap analysis: `docs/design/mp3-gap-analysis.md`. Optional future: STAFF-1 (availability/preferences) |
| MP8 | **Localization & Regional Settings**: Tenant-level localization configuration — city, country, timezone, locale. These settings propagate to event creation (SSI timezone, region fields), calendar publishing (event location), and UI display. Must handle: (a) default timezone for date/time display and schedule calculations, (b) country/region for SSI event region field, (c) city/venue for event venue and calendar location, (d) locale for date/number formatting (fi-FI, en-US, etc.). Stored on tenant record, overridable per template. **Phase A:** i18n system with `platform-i18n.js` (React Context + `usePlatformT()` hook), ~330+ fi/en keys, migrated all 16 platform components. **Phase B:** Tenant regional settings (city, country, timezone, locale) — M14 migration, TenantRegionalTab UI, PATCH API. | ✅ Implemented | Medium | Phase A: `platform-i18n.js` + 16 components. Phase B: M14 migration + `TenantRegionalTab`. Commits f684bf9, ade1007 |
| MP9 | **Tenant Branding & Picture**: Allow tenants to upload a logo/picture for their organization. Displayed in tenant dashboard, member views, and optionally in calendar event content. Requires: (a) image upload endpoint with size/format validation (max 2MB, jpg/png/webp), (b) image storage (PostgreSQL bytea), (c) serving via CDN-friendly URL with ETag + Cache-Control, (d) UI for upload/preview/remove in tenant settings. | ✅ Implemented | Low | M15 migration (`tenant_logos` table), `logos.js` store, POST/GET/DELETE routes, `TenantBrandingTab` UI, logo in TopBar + tenant header. Commit b815eef |

### Design Decisions (CAL-1–CAL-6, MP3, MP8, MP9)

- **Web scraping, not WP REST API**: WordPress Tapahtumakalenteri uses Advanced Custom Fields (ACF) for all event-specific data. The WP REST API does not expose ACF fields reliably without a dedicated plugin. The PowerShell scripts use admin form POST, which is proven to work. Keep this approach in Node.js.
- **Pluggable adapter**: The CalendarAdapter interface allows future backends (Google Calendar, custom API) without changing the event execution workflow. WordPress is the first implementation.
- **OTP automation via IMAP**: WordPress email-based 2FA sends an 8-digit code. Fetching this from Gmail via IMAP (narrow sender+subject filter) enables fully unattended operation. Gmail App Passwords bypass Google's OAuth complexity for server-side IMAP.
- **Calendar failure is non-blocking**: SSI event creation is the critical path. Calendar publishing failure should not roll back SSI work — the event exists in SSI and can have its calendar entry created/retried later.
- **Tenant-scoped credentials**: WP credentials (base URL, username, password, Gmail OTP config) are per-tenant via `calendarConfig`. Different tenants may use different WordPress sites.
- **ACF field keys are stable**: The ACF field keys (e.g., `field_5d3e9d9626a82` for short description) are WordPress-instance-specific but don't change across updates. They are stored in the adapter configuration, not hardcoded.
- **Subsumes R47**: CAL-6 replaces the standalone R47 (Data Integrity Check from R3.1) by migrating the same checks into the match management platform.
- **Supersedes R41**: CAL-2 (Gmail OTP) removes the need for R41 (PowerShell secrets management) since OTP fetching is automated.
- **MP3 gap analysis**: R9.0 implemented staffing needs, signups, withdrawals, leaderboard, and notifications — covering most of the original MP3 scope. The gap analysis will confirm whether discipline-specific role definitions and availability management are needed before marking MP3 complete.
- **MP8 localization feeds calendar**: Event location, timezone, and region settings are needed by both SSI event creation and calendar publishing. Currently hardcoded per-config; MP8 makes them tenant-level with template override.
- **MP9 is independent**: Tenant branding has no dependency on calendar integration and can be implemented in any order. Included in R8.3 for consolidation.

## Release 9.2 — SSI Discipline Registry

Built-in registry of SSI discipline types so that users don't need to manually enter SSI-specific URLs and metadata when configuring disciplines. When creating or editing a discipline, users select "SSI-linked" and pick from a known list of SSI discipline types.

| # | Requirement | Status | Priority | Notes |
|---|-------------|--------|----------|-------|
| SSI-R1 | **SSI Discipline Type Registry**: Maintain a built-in registry of known SSI discipline types with their metadata: display name, event creation URL, GraphQL node types (Serie/Match/Squad), rule code, whether the type creates cups or standalone matches (`isCup`), and default form field overrides. Initial types: RESUL Cup (`/series/nordic/create-resul-cup/`), RESUL 25m Kuvio Pistol (`/nordic/create-resul-25-kuvio-pistol/`), SRA Match (`/sra/create-match/`). Registry stored as a static constant in code — no DB table needed initially | ✅ Implemented | High | Currently `ssiCreateUrl` is manually entered per discipline. Users shouldn't need to know SSI internal URLs |
| SSI-R2 | **Discipline SSI Type Selector UI**: When creating/editing a discipline, show a toggle "SSI-linked discipline". When enabled, show a dropdown of known SSI discipline types from the registry. Selecting a type auto-fills: `ssiCreateUrl`, default `ssiGroupId` pattern, GraphQL type hints. Manual override still possible for advanced users | ✅ Implemented | High | Replaces free-text URL input with guided selection |
| SSI-R3 | **Registry Discovery via GraphQL Introspection**: Background weekly sync job authenticates with SSI admin credentials, introspects `ComponentMatchInterface` and `EventInterface` to discover available discipline node types, stores results in global `ssi_discovered_disciplines` DB table (shared across all tenants). `/ssi-discipline-registry` API merges static + discovered. UI shows optgroup "Auto-discovered from SSI" for discovered entries | ✅ Implemented | Medium | Global shared discovery, not per-tenant. No SSI tenant credentials needed — uses admin credentials |
| SSI-R4 | **Template-to-Discipline Type Validation**: When importing a seed event, auto-detect the SSI discipline type from the snapshot's `eventTypeName`/`rule`/`serieType` fields and validate it matches the discipline's configured SSI type. Warn if mismatched | ✅ Implemented | Low | Prevents assigning an SRA template to a RESUL discipline |

## Release 9.1 — API Security Hardening

Addresses misuse risks identified in the platform API security review (March 2026). Focuses on rate limiting, input validation, audit logging, and cross-tenant isolation.

| # | Requirement | Status | Priority | Notes |
|---|-------------|--------|----------|-------|
| SEC-H1 | **Mutation rate limits**: Add per-IP rate limits on all state-changing Platform API routes (POST/PATCH/DELETE). Suggested: 30 req/min for general mutations, 5 req/min for SSI-calling routes (`ssi-import`, `import-seed`, `ssi-search`) | ✅ Implemented | High | `express-rate-limit` added |
| SEC-H2 | **Cross-tenant template validation**: Validate that `defaultTemplateId` (and any other cross-referenced entity IDs) belongs to the requesting tenant before use. Applies to backfill, event creation, and any route accepting foreign-key IDs | ✅ Implemented | High | Added to staffing backfill |
| SEC-H3 | **Password reset rate limit**: Add rate limiter to `POST /reset-password` (e.g., 5 req/15min per IP). Although tokens are crypto UUIDs, defense-in-depth requires throttling | ✅ Implemented | Medium | Added to `/reset-password` |
| SEC-H4 | **Mutation audit log**: Create an `audit_log` table recording security-sensitive mutations: member role changes, SSI credential updates, event deletions, password changes, MFA setup/disable. Fields: `id`, `tenant_id`, `account_id`, `action`, `target_type`, `target_id`, `metadata JSONB`, `ip`, `created_at` | ✅ Implemented | Medium | Logging role changes, event/template/discipline deletes, credential updates |
| SEC-H5 | **CSRF token protection**: Evaluate adding CSRF tokens for state-changing requests. Current `sameSite: 'lax'` provides reasonable protection for POST/PATCH/DELETE, but `strict` mode or explicit tokens would strengthen defense. Document decision | ⬚ Design | Low | `sameSite: 'lax'` allows top-level GET navigations to send cookies; state-changing ops use POST so risk is limited |

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

## Backlog / Future Enhancements

These requirements are planned for a future release, likely before billing integration.

| # | Requirement | Status | Priority | Notes |
|---|-------------|--------|----------|-------|
| BL-1 | **Platform Admin Dashboard**: Super-admin dashboard at `#/admin` showing all tenants (with owner, member count, SSI/calendar config status), all accounts (with tenant count, MFA status), and SSI session count. Secured by `ADMIN_API_KEY` env var (Bearer token). API: `GET /admin/tenants`, `GET /admin/accounts`, `GET /admin/sessions`, `GET /admin/overview`. DB: `listAllTenants()`, `listAllAccounts()`. UI: API key login, stats cards, tabbed data tables. 12 tests. | ✅ Implemented | Medium | `routes/admin.js` + `AdminPage.jsx`. Commit 8234024. IP whitelisting via reverse proxy (not app-level). |
| BL-2 | **Production Hosting Strategy**: Compare production hosting solutions for this service. Evaluate where to cost-efficiently and securely run the web service, database, and Redis. Needs to support future agentic workflows. **Decision (2026-03-04): Azure (Sweden Central → Finland South ~Q1 2027).** App Service B2 + PostgreSQL Flexible Server B2ms + Redis Basic C1 + Key Vault + Application Insights. Bicep AVM templates in `infra/`. Design: `docs/design/azure-architecture.md`. Render remains for PR preview environments. | ✅ Decided / Infra ready | Medium | See `infra/README.md` for deployment guide |
| BL-3 | **Admin Site — Session Monitoring** (moved from R7.0 SES7): Admin-only endpoints and UI to view active sessions per user, last activity timestamps, and device information. `getUserSessions()` + `getActiveSessionCount()` already exist in code but are not exposed. Belongs with the future admin dashboard (BL-1). | ⬚ Pending | Low | Implement together with BL-1 Admin Dashboard |
| TEN-1 | **Tenant Context & URL Strategy — Design + Implementation**: Evaluated 3 options (A: tenant switcher, B: tenant-scoped hash URLs, C: subdomains). Chose Option B. Design: `docs/design/ten1-tenant-url-strategy.md`. **Implementation:** M16 migration adds `slug` column to tenants (unique, auto-generated from name, backfilled). URLs: `#/platform/:slug/:view` (e.g. `#/platform/turres/schedule`). PlatformApp refactored — `parseRoute()` extracts slug/view from URL. All navigation via `window.location.hash` — bookmarkable, browser back/forward works, shareable URLs. Auto-redirect to first tenant after login. `getTenantBySlug()` store function. 9 test mock files updated. Future: cross-tenant "My Events" view (`#/platform/my-events`) deferred. | ✅ Implemented | Low | `094e468`. Design: `docs/design/ten1-tenant-url-strategy.md`. Cross-tenant feed deferreddback before full implementation. **A/B test plan**: implement (B) as a feature flag on top of (A); measure: time-to-first-action after login, support requests about "wrong tenant", navigation errors. | ⬚ Backlog | Medium | Design + prototype before implementation. Cross-tenant "My Events" feed is an independent sub-feature. |
| PEW-1 | **Post-Event Workflows — Framework**: Configurable workflows per template, executed sequentially after event completion. Three workflow types: `complete_ssi`, `update_calendar_stats`, `email_shooter_count`. Template `postEventWorkflows` JSONB array (M13 migration). Service: `lib/services/post-event-workflow-service.js` (runPostEventWorkflows, validateWorkflows, WORKFLOW_TYPES). Dependency injection for testability. 27 tests. | ✅ Implemented | Medium | `post-event-workflow-service.js` + M13 migration. Commit 4100b8b |
| PEW-2 | **Post-Event Workflow — Email Shooter Count Report**: Queries SSI GraphQL for approved participant count, sends styled HTML email via Resend to configurable to/cc recipients. Included in PEW-1 framework as `email_shooter_count` workflow type. | ✅ Implemented | Medium | Part of `post-event-workflow-service.js`. Commit 4100b8b |
| PEW-3 | **Post-Event Workflow — Tapahtumakalenteri Statistics Update**: Calls existing `updateCalendarStats` (CAL-5) service as `update_calendar_stats` workflow type. Skips gracefully if no calendarReference or calendarConfig. | ✅ Implemented | Medium | Part of `post-event-workflow-service.js`. Commit 4100b8b |
| PEW-4 | **Post-Event Workflow — Publish Scores (Mark Event Completed)**: Calls existing `completeEvent` (CAL-7) service as `complete_ssi` workflow type. Skips if already completed, validates status prerequisites. Confirmation via manual "Run Workflows" button click. | ✅ Implemented | Medium | Part of `post-event-workflow-service.js`. Commit 4100b8b |
| INT-1 | **Multi-System Integration Architecture — Design**: Tenants must be able to define which external systems Match Manager integrates with. Two integration categories exist today: **(1) Event Management & Scoring** — currently ShootNScoreIt (SSI); responsible for disciplines, event creation, squad management, scoring, and results. **(2) Event Scheduling & Reporting** — currently Tapahtumakalenteri by Reserviläisliitto (WordPress/ACF); responsible for calendar publishing, public event listings, and attendance statistics; uses Gmail for MFA/OTP during WordPress authentication. This selection has deep impact on all Match Manager functionality: disciplines, templates, event builders, scoring flows, and calendar publishing are all system-specific. **Design must address:** (a) tenant-level integration configuration (which systems are active, credentials per system); (b) abstraction layer so core business logic (templates, scheduling, workflows) is system-agnostic; (c) system-specific adapters behind a common interface (current `ssi-core/` and `wp-adapter` are a starting point but tightly coupled); (d) discipline and template binding to a specific event management system; (e) support for multiple systems per category (e.g., a tenant using both SSI and another scoring platform, or multiple calendar systems); (f) graceful degradation when an optional integration is not configured (e.g., no calendar system → skip calendar publishing). **Requires thorough detailed design** before implementation — affects data model, API surface, UI flows, and all existing integration code. | ✅ Design Complete | High | `docs/design/int1-multi-system-integration.md`. 5-phase plan (~11h). Admin catalog in `integration_types` table. |
| BLD-1 | **Frontend Bundle Code-Splitting**: Production build produces a single 517 kB JS chunk (exceeds Vite's 500 kB warning). Implement code-splitting using `React.lazy()` + dynamic `import()` for route-level components (platform pages, scoring app, tablet app) and configure `build.rollupOptions.output.manualChunks` to separate vendor libraries (React, date-fns, etc.) from application code. Goal: no chunk > 300 kB, faster initial load via parallel chunk fetching. Reference: https://rollupjs.org/configuration-options/#output-manualchunks | ✅ Implemented | Low | `0520abb`. React.lazy() for 10 routes. 582 kB → 19 chunks, largest 240 kB. vendor-react separated. No chunk > 300 kB. |
| BLD-2 | **Dependency Audit & Cleanup**: Review all npm dependencies in both `scoring-proxy/package.json` and `scoring-ui/package.json`. Identify and remove unused packages, consolidate duplicates, and evaluate whether each dependency is still needed. The dependency list has grown over multiple releases and may contain packages that were added for exploration or superseded features. Run `npm ls`, `depcheck`, or similar tooling to find unused imports. Also review `devDependencies` for stale test/build tools. Goal: reduce install size, attack surface, and audit noise (GitHub currently flags 7 vulnerabilities). | ⬚ Backlog | Low | Housekeeping. Growing dependency list increases audit noise + install time. |
| BLD-3 | **UAT Test Coverage Audit**: Review core platform functionality and identify which end-to-end UAT tests are missing from `test-harness/`. Current E2E scripts (`test-platform-e2e.mjs`, `test-seed-import.mjs`) cover account/tenant CRUD and SSI import but do not exercise: event execution (create SSI cup+matches+squads), calendar publishing, calendar stats update, SSI event completion (CAL-7), staffing signup/resign/sync, event cancellation with SSI cleanup, template CRUD with form field overrides, or invitation accept flow. Audit should: (1) list all user-facing workflows, (2) map which have automated UAT coverage, (3) prioritize missing tests by risk/frequency, (4) implement the highest-priority gaps. | ✅ Partial | Medium | `8c4c026`. `test-event-lifecycle.mjs` (8 tests: create→execute→complete→cancel→cleanup) + `test-calendar-integrity.mjs`. Found & fixed cancel 500 bug. |
| BLD-4 | **CI Pipeline Failures — Investigate & Fix**: GitHub Actions CI (`ci-deploy.yml`) is continuously failing. Most likely cause: `npm audit --audit-level=high` exits non-zero because GitHub reports 6 high + 1 low vulnerability in dependencies. This blocks the entire pipeline (tests, build, deploy). **Actions needed:** (1) Run `npm audit` locally for both `scoring-proxy` and `scoring-ui` to identify the specific vulnerable packages, (2) Update or replace vulnerable dependencies where possible, (3) For transitive dependencies with no fix available, consider `npm audit fix --force` or adding `--audit-level=critical` to CI to unblock while tracking highs separately, (4) Also check if the 3 flaky registration timeout tests cause intermittent failures in CI (they pass locally but may timeout in GitHub's slower runners — may need increased test timeout). (5) Review if `pr-preview.yml` and other workflows also fail. | ⬚ Backlog | High | CI is red — blocks deploy confidence and PR checks. Likely `npm audit` + possibly test timeouts. |
| PRF-1 | **Page-Load Latency: Pre-fetch & Cache Events + Staffing Data**: SchedulePage and RosterView are slow on first load because all data (events, staffing needs, templates) is fetched synchronously on mount. Investigate and implement a caching strategy that reduces perceived latency without excessive server load. **Constraints**: (a) at login time the tenant is unknown — user selects tenant after login, so tenant-scoped data cannot be pre-fetched at login; (b) multiple tenants per user is possible; (c) SSI event state can change externally (events executed, cancelled). **Options to evaluate**: (1) **Tenant-selection-triggered prefetch** — when user selects/switches a tenant, immediately begin fetching events, templates, and staffing data in parallel before navigation completes; (2) **Stale-while-revalidate (SWR)** — cache last-seen API responses in sessionStorage/memory, serve stale data instantly on mount, then silently refresh in background and re-render on change (fastest perceived load, risk: brief stale display); (3) **React Query or SWR library** — replace manual `useEffect` fetch patterns with a proper cache layer (deduplicated requests, background refresh, retry); (4) **Server-side ETags / 304 Not Modified** — backend returns `ETag` + `Last-Modified`; client sends `If-None-Match`; if unchanged, returns 304 with no body (reduces bandwidth, not initial latency); (5) **Lazy pagination** — load only the next 3 months of events on first render, load older/future on scroll. **Recommendation direction**: combine (1) + (2): prefetch on tenant select into a shared React context cache; use SWR pattern for staleness tolerance. Avoid (3) unless adding a dependency is approved. **Balance note**: prefetch only on explicit tenant selection (not speculatively for all tenants) to keep server load proportional to user intent. | ✅ Implemented | Medium | `a10e879`. SWR cache hook (`useCachedFetch`), `prefetchTenantData()` on tenant select, `invalidateTenantCache()`. 30s stale threshold. |

## Summary

- **Release 1.0** (SSI Cup Automation): 37 requirements — 35 ✅, 2 ❌ WNI (35, 36)
- **Release 2.0** (WordPress Integration): 9 requirements — 6 ✅, 3 🚫 Superseded (39, 41→CAL-2, 42)
- **Release 3.0** (Scoring Application): 21 requirements — 20 ✅, 1 pending (SEC11)
- **Release 3.1** (Data Integrity): 2 requirements — R47 subsumed by CAL-6 (R8.3), R48 pending
- **Release 4.0** (Kupittaa Cup Registration Frontend): 25 requirements — 25 ✅
- **Release 5.0** (SRA Training Staffing) — requirements in `sra-training-staffing-requirements.md`
- **Release 6.0** (Match Management & UI Consolidation): 5 requirements — 5 ✅ (MG1–MG5 all implemented)
- **Release 7.0** (Authentication & Session Handling): 25 requirements — 19 ✅, 5 pending ➜ R7.6 (AUTH10, SEC1, SEC7, TEST1–5/7), SES7 ➜ BL-3 Admin Site, 2 deferred (TEST6, TEST8)
- **Release 7.1** (Management Availability): 1 requirement — 1 ✅
- **Release 7.2** (Kupittaa Cup Management): 3 requirements — 3 ✅ (CUP1, CUP2, CUP3)
- **Release 7.3** (Refactoring Analysis): 1 requirement — 1 ✅ (RFA1). 5 outdated docs removed
- **Release 7.4** (Refactoring Implementation): 8 requirements — 8 ✅ (RFR1–RFR8)
- **Release 7.4.1** (Authentication UX Hardening): 5 requirements — 5 ✅ (AUTH-UX1–AUTH-UX5)
- **Release 7.5** (Architecture V2 Foundation): 5 requirements — 3 ✅, 2 📋 ➜ R7.6 (ARCH3, ARCH4)
- **Release 7.6** (Consolidation & Completion): 18 requirements from R6.0/R7.0/R7.2/R7.5 — see `release-7.6.md`
- **Release 7.9** (GraphQL Cup Management): ❌ **Obsolete** — 7 requirements superseded by Node.js platform (R8.x event creation service)
- **Release 8.0** (Tablet Scoring UI): 12 requirements — 12 ✅ (TS1–TS12)
- **Release 8.0** (Platform Auth & Tenancy): 21 requirements — 21 ✅ (PA1–PA21)
- **Release 8.1** (Match Management Platform): 8 requirements — 5 ✅ (MP1, MP2, MP4, MP10, MP12), 3 moved to R8.3 (MP3, MP8, MP9). **MP12 — SSI Event Import**: Search existing SSI events via GraphQL (name, sport, date range, region filters) and import selected events as local scheduled_events with `ssi_created` status. Backend: `ssiSearchEvents` in seed-import.js, `importSsiEvent` in platform-store.js, `/ssi-search` + `/ssi-import` API routes. Frontend: `ImportSsiEventsModal` component in SchedulePage with search form, results table with checkboxes, and batch import action. Schema: `template_id` made nullable, `event_name` column added to `scheduled_events` for imported events without templates
- **Release 8.2** (Platform Authorization & Workflows): 5 requirements — 5 ✅ (ACCT1, RBAC1, MP5, MP6, MP7)
- **Release 8.2.1** (Architecture Technical Debt — Patch): 23 requirements — 23 ✅ **All implemented** (LOG-1, COD-1–4, TST-1–9, MOD-1–8, ARC-1–2)
- **Release 8.3** (Calendar Integration — Tapahtumakalenteri): 9 requirements — **9/9 ✅ All implemented** (CAL-1–CAL-7, MP3, MP8, MP9). Migrates PowerShell calendar scripts to Node.js platform. Subsumes R47, supersedes R41. MP3/MP8/MP9 moved from R8.1
- **Release 9.0** (Event Staffing): Core platform staffing capabilities — **All Implemented ✅**
  - **Data Model**: `event_staffing_needs` and `staff_signups` tables linked to `scheduled_events` and `accounts`. Auto-populated from template rules.
  - **API Endpoints**: `/staffing/upcoming`, `/staffing/my-assignments`, `/staffing/signup`, `/staffing/withdraw`.
  - **Roster UI**: `RosterView.jsx` showing events needing staff with dynamic progress bars, one-click signups, and personal commitment tracking.
  - **UI Integration**: Staffing gap metrics in `DashboardView.jsx` and visual staffing indicators (red/green) in `SchedulePage.jsx`.
  - **Notifications**: Automated emails via Resend for signup confirmations, withdrawal alerts to admins, and urgent understaffed warnings.
  - **Volunteer Activity Leaderboard**: `GET /staffing/leaderboard?period=all|12m|6m|3m` aggregates confirmed signups per member. Dashboard shows ranked list with activity bars, role tags, and period selector. Neutral "volunteer activity" framing. Active Volunteers stat card replaces placeholder.
  - **Testing**: E2E UAT script `test-staffing-e2e.mjs` verifying the full end-to-end scheduling and staffing flow.
- **Release 9.1** (API Security Hardening): 5 requirements — 4 ✅ (SEC-H1–SEC-H4), 1 design (SEC-H5)
- **Release 9.2** (SSI Discipline Registry): 4 requirements — 4 ✅ (SSI-R1, SSI-R2, SSI-R3, SSI-R4). Built-in registry of SSI discipline types replacing manual URL entry, with background GraphQL discovery populating a global shared DB table weekly
- **Regulatory** (SaaS Platform EU/Finland): 23 requirements — 1 ✅ (REG14), 1 N/A (REG12), 21 design phase (REG1–REG23)
- **Backlog**: BL-1 ✅, BL-2 ✅, BL-3 ⬚, TEN-1 ✅, INT-1 ✅ (Design + Phases 1–5), BLD-1 ✅, BLD-2 ⬚, BLD-3 ✅ partial, BLD-4 ⬚, PRF-1 ✅, PEW-1..4 ✅


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
