# Manual Port Implementation Plan

**Date**: 2026-02-10
**Target**: Port staffing features from `feature/sra-match-staffing` to `main`
**Method**: Option 3 - Manual Port (Safest Approach)
**Estimated Effort**: 3-4 hours + comprehensive testing

---

## Overview

This document provides step-by-step instructions for manually porting the SRA staffing system from `feature/sra-match-staffing` to `main`, avoiding the regressions identified in REBASE-ANALYSIS.md.

## Pre-requisites

Before starting, ensure:
- [ ] Local `main` branch is up-to-date
- [ ] `feature/sra-match-staffing` branch is available
- [ ] Clean working directory (`git status` shows no changes)
- [ ] Backend and frontend build tools are working
- [ ] Test suite is operational

---

## Phase 1: Preparation

### Step 1.1: Create New Branch from Main

```bash
git checkout main
git pull origin main
git checkout -b feature/sra-staffing-manual-port
```

### Step 1.2: Verify Main Branch State

Check that main has all critical features:
- [ ] `useRememberMe` hook exists at `scoring-ui/src/hooks/useRememberMe.js`
- [ ] Email tracking in `scoring-proxy/routes/management.js` (693 lines)
- [ ] `docs/SHOOTER-STATE-MANAGEMENT.md` exists
- [ ] `TEST-PLAN.md` exists

---

## Phase 2: Copy New Files

### Step 2.1: Copy Backend Staffing Files

From `feature/sra-match-staffing`, copy these NEW files:

```bash
# Staffing engine and configuration
mkdir -p scoring-proxy/lib/staffing
cp feature-branch/scoring-proxy/lib/staffing/config-loader.js scoring-proxy/lib/staffing/
cp feature-branch/scoring-proxy/lib/staffing/engine.js scoring-proxy/lib/staffing/
cp feature-branch/scoring-proxy/lib/staffing/notifier.js scoring-proxy/lib/staffing/
cp feature-branch/scoring-proxy/lib/staffing/role-assigner.js scoring-proxy/lib/staffing/
cp feature-branch/scoring-proxy/lib/staffing/squad-optimizer.js scoring-proxy/lib/staffing/

# Staffing API routes
cp feature-branch/scoring-proxy/routes/staffing.js scoring-proxy/routes/

# SRA training configuration
cp feature-branch/config/sra-training-config.yml config/
```

**Validation**: Verify files copied correctly
```bash
ls -la scoring-proxy/lib/staffing/
ls -la scoring-proxy/routes/staffing.js
ls -la config/sra-training-config.yml
```

### Step 2.2: Copy Frontend Staffing Files

```bash
# Staffing page components
cp feature-branch/scoring-ui/src/components/StaffingPage.jsx scoring-ui/src/components/
cp feature-branch/scoring-ui/src/components/StaffSignupPanel.jsx scoring-ui/src/components/
cp feature-branch/scoring-ui/src/components/StaffStatusBoard.jsx scoring-ui/src/components/

# Staffing API client
cp feature-branch/scoring-ui/src/staffing-api.js scoring-ui/src/
```

**Validation**: Verify files copied correctly
```bash
ls -la scoring-ui/src/components/Staff*.jsx
ls -la scoring-ui/src/staffing-api.js
```

### Step 2.3: Copy PowerShell Scripts

```bash
# SRA test match scripts
cp feature-branch/scripts-graphql/New-SRATestMatches.ps1 scripts-graphql/
cp feature-branch/scripts-graphql/Remove-SRATestMatches.ps1 scripts-graphql/

# Squad management module
mkdir -p scripts-graphql/lib
cp feature-branch/scripts-graphql/lib/SSI-WebSquad.psm1 scripts-graphql/lib/
```

### Step 2.4: Copy Documentation

```bash
# Staffing design document
cp feature-branch/docs/design/sra-staffing-design.md docs/design/

# SRA requirements
cp feature-branch/docs/requirements/sra-training-staffing-requirements.md docs/requirements/
```

### Step 2.5: Copy Windsurf Workflows

```bash
# SRA matches workflow
cp feature-branch/.windsurf/workflows/sra-matches.md .windsurf/workflows/
```

---

## Phase 3: Integration Points (Manual Edits)

### Step 3.1: Update `scoring-proxy/routes/auth.js`

**Add staffing scope** to the authentication system:

```javascript
// Around line 17-19 (after existing scopes)
const validScopes = ['scoring', 'manage', 'reporting', 'staffing']  // Add 'staffing'
const sessionScope = scope && validScopes.includes(scope) ? scope : 'scoring'

// Around line 21-24 (add staffing allowlist check)
// Staffing scope: cross-check email against instructor allowlist
if (sessionScope === 'staffing' && !isAdminEmail(email)) {
  return res.status(403).json({ error: 'Not authorized. You are not on the instructor list.' })
}
```

**Import required module** at the top:
```javascript
import { isAdminEmail } from '../lib/staffing/config-loader.js'
```

**Validation**:
- [ ] Build succeeds: `cd scoring-proxy && npm run build`
- [ ] Syntax is correct
- [ ] No existing scopes broken

### Step 3.2: Update `scoring-proxy/server.js`

**Add staffing router** to the server:

```javascript
// Around line 10-15 (imports section)
import { createStaffingRouter } from './routes/staffing.js'

// Around line 100-110 (after other routers)
const staffingRouter = createStaffingRouter({
  requireAuth,
  graphqlWithRefresh,
  getAdminSession,  // Note: currently unused but kept for future
})
app.use('/api/staffing', staffingRouter)
```

**Validation**:
- [ ] Server starts: `node server.js`
- [ ] No errors in console
- [ ] `/api/staffing/events` endpoint available (requires auth)

### Step 3.3: Update `scoring-proxy/lib/ssi-core/client.js`

**Add new SSI functions** at the end of the file:

Copy these functions from feature branch:
- `ssiRegisterToTrainerSquad` (lines ~897-1007)
- `ssiGetMatchGroupId` (lines ~673-692)
- `ssiAddToMatchManagement` (lines ~703-780)
- `ssiRemoveFromMatchManagement` (lines ~788-838)
- `ssiGetMatchOfficials` (if exists)

**Update exports** in `scoring-proxy/lib/ssi-core/index.js`:
```javascript
export {
  // ... existing exports
  ssiRegisterToTrainerSquad,
  ssiGetMatchGroupId,
  ssiAddToMatchManagement,
  ssiRemoveFromMatchManagement,
  ssiGetMatchOfficials,
} from './client.js'
```

**Validation**:
- [ ] No duplicate function definitions
- [ ] All exports are valid
- [ ] `scoring-proxy/lib/ssi-client.js` (barrel) still re-exports everything

### Step 3.4: Update `scoring-ui/src/main.jsx`

**Add staffing route**:

```javascript
// Around line 5-10 (imports)
import StaffingPage from './components/StaffingPage.jsx'

// Around line 15-20 (routes)
routes: [
  { path: '/', component: App },
  { path: '/manage', component: ManagePage },
  { path: '/report', component: ReportPage },
  { path: '/summary', component: SummaryReportPage },
  { path: '/staffing', component: StaffingPage },  // Add this
]
```

**Validation**:
- [ ] Build succeeds: `cd scoring-ui && npm run build`
- [ ] No import errors
- [ ] Route is accessible at `/#/staffing`

### Step 3.5: Update `scoring-ui/src/components/HomePage.jsx`

**Add staffing navigation link**:

```javascript
// Around line 50-70 (navigation section)
<div className="space-y-3">
  {/* ... existing links ... */}

  {/* Add Staffing Link */}
  <a
    href="#/staffing"
    className="block bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-6 py-4 text-center font-semibold transition-colors"
  >
    📋 Kouluttajien ilmoittautuminen
  </a>
</div>
```

**Validation**:
- [ ] Link appears on home page
- [ ] Click navigates to staffing page
- [ ] Styling matches other links

### Step 3.6: Update `scoring-ui/src/i18n.js`

**Add staffing translations**:

```javascript
// Around line 100+ (at the end)
staffing: {
  title: 'Kouluttajien ilmoittautuminen',
  loginPrompt: 'Kirjaudu sisään ilmoittautuaksesi kouluttajaksi',
  // ... add all staffing translations from feature branch
}
```

**Validation**:
- [ ] No syntax errors
- [ ] Translations are complete
- [ ] Finnish text is correct

### Step 3.7: Update `scoring-ui/src/api.js`

**Add staffing API functions**:

Copy from `feature-branch/scoring-ui/src/staffing-api.js` and integrate into `api.js`:

```javascript
// Staffing API endpoints
export async function getStaffingEvents() {
  const resp = await fetch('/api/staffing/events', {
    credentials: 'include',
  })
  return handleResponse(resp)
}

export async function staffSignup(eventId, role) {
  const resp = await fetch(`/api/staffing/events/${eventId}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ role }),
  })
  return handleResponse(resp)
}

export async function staffResign(eventId) {
  const resp = await fetch(`/api/staffing/events/${eventId}/signup`, {
    method: 'DELETE',
    credentials: 'include',
  })
  return handleResponse(resp)
}
```

**Validation**:
- [ ] No duplicate function names
- [ ] All functions use `handleResponse`
- [ ] Credentials included in all calls

### Step 3.8: Update `render.yaml`

**Add staffing cron job** (carefully - don't break existing config):

```yaml
# After web service definition
- type: cron
  name: sra-staffing-finalizer
  env: node
  plan: free
  repo: https://github.com/tohewi/tapahtumakalenteri-ssi-integrator
  branch: main
  buildCommand: cd scoring-proxy && npm install
  schedule: "0 6 * * *"  # Daily at 6 AM
  startCommand: node lib/staffing/cron.js
  envVars:
    - key: NODE_ENV
      value: production
```

**Note**: The cron job may not work yet due to missing implementations in `cron.js`. This is expected and will be fixed in Phase 4.

**Validation**:
- [ ] YAML syntax is valid: `yamllint render.yaml`
- [ ] Existing service config unchanged
- [ ] Cron job has correct path

---

## Phase 4: Fix Known Issues (From Copilot Review)

### Issue 4.1: Remove Unused AppHeader Import

**File**: `scoring-ui/src/components/StaffingPage.jsx`

```javascript
// Remove this import (unused)
- import AppHeader from './AppHeader.jsx'
```

### Issue 4.2: Remove or Use Computed Values

**File**: `scoring-ui/src/components/StaffingPage.jsx` (lines ~203-207)

Either remove these unused computations:
```javascript
// Remove if unused
- const specialsTaken = ...
- const maxVetajat = ...
- const vetajatSlots = ...
```

OR use them for UI logic:
```javascript
// Show slot availability
{vetajatSlots <= 0 && <p className="text-red-600">Ei vapaita paikkoja</p>}
```

### Issue 4.3: Remove Unused getAdminSession Parameter

**File**: `scoring-proxy/routes/staffing.js` (line 44)

```javascript
// Remove unused parameter
- export function createStaffingRouter({ requireAuth, graphqlWithRefresh, getAdminSession }) {
+ export function createStaffingRouter({ requireAuth, graphqlWithRefresh }) {
```

**Update call site** in `server.js`:
```javascript
- const staffingRouter = createStaffingRouter({ requireAuth, graphqlWithRefresh, getAdminSession })
+ const staffingRouter = createStaffingRouter({ requireAuth, graphqlWithRefresh })
```

### Issue 4.4: Fix or Remove getTrainingType Logic

**File**: `scoring-proxy/lib/staffing/config-loader.js` (lines 58-73)

The current logic is broken. Replace with:
```javascript
export function getTrainingType(nameOrKey) {
  const types = loadConfig().trainingTypes

  // Direct key match only
  if (types[nameOrKey]) {
    return { key: nameOrKey, config: types[nameOrKey] }
  }

  // Event name matching is handled in routes/staffing.js
  return null
}
```

### Issue 4.5: Fix Broken Imports in StaffStatusBoard

**File**: `scoring-ui/src/components/StaffStatusBoard.jsx`

Check if `staffFinalize` is imported but not exported:
```javascript
// Remove if staffFinalize doesn't exist in staffing-api.js
- import { staffFinalize } from '../staffing-api'
```

If finalize functionality is needed, implement it first in `api.js`.

### Issue 4.6: Fix Broken Imports in StaffSignupPanel

**File**: `scoring-ui/src/components/StaffSignupPanel.jsx`

Check if `staffCancelSignup` is used:
```javascript
// Replace with staffResign if that's the intent
- import { staffCancelSignup } from '../staffing-api'
+ import { staffResign } from '../api'
```

### Issue 4.7: Remove or Implement Missing Endpoints

**Missing endpoint**: `GET /api/staffing/events/:eventId`

Either:
- Remove calls to `fetchStaffingEvent()` in frontend, OR
- Implement the endpoint in `scoring-proxy/routes/staffing.js`

### Issue 4.8: Remove or Implement Cron Endpoint

**Missing endpoint**: `POST /api/staffing/finalize-due`

Either:
- Simplify `cron.js` to call `getEventsDueForFinalization` directly, OR
- Implement the endpoint with `X-Cron-Secret` authentication

### Issue 4.9: Fix Cron Implementation

**File**: `scoring-proxy/lib/staffing/cron.js`

The current implementation imports functions that don't exist. Fix:

```javascript
import { getAllEvents } from './engine.js'
import { ssiLogin } from '../ssi-core/client.js'

// Simple implementation: check events and log
async function runStaffingFinalization() {
  console.log('[cron] Checking for events due for finalization...')

  // For now, just log
  const events = getAllEvents()
  console.log(`[cron] Found ${events.length} events in system`)

  // TODO: Implement finalization logic when requirements are clear
}

runStaffingFinalization()
  .then(() => {
    console.log('[cron] Staffing finalization complete')
    process.exit(0)
  })
  .catch(err => {
    console.error('[cron] Staffing finalization failed:', err)
    process.exit(1)
  })
```

---

## Phase 5: Testing

### Step 5.1: Backend Tests

```bash
cd scoring-proxy

# Run existing tests (should still pass)
npm test

# Manually test staffing endpoints (requires auth)
# 1. Login with instructor credentials
# 2. GET /api/staffing/events
# 3. POST /api/staffing/events/:id/signup
# 4. DELETE /api/staffing/events/:id/signup
```

### Step 5.2: Frontend Tests

```bash
cd scoring-ui

# Build (should succeed)
npm run build

# Check for warnings/errors
npm run lint  # If available
```

### Step 5.3: Integration Tests

Manual testing checklist:

- [ ] **Login Flow**
  - Login with non-instructor email → should fail with 403
  - Login with instructor email → should succeed
  - Remember me works for staffing scope

- [ ] **Staffing Page**
  - Page loads without errors
  - Events list displays correctly
  - Signup button works
  - Resign button works
  - Role selection works

- [ ] **SSI Integration**
  - Trainer squad registration works
  - Management group addition works
  - Role assignment works (Lead Instructor → MD, Equipment Manager → QM)
  - Resignation removes from SSI correctly

- [ ] **Existing Features** (Regression Testing)
  - Scoring app still works
  - Management console still works
  - Report pages still work
  - Remember me works for all scopes
  - Email tracking works in management

---

## Phase 6: Documentation Updates

### Step 6.1: Update README

Add staffing feature to main README.md:

```markdown
## Features

- **Scoring App** - Real-time match scoring
- **Management Console** - Shooter and squad management
- **Reporting** - Match results and summaries
- **Staffing System** - SRA training staff registration (NEW)
```

### Step 6.2: Update API Documentation

Add staffing endpoints to developer documentation.

### Step 6.3: Update Changelog

Add entry to `docs/RELEASE-NOTES.md`:

```markdown
## [Unreleased]

### Added
- SRA training staffing system with SSI integration
- Staffing page for instructor registration
- Trainer squad automatic registration
- Match management group assignment with roles
- Instructor allowlist gating
- Staffing cron job (skeleton for future finalization)
```

---

## Phase 7: Commit and Push

### Step 7.1: Review Changes

```bash
git status
git diff  # Review all changes
```

### Step 7.2: Commit in Logical Groups

```bash
# Commit 1: New staffing files
git add scoring-proxy/lib/staffing/
git add scoring-proxy/routes/staffing.js
git add config/sra-training-config.yml
git commit -m "feat(staffing): add backend staffing engine and config"

# Commit 2: Frontend staffing components
git add scoring-ui/src/components/Staff*.jsx
git add scoring-ui/src/staffing-api.js
git commit -m "feat(staffing): add staffing UI components"

# Commit 3: Integration points
git add scoring-proxy/routes/auth.js
git add scoring-proxy/server.js
git add scoring-ui/src/main.jsx
git add scoring-ui/src/components/HomePage.jsx
git add scoring-ui/src/api.js
git add scoring-ui/src/i18n.js
git commit -m "feat(staffing): integrate staffing into main app"

# Commit 4: SSI functions
git add scoring-proxy/lib/ssi-core/client.js
git add scoring-proxy/lib/ssi-core/index.js
git commit -m "feat(staffing): add SSI staffing functions (trainer squad, management group)"

# Commit 5: Scripts and tooling
git add scripts-graphql/New-SRATestMatches.ps1
git add scripts-graphql/Remove-SRATestMatches.ps1
git add scripts-graphql/lib/SSI-WebSquad.psm1
git commit -m "feat(staffing): add SRA test match scripts"

# Commit 6: Documentation
git add docs/design/sra-staffing-design.md
git add docs/requirements/sra-training-staffing-requirements.md
git add .windsurf/workflows/sra-matches.md
git add docs/RELEASE-NOTES.md
git add README.md
git commit -m "docs: add staffing documentation and update changelog"

# Commit 7: Configuration and deployment
git add render.yaml
git commit -m "chore: add staffing cron job to Render config"

# Commit 8: Bug fixes from review
git add [files with fixes]
git commit -m "fix(staffing): address code review issues

- Remove unused imports
- Fix broken function references
- Remove unused parameters
- Fix config-loader logic
- Simplify cron implementation"
```

### Step 7.3: Push and Create PR

```bash
git push origin feature/sra-staffing-manual-port

# Create PR via GitHub CLI or web interface
gh pr create --base main --head feature/sra-staffing-manual-port \
  --title "feat: SRA staffing system with SSI integration (manual port)" \
  --body "Manual port of staffing features from feature/sra-match-staffing to preserve main branch improvements.

## Changes
- SRA training staffing system
- Trainer squad automatic registration
- Match management group with roles
- Instructor allowlist gating
- PowerShell test scripts
- Staffing cron job skeleton

## Testing
- [x] Backend builds successfully
- [x] Frontend builds successfully
- [x] Staffing login works
- [x] Signup/resign operations work
- [x] SSI integration verified
- [x] Existing features not broken (regression test)

## Preserves Main Branch Features
- ✅ useRememberMe hook
- ✅ Email tracking
- ✅ Shooter state management
- ✅ All documentation

## Known Limitations
- Cron finalization logic not fully implemented (skeleton only)
- Some unused code from review will be cleaned up in follow-up

Closes #70"
```

---

## Rollback Plan

If issues arise after merge:

```bash
# Create rollback branch from last good commit
git checkout main
git log --oneline  # Find commit before staffing merge
git checkout -b rollback-staffing <commit-before-staffing>

# Cherry-pick only safe commits
git cherry-pick <safe-commit-1>
git cherry-pick <safe-commit-2>

# Force push to main (use with extreme caution)
git push origin rollback-staffing:main --force
```

**Important**: Only use rollback if critical production issues occur.

---

## Post-Merge Tasks

After successful merge to main:

### 1. Deploy to Production
- [ ] Verify Render auto-deploy triggered
- [ ] Monitor logs for errors
- [ ] Test staffing feature in production
- [ ] Verify existing features still work

### 2. Update Documentation
- [ ] Update PR #70 with link to new PR
- [ ] Update REBASE-ANALYSIS.md with "RESOLVED" status
- [ ] Archive old feature branch

### 3. Follow-up Work (See "Immediate Development Needs")
- [ ] Implement cron finalization logic
- [ ] Add automated tests for staffing
- [ ] Add missing API endpoints if needed
- [ ] Clean up unused code

---

## Troubleshooting

### Build Fails

**Symptom**: `npm run build` fails
**Solution**:
- Check for missing imports
- Verify all files copied correctly
- Check for typos in integration edits

### Tests Fail

**Symptom**: `npm test` fails
**Solution**:
- Run tests before manual port to establish baseline
- Fix only tests related to your changes
- Don't fix unrelated failing tests

### Staffing Page Crashes

**Symptom**: Navigating to `/#/staffing` causes error
**Solution**:
- Check browser console for error details
- Verify all imports exist
- Check API endpoints are available
- Verify authentication scope is correct

### SSI Integration Fails

**Symptom**: Signup/resign operations fail
**Solution**:
- Check SSI credentials are valid
- Verify session cookies are present
- Check debug logs in `ssi-core/client.js`
- Verify trainer squad name matches config

### Existing Features Broken

**Symptom**: Scoring/management/report pages broken
**Solution**:
- **CRITICAL**: This should NOT happen
- Review all edits to shared files carefully
- Check for missing imports or exports
- Verify no files were accidentally deleted
- Consider rollback if issue is severe

---

## Success Criteria

The manual port is successful when:

✅ All staffing files copied and integrated
✅ Backend builds and starts without errors
✅ Frontend builds without errors
✅ Staffing page loads and works
✅ SSI integration functions correctly
✅ Existing features still work (NO REGRESSIONS)
✅ All code review issues addressed
✅ Tests pass (or new tests added if needed)
✅ Documentation updated
✅ PR created and ready for review

---

## Estimated Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Phase 1-2 | 30 min | Preparation and file copying |
| Phase 3 | 60 min | Integration edits |
| Phase 4 | 30 min | Bug fixes |
| Phase 5 | 60 min | Testing |
| Phase 6 | 15 min | Documentation |
| Phase 7 | 15 min | Commit and push |
| **Total** | **3.5 hours** | Plus time for fixing any issues found |

Add 30-60 minutes buffer for unexpected issues.

---

## References

- **REBASE-ANALYSIS.md** - Problem analysis and strategy
- **docs/design/ssi-dual-approach-graphql-webscraping.md** - SSI integration patterns
- **docs/design/sra-staffing-design.md** - Staffing feature design (after port)
- **.github/agents/ssi-api-limitations.md** - SSI API constraints
- **Code review comments** - Issues to fix (in REBASE-ANALYSIS.md)

---

**Last Updated**: 2026-02-10
**Status**: Ready for execution
**Next Step**: Execute Phase 1 when main branch is available
