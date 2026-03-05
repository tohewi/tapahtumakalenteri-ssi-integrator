# Development Modularity Guidelines

**Document Version:** 1.1
**Date:** 2026-03-05
**Status:** Approved (updated after R80 platform feature additions)
**Purpose:** Reduce merge conflicts and improve parallel development efficiency

---

## Executive Summary

This document provides guidelines for modular development to minimize merge conflicts when multiple feature branches modify the codebase simultaneously. The goal is to enable efficient parallel development while maintaining code quality.

**Key Findings (v1.1 update, 2026-03-05):**
- ✅ **Server routes modularized** - Scoring, management, staffing, registration, platform all split
- ✅ **SSI client domain-split** - `ssi-core/` now has graphql.js, participants.js, management.js, scoring.js, event-creation.js, seed-import.js
- ✅ **Multiple frontend API clients** - platform-api.js, register-api.js, staffing-api.js extracted from api.js
- ✅ **ManagePage partial extraction** - manage/ sub-components created
- 🔴 **`routes/platform.js` at 2550 lines** - new critical hotspot, not in original guidelines
- 🔴 **`TenantDetailPage.jsx` at 1119 lines** - largest component, well over limit
- ⚠️ **`client.js` grown to 1768 lines** (was 1060) - needs extraction of new functions to lib/services/
- ⚠️ **`lib/services/` layer not in guidelines** - new patterns (event-builders, service files) need documenting
- ⚠️ **`ManagePage.jsx` still 689 lines** - partial extraction done but not complete

**Recommended Actions:**
1. Follow the modularity guidelines below when adding new features
2. Implement the shared component modification process
3. Apply documentation modularization practices
4. Use PR preview environments for parallel testing

---

## Table of Contents

1. [Merge Conflict Hotspots](#merge-conflict-hotspots)
2. [Modularity Guidelines](#modularity-guidelines)
3. [Shared Component Modification Process](#shared-component-modification-process)
4. [Documentation Modularization](#documentation-modularization)
5. [Code Organization Best Practices](#code-organization-best-practices)
6. [Development Workflow for Parallel Features](#development-workflow-for-parallel-features)
7. [Examples and Anti-Patterns](#examples-and-anti-patterns)

---

## Merge Conflict Hotspots

### Critical Risk Areas (High probability of conflicts)

Based on codebase analysis, these files are most likely to cause merge conflicts:

| File | Lines | Risk Level | Why | Mitigation |
|------|-------|------------|-----|------------|
| **scoring-proxy/routes/platform.js** | 2,550 | 🔴 CRITICAL | Entire platform subsystem in one route file | Split by domain: accounts.js, tenants.js, members.js, events.js, mfa.js |
| **scoring-ui/src/components/platform/TenantDetailPage.jsx** | 1,119 | 🔴 CRITICAL | All tenant management UI in one component | Extract tab-based sub-components |
| **scoring-proxy/lib/ssi-core/client.js** | 1,768 | 🔴 HIGH | Core integration, grown 700 lines since v1.0 | New functions → lib/services/ not client.js |
| **scoring-ui/src/App.jsx** | 792 | 🔴 HIGH | Central state management, all features touch this | Extract feature-specific logic to separate modules |
| **scoring-ui/src/components/ManagePage.jsx** | 689 | 🟡 MEDIUM | Large but partially extracted to manage/ | Complete extraction; manage/ sub-components exist |
| **scoring-ui/src/components/platform/SchedulePage.jsx** | 606 | 🟡 MEDIUM | Complex event scheduling UI | Extract sub-components for calendar vs list views |
| **scoring-proxy/lib/services/event-creation-service.js** | 673 | 🟡 MEDIUM | Multi-step SSI event creation orchestration | Split date/form helpers to separate utility files |
| **scoring-ui/src/components/TabletScoringView.jsx** | 600 | 🟡 MEDIUM | Full tablet scoring UI in one component | Extract scoring form, results panel |
| **scoring-proxy/routes/management.js** | 550 | 🟡 MEDIUM | Multiple admin endpoints | Split by feature domain (see guidelines below) |
| **scoring-proxy/server.js** | ~350 | 🟢 LOW | Mostly configuration, routes already split | Minimal changes needed |

### Conflict Patterns Observed

1. **Multiple features adding endpoints** to route files simultaneously
2. **Multiple features modifying SSI client** for new operations
3. **UI state management changes** in App.jsx competing with each other
4. **Documentation updates** in large monolithic docs files

---

## Modularity Guidelines

### Principle 1: Feature Isolation

**Goal:** Each feature should touch as few shared files as possible.

#### Backend: Route Module Organization

Each route file should be organized into logical sections with clear boundaries:

```javascript
// scoring-proxy/routes/management.js

// ============================================================
// SECTION 1: Cup-level operations
// ============================================================
router.get('/cup/:id', requireAuth('manage'), async (req, res) => {
  // Cup overview endpoint
})

router.post('/cup/:id/participant', requireAuth('manage'), async (req, res) => {
  // Add participant endpoint
})

// ============================================================
// SECTION 2: Match-level operations
// ============================================================
router.get('/match/:id/participants', requireAuth('manage'), async (req, res) => {
  // Match participants endpoint
})

// ============================================================
// SECTION 3: Squad assignment operations
// ============================================================
router.put('/participant/:id/squad', requireAuth('manage'), async (req, res) => {
  // Squad assignment endpoint
})

// ============================================================
// SECTION 4: Pending shooter management
// ============================================================
router.get('/pending-shooters', requireAuth('manage'), async (req, res) => {
  // Pending shooters list
})
```

**Guidelines:**
- Add clear section comments for each functional area
- New endpoints go in the appropriate section
- If a section grows beyond 150 lines, consider extracting to a new route file
- Add new endpoints at the **end of their section** to minimize conflicts

#### Frontend: Component Organization

Large components should be split by feature area:

```javascript
// scoring-ui/src/components/ManagePage.jsx (689 lines — partial extraction done)

// CURRENT STATE: manage/ sub-components exist but ManagePage.jsx is still too large.
// REMAINING WORK: continue extracting sections into manage/ directory.

// RECOMMENDED STRUCTURE for NEW large pages (e.g. TenantDetailPage.jsx at 1119 lines):
// TenantDetailPage.jsx (main orchestrator, 150-200 lines)
// ├── TenantMembersTab.jsx (member management)
// ├── TenantSsiCredentialsTab.jsx (SSI integration settings)
// ├── TenantEventsTab.jsx (event calendar / schedule)
// └── TenantDisciplinesTab.jsx (discipline configuration)
```

**Shared hooks pattern:** When the same auth+load pattern appears in multiple page components, extract it to `src/hooks/`.

```javascript
// src/hooks/useAuthenticatedPage.js — already exists
// Extract more shared patterns here, not inline in page components.
```

**Guidelines:**
- Extract feature-specific UI into separate components when sections exceed 200 lines
- Use clear prop interfaces between parent and child components
- Keep shared state in parent, pass down as props
- New features should create new component files when possible

### Principle 2: Minimize Shared File Modifications

**Goal:** Reduce the number of developers touching the same files.

#### API Client Pattern

Multiple frontend API client files now exist — use the right one:

| File | Purpose |
|------|---------|
| `api.js` | SSI scoring/manage operations (cups, matches, squads, participants) |
| `platform-api.js` | Platform operations (accounts, tenants, members, MFA, invitations) |
| `register-api.js` | Public self-registration API |
| `staffing-api.js` | Staffing signup, resign, sync |

**Rule:** If adding more than 3 methods for a new domain, create `[domain]-api.js` rather than adding to an existing file.

When adding new API methods, use a consistent pattern:

```javascript
// scoring-ui/src/api.js

// ============================================================
// SECTION: Management API calls
// ============================================================

export async function getCupOverview(cupId) {
  // ... existing method
}

export async function getPendingShooters(cupId) {
  // ... existing method
}

// ADD NEW METHODS HERE (at end of section)
export async function approveShooter(cupId, shooterId) {
  // New method added by feature branch A
}

export async function assignSquad(participantId, squadId) {
  // New method added by feature branch B
}
```

**Guidelines:**
- Add new methods at the **end of their section**
- Use JSDoc comments to document parameters and return values
- Group related methods together
- If adding more than 5 methods, consider creating a separate API module

#### SSI Client Extensions

⚠️ **`client.js` is frozen for new additions.** It is 1,768 lines and must not grow further.

When adding new SSI raw HTTP operations:
1. **Add to the appropriate `lib/ssi-core/` domain file** (graphql.js, participants.js, management.js, scoring.js) or create a new domain file
2. **Add the business logic wrapper to `lib/services/`** — never put multi-step orchestration in ssi-core

```javascript
// CORRECT: raw HTTP in ssi-core domain file
// lib/ssi-core/participants.js  ← re-exports from client.js OR new domain file
export async function ssiGetParticipantEmail(participantId, cookies) {
  // Single-purpose HTTP scrape
}

// CORRECT: business logic in lib/services/
// lib/services/cup-manage.js
import { ssiGetParticipantEmail } from '../ssi-core/participants.js'
export async function resolveParticipantIdentity(cupId, name, cookies) {
  // Multi-step orchestration using ssi-core primitives
}

// WRONG: new function appended to client.js
// ← Do not add here anymore
```

**Naming conventions:**
- `ssi-core/` functions: `ssi[Action][Entity]` (e.g., `ssiGetParticipantStatus`) — raw HTTP only
- `lib/services/` functions: plain descriptive names (e.g., `resolveParticipant`, `createCupWithMatches`)

### Principle 3: Configuration Over Code

**Goal:** Make features configurable rather than hardcoded.

#### Constants and Configuration

Extract feature toggles and configuration to dedicated files:

```javascript
// scoring-proxy/lib/ssi-core/constants.js

export const SSI_BASE_URL = 'https://shootnscoreit.com'
export const SSI_GRAPHQL_URL = `${SSI_BASE_URL}/api/graphql`

// Feature flags (makes it easier to enable/disable features)
export const FEATURES = {
  SQUAD_AUTO_ASSIGNMENT: true,
  EMAIL_NOTIFICATIONS: true,
  PENDING_SHOOTER_APPROVAL: true,
}

// Business rules
export const RULES = {
  MAX_SQUAD_SIZE: 10,
  REGISTRATION_DEADLINE_HOURS: 24,
  AUTO_APPROVE_THRESHOLD: 5,
}
```

**Guidelines:**
- Put all constants in `constants.js` files
- Use feature flags for optional functionality
- Extract magic numbers to named constants
- Document the purpose of each configuration value

### Principle 4: Vertical Slicing

**Goal:** Each feature should be a complete vertical slice from UI to backend.

#### New Feature Checklist

When adding a new feature:

1. **Backend Route** (new endpoint or new file if substantial)
   - Add route handler in appropriate route file
   - Add to correct section with clear comments
   - If route file exceeds 400 lines, split off a new `routes/[domain]-[subdomain].js`

2. **SSI Integration** (if needed)
   - Raw HTTP: add to appropriate `lib/ssi-core/` domain file (NOT client.js)
   - Business logic: add to `lib/services/[domain].js`

3. **API Client** (frontend)
   - Add API method to the correct `[domain]-api.js` file
   - If no domain file exists and you're adding 3+ methods, create one

4. **UI Component** (frontend)
   - Create new component file if feature is substantial (>150 lines)
   - Shared auth/load patterns → `src/hooks/`
   - Sub-components of a page → `components/[pagename]/` directory

5. **Documentation**
   - Add to appropriate section in existing docs
   - Or create new doc file if feature is large

**Example: Adding "Bulk Shooter Import" Feature**

```
Backend:
├── routes/management.js (add POST /bulk-import section)
├── lib/ssi-core/participants.js (add ssiBulkSearchParticipants — raw HTTP only)
├── lib/services/bulk-import-service.js (NEW FILE — orchestration logic)

Frontend:
├── api.js (add bulkImportShooters at end of "Management API" section)
├── components/manage/ManageBulkImport.jsx (NEW FILE in manage/ sub-dir)
├── components/ManagePage.jsx (import and render ManageBulkImport)

Documentation:
├── docs/design/manage-page-design.md (add "Bulk Import" section at end)
```

---

## Shared Component Modification Process

When you need to modify a core shared component, follow this process to avoid conflicts:

### Step 1: Check for Existing Work

Before modifying a shared file:

1. **Check open PRs** that touch the same file:
   ```bash
   gh pr list --search "path:scoring-proxy/lib/ssi-core/client.js"
   ```

2. **Coordinate on GitHub** if another PR is modifying the same area:
   - Comment on the other PR: "I need to add X functionality, will coordinate"
   - Consider pairing on the changes
   - Discuss which PR should merge first

### Step 2: Communicate Intent

Open a **draft PR early** to signal your work:

1. Create PR with `[WIP]` or `[Draft]` prefix
2. Add description: "Modifying SSI client to add X functionality"
3. Tag relevant developers as reviewers
4. Include preview environment link for testing

### Step 3: Minimize Change Scope

When modifying shared files:

- **Add, don't modify** - Add new functions rather than changing existing ones
- **Append, don't insert** - Add at the end of sections to avoid line number conflicts
- **Extract, don't embed** - Extract helper functions to reduce changes to main functions

### Step 4: Frequent Syncing

Keep your branch up to date:

```bash
# Rebase frequently to catch conflicts early
git fetch origin main
git rebase origin/main

# Or merge if you prefer
git merge origin/main
```

### Step 5: Communicate Completion

When ready to merge:

1. Mark PR as **ready for review** (remove draft status)
2. Comment: "Ready to merge - affects [file list]"
3. Request priority review if blocking other work
4. Merge promptly after approval to unblock others

---

## Documentation Modularization

### Current Issue

Large documentation files (e.g., 42KB `refactoring-plan.md`, 38KB `SHOOTER-STATE-MANAGEMENT.md`) become conflict hotspots when multiple features update docs simultaneously.

### Solution: Topic-Based Documentation

Organize documentation by topic, not by type:

#### Current Structure (Conflict-Prone)
```
docs/
├── requirements.md (all requirements)
├── architecture.md (all architecture)
└── user-guide.md (all user docs)
```

#### Recommended Structure (Conflict-Resistant)
```
docs/
├── features/
│   ├── scoring/
│   │   ├── README.md (overview)
│   │   ├── requirements.md
│   │   ├── architecture.md
│   │   └── user-guide.md
│   ├── registration/
│   │   ├── README.md
│   │   ├── requirements.md
│   │   └── architecture.md
│   └── management/
│       ├── README.md
│       ├── requirements.md
│       └── architecture.md
├── design/
│   ├── ssi-dual-approach-graphql-webscraping.md (already good)
│   └── ui-design-guidelines.md
└── operations/
    ├── BRANCHING-STRATEGY.md
    └── PR-PREVIEW-DEPLOYMENTS.md
```

### Documentation Guidelines

1. **Feature-specific docs** go in `docs/features/[feature-name]/`
2. **Cross-cutting concerns** stay in top-level docs/
3. **Keep docs under 500 lines** - split if exceeding
4. **Use relative links** between docs for easy navigation
5. **Add to appropriate section** at the end to minimize conflicts

### Large Document Splitting Strategy

For existing large docs, follow this pattern:

**Example: Splitting `SHOOTER-STATE-MANAGEMENT.md` (38KB)**

```
docs/features/management/
├── README.md (overview and index)
├── shooter-state-concepts.md (what is pending/approved state)
├── shooter-state-flows.md (state transition diagrams)
├── shooter-state-api.md (API endpoints)
├── shooter-state-implementation.md (code details)
└── shooter-state-testing.md (test scenarios)
```

**Migration Process:**
1. Create new directory structure
2. Copy sections from large doc to new files
3. Add index file linking to all new files
4. Update references in code and other docs
5. Mark old file as deprecated with pointer to new location

---

## Code Organization Best Practices

### File Size Limits

| File Type | Target | Maximum | Action if Exceeded |
|-----------|--------|---------|-------------------|
| Route file | 200 lines | 400 lines | Split into multiple route files |
| Component | 150 lines | 300 lines | Extract sub-components |
| API client | 150 lines | 300 lines | Split by feature domain |
| SSI client | 300 lines | 500 lines per section | Split into multiple modules |
| Documentation | 300 lines | 500 lines | Split into topic-specific docs |

**Note:** `scoring-proxy/lib/ssi-core/client.js` (1,768 lines as of v1.1) is no longer an acceptable exception — it has grown 700 lines since v1.0. **New SSI operations must go into `lib/services/` (business logic) or new `lib/ssi-core/*.js` domain files (raw HTTP operations), not into client.js.** The existing content stays to preserve stability; new additions are prohibited in this file.

**`lib/services/` file guidance:** Service files (e.g. `event-creation-service.js`, `cup-manage.js`) should target 300 lines and must not exceed 500 lines. When a service file exceeds 400 lines, extract helper functions to a `lib/services/helpers/` module or split by operation type (e.g. `event-creation-service.js` → `event-creation-service.js` + `event-deletion-service.js`).

### Section Organization

Use consistent section markers in all code files:

```javascript
// ============================================================
// SECTION NAME: Brief description
// ============================================================

// Code for this section...

// ============================================================
// NEXT SECTION NAME: Brief description
// ============================================================
```

**Benefits:**
- Easy to navigate large files
- Clear boundaries for additions
- Helps identify extraction candidates
- Makes conflicts less likely (append to sections)

### Function Organization

Within sections, order functions logically:

1. **Main/public functions** first
2. **Helper/private functions** after
3. **New functions** at the end of their category

```javascript
// ============================================================
// SECTION: Participant management
// ============================================================

// Main public function
export async function ssiFindAndApproveCupParticipant(...) {
  const participant = await findParticipantHelper(...)
  return approveParticipantHelper(...)
}

// Helper functions
async function findParticipantHelper(...) {
  // ...
}

async function approveParticipantHelper(...) {
  // ...
}

// NEW FUNCTIONS ADDED HERE
export async function ssiFindAndSuspendCupParticipant(...) {
  // New function by feature branch
}
```

### Import Organization

Organize imports consistently to minimize conflicts:

```javascript
// Node.js built-ins
import crypto from 'node:crypto'
import path from 'node:path'

// External dependencies
import express from 'express'
import cors from 'cors'

// Internal modules
import { ssiGraphQL, ssiLogin } from './lib/ssi-client.js'
import { createAuthRouter } from './routes/auth.js'

// Types (if using TypeScript)
// import type { Cup, Match } from './types.js'
```

---

## Development Workflow for Parallel Features

### Scenario: Multiple Teams Working Simultaneously

**Team A:** Adding bulk shooter import
**Team B:** Adding squad auto-assignment
**Team C:** Fixing pending shooter bug

All three need to modify `routes/management.js` and `lib/ssi-core/client.js`.

### Recommended Workflow

#### Day 1: Coordination

1. **Team leads meet** to discuss upcoming work
2. **Divide the files** into logical sections:
   - Team A owns "Bulk operations" section
   - Team B owns "Squad assignment" section
   - Team C fixes bugs in "Pending shooter" section

3. **Create draft PRs** immediately:
   - PR #123 [WIP] Add bulk shooter import
   - PR #124 [WIP] Add squad auto-assignment
   - PR #125 [Draft] Fix pending shooter display bug

4. **Use PR preview environments** for independent testing

#### Day 2-3: Development

1. Each team works in their designated sections
2. Add new code at the **end of sections** to minimize conflicts
3. Sync with main daily:
   ```bash
   git fetch origin main
   git rebase origin/main
   # or git merge origin/main
   ```

4. Test in **preview environments** (unique per PR)

#### Day 4: Integration

1. **Team C merges first** (bug fix has priority)
2. **Team A and B rebase** on updated main
3. Resolve any conflicts (should be minimal due to section separation)
4. **Team A merges** next (bulk import)
5. **Team B merges** last (auto-assignment)

#### Conflict Resolution Tips

If conflicts do occur:

1. **Favor append over insert** - Add new code at end of sections
2. **Accept both changes** when adding new functions
3. **Communicate** - Ask the other team if unsure
4. **Test thoroughly** after resolving conflicts

---

## Examples and Anti-Patterns

### ✅ Good Practice: Adding New Endpoint

```javascript
// scoring-proxy/routes/management.js

// EXISTING CODE (don't modify)
router.get('/cup/:id', requireAuth('manage'), async (req, res) => {
  // ... existing endpoint
})

// ============================================================
// NEW FEATURE: Bulk Import (added at end of section)
// ============================================================

router.post('/cup/:id/bulk-import', requireAuth('manage'), async (req, res) => {
  try {
    const { shooters } = req.body
    const results = await ssiBulkImportShooters(
      req.ssiSession,
      req.params.id,
      shooters
    )
    res.json({ success: true, results })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

**Why this is good:**
- Added at end of file/section
- Doesn't modify existing code
- Clear section comment
- Minimal conflict risk

### ❌ Anti-Pattern: Modifying Existing Function

```javascript
// scoring-proxy/lib/ssi-core/client.js

// BEFORE
export async function ssiFindAndApproveCupParticipant(cookies, cupId, firstName, lastName) {
  // ... 50 lines of existing logic
}

// AFTER (modified by two teams)
export async function ssiFindAndApproveCupParticipant(cookies, cupId, firstName, lastName, email, phone) {
  // Team A added email parameter
  // Team B added phone parameter
  // ... 50 lines of existing logic with changes from both teams
  // HIGH CONFLICT RISK
}
```

**Why this is bad:**
- Both teams modified same function signature
- Changes interleaved throughout function body
- High conflict probability

**Better approach:**
```javascript
// Keep existing function unchanged
export async function ssiFindAndApproveCupParticipant(cookies, cupId, firstName, lastName) {
  // ... original 50 lines unchanged
}

// Team A adds new function
export async function ssiFindAndApproveCupParticipantByEmail(cookies, cupId, email) {
  // New logic for email-based approval
}

// Team B adds different function
export async function ssiFindAndApproveCupParticipantByPhone(cookies, cupId, phone) {
  // New logic for phone-based approval
}
```

### ✅ Good Practice: Component Extraction

```javascript
// scoring-ui/src/components/ManagePage.jsx (809 lines → 200 lines)

import ManageCupOverview from './manage/ManageCupOverview.jsx'
import ManagePendingShooters from './manage/ManagePendingShooters.jsx'
import ManageSquadAssignment from './manage/ManageSquadAssignment.jsx'

export default function ManagePage() {
  const [selectedCup, setSelectedCup] = useState(null)
  const [pendingShooters, setPendingShooters] = useState([])

  return (
    <div className="min-h-screen bg-gray-100">
      <ManageCupOverview onCupSelect={setSelectedCup} />
      {selectedCup && (
        <>
          <ManagePendingShooters
            cupId={selectedCup.id}
            shooters={pendingShooters}
            onUpdate={setPendingShooters}
          />
          <ManageSquadAssignment cupId={selectedCup.id} />
        </>
      )}
    </div>
  )
}
```

**Why this is good:**
- Main component is now small (200 lines)
- Each sub-feature in separate file
- Teams can work on different features without conflicts
- Clear prop interfaces

### ❌ Anti-Pattern: Monolithic Documentation

```markdown
<!-- docs/requirements.md (20KB file) -->

# Requirements

## Scoring Requirements
... 200 lines ...

## Registration Requirements
... 200 lines ...

## Management Requirements
... 200 lines ...

## Reporting Requirements
... 200 lines ...
```

**Problem:** Four teams updating different sections of same file causes conflicts.

**Better approach:**

```
docs/features/
├── scoring/requirements.md (5KB)
├── registration/requirements.md (5KB)
├── management/requirements.md (5KB)
└── reporting/requirements.md (5KB)
```

---

## Implementation Checklist

Use this checklist when starting a new feature:

### Planning Phase

- [ ] Identify which shared files will be modified
- [ ] Check for open PRs touching the same files
- [ ] Coordinate with other developers if conflicts expected
- [ ] Create draft PR early to signal your work
- [ ] Identify appropriate sections for additions

### Development Phase

- [ ] Add new code at end of sections (not middle)
- [ ] Create new files for substantial features
- [ ] Use clear section comments
- [ ] Follow naming conventions
- [ ] Add JSDoc comments for new functions
- [ ] Sync with main branch daily

### Documentation Phase

- [ ] Update or create feature-specific docs
- [ ] Add to appropriate section (at end)
- [ ] Keep docs under 500 lines
- [ ] Update cross-references if needed

### Review Phase

- [ ] Mark PR as ready for review
- [ ] Share preview environment URL
- [ ] Highlight shared file modifications
- [ ] Respond to feedback promptly
- [ ] Merge quickly after approval

### Post-Merge

- [ ] Notify other developers of merge
- [ ] Monitor for issues in production
- [ ] Help other teams resolve conflicts if needed

---

## Measuring Success

Track these metrics to evaluate modularity improvements:

1. **Merge conflict rate** - # of PRs with conflicts / total PRs
2. **Average PR size** - Lines changed per PR (smaller is better)
3. **File change concentration** - # of PRs changing top 10 files
4. **Time to merge** - Days from PR creation to merge
5. **Rebase frequency** - # of times developers need to rebase

**Goals:**
- Merge conflict rate < 10%
- Average PR size < 500 lines
- File change concentration distributed across more files
- Time to merge < 3 days
- Rebase frequency < 2 times per PR

---

## Related Documentation

- [Branching Strategy](./BRANCHING-STRATEGY.md) - Git workflow and PR process
- [PR Preview Deployments](./PR-PREVIEW-DEPLOYMENTS.md) - Preview environment setup
- [Agent Instructions](../../AGENTS.md) - Cascade and Copilot agent guidelines (canonical)
- [Developer Guide](./developer-guide.md) - Setup and development instructions
- [SSI GraphQL Migration Analysis](./r7.9-graphql-migration-analysis.md) - Web scraping vs GraphQL audit
- [SSI Dual Approach](./ssi-dual-approach-graphql-webscraping.md) - Original GraphQL/scraping architecture
- [Architecture Review](./architecture-review.md) - Architecture review and roadmap

---

## Conclusion

Following these modularity guidelines will:

✅ **Reduce merge conflicts** by isolating changes to specific files and sections
✅ **Enable parallel development** through clear ownership and coordination
✅ **Improve code quality** through better organization and smaller files
✅ **Speed up development** by reducing conflict resolution time
✅ **Make onboarding easier** through clear patterns and structure

**Remember:** The goal is not to avoid all conflicts, but to make them:
1. Less frequent
2. Easier to resolve when they occur
3. Less disruptive to development velocity

---

**Document Metadata:**
- Author: Claude (AI Agent)
- Version: 1.1
- Last Updated: 2026-03-05
- Review Status: Updated — reflects R80 platform additions
- Changes in v1.1: Updated conflict hotspot table (platform.js, TenantDetailPage.jsx added); client.js frozen policy; lib/services/ guidance; multi-API-client pattern; corrected stale doc references
