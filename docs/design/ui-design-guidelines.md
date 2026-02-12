# UI Design Guidelines

Design rules for all current and future features in the scoring UI application.

## Routing

- Root URL (`#/`) is the **front page** with links to all features.
- Each feature has its own hash route: `#/scoring`, `#/register`, `#/manage`, `#/report`.
- New features must follow the same pattern: `#/<feature-name>`.

## Shared UI Components

All features must use the shared components from `scoring-ui/src/components/shared.jsx`:

| Component | Purpose |
|-----------|---------|
| `AppHeader` | Blue gradient header with title, subtitle, optional back button |
| `BackButton` | Chevron-left navigation |
| `CupList` | Cup cards with open/closed sections, date badges, capacity |
| `ErrorBanner` | Red error notification with optional close button |
| `Spinner` | Centered loading spinner |
| `formatDate` | Finnish long date (weekday, day, month, year) |
| `formatDateShort` | Finnish short date (d.M.yyyy) |

**Rules:**
- Never duplicate these components locally in a feature file.
- If a shared component needs customization, add a prop (e.g. `openLabel` in `CupList`) rather than forking the component.
- New reusable UI patterns should be extracted into `shared.jsx`.

## Headers

- Each feature page renders **one** `<AppHeader>` at the top.
- `LoginScreen` must always receive `hideHeader` when an `AppHeader` is already rendered above it.
- Never render two headers on the same page.
- **Second-level pages** (login pages, registration, or similar pages that are one level deep from the home page) must include a "Home"/"Alkuun" link in the top-right of the header that navigates back to the home page (`#/`).
- The "Home"/"Alkuun" link should use the i18n translation (`fi.home`) and style: `text-blue-200 text-sm active:text-white`.

## Authentication & Login

- All authenticated features (scoring, manage, report) share a **single** `LoginScreen` component.
- All features use the **same localStorage key** for credentials: `ssi_credentials`.
- Login once with "Remember me" → auto-login works across all features.
- Never create feature-specific credential keys (no `ssi_manage_credentials`, `ssi_report_credentials`, etc.).
- Auto-login flow: on mount, read `ssi_credentials` from localStorage → decrypt → call `api.login()` → if success, skip login screen.

## Cup Lists

- Cup data comes from the registration API (`/api/register/cups`) for all features that list cups.
- Cups are sorted **ascending by proximity to today** (closest first).
- Open cups shown first with green indicators; closed/upcoming cups shown greyed out below.
- Feature-specific text is controlled via props (e.g. `openLabel="Hallitse"` in Manage vs default `"Ilmoittautuminen auki"` in Register).

## Visual Design

- **Color scheme**: Blue gradient headers (`from-blue-700 to-blue-900`), white content cards with rounded borders.
- **Cards**: `rounded-xl border bg-white` with `p-4` padding.
- **Buttons**: `rounded-xl` with `active:` press states, `disabled:bg-gray-300` for disabled.
- **Typography**: Tailwind defaults. Finnish language for user-facing text.
- **Mobile-first**: All layouts designed for phone screens, responsive up.
- **Date badges**: 12×12 rounded squares with weekday abbreviation + day number.

## Session Handling on Page Reload

When a user reloads the browser (or navigates back to a feature page), the React state is lost but the HTTP-only session cookie may still be valid on the server.

**Pattern — restore session on mount:**
1. On component mount, call `api.getAuthStatus()` (GET `/api/auth/status`).
2. If `status.authenticated === true`, set `authed` state to `true` — skip the login screen.
3. If the session has expired server-side, the check returns `authenticated: false` → show login screen as normal.

**Sliding window cookie refresh:**
- The session cookie is initially issued with a `maxAge` based on the default `SESSION_TTL` (unless the caller passes an explicit scope-specific TTL at login).
- Every authenticated request passes through `requireAuth`, which **refreshes the cookie** with a new `maxAge`, resetting the browser-side expiry timer according to the current server-side session TTL.
- This means the session stays alive as long as the user keeps interacting — it only expires after N minutes of **zero activity** (no API calls).

**Scope-based TTL:**
- `SESSION_TTL_BY_SCOPE` in `server.js` defines per-scope overrides (e.g. `staffing: 5 * 60 * 1000`).
- `getSessionTTL(session)` returns the TTL for the session's scope, falling back to the default `SESSION_TTL`.
- Both the server-side cleanup interval and `getSession()` use this function; the initial login cookie `maxAge` continues to use `SESSION_TTL` unless a scope-specific TTL is explicitly provided at login.

**Implementation reference:** `StaffingPage.jsx` mount effect, `server.js` `requireAuth` middleware.

## Adding a New Feature

1. Create `scoring-ui/src/components/<FeatureName>Page.jsx`.
2. Add route in `scoring-ui/src/main.jsx`: `if (route === '#/<feature>') return <FeaturePage />`.
3. Add link card in `scoring-ui/src/components/HomePage.jsx`.
4. Import and use shared components — do not duplicate.
5. If authenticated, use `ssi_credentials` key and `LoginScreen` with `hideHeader`.
6. If it needs a cup list, use `<CupList>` with registration API data.
