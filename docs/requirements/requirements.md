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
| MG2 | **Cup list sorting**: Sort cups ascending by proximity to today (closest first). Applies to all cup lists (register, manage, scoring) | ⬚ Pending |
| MG3 | **Scoring route change**: Move scoring app from `#/` to `#/scoring`. Root URL (`#/`) becomes a front page with static links to the three main features: Scoring, Registration, Management | ⬚ Pending |
| MG4 | **Shared UI components**: Extract and share common components (LoginScreen, CupList, visual design) between scoring, registration, and management features | ⬚ Pending |
| MG5 | **Manage cup list**: Reuse the same CUP list component as Registration. Only change text from "ilmoittautuminen" to "hallitse" | ⬚ Pending |

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
| AUTH1 | **Dual-Session Architecture**: Implement secure impersonation with user session + admin SSI delegation. Each user session must contain both user's SSI token and admin SSI token for impersonation. | ⬚ Pending |
| AUTH2 | **User Session Persistence**: Sessions must persist across server restarts using Redis store with 8-hour TTL. Session data includes user ID, user SSI token, admin SSI token, scope, and metadata. | ⬚ Pending |
| AUTH3 | **SSI Token Validation**: User's SSI token must be validated on each API request. If user SSI token is expired, API access is denied even if proxy session is valid. | ⬚ Pending |
| AUTH4 | **Automatic SSI Token Refresh**: User's SSI token must be automatically refreshed in background when expiring within 10 minutes. Admin SSI token refreshed independently. | ⬚ Pending |
| AUTH5 | **Secure Impersonation**: All SSI operations must use admin SSI token but be bound to valid user session. Admin token cannot be accessed without valid user authentication. | ⬚ Pending |
| AUTH6 | **Session Isolation**: Each user gets isolated session with their own admin delegation. No shared admin state between users. | ⬚ Pending |
| AUTH7 | **Audit Trail**: Every SSI operation must log which user performed the action, including timestamp, operation type, and success/failure status. | ⬚ Pending |
| AUTH8 | **State Restoration**: User navigation state must be fully restored after session expiry and re-authentication. State preserved for 30 minutes post-expiry. | ⬚ Pending |
| AUTH9 | **Cross-Feature Authentication**: Single login works across scoring, management, and reporting features. No separate logins required. | ⬚ Pending |
| AUTH10 | **Registration Security**: Registration endpoints must require user authentication before using admin SSI operations. Fix current vulnerability. | ⬚ Pending |

### Session Management Requirements

| # | Requirement | Status |
|---|-------------|--------|
| SES1 | **Redis Session Store**: Use express-session with connect-redis for persistent session storage. Sessions survive server restarts and deployments. | ⬚ Pending |
| SES2 | **Session TTL Configuration**: User sessions expire after 8 hours of inactivity. Configurable via environment variable. | ⬚ Pending |
| SES3 | **Session Cleanup**: Automatic cleanup of expired sessions. Redis handles TTL-based expiration. | ⬚ Pending |
| SES4 | **Session Security**: HttpOnly, Secure, SameSite=Lax cookies. Session fixation prevention. CSRF protection. | ⬚ Pending |
| SES5 | **Concurrent Sessions**: Support multiple sessions per user (different devices). Each device gets separate session ID. | ⬚ Pending |
| SES6 | **Session Revocation**: Immediate session revocation on logout, password change, or security events. | ⬚ Pending |
| SES7 | **Session Monitoring**: Track active sessions per user, last activity, and device information. | ⬚ Pending |

### Security Requirements

| # | Requirement | Status |
|---|-------------|--------|
| SEC1 | **OWASP Compliance**: Session handling must follow OWASP Session Management Cheat Sheet guidelines. | ⬚ Pending |
| SEC2 | **Impersonation Security**: Admin SSI token must never be accessible without valid user session context. | ⬚ Pending |
| SEC3 | **Token Validation**: Both user and admin SSI tokens must be validated before use in SSI operations. | ⬚ Pending |
| SEC4 | **Rate Limiting**: Authentication endpoints rate limited (10 attempts/15min per IP). Session refresh limited (30/10min). | ⬚ Pending |
| SEC5 | **Audit Logging**: All authentication events, session operations, and SSI impersonation must be logged. | ⬚ Pending |
| SEC6 | **Error Handling**: Authentication errors must be generic to prevent user enumeration. | ⬚ Pending |
| SEC7 | **Secure Storage**: SSI tokens stored encrypted in Redis. Session keys use cryptographic randomness. | ⬚ Pending |

### Testing Requirements

| # | Requirement | Status |
|---|-------------|--------|
| TEST1 | **Unit Tests**: 90% coverage for session management, token validation, and impersonation logic. | ⬚ Pending |
| TEST2 | **Integration Tests**: Test complete authentication flows with Redis, SSI token refresh, and session isolation. | ⬚ Pending |
| TEST3 | **Security Tests**: Test impersonation security, privilege escalation prevention, and session hijacking scenarios. | ⬚ Pending |
| TEST4 | **Reliability Tests**: Test Redis failure scenarios, session recovery, and SSI token expiry handling. | ⬚ Pending |
| TEST5 | **Performance Tests**: Session lookup latency <50ms p95. Support 100 concurrent users. | ⬚ Pending |
| TEST6 | **E2E Tests**: Complete user journeys through login, session expiry, re-authentication, and state restoration. | ⬚ Pending |
| TEST7 | **Penetration Tests**: Simulate attacks on session management, token theft, and impersonation bypass. | ⬚ Pending |
| TEST8 | **Load Tests**: Session store performance under load with concurrent authentication and SSI operations. | ⬚ Pending |

## Release 7.1 — Management Availability

| # | Requirement | Status | Tokens (est.) |
|---|-------------|--------|---------------|
| MGMT1 | **Management Independent of Registration**: Kupittaa Cup Hallinta must keep cups available for management independent of registration status, once registration start date has passed and while the cup is still active. Management is available until the cup's end date and time (`ends`), or `starts + 24h` fallback. Cups with no `registration_starts` are excluded. Uses dedicated `/api/manage/cups` endpoint. | ✅ Implemented | ~14,000 |

## Release 7.3 — Refactor for maintainability

| # | Requirement | Status | Tokens (est.) |
|---|-------------|--------|---------------|
| rfr1 | Review IMMEDIATE-DEVELOPMENT-NEEDS.md and architecture-review.md and prepare refactoring plan | ⬚ Pending |

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

## Release 7.2 — Kupittaa Cup Management

| # | Requirement | Status |
|---|-------------|--------|
| CUP1 | **Move Shooter Between Squads**: In the "Squadit" section, it must be possible to move a shooter from one squad to another. The UI must show the same `→ S?` button as in the "Ei Squadeissa" section and function identically (squad picker dialog, SSI sync). Move is only allowed within the same match via Squadit. | 📋 Specified |
| CUP2 | **Set Shooter as DNS (Did Not Start)**: SSI calls this "Did Not Show". Setting DNS must be applied at the **cup level** and on **all matches** in the cup. The button must appear next to every shooter regardless of which section they are in. Clicking it shows a confirmation dialog: "Set N.N as DNS?" / "Aseta Etu Suku DNS?" (fi/en). It must be possible to **undo** (reverse) DNS if set by accident. SSI endpoints: `GET /event/participant/{ct}/{id}/set-did-not-show/` (set) and `GET /event/participant/{ct}/{id}/undo-did-not-show/` (undo), applied to cup + each match. | 📋 Specified |
| CUP3 | **Mark Payment Received**: Per-competitor paid toggle at the **cup level only**. UI shows a button next to each shooter. When paid, the button must be **solid green** (high contrast) so it is immediately obvious who has paid when scanning the list. When unpaid, the button is gray/muted. State is stored in SSI via `GET /event/participant/{ct}/{id}/toggle-paid/`. Must reflect current paid status from SSI and allow toggling. | ✅ Implemented |

### Design Decisions (CUP1–CUP3)

- **All features** are added to the existing **Hallinta** page (`SquadManagementPage` component). No new pages needed.
- **CUP1**: Move is performed only within Squadit (not across matches). Strict capacity enforcement — cannot move into a full squad. Same `→ S?` button and squad picker as "Ei Squadeissa" section.
- **CUP2**: DNS is set on cup **and** all matches in the cup in a single action. Reversible — undo removes DNS from cup and all matches. DNS status must be visually distinct (e.g., strikethrough or badge). Confirmation dialog is bilingual (fi/en).
- **CUP3**: Paid status is read from and written to SSI at **cup level only**. No local persistence — SSI is the source of truth.
- **SSI integration**: CUP2 and CUP3 use **web scraping** (admin cookies) for both reading and writing state. SSI GraphQL does not support write operations reliably. Endpoints: `set-did-not-show`, `undo-did-not-show`, `toggle-paid` via `GET /event/participant/{ct}/{id}/...`. Reading paid/DNS status also requires scraping the participant page since GraphQL does not expose these fields.

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
- **Release 6.0** (Match Management & UI Consolidation): 5 requirements — 1 ✅, 4 pending (MG2–MG5)
- **Release 7.0** (Authentication & Session Handling): 25 requirements — 0 ✅, 25 pending (AUTH1–10, SES1–7, SEC1–7, TEST1–8)
- **Release 7.1** (Management Availability): 1 requirement — 1 ✅
- **Release 7.2** (Kupittaa Cup Management): 3 requirements — 1 ✅, 2 📋 Specified (CUP1–CUP3)
- **Release 7.3** (Refactor for Maintainability): 1 requirement — 1 pending (rfr1)
- **Release 7.9** (GraphQL Cup Management): 6 requirements — 0 ✅, 6 pending (GQL1–GQL6)
- **Release 8.0** (Tablet Scoring UI): 9 requirements — 9 ✅ (TS1–TS9)
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
