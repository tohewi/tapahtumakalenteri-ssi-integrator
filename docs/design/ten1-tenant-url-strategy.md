# TEN-1: Tenant Context & URL Strategy

**Date:** 2026-03-12
**Status:** Implementing
**Author:** Cascade

---

## 1. Problem Statement

The current platform UI (`#/platform`) manages tenant context and view selection entirely in React state. This causes:

1. **No bookmarkable URLs** — refreshing the page loses the active tenant and view
2. **No deep linking** — cannot share a link to a specific tenant's schedule
3. **No browser navigation** — back/forward buttons don't work across tenant switches or view changes
4. **No shareable URLs** — cannot send someone a link to "our club's event roster"

## 2. Current Architecture

```
URL:    #/platform                        (static, never changes)
State:  selectedTenantId  (React state)   — lost on refresh
        activeView        (React state)   — lost on refresh
        selectedTemplateId (React state)  — lost on refresh
```

Backend API already uses tenant IDs in URL paths (`/tenants/:tenantId/events`), so no backend URL changes needed.

## 3. Options Evaluated

### Option A: Global Login + Tenant Switcher (improved current)

Keep `#/platform` as the only URL. Persist `selectedTenantId` in `sessionStorage` or a cookie so it survives refresh.

- **Pro:** Minimal code change
- **Con:** Still no deep linking, no shareable URLs, no browser history integration
- **Verdict:** Band-aid. Doesn't solve the core UX problems.

### Option B: Global Login + Tenant-Scoped Hash URLs ✅ Recommended

Use `#/platform/:tenantSlug/:view` URLs:

```
#/platform                           → tenant list (or auto-redirect if single tenant)
#/platform/turres/dashboard          → TurRes Turku dashboard
#/platform/turres/schedule           → TurRes Turku schedule
#/platform/turres/roster             → TurRes Turku roster
#/platform/turres/templates          → TurRes Turku templates
#/platform/turres/templates/:id      → TurRes Turku template editor
#/platform/turres/members            → TurRes Turku members
#/platform/turres/settings           → TurRes Turku settings
#/platform/turres/account            → Account settings (tenant-scoped URL but user-level content)
```

- **Pro:** Bookmarkable, deep-linkable, browser history works, shareable
- **Pro:** Same domain — no cookie/CORS/cert complications
- **Pro:** Hash routing keeps compatibility with existing `main.jsx` router
- **Con:** Requires slug column on tenants + slug generation logic
- **Verdict:** Best balance of UX and implementation effort.

### Option C: Tenant Subdomains (`turres.towi.me`)

- **Pro:** Strongest isolation, cleanest URLs
- **Con:** Wildcard cert + DNS, cookie domain config, complicates local dev, complicates Render deploy
- **Verdict:** Overkill for current scale. Revisit if/when multi-tenant isolation becomes a hard requirement.

## 4. Design — Option B Implementation

### 4.1 Database: Tenant Slugs

**Migration M16:** Add `slug` column to `tenants` table.

```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug);
```

Slug generation rules:
- Lowercase the tenant name
- Replace non-alphanumeric characters with hyphens
- Collapse consecutive hyphens
- Trim leading/trailing hyphens
- If collision, append `-2`, `-3`, etc.
- Max length: 48 characters

Examples: "TurRes Turku" → `turres-turku`, "Ålands Skyttegille" → `alands-skyttegille`

Existing tenants get slugs generated from their names during M16 migration (application-level, on first boot).

### 4.2 Backend Changes

- `getTenantBySlug(slug)` — new store function
- `createTenant()` — auto-generate slug from name
- `updateTenant()` — allow slug update (with uniqueness check)
- Slug included in tenant API responses

### 4.3 Frontend URL Routing

**PlatformApp** parses the hash route:

```
#/platform                    → authState: show tenant list or auto-redirect
#/platform/:slug              → redirect to /:slug/dashboard
#/platform/:slug/:view        → resolve slug → tenantId, render view
#/platform/:slug/:view/:id    → view with sub-resource (e.g., template editor)
```

**Navigation function** replaces `setActiveView()`:

```javascript
function navigate(view, subId) {
  const base = `#/platform/${activeTenantSlug}`
  window.location.hash = subId ? `${base}/${view}/${subId}` : `${base}/${view}`
}
```

**hashchange listener** in PlatformApp drives all routing — no more `activeView` state.

### 4.4 Auth Flow URLs

Auth pages remain at `#/platform` (no tenant context needed):
- `#/platform` — welcome/sign-in (when not authenticated)
- `#/platform/forgot-password` — password reset request
- `#/platform/reset-password/:token` — password reset form
- `#/platform/join/:token` — invitation accept

After login, redirect to `#/platform/:slug/dashboard` (first tenant or remembered last tenant).

### 4.5 Tenant Selection Page

When a user has multiple tenants and visits `#/platform` while authenticated:
- Show a tenant picker grid (card per tenant with logo, name, role badge)
- Clicking a tenant navigates to `#/platform/:slug/dashboard`

Single-tenant users auto-redirect to their tenant's dashboard.

### 4.6 Cross-Tenant "My Events" View (Future)

Not in this prototype. Design note: `#/platform/my-events` could aggregate upcoming events across all tenants where the user has a role. Requires a new backend endpoint that queries across tenant boundaries.

## 5. Migration Path

1. Add slug column + generate slugs for existing tenants
2. Refactor PlatformApp to URL-based routing
3. Old `#/platform` URL continues to work (redirects appropriately)
4. No breaking changes to API or backend

## 6. Files Changed

- `scoring-proxy/lib/db/postgres.js` — M16 migration
- `scoring-proxy/lib/db/platform-store/tenants.js` — `getTenantBySlug`, slug generation
- `scoring-ui/src/components/platform/PlatformApp.jsx` — URL-based routing
- `scoring-ui/src/platform-i18n.jsx` — i18n keys for tenant picker
