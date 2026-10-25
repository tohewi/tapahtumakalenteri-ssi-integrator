# Requirements

> **Product Scope:** This document specifies requirements for **TurRes SSI Tools** (Scoring Mobile & Tablet, Public Registration, Cup Management, and SRA Training Staffing). The multi-tenant **Match Manager** platform has been moved to its own repository (`tohewi/match-manager`).

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
| 17 | There are three squads per match — Squad 1: Laina-ase (pieni puoli), Squad 2: Oma ase 1 (iso puoli, vasen), Squad 3: Oma ase 2 (iso puoli, oikea) | ✅ |
| 18 | Laina-ase and Oma ase 1 have max 9 shooters. Oma ase 2 has max 7 shooters (total 25) | ✅ |
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

## Release 3.1 - Data Integrity (Planned)

| # | Requirement | Status |
|---|-------------|--------|
| 47 | **Data Integrity Check**: Modular integrity verification between SSI and WordPress. (1) List all Cups owned by SSI login and verify each has a corresponding Tapahtumakalenteri event. (2) Validate date list file against both systems - all dates should have SSI Cup and WordPress event. (3) Verify cross-references: WordPress permalink contains Cup ID, WordPress content links to SSI Cup URL. Configurable by event type (e.g., Kupittaa Cup) and date list file parameter. | ⬚ Pending |
| 48 | Design automation architecture with following assumptions: Continue with web scraping (Tapahtumakalenteri and SSI API access will not happen shortly). It is going to be possible to programmatically access mailbox to read OTP. Automation architecture should utilize agents and workflows. Tech preference Azure and MS Foundry. Agentic workflows should keep up to date with Tapahtumakalenteri events and perform reporting and data integrity tasks when needed. i.e. after an event. Agentic workflow should handle a batch request for new events or updating existing events. If this requirement is too large, split it into smaller requirements and into multiple versions to achieve suitable increments of functionality. Always make sure documentation and test automation is in place and adds value to users and developers, agentic or human. | ⬚ Pending |

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

## Release 5.0 - SRA Training Staffing

See [sra-training-staffing-requirements.md](./sra-training-staffing-requirements.md) and [sra-staffing-design.md](../design/sra-staffing-design.md) for SRA Training Staffing requirements and architecture (`#/staffing`).

## Release 6.0 - Match Management & UI Consolidation

### Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| MG1 | **Match Management UI** (`#/manage`): Password-protected (SSI login). After login, pick an active Kupittaa cup. Shows consolidated squadding overview — per-squad cross-match table, unsquadded shooters, CUP/match membership mismatches | ✅ |
| MG2 | **Cup list sorting**: Sort cups ascending by proximity to today (closest first). Applies to all cup lists (register, manage, scoring) | ✅ Implemented (`shared.jsx` `CupList` + `routes/scoring.js` `sortByProximityToNow`) |
| MG3 | **Scoring route change**: Move scoring app from `#/` to `#/scoring`. Root URL (`#/`) becomes a front page with static links to the main features: Scoring, Registration, Management | ✅ Implemented (`main.jsx` + `HomePage.jsx`) |
| MG4 | **Shared UI components**: Extract and share common components (LoginScreen, CupList, visual design) between scoring, registration, and management features | ✅ Implemented (`shared.jsx`) |
| MG5 | **Manage cup list**: Reuse the same CUP list component as Registration. Only change text from "ilmoittautuminen" to "hallitse" | ✅ Implemented (`ManagePage.jsx`) |

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
| AUTH10 | **Registration Security**: Cup registration must require authenticated SSI passthrough login before registration actions are executed. Registration to cup, match enrollment, and squad assignment must run in authenticated user context (not unauthenticated email-only submission). | ✅ Implemented (`routes/registration.js` passthrough session/password verification + `FEATURE_REGISTRATION_AUTH_REQUIRED`) |

### Session Management Requirements

| # | Requirement | Status |
|---|-------------|--------|
| SES1 | **Redis Session Store**: Use express-session with connect-redis for persistent session storage. Sessions survive server restarts and deployments. | ✅ Implemented |
| SES2 | **Session TTL Configuration**: User sessions expire after 8 hours of inactivity. Configurable via environment variable. | ✅ Implemented |
| SES3 | **Session Cleanup**: Automatic cleanup of expired sessions. Redis handles TTL-based expiration. | ✅ Implemented |
| SES4 | **Session Security**: HttpOnly, Secure, SameSite=Lax cookies. Session fixation prevention. CSRF protection. | ✅ Implemented |
| SES5 | **Concurrent Sessions**: Support multiple sessions per user (different devices). Each device gets separate session ID. | ✅ Implemented |
| SES6 | **Session Revocation**: Immediate session revocation on logout, password change, or security events. | ✅ Implemented |
| SES7 | **Session Monitoring**: Track active sessions per user, last activity, and device information. | ✅ Implemented (`GET /api/v1/auth/sessions`) |

### Security Requirements

| # | Requirement | Status |
|---|-------------|--------|
| SEC1 | **OWASP Compliance**: Session handling must follow OWASP Session Management Cheat Sheet guidelines. | ✅ Implemented (`docs/design/session-handling.md`) |
| SEC2 | **Impersonation Security**: Admin SSI token must never be accessible without valid user session context. | ✅ Implemented |
| SEC3 | **Token Validation**: Both user and admin SSI tokens must be validated before use in SSI operations. | ✅ Implemented |
| SEC4 | **Rate Limiting**: Authentication endpoints rate limited (10 attempts/15min per IP). Session refresh limited (30/10min). | ✅ Implemented |
| SEC5 | **Audit Logging**: All authentication events, session operations, and SSI impersonation must be logged. | ✅ Implemented |
| SEC6 | **Error Handling**: Authentication errors must be generic to prevent user enumeration. | ✅ Implemented |
| SEC7 | **Secure Storage**: SSI tokens stored encrypted in Redis. Session keys use cryptographic randomness. | ✅ Implemented (`crypto.randomUUID()` + AES-256-GCM device tokens + private network Redis evaluation) |

### Testing Requirements

| # | Requirement | Status |
|---|-------------|--------|
| TEST1 | **Unit Tests**: 90% coverage for session management, token validation, and impersonation logic. | ✅ Implemented |
| TEST2 | **Integration Tests**: Test complete authentication flows with Redis, SSI token refresh, and session isolation. | ✅ Implemented |
| TEST3 | **Security Tests**: Test impersonation security, privilege escalation prevention, and session hijacking scenarios. | ✅ Implemented |
| TEST4 | **Reliability Tests**: Test Redis failure scenarios, session recovery, and SSI token expiry handling. | ✅ Implemented |
| TEST5 | **Performance Tests**: Session lookup latency <50ms p95. Support 100 concurrent users. | ✅ Implemented (`reliability-and-perf.test.js`) |
| TEST6 | **E2E Tests**: Complete user journeys through login, session expiry, re-authentication, and state restoration. | ✅ Implemented (`scoring-ui/e2e/*.spec.js` + `mock-ssi-server.js`) |
| TEST7 | **Penetration Tests**: Simulate attacks on session management, token theft, and impersonation bypass. | ✅ Implemented (CI `npm audit --audit-level=high` + GitGuardian + session security suite) |
| TEST8 | **Load Tests**: Session store performance under load with concurrent authentication and SSI operations. | ⬚ Pending |

## Release 7.1 — Management Availability

| # | Requirement | Status | Tokens (est.) |
|---|-------------|--------|---------------|
| MGMT1 | **Management Independent of Registration**: Kupittaa Cup Hallinta must keep cups available for management independent of registration status, once registration start date has passed and while the cup is still active. Management is available until 24h after the cup's end date (`ends + 24h` grace period), or `starts + 48h` fallback when `ends` is null. The grace period ensures cups remain manageable on event day regardless of timezone. Cups with no `registration_starts` are excluded. Uses dedicated `/api/manage/cups` endpoint. | ✅ Implemented | ~14,000 |

## Release 7.2 — Kupittaa Cup Management

| # | Requirement | Status |
|---|-------------|--------|
| CUP1 | **Move Shooter Between Squads**: In the "Squadit" section, it must be possible to move a shooter from one squad to another. The UI must show the same `→ S?` button as in the "Ei Squadeissa" section and function identically (squad picker dialog, SSI sync). Move is only allowed within the same match via Squadit, and the target squad must not be full. | ✅ Implemented (`SquadCard.jsx`, `SquadPickerSheet.jsx` capacity guard + `fix-squad` capacity & optional `matchId`) |
| CUP2 | **Set Shooter as DNS (Did Not Start)**: SSI calls this "Did Not Show". Setting DNS must be applied at the **cup level** and on **all matches** in the cup. The button must appear next to every shooter regardless of which section they are in. Clicking it shows a confirmation dialog: "Set N.N as DNS?" / "Aseta Etu Suku DNS?" (fi/en). It must be possible to **undo** (reverse) DNS if set by accident. SSI endpoints: `GET /event/participant/{ct}/{id}/set-did-not-show/` (set) and `GET /event/participant/{ct}/{id}/undo-did-not-show/` (undo), applied to cup + each match. | ✅ Implemented |
| CUP3 | **Mark Payment Received**: Per-competitor paid toggle at the **cup level only**. UI shows a button next to each shooter. When paid, the button must be **solid green** (high contrast) so it is immediately obvious who has paid when scanning the list. When unpaid, the button is gray/muted. State is stored in SSI via `GET /event/participant/{ct}/{id}/toggle-paid/`. Must reflect current paid status from SSI and allow toggling. | ❌ Deprecated / Removed (`R76-COM2` — disabled for SSI license compliance in Release 7.6.1) |

### Design Decisions (CUP1–CUP3)

- **All features** are added to the existing **Hallinta** page (`SquadManagementPage` component). No new pages needed.
- **CUP1**: Move is performed only within Squadit (not across matches). Strict capacity enforcement — cannot move into a full squad. Same `→ S?` button and squad picker as "Ei Squadeissa" section.
- **CUP2**: DNS is set on cup **and** all matches in the cup in a single action. Reversible — undo removes DNS from cup and all matches. DNS status must be visually distinct (e.g., strikethrough or badge). Confirmation dialog is bilingual (fi/en).
- **CUP3**: Paid status flow was deprecated and disabled in Release 7.6.1 (`R76-COM2`) for SSI license compliance.
- **SSI integration**: CUP2 uses **web scraping** (admin cookies) for reading and writing state. SSI GraphQL does not support write operations reliably. Endpoints: `set-did-not-show`, `undo-did-not-show` via `GET /event/participant/{ct}/{id}/...`.

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
- **No shared constants package**: Score zones are duplicated in UI and proxy but they're small (12 values). A shared NPM package adds build complexity. Keep them in sync manually.

## Release 7.4.1 — Authentication UX Hardening

Patch release focused on authentication UX consistency across protected feature domains and documentation consolidation.

| # | Requirement | Status |
|---|-------------|--------|
| AUTH-UX1 | **Mount-time auth bootstrap**: Protected feature entry must call `/api/auth/status` on mount and decide between restore or login without creating a new session | ✅ Implemented |
| AUTH-UX2 | **Restoring auth gate**: Protected features must render a neutral `restoring`/loading state while auth bootstrap runs, instead of showing login first | ✅ Implemented |
| AUTH-UX3 | **No auto-login on mount**: Reload restoration must not call `/api/auth/login`; explicit user login remains required to create sessions | ✅ Implemented |
| AUTH-UX4 | **Architecture baseline update**: Session handling documentation must define Auth Bootstrap + Auth Gate as the default pattern for all protected domains (`scoring`, `manage`, `reporting`) | ✅ Implemented |
| AUTH-UX5 | **Authentication UAT coverage**: Add a concise UAT test plan covering login, reload with/without session, expiry, scope mismatch, restore-after-login, and logout persistence | ✅ Implemented |

### Manage-only refresh follow-up (AUTH-UX1–AUTH-UX3)

Status: ✅ Implemented/Ready (2026-09-11; local verification and user-confirmed preview testing; deployment tracked in PR #167).

- Manage checks `/api/v1/auth/status` with the existing cookie before rendering either the login form or management content. Only an authenticated `manage` scope resumes to the Cup list, which reloads fresh data rather than rendering a saved overview without data.
- Missing sessions, HTTP 401, and other scopes require explicit Manage login. Network errors, non-success responses, and malformed status responses show a retryable error instead of treating the user as logged out.
- Refresh never calls login or logout. In-flight checks are cancelled when leaving Manage, and existing explicit login, logout, and session-expiry behavior is retained.
- Scope boundary: mobile/tablet scoring login and session code, `api.js`, `useRememberMe`, `LoginScreen`, and all backend session/auth code are unchanged. The shared page hook only adds an optional initial authenticated state, defaulting to its existing logged-out behavior; only Manage supplies it after server verification.
- Verification: 19 new Manage regressions (15 failed before the fix); all 212 frontend tests pass, including unchanged scoring reload and tablet persistence tests. Frontend build and targeted lint pass.

## Release 7.5 — Architecture V2 Foundation

Establish architectural patterns and foundations for future scalability while maintaining simplicity. This release focuses on modular monolith patterns, centralized error handling, API versioning preparation, and service layer completion.

| # | Requirement | Status |
|---|-------------|--------|
| ARCH1 | **Centralized Error Handling**: Implement Express error handling middleware with custom error classes. Consistent error responses across all endpoints with proper logging and operational vs. programming error distinction | ✅ Implemented |
| ARCH2 | **API Versioning Structure**: Add `/api/v1/` base path for current endpoints. Prepare versioning strategy to support shooting disciplines (e.g., `/api/v2/sra/`, `/api/v2/resul/`). Update all frontend API calls to use versioned paths | ✅ Implemented |
| ARCH3 | **Service Layer Completion**: Extract business logic from remaining routes into service modules: `scoring-service.js`, `registration-service.js`, `staffing-service.js`. Routes become thin dispatchers focusing on HTTP contract only | ✅ Implemented |
| ARCH4 | **Module Boundary Enforcement**: Add ESLint rules to prevent architectural drift. Define and document allowed import patterns: routes → domain modules → services, no cross-domain imports in ssi-core, no barrel imports that create hidden coupling | ✅ Implemented (`scoring-proxy/eslint.config.js` + CI lint gate) |
| ARCH5 | **Architecture Documentation**: Update architecture-review.md with target modular monolith patterns, module boundaries, and migration progress. Document explicit import rules and anti-patterns to prevent | ✅ Implemented |

### Design Decisions (ARCH1-ARCH5)

- **Modular Monolith Target**: Keep single deployment but enforce clear module boundaries. This provides simplicity while enabling future microservice extraction when multi-tenancy is needed
- **Error Pattern**: Custom `AppError` class + centralized middleware. Operational errors (validation, auth) return user-friendly messages; programming errors return generic 500 with stack only in dev
- **Versioning Strategy**: URL-based versioning (`/api/v1/`) with discipline-specific paths in future versions. Maintain backward compatibility during transition
- **Service Extraction**: Pure business logic functions without Express dependencies. Enables unit testing without HTTP mocking
- **Import Rules**: Enforced via ESLint to prevent re-coupling. Domain modules in ssi-core/ may only import http-helpers; routes must import specific domain modules, not barrel exports

## Release 7.6 — Consolidation & Compliance Hardening

Consolidates pending requirements from Releases 6.0, 7.0, 7.2, and 7.5 along with SSI license compliance hardening and the technical debt backlog (`R76-TD1`–`R76-TD5`). See [release-7.6.md](./release-7.6.md) for the full specification, technical acceptance checklists, and technical debt backlog.

### Release 7.6.1 — Compliance Hardening: Paid Tracking Disabled

| # | Requirement | Status |
|---|-------------|--------|
| R76-COM2 | **Disable Paid Tracking in Tooling**: Remove paid-status tracking from management UI and disable backend `toggle-paid` mutations by default (`FEATURE_PAID_TOGGLE_ENABLED=false`). | ✅ Implemented |
| R76-LOG1 | **Middleware Logging Consistency**: Replace raw `console.warn` / `console.error` calls in `scoring-proxy/middleware/auth-v7.js` with structured `log.warn` / `log.error`. | ✅ Implemented |

### Technical Debt Backlog (R76-TD1–R76-TD6)

| # | Requirement | Priority | Status |
|---|-------------|----------|--------|
| R76-TD1 | **Monolithic SSI Client Decomposition (`scoring-proxy/lib/ssi-core/client.js`, 1,898 lines)**: Move domain implementations out of `client.js` into `graphql.js`, `scoring.js`, `participants.js`, `management.js`, and `http-helpers.js` and remove unused `lib/ssi-client.js` compat shim. | HIGH | ✅ Implemented |
| R76-TD2 | **Oversized UI & Route Files (>500-Line Guideline Violations)**: Decompose `scoring-ui/src/App.jsx`, `scoring-ui/src/components/ManagePage.jsx`, `scoring-proxy/routes/management.js`, and `scoring-ui/src/components/TabletScoringView.jsx` into focused sub-components and service functions to satisfy the ~500-line modularity limit. | MEDIUM | ✅ Implemented |
| R76-TD3 | **Orphaned SRA Staffing Prototype Cleanup & Staffing Tests**: Clean up or integrate orphaned prototype modules (`scoring-ui/src/components/StaffStatusBoard.jsx`, `StaffSignupPanel.jsx`, `scoring-proxy/lib/staffing/cron.js`, `notifier.js`, `role-assigner.js`, `squad-optimizer.js`), archive obsolete root `IMMEDIATE-DEVELOPMENT-NEEDS.md` to `archive/staffing-prototype/`, and add unit tests for `staffing-service.js` and `lib/staffing/engine.js`. | MEDIUM | ✅ Implemented |
| R76-TD4 | **Backend ESLint Configuration & CI Lint Gate**: Migrate root `.eslintrc-architectural.js` (legacy CommonJS ESLint v8 format) to ESLint v9 flat config (`scoring-proxy/eslint.config.js`), add `npm run lint` to `scoring-proxy/package.json`, and add a `npm run lint` step for both `scoring-ui` and `scoring-proxy` in `.github/workflows/ci-deploy.yml`. | MEDIUM | ✅ Implemented |
| R76-TD5 | **Unmerged Feature Branch Consolidation (`R7.8`, `R7.9`, `R10.0`)**: Reconcile and merge completed work sitting on unmerged feature branches: `copilot/vscode-mnw87b09-v5g9` (Release 7.8 Induction Wait List), `R79-hotfix-cup-count-status-sync` (7-day manage window + -1d lookback), and `R100-feature-registration-buffer-*` (Release 10.0 Registration Buffer). | HIGH | 📋 Backlog |
| R76-TD6 | **Playwright E2E UAT Suite Against Mock/Stubbed SSI Upstream (Fast CI Gate — `TEST6`)**: Build a deterministic Playwright E2E test suite running against `scoring-proxy` + `scoring-ui` backed by a local mock SSI server (`SSI_BASE_URL` serving GraphQL & HTML fixtures). Automate `AUTH-UAT-01..08` (`docs/Implementation/authentication-uat-test-plan.md`), mobile & tablet scoring flows (`docs/design/tablet-scoring-uat-plan.md`), and registration/management squad capacity & DNS flows as a fast CI gate. | HIGH | ✅ Implemented |

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

> **Branch Status:** Implemented on branch `copilot/vscode-mnw87b09-v5g9` (32 requirements: `WL1–WL13`, `WL-SEC1–SEC7`, `WL-CFG1–CFG3`, `WL-OPS1–OPS3`, `WL-UX1–UX2`, `WL-TEST1–TEST4`); pending merge to `main`.

Provides a public waiting list (`#/waitlist`) with math captcha and SSI email verification, token-based self-cancellation, allowlist-protected admin group planning (`#/waitlist-admin`), and bilingual notification emails via Resend API.

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

### Release 7.9.1 — GraphQL Upstream Reliability Hotfix

| # | Fix | Status |
|---|-----|--------|
| GQL-HF1 | **Transient upstream retry**: GraphQL requests retry on transient SSI failures (`502/503/504`) and `fetch failed` network errors with jittered backoff (max 2 retries). | ✅ Implemented |
| GQL-HF2 | **Upstream diagnostics logging**: Failed transient upstream attempts log response header snapshot and body snippet for faster incident triage on Render. | ✅ Implemented |
| GQL-HF3 | **Clean UI availability error**: Transient upstream incidents are mapped to HTTP `503` with user-safe message/code (`UPSTREAM_UNAVAILABLE`) instead of generic auth/internal failures. | ✅ Implemented |

### Release 7.9.2 — Cup Management Hotfixes

| # | Fix | Status |
|---|-----|--------|
| GQL-HF4 | **Cup competitor count source hardening**: Cup registered competitor totals are calculated from CUP-level approved competitors first (`status` = `a/approved`) with match-squad fallback, so registration and management UI views keep accurate count badges even when squad competitor data is incomplete. | ✅ Implemented |
| GQL-HF7 | **SSI CSRF compatibility**: Send the SSI CSRF cookie as a request token for participant search, registration confirmation, trainer registration, staff-removal participant lookup, and squad/status edits. Fetch the search page for sessions without a CSRF cookie, carry response cookies through each workflow without mutating shared session cookies, and retain legacy no-CSRF compatibility. | ✅ Implemented/Ready |

GQL-HF7 validation (2026-09-11): 239 backend tests, including 12 CSRF regressions, and 193 frontend tests pass; frontend production build and sharp SVG-to-PNG smoke test pass. Approved dependency updates (including sharp 0.35.4) resolve the pre-existing CI audit blocker; both dependency audits report zero vulnerabilities. SSI began issuing CSRF cookies between September 5 and September 8; production search-and-add requests returned HTTP 403 from September 9. The production hotfix retains the current client layout by explicit exception. Deployment and live SSI registration verification remain pending.

### Release 7.9.3 — Competitor Number Sync Hardening

| # | Fix | Status |
|---|-----|--------|
| GQL-HF5 | **Cup-match competitor number consistency**: When management adds competitors to a cup and/or squads them to all included matches, each competitor's participant number must be identical in the CUP and in every included match. Implement a numbering sync workflow that treats CUP participant numbers as canonical, detects mismatches, and updates match participant numbers to match CUP numbering. Evaluate SSI endpoint `/event/{ct}/{id}/reset-numbering/` for cup+match contexts; if numbering is per-event/non-deterministic, keep it optional and still enforce CUP-canonical final numbers. | 📋 Specified |

### Design Notes (GQL-HF5)

- **Canonical source**: CUP participant numbering is the source of truth.
- **Identity mapping**: Use shared participant identifiers first; when unavailable, use deterministic fallback key (`first_name + last_name + email`) to map cup participants to match participants.
- **Sync flow**: Read CUP+match participants -> compute mismatch plan -> apply match number updates -> re-read and verify no mismatches remain.
- **Reset-numbering policy**: Validate `/reset-numbering/` behavior against a real cup + included matches before use. If it renumbers each event independently, do not rely on it as the final consistency mechanism.
- **Operational safety**: Sync must be idempotent and produce an audit summary of changed competitors and affected match IDs.

### Release 7.9.4 — iCal Calendar Attachment in Registration Email

| # | Requirement | Status |
|---|-------------|--------|
| GQL-HF6 | **iCal attachment on registration confirmation**: When the registration confirmation email is sent (`sendRegistrationConfirmation`), attach a standard `.ics` (iCalendar RFC 5545) file so the shooter can add the event directly to their calendar. Compatible with iPhone Calendar, Android Calendar (Google Calendar), Outlook, and Google Calendar web. | ⬚ Specified |

### Design Notes (GQL-HF6)

- **iCal generation**: Build the `.ics` content in `lib/email.js` — no external library needed for this use case; a simple template string is sufficient (RFC 5545 format: `BEGIN:VCALENDAR`, `BEGIN:VEVENT`, `DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `UID`, `END:VEVENT`, `END:VCALENDAR`).
- **Event span**: Use the cup `starts` and `ends` fields from SSI. If only `starts` is available, default `DTEND` to `starts + 8 hours`. Both must be fetched in the `CupDetail` GraphQL query in `routes/registration.js` (add `starts ends` to the query fields).
- **SUMMARY**: Cup name (e.g. `TurRes Kupittaa CUP 13.06.2026`).
- **DESCRIPTION**: Squad assignments (same content as the email body match list), plus the cancel/re-register URLs.
- **UID**: Deterministic — `registration-{cupId}-{shooterEmail}@ssi-tools` so re-registrations produce an update rather than a duplicate entry when the same `.ics` is imported again.
- **Resend attachment**: Pass the `.ics` as a base64-encoded attachment via Resend's `attachments` field: `{ filename: 'ilmoittautuminen.ics', content: Buffer.from(icsContent).toString('base64'), contentType: 'text/calendar; charset=utf-8; method=REQUEST' }`.
- **Content-Type `method=REQUEST`**: Triggers the native "Add to Calendar" prompt in iOS Mail, Outlook, and Gmail without requiring the user to manually open the attachment.
- **No new npm dependency**: iCal content is simple enough to generate inline; avoids supply-chain risk.
- **Fallback**: If `starts` is missing from the SSI response (older cups), omit the attachment silently and log a warning — email still sends.

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
| TS13 | **Drag-and-Drop Shooter Reordering with Dedicated Drag Handle**: Replace the tiny up/down (`▲` / `▼`) buttons in the Tablet Scoring shooter list (`TabletShooterSidebar` in `TabletScoringPanels.jsx`) with touch- and mouse-friendly drag-and-drop reordering to match shooter order at the firing line. Must use a dedicated drag handle (or intentional hold/drag activation threshold) isolated from row selection so tapping a shooter to score never accidentally reorders their position. | ✅ Implemented (`TabletShooterSidebar` in `TabletScoringPanels.jsx`) |

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

## Release 9.0 — Gun Inventory, Usage & Maintenance Tracking

> **Detailed Specification:** [release-9.0-gun-inventory.md](./release-9.0-gun-inventory.md)

Inventory, loaner-gun checkout (*laina-ase*), cartridge (*patruuna*) bookkeeping, end-of-match return to gun safe, and cleaning/maintenance tracking for club firearms, restricted to admins of the configured SSI group (default Group `25874` — `https://shootnscoreit.com/groups/25874/`).

| # | Requirement | Status |
|---|-------------|--------|
| GUN1 | **Configurable SSI Group Admin Access Control**: Restrict all gun inventory and loaner-gun management endpoints to authenticated users with role `"admin"` in the configured SSI group (default Group ID `25874`, configurable in `config/gun-inventory-config.yml` and `SSI_GUN_INVENTORY_GROUP_ID`). | ✅ Implemented (`R90-GUN1`) |
| GUN2 | **JSON File Gun Inventory Store & CRUD API**: Persist gun inventory (`make`, `model`, `serialNumber`, `acquisitionYear`, `state`: `in_gun_safe` \| `in_range_use` \| `retired`, usage/cartridge counters, maintenance & usage history) in `scoring-proxy/data/gun-inventory.json` with full CRUD endpoints (`/api/v1/guns`). | ✅ Implemented (`R90-GUN2`) |
| GUN3 | **Laina-ase Checkout & Cartridge Tracking (`patruunamäärä`)**: Allow picking a shooter from the `"Laina-ase"` squad, selecting an available gun from `in_gun_safe`, and entering cartridges given (`patruunamäärä` / `cartridgesGiven`, typically `100` rounds or `0` if shooter has ammunition permit). Marks gun `in_range_use` and increments usage & cartridge counters (`timesUsedTotal`, `timesUsedSinceMaintenance`, `cartridgesIssuedTotal`, `cartridgesSinceMaintenance`). | ✅ Implemented (`R90-GUN3`) |
| GUN4 | **End-of-Match Return to Gun Safe**: Support returning checked-out `"Laina-ase"` guns from `in_range_use` back to `in_gun_safe` individually (`POST /api/v1/guns/:id/return`) or all at once (`POST /api/v1/guns/return-all`). | ✅ Implemented (`R90-GUN4`) |
| GUN5 | **Cleaning & Maintenance Recording**: Support recording cleaning/maintenance (`POST /api/v1/guns/:id/maintenance`), appending to maintenance history and resetting `timesUsedSinceMaintenance = 0` and `cartridgesSinceMaintenance = 0` while preserving lifetime totals. | ✅ Implemented (`R90-GUN5`) |
| GUN6 | **Gun Inventory & Maintenance Web UI (`#/guns`)**: Dedicated page displaying inventory state (`Asekaapissa` / `Radalla käytössä`), total & since-maintenance usage and cartridge counts, Add/Edit/Retire gun dialog, Record Cleaning/Maintenance action, and Return to Safe action. | ✅ Implemented (`R90-GUN6`) |
| GUN7 | **ManagePage (`#/manage`) Laina-ase Squad Integration**: In `SquaddingOverview` / `SquadCard`, allow selecting a shooter in the `"Laina-ase"` squad, picking an available gun + cartridge count (`100` / `0` / custom), displaying assigned gun badge on shooter row, and returning guns to safe at end of match. | ✅ Implemented (`R90-GUN7`) |
| GUN8 | **Unit, Integration & Playwright E2E Verification**: Unit/route/component tests and Playwright E2E coverage for gun inventory, Laina-ase checkout/return, maintenance reset, and SSI Group `25874` admin access control. | ✅ Implemented (`R90-GUN8`) |
| GUN9 | **Gun Inventory & Usage Privacy Notice (*Rekisteriseloste*, FI & EN)**: Simple, legally valid (GDPR Art. 13–14 & Finnish Firearms Act duty of care) bilingual privacy notice (`docs/privacy-notice-gun-inventory.md` & `#/privacy-guns`) explaining controller, purpose, data fields recorded on loan/maintenance, EU storage, access restriction (`25874` admin), retention, and data subject rights. | ✅ Implemented (`R90-GUN9`) |
| GUN10 | **Persistent Disk Storage for Gun Inventory & Event Store**: Persist gun inventory, loan/maintenance event logs (`gun-inventory.json`), and staffing event store (`staffing-events.json`) on a cost-optimized 1 GB Render Persistent Disk (`turres-ssi-data` mounted at `/opt/render/project/src/scoring-proxy/data` in Frankfurt) so data survives redeploys and restarts without requiring a managed database. | ✅ Implemented (`R90-GUN10` in `render.yaml`) |
| GUN11 | **Link Gun Inventory to Ammo Inventory (`defaultAmmoId` / *Käytettävä patruuna*)**: In the Gun Inventory (`GunsPage` Add/Edit modal & `/api/v1/guns`), allow selecting which Ammo Inventory item (`defaultAmmoId` — `make + model + caliber`, e.g., `"GCI FMJ 124gr 9x19"` for Glock) is used with each firearm. When a range officer selects a gun for a shooter in `LoanerGunPickerSheet` (`#/manage`), automatically pre-select and display the gun's linked ammo item (`defaultAmmoId`) so handing over the gun deducts cartridges from that linked ammo inventory item. | 📋 Specified (`R90-GUN11` / `prd.json` `US-005`–`US-006`) |
| GUN12 | **Cartridge / Ammo Purchase & Stock Inventory (by `make + model + caliber`, Group `25874` Admin Restricted)**: Track ammunition inventory grouped by `(make, model, caliber)` in `gun-inventory.json`, restricted to the exact same SSI Group (`25874`, role `"admin"`) as the gun inventory. Support recording newly purchased ammunition batches with fields: `make`, `model`, `caliber`, `count` (rounds), `price` (EUR), `store` (vendor/store), `purchaseDate`, and `purchasedBy` (buyer). Automatically increases the calculated stock (`calculatedStock`) for that `(make, model, caliber)`. | 📋 Specified (`R90-GUN12` / `prd.json` `US-005`) |
| GUN13 | **Automatic Ammo Stock Deduction on Laina-ase Checkout**: When a shooter borrows a loaner gun with `cartridgesGiven > 0` (e.g. `100` rounds), automatically deduct `cartridgesGiven` from the selected `(make, model, caliber)` ammunition inventory (`calculatedStock -= cartridgesGiven`, `totalIssued += cartridgesGiven`). | 📋 Specified (`R90-GUN13` / `prd.json` `US-005`) |
| GUN14 | **Physical Ammo Stocktake & Discrepancy Calculation (*Patruunainventointi*)**: Allow admins to perform a physical inventory count (*inventointi*) per `(make, model, caliber)` by entering the real counted rounds (`actualCount`), calculating and logging the discrepancy (`discrepancy = actualCount - calculatedStock`), and reconciling `calculatedStock` to `actualCount`. | 📋 Specified (`R90-GUN14` / `prd.json` `US-005`–`US-006`) |
| GUN15 | **CSV Export of Gun Inventory & Gun Events (Loans & Maintenance)**: Allow authorized group admins (`25874` `admin`) to download the gun inventory (`make`, `model`, `serialNumber`, `acquisitionYear`, `state`, linked ammo, usage/cartridge counters) and all gun events (loan checkouts/returns `usageHistory` and cleanings `maintenanceHistory`) as standard UTF-8 CSV files (`GET /api/v1/guns/export/guns.csv` & `GET /api/v1/guns/export/gun-events.csv` + download buttons on `#/guns`) for easy import into external systems or spreadsheets. | 📋 Specified (`R90-GUN15` / `prd.json` `US-007`) |
| GUN16 | **CSV Export of Ammo Inventory & Ammo Events (Purchases & Stocktakes)**: Allow authorized group admins (`25874` `admin`) to download the ammunition inventory (`make`, `model`, `caliber`, `calculatedStock`, `totalPurchased`, `totalIssued`, `totalSpendEur`) and all ammo events (purchases and physical stocktake discrepancy logs) as standard UTF-8 CSV files (`GET /api/v1/guns/export/ammo.csv` & `GET /api/v1/guns/export/ammo-events.csv` + download buttons on `#/guns`). | 📋 Specified (`R90-GUN16` / `prd.json` `US-007`) |

## Release 10.0 — Public Registration Buffer

> **Branch Status:** Specified in `origin/R100-feature-registration-buffer-design` and Loop 1 storage implemented on `origin/R100-feature-registration-buffer-loop1-store`.

Decouples public Kupittaa Cup registration (`#/register`) from immediate SSI account existence by persisting registrations in an application-owned buffer database and synchronizing with SSI asynchronously.

## Summary

- **Release 1.0** (SSI Cup Automation): 37 requirements — 35 ✅, 2 on hold (35, 36)
- **Release 2.0** (WordPress Integration): 9 requirements — 6 ✅, 1 on hold (41), 2 pending (39, 42)
- **Release 3.0** (Scoring Application): 21 requirements — 20 ✅, 1 pending (SEC11)
- **Release 3.1** (Data Integrity): 2 requirements — 2 pending (47, 48)
- **Release 4.0** (Kupittaa Cup Registration Frontend): 25 requirements — 25 ✅
- **Release 5.0** (SRA Training Staffing): requirements in [sra-training-staffing-requirements.md](./sra-training-staffing-requirements.md)
- **Release 6.0** (Match Management & UI Consolidation): 5 functional + 5 identification requirements — 10 ✅ (MG1–MG5, MG-ID1–MG-ID5)
- **Release 7.0** (Authentication & Session Handling): 25 requirements — 24 ✅ (including TEST6), 1 deferred (TEST8)
- **Release 7.1** (Management Availability): 1 requirement — 1 ✅
- **Release 7.2** (Kupittaa Cup Management): 3 requirements — 2 ✅ (CUP1, CUP2), 1 ❌ deprecated/removed (CUP3 → R76-COM2)
- **Release 7.3** (Refactoring Analysis): 1 requirement — 1 ✅ (RFA1). 5 outdated docs removed
- **Release 7.4** (Refactoring Implementation): 8 requirements — 8 ✅ (RFR1–RFR8)
- **Release 7.4.1** (Authentication UX Hardening): 5 requirements — 5 ✅ (AUTH-UX1–AUTH-UX5)
- **Release 7.5** (Architecture V2 Foundation): 5 requirements — 5 ✅ (ARCH1–ARCH5)
- **Release 7.6** (Consolidation & Compliance Hardening): 21 consolidated requirements + 6 tech debt backlog items (`R76-TD1`–`R76-TD6`) — 26 ✅ (`R76` 21/21 + `R76-TD1`–`R76-TD4`, `R76-TD6`), 1 backlog (`R76-TD5` unmerged branch consolidation) — see [release-7.6.md](./release-7.6.md)
- **Release 7.7** (QR Code Login for Scoring): 6 requirements — 6 ✅ (QR1–QR6). **7.7.1 hotfix**: 4 fixes ✅
- **Release 7.8** (Induction Wait List): 32 requirements — 32 ✅ on branch `copilot/vscode-mnw87b09-v5g9` (pending merge to `main`)
- **Release 7.9** (GraphQL Cup Management): 6 requirements — 0 ✅, 6 pending (GQL1–GQL6). **7.9.1 hotfix**: 3 fixes ✅ (GQL-HF1–GQL-HF3). **7.9.2 hotfix**: 2 fixes ✅ (GQL-HF4, GQL-HF7). **7.9.3 hotfix**: 1 fix 📋 (GQL-HF5). **7.9.4**: 1 requirement ⬚ (GQL-HF6 — iCal calendar attachment)
- **Release 8.0** (Tablet Scoring UI): 13 requirements — 13 ✅ (TS1–TS13)
- **Release 9.0** (Gun & Cartridge Inventory, Usage & Maintenance Tracking): 16 requirements — 10 ✅ (`GUN1`–`GUN10`), 6 specified (`GUN11`–`GUN16` cartridge/ammo inventory, gun-to-ammo link, checkout deduction, stocktake discrepancy, and CSV exports) — see [release-9.0-gun-inventory.md](./release-9.0-gun-inventory.md)
- **Release 10.0** (Public Registration Buffer): 📋 Specified & Loop 1 store implemented on `origin/R100-feature-registration-buffer-*`

> **Note:** The multi-tenant **Match Management Platform** (formerly listed as Release 8.0/8.1 roadmap `MP1–MP7`) has been moved to its own repository: `tohewi/match-manager`.

## Configuration Files

| File | Purpose |
|------|---------|
| `config/kupittaa-cup-config.yml` | Kupittaa Cup SSI and WordPress settings |
| `config/kupittaa-cup-dates.txt` | Date list for batch creation |
| `config/kupittaa-cup-dates-2h.txt` | 2H 2026 Kupittaa Cup date list |
| `config/kupittaa-perehdytys-config.yml` | Kupittaa Perehdytys settings |
| `config/kupittaa-perehdytys-dates-2h.txt` | 2H 2026 Perehdytys date list |
| `config/sra-training-config.yml` | SRA training staffing roles, allowlist, and service accounts |

## Scripts (Legacy Archive)

| Script | Purpose |
|--------|---------|
| `archive/scripts-legacy/New-KupittaaCup.ps1` | Main script - creates Cup, Matches, Squads, Calendar Event |
| `archive/scripts-legacy/New-KupittaaCupBatch.ps1` | Batch creation from date list |
| `archive/scripts-legacy/Connect-SSI.ps1` | SSI web session authentication |
| `archive/scripts-legacy/Connect-WordPress.ps1` | WordPress authentication with 2FA |
| `archive/scripts-legacy/New-TapahtumakalenteriEvent.ps1` | Calendar event creation |
| `archive/scripts-legacy/Update-TapahtumakalenteriEvent.ps1` | Statistics update |
| `archive/scripts-legacy/Test-EventIntegrity.ps1` | Data integrity check between SSI and WordPress |

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/instructions/user-guide.md` | Scoring and registration app user guide |
| `docs/instructions/installation-guide.md` | Render, Resend, and GitHub deployment guide |
| `docs/instructions/PR-PREVIEW-DEPLOYMENTS.md` | Automated PR preview environments on Render |
| `docs/instructions/BRANCHING-STRATEGY.md` | GitHub Flow branching and release strategy |
| `docs/RELEASE-NOTES.md` | Version history and changelog |
| `docs/design/registration-flow.md` | Backend sequence diagrams and SSI state machine |
| `docs/design/scoring-architecture.md` | Proxy architecture, session management, scoring flow |
| `docs/design/ssi-admin-operations.md` | Web scraping endpoints and form field reference |
| `docs/instructions/README.md` | Documentation index and PowerShell scripts reference |
| `docs/developer-guide.md` | Cup creation process technical details |
