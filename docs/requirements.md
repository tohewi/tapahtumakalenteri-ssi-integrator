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

## Release 4.0 - Registration Frontend

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

## Release 5.0 - Match Management & UI Consolidation

### Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| MG1 | **Match Management UI** (`#/manage`): Password-protected (SSI login). After login, pick an active Kupittaa cup. Shows consolidated squadding overview — per-squad cross-match table, unsquadded shooters, CUP/match membership mismatches | ✅ |
| MG2 | **Cup list sorting**: Sort cups ascending by proximity to today (closest first). Applies to all cup lists (register, manage, scoring) | ⬚ Pending |
| MG3 | **Scoring route change**: Move scoring app from `#/` to `#/scoring`. Root URL (`#/`) becomes a front page with static links to the three main features: Scoring, Registration, Management | ⬚ Pending |
| MG4 | **Shared UI components**: Extract and share common components (LoginScreen, CupList, visual design) between scoring, registration, and management features | ⬚ Pending |
| MG5 | **Manage cup list**: Reuse the same CUP list component as Registration. Only change text from "ilmoittautuminen" to "hallitse" | ⬚ Pending |

## Release 2.1 - Data Integrity (Planned)

| # | Requirement | Status |
|---|-------------|--------|
| 47 | **Data Integrity Check**: Modular integrity verification between SSI and WordPress. (1) List all Cups owned by SSI login and verify each has a corresponding Tapahtumakalenteri event. (2) Validate date list file against both systems - all dates should have SSI Cup and WordPress event. (3) Verify cross-references: WordPress permalink contains Cup ID, WordPress content links to SSI Cup URL. Configurable by event type (e.g., Kupittaa Cup) and date list file parameter. | ⬚ Pending |
| 48| Design automation architecture with following assumptions: Continue with web scraping (Tapahtumakalenteri and SSI API access will not happen shortly). It is going to be possible to programmatically access mailbox to read OTP. Automation architecture should utilize agents and workflows. Tech preference Azure and MS Foundry. Agentic workflows should keep up to date with Tapahtumakalenteri events and perform reporting and data integrity tasks when needed. i.e. after an event. Agentic workflow should handle a batch request for new events or updating existing events. If this requirement is too large, split it into smaller requirements and into multiple versions to achieve suitable increments of functionality. Always make sure documentation and test automation is in place and adds value to users and developers, agentig or human.| ⬚ Pending |
||| ⬚ Pending |

## Summary

- **Release 1.0** (SSI Cup Automation): 37 requirements — 35 ✅, 2 on hold (35, 36)
- **Release 2.0** (WordPress Integration): 9 requirements — 6 ✅, 1 on hold (41), 2 pending (39, 42)
- **Release 3.0** (Scoring Application): 21 requirements — 20 ✅, 1 pending (SEC11)
- **Release 4.0** (Registration Frontend): 25 requirements — 25 ✅
- **Release 5.0** (Match Management & UI Consolidation): 5 requirements — 1 ✅, 4 pending (MG2–MG5)
- **Release 2.1** (Data Integrity): 2 requirements — 2 pending (47, 48)

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
