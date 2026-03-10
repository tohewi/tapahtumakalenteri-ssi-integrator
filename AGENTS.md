# Agent Instructions (Cascade & Copilot)

- When starting work on a requirement, create a **new branch** from `main` (or the correct base branch per the branching guide).
- **Branch naming:** start with the requirement number, then include the work type (feature/hotfix) in the name.
  - Example: `R12-feature-staffing-filters` or `R07-hotfix-squad-sync`.
- **Commit messages:** explain how the commit advances the requirement toward completion. Include the requirement number in the subject or body.
- When a requirement is completed and tests pass, **update the requirements document** to mark it ✅ **Implemented/Ready**.
- **Keep release notes in sync with requirements:** When completing a release or significant feature, update `docs/RELEASE-NOTES.md` with a new section. Release numbers in release notes **must match** the release numbers in `docs/requirements/requirements.md`. Do not invent new version numbers — use the requirement release number (e.g., "Release 7.2" not "Version 5.0"). Include: overview, new features, bug fixes, requirements met, and test status.
- **Hotfix release numbering must match the base release stream:** Always align hotfix release numbers with the related requirement/base release (for example, R74 hotfixes use `Release 7.4.x`, such as `7.4.1`, `7.4.2`). Do not relabel hotfixes into unrelated release lines.
- **Keep instructions in sync:** if you modify these agent instructions, update **both** `AGENTS.md` and `.github/copilot-instructions.md` with the same changes.
- **Tooling limitations:**
  - `grep` is not available in this environment. Use `findstr` tool, or `Select-String` in PowerShell, or other file-finding tools instead.
  - `node -e` does not work for multi-line code or code with template literals/backticks/dollar signs. PowerShell escaping is fundamentally broken for these. Instead: use the `edit`/`multi_edit` tool to modify files directly, or `write_to_file` to create a temp `.js` script and run it with `node temp_script.js`. Only use `node -e` for trivial single-expression commands with no special characters.
- **Track token usage:** At the end of each session (or when asked), provide a rough token usage summary per requirement. Count words read (file reads, search results, command output) and words written (edits, new files, commands) during the session. Summarize in a table like:

  | Requirement | Words Read | Words Written | Total (approx tokens) |
  |-------------|-----------|---------------|----------------------|
  | R12 staffing | ~3,200 | ~800 | ~5,300 |

  Use the approximation: **1 token ≈ 0.75 words** (i.e., total tokens ≈ total words × 1.33). This is a rough estimate for cost awareness, not exact billing.

- **Ralph Loop workflow:** Follow the `/ralph` workflow (`.windsurf/workflows/ralph.md`) for structured task execution. Key discipline:
  - **Start of session:** Read `progress.md` first — it's your cross-session memory.
  - **One task at a time:** Implement, test, commit, push before starting the next task.
  - **End of session:** Update `progress.md` with what was done, current branch/commit, test counts, and what's next.
  - **PRD authority:** `docs/requirements/requirements.md` defines "done". `progress.md` tracks where we are.

For full project context, see: `.github/copilot-instructions.md`.

## Project Overview

This is a **shooting competition management system** to help setting up events in SSI (ShootnScoreIt, a SaaS service for competition management) with two main components:

- **scoring-ui/** — React frontend (Vite, TailwindCSS), mobile-first design
- **scoring-proxy/** — Express.js backend proxy to ShootNScoreIt (SSI) API

**Key terminology:**
- **Cup:** A shooting competition event that contains multiple matches
- **Match:** A shooting competition in a specific discipline. Match can be in a cup or in a league, or be a standalone match.
- **Squad:** A group of competitors assigned to shoot a stage together.
- **Stage:** A stage is a carefully designed challenge, presenting a unique set of targets, obstacles, and engagement scenarios. Each stage is a part of a match.
- **SSI:** ShootNScoreIt, the external competition management system

## Repository Structure

```
├── scoring-ui/              # React frontend (Vite + TailwindCSS)
│   ├── src/
│   │   ├── main.jsx         # Hash-based routing (#/scoring, #/platform, etc.)
│   │   ├── App.jsx          # Scoring app (state machine)
│   │   ├── TabletApp.jsx    # Tablet scoring app shell
│   │   ├── api.js           # SSI scoring/manage API client (/api/v1/)
│   │   ├── platform-api.js  # Platform API client (accounts, tenants, members)
│   │   ├── register-api.js  # Registration API client
│   │   ├── staffing-api.js  # Staffing API client
│   │   ├── i18n.js          # Internationalization (fi/en)
│   │   ├── hooks/           # Shared hooks (useAuthenticatedPage, useRememberMe)
│   │   └── components/      # Page components
│   │       ├── manage/      # ManagePage sub-components (barrel export)
│   │       └── platform/    # Match Management Platform UI (20+ components)
│   └── package.json
│
├── scoring-proxy/           # Express backend
│   ├── server.js            # Main server, middleware, route mounting
│   ├── routes/
│   │   ├── auth-v7.js       # SSI authentication (dual-session login/logout/status)
│   │   ├── platform.js      # Platform router (thin orchestrator, mounts routes/platform/* sub-routers)
│   │   ├── platform/        # Platform domain sub-routers (each exports mountXxxRoutes(router, deps))
│   │   │   ├── auth.js      # Register, login, logout, MFA, account profile
│   │   │   ├── tenants.js   # Tenant CRUD
│   │   │   ├── disciplines.js # Discipline CRUD + SSI registry
│   │   │   ├── templates.js # Match template CRUD + SSI seed import
│   │   │   ├── events.js    # Scheduled events CRUD + SSI execute/search/import
│   │   │   ├── members.js   # Tenant member management
│   │   │   ├── invitations.js # Tenant invitations (protected + public accept)
│   │   │   └── staffing.js  # Event staffing roster + SSI sync
│   │   ├── scoring.js       # Score entry endpoints
│   │   ├── management.js    # Cup management endpoints
│   │   ├── registration.js  # Public self-registration
│   │   ├── reports.js       # Report generation
│   │   ├── staffing.js      # Staffing endpoints (signup, resign, sync)
│   │   └── v1/index.js      # API version info endpoint
│   ├── middleware/
│   │   ├── auth-v7.js       # SSI auth middleware (requireAuthV7, requireScopeV7)
│   │   ├── platform-auth.js # Platform auth middleware (requirePlatformAuth, requireTenantRole, COOKIE_OPTIONS)
│   │   └── errorHandler.js  # Centralized error handling + asyncHandler
│   ├── lib/
│   │   ├── db/              # Database layer
│   │   │   ├── postgres.js  # PostgreSQL pool, schema DDL, migrations
│   │   │   ├── platform-store.js # Platform data store barrel (re-exports from platform-store/)
│   │   │   └── platform-store/   # Domain modules: accounts, tenants, members, disciplines, templates,
│   │   │                         #   events, staffing, invitations, audit, rbac, utils
│   │   ├── ssi-core/        # SSI API integration (split by domain)
│   │   │   ├── client.js    # Monolithic SSI client (legacy, code move pending)
│   │   │   ├── graphql.js   # Auth, JWT, login
│   │   │   ├── scoring.js   # Scoring page scraping
│   │   │   ├── participants.js # Participant management
│   │   │   ├── management.js   # Match management scraping
│   │   │   ├── seed-import.js  # SSI event search + structure import (GraphQL)
│   │   │   └── http-helpers.js # Cookie/fetch helpers
│   │   ├── services/        # Business logic (pure functions)
│   │   │   ├── cup-manage.js          # Cup management operations
│   │   │   ├── mfa-service.js         # TOTP MFA (setup, verify, recovery codes)
│   │   │   ├── event-creation-service.js # SSI event creation (cups, matches, squads)
│   │   │   └── platform-validation.js # Platform input validation (validateSignUp, validateTenantCreate)
│   │   ├── errors/          # Custom error classes
│   │   │   └── AppError.js  # AppError hierarchy (9 error types)
│   │   ├── session/         # SSI session management (Redis/memory)
│   │   │   ├── store.js     # Redis/memory dual store
│   │   │   ├── redis.js     # Redis client (shared by SSI sessions + platform sessions)
│   │   │   └── config.js    # Session configuration
│   │   ├── staffing/        # Staffing engine
│   │   │   ├── engine.js    # Core staffing logic
│   │   │   └── config-loader.js  # Config loading + helpers
│   │   ├── email.js         # Email via Resend API (confirmations, invitations, password reset)
│   │   └── logger.js        # Structured logger (LOG_LEVEL controlled)
│   └── package.json
│
├── config/                  # Cup templates and defaults
│   └── training-staffing-configuration.yml  # Staffing config (roles, allowlist)
├── test-harness/            # E2E test scripts
├── render.yaml              # Render Blueprint (deploy config)
└── docs/                    # Documentation
    ├── design/platform-data-model.md  # Platform entity definitions & storage
    ├── design/architecture-review.md  # Architecture review & roadmap
    └── requirements/requirements.md   # All requirements & status tracking
```

## Development Workflow

### Building

```bash
# Frontend build
cd scoring-ui && npm install && npm run build

# Backend dependencies
cd scoring-proxy && npm install
```

### Local Development
Please run local development environment on port 3001, as local FW has been configured to allow that traffic.
```bash
# Start the server (serves both API and built frontend)
cd scoring-proxy && node server.js
# Runs on http://localhost:3001
```

### Code Style

- No TypeScript — plain JavaScript (ES modules)
- React with hooks for state management
- TailwindCSS for styling (mobile-first)
- Always add comments and maintain documentation up to date
- Follow existing patterns in the codebase
- If you want to refactor, please prepare a plan and reasoning and ask for approval before starting.
- **File size guidelines:** Keep files under ~500 lines. When a file exceeds this:
  - **Routes:** Extract business logic into `lib/services/` (pure functions, no Express req/res)
  - **React pages:** Extract sub-components into a `components/<page>/` directory with barrel export
  - **Shared hooks:** Extract duplicated hook patterns into `hooks/` (e.g. `useAuthenticatedPage`)
  - Route files should remain thin dispatchers: validate → call service → respond

## Deployment

### Render Production

The service `turres-ssi-tools` auto-deploys from `main` when code is merged.

1. Create a feature branch from `main`
2. Make changes, commit, push the feature branch
3. Open a PR targeting `main`
4. CI runs tests, audit, and build
5. Preview environment is automatically created for the PR
6. After merge to `main`, Render auto-deploys to production
7. Preview environment is automatically deleted

### Render Preview Environments

Preview environments are **automatically created** for all pull requests via GitHub Actions (`.github/workflows/pr-preview.yml`):

- **Generation:** Automatic — created by GitHub Actions when PR is opened
- **Deployment:** Automatic — redeploys on every commit to PR branch
- **Cleanup:** Automatic — deleted when PR is closed or merged
- **Expiry:** Services persist until PR closes (no time-based expiry)
- **Plan:** Starter instances (same as production)
- **Naming:** `turres-ssi-tools-pr-{NUMBER}` (e.g., `turres-ssi-tools-pr-42`)
- **URL:** `https://turres-ssi-tools-pr-{NUMBER}.onrender.com`

**How it works:**
1. Open a PR targeting `main`
2. GitHub Actions workflow automatically creates a Render service
3. Preview URL is posted as a PR comment by github-actions bot
4. Push new commits → Preview automatically redeploys
5. Close/merge PR → Preview service is automatically deleted

**Requirements:**
- GitHub secrets:
  - `RENDER_API_KEY` - API token from Render Dashboard → Account Settings → API Keys
  - `RENDER_OWNER_ID` - Workspace ID (`tea-d62r4ucoud1c73d50qg0` for this repo)
- See `docs/PR-PREVIEW-DEPLOYMENTS.md` for complete documentation

**Troubleshooting:**
- Check workflow logs in GitHub Actions tab if preview creation fails
- Verify secrets are configured in repository settings
- Preview services may take 30-60 seconds to wake up after inactivity

## Git Workflow

- **`main` branch:** Contains the **Release 7 code stream only**. Will NOT be updated with Release 8 or later work.
- **Release 8+ base branch:** `release/r80-match-manager-base` — this is the integration branch for all R8.x work.
- **Remote name:** `origin` (repo: `tohewi/tapahtumakalenteri-ssi-integrator`)
- **Feature/hotfix branches:** Create from the appropriate `release/rXX-*` branch, open PR targeting that same branch. Never target `main` for R8+ work.
- **Preview environments:** Automatically created by GitHub Actions for every PR
- **CI/CD:** Two workflows run on PRs:
  - `ci-deploy.yml` - Tests, audit, build (required to pass)
  - `pr-preview.yml` - Creates/updates/deletes preview environments

## Key Files for Common Tasks

| Task | Files |
|------|-------|
| Add API endpoint | `scoring-proxy/server.js` (mount), `scoring-proxy/routes/*.js` (handler), `scoring-ui/src/api.js` (client) |
| Add platform API endpoint | `scoring-proxy/routes/platform/<domain>.js` (add to mount function), `scoring-ui/src/platform-api.js` (client) |
| Add new page | `scoring-ui/src/components/NewPage.jsx`, `scoring-ui/src/main.jsx` |
| Modify SSI integration | `scoring-proxy/lib/ssi-core/*.js` (domain module, NOT `client.js`) |
| Change deploy config | `render.yaml` |
| Modify scoring logic | `scoring-proxy/lib/services/cup-manage.js`, `scoring-proxy/routes/scoring.js` |
| Modify management logic | `scoring-proxy/lib/services/cup-manage.js`, `scoring-proxy/routes/management.js` |
| Modify staffing logic | `scoring-proxy/lib/staffing/engine.js`, `scoring-proxy/routes/staffing.js` |
| Modify staffing config | `config/training-staffing-configuration.yml`, `scoring-proxy/lib/staffing/config-loader.js` |
| Add/update translations | `scoring-ui/src/i18n.js` |
| Modify SSI authentication | `scoring-proxy/routes/auth-v7.js`, `scoring-proxy/middleware/auth-v7.js` |
| Modify platform auth | `scoring-proxy/routes/platform/auth.js`, `scoring-proxy/middleware/platform-auth.js` |
| Modify platform data | `scoring-proxy/lib/db/platform-store.js`, `scoring-proxy/lib/db/postgres.js` |
| Modify platform UI | `scoring-ui/src/components/platform/*.jsx`, `scoring-ui/src/platform-api.js` |
| Modify MFA | `scoring-proxy/lib/services/mfa-service.js`, `scoring-proxy/routes/platform/auth.js` |
| Modify SSI event import | `scoring-proxy/lib/ssi-core/seed-import.js`, `scoring-proxy/routes/platform/events.js` |
| Modify error handling | `scoring-proxy/middleware/errorHandler.js`, `scoring-proxy/lib/errors/AppError.js` |
| Modify session management | `scoring-proxy/lib/session/store.js`, `scoring-proxy/lib/session/config.js` |

## SSI GraphQL — Discovering Form Fields

The SSI GraphQL `create_event` mutation accepts a `form_input: JSON!` parameter whose required fields are **not documented** and **not discoverable via schema introspection** (it's an opaque `JSON` scalar). SSI's error messages only say "This field is required" without naming the field.

**To discover required form fields**, log in to SSI via web scraping and fetch the HTML create-event form. Parse the `<input>`, `<select>`, and `<textarea>` elements to find field names, valid values, and which are marked `required`.

### How to scrape form fields

```powershell
# 1. Log in via web scraping (credentials in scripts-graphql/config/api-key.yml)
$session = & .\archive\scripts-legacy\Connect-SSI.ps1 -Username $email -Password $password

# 2. Fetch the create form page (example: RESUL Cup)
$formPage = Invoke-WebRequest -Uri "https://shootnscoreit.com/series/nordic/create-resul-cup/" -WebSession $session

# 3. Extract field names and required status
$inputs = [regex]::Matches($formPage.Content, '<input[^>]+name="([^"]+)"[^>]*>')
$selects = [regex]::Matches($formPage.Content, '<select[^>]+name="([^"]+)"[^>]*>')
$textareas = [regex]::Matches($formPage.Content, '<textarea[^>]+name="([^"]+)"[^>]*>')

# 4. For checkbox/radio fields, extract valid values
$values = [regex]::Matches($formPage.Content, '<input[^>]+name="weapon_groups"[^>]+value="([^"]+)"[^>]*>')
```

### Key form URLs

| Event Type | Create Form URL |
|-----------|----------------|
| RESUL Cup | `/series/nordic/create-resul-cup/` |
| RESUL Match | `/match/nordic/create-resul-p2p/` (sub-rule varies) |
| Squads | `/event/{typeId}/{eventId}/add-squads/` |

### Known required fields for Cup creation (as of Feb 2026)

`name`, `starts_date`, `starts_time`, `max_competitors`, `visibility`, `status`, `results`, `registration`, `region`, `scoring_mode`, `match_registration_mode`, `count`, `timezone`, `currency`, `reg_start_date`, `reg_start_time`, `has_accepted_event_data_ass_agreement`, `weapon_groups` (array), `categories` (array), `competence_classes` (array)

### Common pitfalls

- **CSRF token is NEVER the issue.** SSI web forms work without a CSRF token — do not waste time investigating CSRF. The `csrfmiddlewaretoken` field can be empty and the form will still work. Focus on actual form field validation errors instead.
- **Different disciplines have different form structures.** Nordic/RESUL forms use `<select multiple>` for weapon groups. SRA forms use multiple hidden `<input>` elements with the same `name` attribute for division arrays, and checkboxes for categories/firearms. The form parser must handle both patterns.
- **SSI validation errors use `class="list-unstyled text-danger"`**, NOT Django's standard `class="errorlist"`. Always check for both patterns when extracting form errors.
- **Field names may differ between disciplines.** The agreement checkbox, division fields, and other form elements can have different `name` attributes in SRA vs Nordic forms. Always scrape the actual form to discover field names — do not assume they match across disciplines.
- **Radio buttons** must only send the checked value. Do not promote radio buttons to arrays like checkboxes.
- **`count` not `match_count`** — the cup match count field is `count`
- **`reg_start_date`/`reg_start_time`** — registration dates use `reg_start_*` prefix, not `registration_starts_*`
- **Array fields** (`weapon_groups`, `categories`, `competence_classes`) must be present with valid enum values scraped from the form
- **`has_accepted_event_data_ass_agreement`** must be `"on"` (Nordic cups — SRA may use a different field name)
- **`group`** and `ends_date`/`ends_time` are accepted but not required
- **When debugging SSI form submission failures:** Look for `text-danger` validation errors in the response HTML with the preceding `<label>` to identify which field failed. Do not chase CSRF — it is never the problem.

## Important Constraints

- **All infrastructure must be deployed in Europe** (Render region: `frankfurt`). This applies to all services, databases, and Key Value instances — both in `render.yaml` and in GitHub Actions preview workflows. Never deploy to US or other non-EU regions.
- SSI API requires authentication via session cookies (stored in-memory on server)
  - Note that there is User session cookie and Admin session cookie.
  - User session cookie is to verify user identity and access user data.
  - Admin session cookie is used in most of the SSI API calls.
- Server restart clears all sessions — users must re-login
- The proxy serves the built frontend from `scoring-ui/dist/`
- Environment variables:
  - `NODE_ENV=development`, `PORT=3001` for local development
  - `NODE_ENV=production` for production do not specify PORT. Render will assign a port.
- Max JSON body size: 10kb

## Architecture Guidelines (v7.5+)

### Module Boundaries

Follow the modular monolith pattern with enforced boundaries:

1. **Routes** (`routes/*.js`) may import:
   - Their domain module from `lib/ssi-core/`
   - Their service module from `lib/services/`
   - Shared utilities (logger, errors, middleware)

2. **Services** (`lib/services/*.js`) may import:
   - Their domain module from `lib/ssi-core/`
   - Other services (if absolutely necessary)
   - Shared utilities

3. **Domain modules** (`lib/ssi-core/*.js`) may import:
   - `http-helpers.js` only
   - Nothing else from outside `ssi-core/`

4. **UI Components** may import:
   - Their feature's hooks/components
   - Shared UI components
   - API client (`api.js`)

### Forbidden Patterns

```javascript
// ❌ Forbidden - creates hidden coupling
import * from '../lib/ssi-core/'

// ❌ Forbidden - cross-domain imports
import { ssiGetScoringPage } from '../lib/ssi-core/participants.js'

// ❌ Forbidden - barrel imports that hide dependencies
import { ssiGraphQL } from '../lib/ssi-core/index.js'

// ✅ Allowed - domain-specific import
import { ssiGetScoringPage } from '../lib/ssi-core/scoring.js'
```

### Service Layer Pattern

Routes must be thin dispatchers. Business logic goes in services:

```javascript
// Route - thin dispatcher
app.get('/api/v1/cups', requireAuth('scoring'), asyncHandler(async (req, res) => {
  const cups = await scoringService.searchCups(...)
  res.json({ cups })
}))

// Service - pure business logic
async function searchCups(search, session, graphqlWithRefresh) {
  // Business logic here, no Express dependencies
}
```

### Error Handling

All route errors must flow through centralized error handling:

```javascript
import { AppError } from '../lib/errors/AppError.js'

function internalError(message) {
  return new AppError(message, 500, 'INTERNAL_ERROR')
}

// Route handlers use next(error) — NEVER res.status(500).json() directly
router.post('/data', async (req, res, next) => {
  try {
    // ... business logic
  } catch (err) {
    log.error('[module] Operation failed:', err.message)
    return next(internalError('User-safe error message'))
  }
})

// Or use asyncHandler wrapper (scoring.js pattern)
router.post('/data', asyncHandler(async (req, res) => {
  // Async errors automatically caught and forwarded to errorHandler
}))
```

### Logging Discipline

- **Always use `log.*`** from `lib/logger.js` — never `console.log/error/warn` in route or service files
- `log.error()` for failures, `log.warn()` for degraded states, `log.debug()` for operational traces
- Logging verbosity controlled by `LOG_LEVEL` env var (production: `info`, development: `debug`)
- Include module prefix in log messages: `[manage]`, `[staffing]`, `[register]`, `[auth-v7]`, `[reports]`

### Router Factory Pattern

All route modules must use the stateless factory pattern:

```javascript
export function createXxxRouter({ requireAuth, graphqlWithRefresh, ... }) {
  const router = express.Router()
  // Define routes...
  return router
}
```

- Router instance created **inside** the factory (no module-level shared state)
- Dependencies injected via factory parameters (testable, no hidden coupling)
- Factory exported as named export

### Platform Sub-Router Pattern

Platform routes are split into domain sub-routers under `routes/platform/`. Each domain file exports a **mount function** instead of a router:

```javascript
// routes/platform/disciplines.js
export function mountDisciplineRoutes(router, { requirePlatformAuth, requireTenantRole, platformMutationLimiter }) {
  router.get('/tenants/:tenantId/disciplines', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res) => {
    // ...
  })
}
```

The orchestrator (`routes/platform.js`) builds a shared `deps` object and calls all mount functions:

```javascript
export function createPlatformRouter(limiters) {
  const router = express.Router()
  const deps = { requirePlatformAuth, requireTenantRole, ...limiters }
  mountAuthRoutes(router, deps)
  mountDisciplineRoutes(router, deps)
  // ...
  return router
}
```

**Rules:**
- Each domain file (`routes/platform/<domain>.js`) handles one functional area only
- All imports are local to the domain file — never import from sibling domain files
- Shared middleware (`requirePlatformAuth`, `requireTenantRole`, `COOKIE_OPTIONS`) is imported from `middleware/platform-auth.js`
- New platform endpoints go into the appropriate existing domain file, not into `platform.js` directly
- Platform data access always goes through `lib/db/platform-store.js` (barrel) → `lib/db/platform-store/<domain>.js`

### API Versioning

- All new endpoints use `/api/v1/` prefix
- Frontend API calls use versioned paths
- Legacy `/api/` aliases exist with deprecation headers — do not add new legacy aliases
- Future versions will support discipline-specific paths (`/api/v2/sra/`, `/api/v2/resul/`)

### Test Requirements

- **New endpoints:** Must include route-level tests (HTTP contract: status codes, response shape, validation errors, auth checks)
- **New SSI client functions:** Must include unit tests with HTML fixture files for any scraping logic
- **Bug fixes:** Must include a regression test that fails without the fix
- **Refactors:** Must not reduce test count. Run `npm test` in both `scoring-proxy/` and `scoring-ui/` before committing
- **Time-dependent tests:** Must use `vi.useFakeTimers()` to pin the clock. Never hardcode dates that will expire
- **Playwright Locators & Accessibility:** When writing Playwright tests or React UI components, always ensure `<label>` elements have an `htmlFor` attribute that exactly matches the `<input id="...">` attribute. This is required to give the input an accessible name so that `page.getByRole('textbox', { name: /label text/i })` can successfully locate it. Never use `page.locator('input[name="..."]')` as a crutch for missing accessibility attributes.

### WordPress / Tapahtumakalenteri Integration Gotchas

- **ACF fields are cleared if omitted from POST:** When POSTing to `wp-admin/post.php`, WordPress/ACF interprets any ACF fields NOT included in the body as "clear this field". Always re-submit all current ACF values when changing post status (e.g., draft → publish). Use `extractAcfFieldValues()` to read current values from the edit page before POSTing.
- **wpLogin URL normalization:** Users often paste `https://site.fi/wp-admin` as the WordPress URL. `wpLogin()` normalizes this by stripping `/wp-admin` and trailing slashes. The login endpoint is always at the site root: `/wp-login.php`.
- **Field name consistency UI ↔ service:** The template editor UI field names (stored in JSONB) must exactly match what the backend service reads. E.g., UI stores `calendarTemplate.content` — service must read `.content`, not `.contentTemplate`. Always verify field names end-to-end when adding new template fields.
- **calendarConfig secrets are encrypted:** Like `ssiCredentials`, the `calendarConfig` JSONB is encrypted with AES-256-GCM. Passwords are write-only (never returned to frontend). The store returns `hasWpPassword`/`hasGmailAppPassword` flags instead. Use `getTenantWithCredentials()` for internal operations that need actual passwords.

### Merge Conflict Prevention

- Before starting work, check if the target files are being modified in other active branches
- When adding a new endpoint, prefer creating a new route file or service module rather than appending to existing large files
- When adding SSI integration, add to the appropriate domain module in `lib/ssi-core/`, not to the monolithic `client.js`
- Keep commits small and focused — one logical change per commit
