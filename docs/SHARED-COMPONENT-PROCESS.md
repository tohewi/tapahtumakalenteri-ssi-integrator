# Shared Component Modification Process

**Quick Reference Guide for Modifying Core Shared Components**

---

## Core Shared Components

These files are used by multiple features and require careful coordination:

| Component | Lines | Usage | Risk Level |
|-----------|-------|-------|------------|
| `scoring-proxy/lib/ssi-core/client.js` | 1,060 | All backend routes | 🔴 CRITICAL |
| `scoring-ui/src/App.jsx` | 711 | Central state management | 🔴 HIGH |
| `scoring-ui/src/components/ManagePage.jsx` | 809 | Admin features | 🔴 HIGH |
| `scoring-proxy/routes/management.js` | 693 | Admin endpoints | 🟡 MEDIUM |
| `scoring-ui/src/api.js` | 247 | All API calls | 🟡 MEDIUM |

---

## The 5-Step Process

### 1. Check Before You Start

**Before modifying a shared file, check for conflicts:**

```bash
# Check open PRs touching the same file
gh pr list --search "path:scoring-proxy/lib/ssi-core/client.js"

# Check recent commits to the file
git log --oneline --since="1 week ago" -- scoring-proxy/lib/ssi-core/client.js
```

**If another PR is modifying the same file:**
- Comment on their PR to coordinate
- Consider pairing on the changes
- Decide which PR should merge first

### 2. Signal Your Work

**Open a draft PR immediately:**

```bash
# Create your feature branch
git checkout -b feature/my-feature

# Make a small initial commit
git commit --allow-empty -m "WIP: Add feature X"
git push origin feature/my-feature

# Open draft PR on GitHub
gh pr create --draft --title "[WIP] Add feature X" --body "Modifying shared files: client.js, api.js"
```

**In the PR description, list:**
- Which shared files you're modifying
- Which sections/functions you're adding/changing
- Expected completion date

### 3. Minimize Your Changes

**Follow these rules when modifying shared files:**

#### ✅ DO: Add, Don't Modify

```javascript
// Good: Add new function at end of section
export async function ssiFindAndApproveCupParticipant(...) {
  // Existing function - DON'T TOUCH
}

// ADD NEW FUNCTION HERE (at end)
export async function ssiNewFeatureFunction(...) {
  // Your new code
}
```

#### ❌ DON'T: Modify Existing Functions

```javascript
// Bad: Modifying existing function
export async function ssiFindAndApproveCupParticipant(cookies, cupId, firstName, lastName, newParam) {
  // Modified signature and body - HIGH CONFLICT RISK
}
```

#### ✅ DO: Append to Sections

```javascript
// ============================================================
// SECTION: Participant management
// ============================================================

// Existing code...

// ADD NEW CODE HERE (at end of section)
```

#### ❌ DON'T: Insert in Middle

```javascript
// ============================================================
// SECTION: Participant management
// ============================================================

function existing1() { }

function myNewFunction() { } // DON'T insert here

function existing2() { }
```

#### ✅ DO: Extract Complex Logic

```javascript
// Good: Extract helper to minimize changes to shared function
export async function ssiExistingFunction(...) {
  // Original code unchanged
  const result = await myNewHelper(...) // Just one line added
  return result
}

// New helper function at end
async function myNewHelper(...) {
  // All your new logic here
}
```

### 4. Sync Frequently

**Keep your branch up to date to catch conflicts early:**

```bash
# Daily sync (choose rebase OR merge, be consistent)
git fetch origin main

# Option A: Rebase (cleaner history)
git rebase origin/main

# Option B: Merge (safer for shared branches)
git merge origin/main

# Push (use --force-with-lease after rebase)
git push origin feature/my-feature --force-with-lease
```

**Resolve conflicts immediately:**
- Don't let conflicts pile up
- Test thoroughly after resolving
- Ask for help if unsure

### 5. Merge Promptly

**When your PR is approved:**

1. **Mark as ready for review:**
   ```bash
   gh pr ready
   ```

2. **Request priority if blocking others:**
   - Comment: "This PR is blocking work on feature Y, requesting priority review"

3. **Merge immediately after approval:**
   - Don't wait if others are blocked
   - Squash and merge to keep history clean

4. **Notify other developers:**
   - Comment on related PRs: "Just merged #123, you may need to rebase"

---

## Section Guidelines for Shared Files

### scoring-proxy/lib/ssi-core/client.js

**Sections (add to appropriate section):**

```javascript
// ============================================================
// GraphQL client setup and authentication
// ============================================================
// Functions: ssiGraphQL, ssiLogin, ssiRefreshJWT

// ============================================================
// Cup participant management
// ============================================================
// Functions: ssiFindAndApproveCupParticipant, ssiFindAndDeleteCupParticipant
// ADD NEW CUP PARTICIPANT FUNCTIONS HERE

// ============================================================
// Match participant management
// ============================================================
// Functions: ssiFindCompetitorInMatch, ssiSetParticipantSquad
// ADD NEW MATCH PARTICIPANT FUNCTIONS HERE

// ============================================================
// Scoring operations
// ============================================================
// Functions: ssiGetMatchDetails, ssiSubmitScore
// ADD NEW SCORING FUNCTIONS HERE

// ============================================================
// Search and add operations
// ============================================================
// Functions: ssiSearchAndAddParticipant
// ADD NEW SEARCH FUNCTIONS HERE

// ============================================================
// Bulk operations
// ============================================================
// ADD NEW BULK OPERATIONS HERE

// ============================================================
// Utility functions (internal helpers)
// ============================================================
// Helper functions used by multiple operations above
```

### scoring-ui/src/api.js

**Sections (add to appropriate section):**

```javascript
// ============================================================
// Authentication API
// ============================================================
// Functions: login, checkAuthStatus, logout

// ============================================================
// Scoring API
// ============================================================
// Functions: searchCups, getMatchDetails, submitScore
// ADD NEW SCORING API CALLS HERE

// ============================================================
// Management API
// ============================================================
// Functions: getCupOverview, getPendingShooters, approveShooter
// ADD NEW MANAGEMENT API CALLS HERE

// ============================================================
// Registration API
// ============================================================
// Functions: in register-api.js (separate file)

// ============================================================
// Reporting API
// ============================================================
// Functions: getMatchReport, getSummaryReport
// ADD NEW REPORTING API CALLS HERE
```

### scoring-proxy/routes/*.js

**All route files should follow this pattern:**

```javascript
// ============================================================
// GET endpoints (list/read operations)
// ============================================================
router.get('/resource', ...)
router.get('/resource/:id', ...)
// ADD NEW GET ENDPOINTS HERE

// ============================================================
// POST endpoints (create operations)
// ============================================================
router.post('/resource', ...)
// ADD NEW POST ENDPOINTS HERE

// ============================================================
// PUT/PATCH endpoints (update operations)
// ============================================================
router.put('/resource/:id', ...)
// ADD NEW PUT ENDPOINTS HERE

// ============================================================
// DELETE endpoints (delete operations)
// ============================================================
router.delete('/resource/:id', ...)
// ADD NEW DELETE ENDPOINTS HERE
```

---

## Conflict Resolution Cheat Sheet

### When You Have a Merge Conflict

```bash
# Update your branch
git fetch origin main
git merge origin/main

# Git will mark conflicts in files
# Look for conflict markers:
<<<<<<< HEAD
Your changes
=======
Their changes
>>>>>>> origin/main
```

### Common Conflict Scenarios

#### Scenario 1: Both Added Functions (Easy)

```javascript
<<<<<<< HEAD
export async function myNewFunction() {
  // Your code
}
=======
export async function theirNewFunction() {
  // Their code
}
>>>>>>> origin/main
```

**Resolution: Keep both**
```javascript
export async function myNewFunction() {
  // Your code
}

export async function theirNewFunction() {
  // Their code
}
```

#### Scenario 2: Modified Same Function (Hard)

```javascript
<<<<<<< HEAD
export async function existingFunction(param1, param2, myNewParam) {
  // Your modified version
}
=======
export async function existingFunction(param1, param2, theirNewParam) {
  // Their modified version
}
>>>>>>> origin/main
```

**Resolution: Communicate**
1. Ask the other developer what their change does
2. Discuss how to integrate both changes
3. Test thoroughly after resolution

#### Scenario 3: Import Conflicts (Easy)

```javascript
<<<<<<< HEAD
import { functionA, myNewFunction } from './client.js'
=======
import { functionA, theirNewFunction } from './client.js'
>>>>>>> origin/main
```

**Resolution: Merge imports**
```javascript
import { functionA, myNewFunction, theirNewFunction } from './client.js'
```

---

## Quick Decision Tree

```
Need to modify a shared file?
│
├─ Is another PR already touching this file?
│  ├─ YES → Coordinate with that developer
│  └─ NO → Continue
│
├─ Can you add new code without modifying existing code?
│  ├─ YES → Great! Add at end of section
│  └─ NO → Consider extracting to new file/function
│
├─ Is your change >100 lines?
│  ├─ YES → Consider creating new module/component
│  └─ NO → Proceed with caution
│
└─ Open draft PR → Make changes → Sync daily → Merge promptly
```

---

## Examples

### Example 1: Adding New SSI Function

**Scenario:** Need to add bulk import functionality

```bash
# 1. Check for conflicts
gh pr list --search "path:scoring-proxy/lib/ssi-core/client.js"
# Result: No open PRs

# 2. Create draft PR
git checkout -b feature/bulk-import
git commit --allow-empty -m "WIP: Add bulk import"
git push origin feature/bulk-import
gh pr create --draft --title "[WIP] Bulk import feature"

# 3. Add code at end of "Bulk operations" section
# (Edit client.js)

# 4. Commit and push
git add scoring-proxy/lib/ssi-core/client.js
git commit -m "Add ssiBulkImportShooters function"
git push origin feature/bulk-import

# 5. Daily sync
git fetch origin main
git rebase origin/main
git push origin feature/bulk-import --force-with-lease

# 6. Mark ready and merge
gh pr ready
# (Get approval)
gh pr merge --squash
```

### Example 2: Handling Conflict

**Scenario:** Someone else added a function in the same section

```bash
# After rebase, conflict occurs
git rebase origin/main
# CONFLICT in client.js

# Open client.js, see:
<<<<<<< HEAD
export async function myNewFunction() {
  // ...
}
=======
export async function theirFunction() {
  // ...
}
>>>>>>> origin/main

# Resolution: Keep both, stage, continue
# (Edit to include both functions)
git add client.js
git rebase --continue
git push origin feature/bulk-import --force-with-lease
```

---

## Getting Help

**If you're stuck:**

1. **Ask in PR comments** - Tag relevant developers
2. **Check similar PRs** - See how others handled it
3. **Pair program** - Screen share to resolve together
4. **Escalate early** - Don't struggle alone for hours

**Contact points:**
- PR review requests
- Team chat
- Project maintainers

---

## Checklist

Use this for every shared component modification:

- [ ] Checked for open PRs touching the same file
- [ ] Opened draft PR early
- [ ] Added code at end of appropriate section
- [ ] Did not modify existing function signatures
- [ ] Added clear section comments
- [ ] Added JSDoc for new functions
- [ ] Synced with main daily
- [ ] Tested in preview environment
- [ ] Resolved conflicts promptly
- [ ] Marked PR ready when complete
- [ ] Merged promptly after approval
- [ ] Notified dependent developers

---

**Document Metadata:**
- Version: 1.0
- Last Updated: 2026-02-11
- Related: [DEVELOPMENT-MODULARITY-GUIDELINES.md](./DEVELOPMENT-MODULARITY-GUIDELINES.md)
