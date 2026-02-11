# Development Modularity Guidelines - Agent Instructions

**Critical Information for AI Agents Working on This Codebase**

## Overview

This repository has established **modularity guidelines** to minimize merge conflicts when multiple feature branches are being developed in parallel. As a coding agent, you **MUST** follow these guidelines when modifying shared components.

## Essential Reading

Before modifying any shared files, read these documents:

1. **Quick Reference:** `docs/SHARED-COMPONENT-PROCESS.md` (5-step process)
2. **Full Guidelines:** `docs/DEVELOPMENT-MODULARITY-GUIDELINES.md` (comprehensive guide)

These documents are located in the `docs/` directory at the repository root.

## Critical Shared Files

These files have **HIGH CONFLICT RISK** and require extra caution:

| File | Lines | Risk | Why |
|------|-------|------|-----|
| `scoring-proxy/lib/ssi-core/client.js` | 1,060 | 🔴 CRITICAL | Core SSI integration, used by all backend routes |
| `scoring-ui/src/App.jsx` | 711 | 🔴 HIGH | Central state management for entire UI |
| `scoring-ui/src/components/ManagePage.jsx` | 809 | 🔴 HIGH | Multiple admin features in one component |
| `scoring-proxy/routes/management.js` | 693 | 🟡 MEDIUM | Multiple admin endpoints |
| `scoring-ui/src/api.js` | 247 | 🟡 MEDIUM | All frontend API client methods |

## The 5-Step Process (MANDATORY)

When you need to modify any of the above files, follow these steps:

### Step 1: Check for Conflicts

```bash
# Check if other PRs are modifying the same file
gh pr list --search "path:scoring-proxy/lib/ssi-core/client.js"
```

**Action:** If another PR is touching the same file:
- Comment on their PR to coordinate
- Consider pairing on the changes
- Decide which PR should merge first

### Step 2: Signal Your Work

**Action:** Open a draft PR immediately, even with just an empty commit:

```bash
git commit --allow-empty -m "WIP: Add feature X"
git push origin feature/my-feature
gh pr create --draft --title "[WIP] Add feature X" --body "Modifying shared files: client.js, api.js"
```

**Why:** This signals to other developers that you're working on these files.

### Step 3: Minimize Your Changes

**DO:** Add new code at the end of sections

```javascript
// ============================================================
// SECTION: Participant management
// ============================================================

// Existing functions...

export async function ssiFindAndApproveCupParticipant(...) {
  // Existing function - DON'T TOUCH
}

// ADD NEW FUNCTIONS HERE (at end of section)
export async function ssiNewFeatureFunction(...) {
  // Your new code
}
```

**DON'T:** Modify existing function signatures or insert code in the middle

```javascript
// ❌ BAD: Modifying existing function
export async function ssiFindAndApproveCupParticipant(cookies, cupId, firstName, lastName, newParam) {
  // Modified signature - HIGH CONFLICT RISK
}
```

**DO:** Extract complex logic to minimize changes

```javascript
// ✅ GOOD: Extract helper to keep changes minimal
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

### Step 4: Sync Frequently

**Action:** Rebase or merge from main daily:

```bash
git fetch origin main
git rebase origin/main  # Or: git merge origin/main
git push origin feature/my-feature --force-with-lease
```

**Why:** Catch conflicts early when they're easier to resolve.

### Step 5: Merge Promptly

**Action:** Once approved, merge immediately:

```bash
gh pr ready  # Remove draft status
# After approval:
gh pr merge --squash
```

**Why:** Don't block other developers who are waiting on your changes.

## Section Organization

Each shared file has clearly marked sections. **Always add new code at the end of the appropriate section.**

### scoring-proxy/lib/ssi-core/client.js Sections

```javascript
// ============================================================
// GraphQL client setup and authentication
// ============================================================
// ADD AUTH FUNCTIONS HERE

// ============================================================
// Cup participant management
// ============================================================
// ADD CUP FUNCTIONS HERE

// ============================================================
// Match participant management
// ============================================================
// ADD MATCH FUNCTIONS HERE

// ============================================================
// Scoring operations
// ============================================================
// ADD SCORING FUNCTIONS HERE

// ============================================================
// Search and add operations
// ============================================================
// ADD SEARCH FUNCTIONS HERE

// ============================================================
// Bulk operations
// ============================================================
// ADD BULK FUNCTIONS HERE

// ============================================================
// Utility functions (internal helpers)
// ============================================================
// ADD HELPER FUNCTIONS HERE
```

### scoring-ui/src/api.js Sections

```javascript
// ============================================================
// Authentication API
// ============================================================
// ADD AUTH API CALLS HERE

// ============================================================
// Scoring API
// ============================================================
// ADD SCORING API CALLS HERE

// ============================================================
// Management API
// ============================================================
// ADD MANAGEMENT API CALLS HERE

// ============================================================
// Reporting API
// ============================================================
// ADD REPORTING API CALLS HERE
```

## Code Organization Rules

### File Size Limits

| File Type | Target | Maximum | Action if Exceeded |
|-----------|--------|---------|-------------------|
| Route file | 200 lines | 400 lines | Split into multiple route files |
| Component | 150 lines | 300 lines | Extract sub-components |
| API client | 150 lines | 300 lines | Split by feature domain |
| SSI client function | 50 lines | 100 lines | Extract helper functions |

### Naming Conventions

**Backend (SSI client):**
- Pattern: `ssi[Action][Entity]`
- Examples: `ssiFindAndApproveCupParticipant`, `ssiDeleteMatchParticipant`, `ssiUpdateSquadAssignment`

**Frontend (API client):**
- Pattern: `[action][Entity]`
- Examples: `getCupOverview`, `approveShooter`, `assignSquad`

### Documentation Requirements

**All new functions must have JSDoc comments:**

```javascript
/**
 * Finds and approves a pending cup participant by name
 * @param {Object} cookies - SSI session cookies
 * @param {string} cupId - Cup event ID
 * @param {string} firstName - Participant first name
 * @param {string} lastName - Participant last name
 * @param {string} [email] - Optional email for logging
 * @param {string} [participantId] - Optional GraphQL participant ID
 * @returns {Promise<Object>} Result with success status
 */
export async function ssiFindAndApproveCupParticipant(cookies, cupId, firstName, lastName, email = null, participantId = null) {
  // Implementation
}
```

## When to Extract Components

**Extract when:**
- Component exceeds 300 lines
- Component has multiple distinct features
- Multiple developers need to work on different parts

**Example: ManagePage.jsx**

Current structure (809 lines):
```
ManagePage.jsx (all features)
```

Recommended structure:
```javascript
// ManagePage.jsx (main orchestrator, ~150 lines)
import ManageCupOverview from './manage/ManageCupOverview.jsx'
import ManagePendingShooters from './manage/ManagePendingShooters.jsx'
import ManageSquadAssignment from './manage/ManageSquadAssignment.jsx'

export default function ManagePage() {
  // Orchestration logic only
  return (
    <>
      <ManageCupOverview onCupSelect={setSelectedCup} />
      <ManagePendingShooters cupId={selectedCup?.id} />
      <ManageSquadAssignment cupId={selectedCup?.id} />
    </>
  )
}
```

## Conflict Resolution

### Common Scenarios

**Scenario 1: Both Added Functions**

```javascript
<<<<<<< HEAD
export async function myNewFunction() { }
=======
export async function theirNewFunction() { }
>>>>>>> origin/main
```

**Resolution:** Keep both (easy!)

```javascript
export async function myNewFunction() { }
export async function theirNewFunction() { }
```

**Scenario 2: Modified Same Function**

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

**Resolution:** Coordinate with the other developer. Ask:
- What does their change do?
- How can we integrate both changes?
- Test thoroughly after resolution!

## Checklist for Every Shared File Modification

Use this checklist:

- [ ] Checked for open PRs touching the same file (`gh pr list --search "path:file.js"`)
- [ ] Opened draft PR early
- [ ] Added code at end of appropriate section
- [ ] Did not modify existing function signatures
- [ ] Used clear section comments
- [ ] Added JSDoc comments for new functions
- [ ] Extracted helpers for complex logic
- [ ] Synced with main daily
- [ ] Tested in preview environment
- [ ] Resolved conflicts promptly
- [ ] Marked PR ready when complete
- [ ] Merged promptly after approval

## Integration with Other Guidelines

This document works together with:

- **SSI API Limitations:** `.github/agents/ssi-api-limitations.md` - What works/doesn't work in SSI GraphQL
- **Main Copilot Instructions:** `.github/copilot-instructions.md` - General project guidelines
- **Branching Strategy:** `docs/BRANCHING-STRATEGY.md` - Git workflow and PR process
- **AI Agent Guidelines:** `docs/ai-agent-guidelines.md` - Token optimization for AI development

## Quick Decision Tree

```
Need to modify a shared file?
│
├─ Is it in the high-risk list above?
│  ├─ YES → Follow all 5 steps strictly
│  └─ NO → Still follow best practices (add at end, etc.)
│
├─ Check for conflicting PRs
│  ├─ FOUND → Coordinate before proceeding
│  └─ NONE → Continue
│
├─ Can you add without modifying existing code?
│  ├─ YES → Add at end of section
│  └─ NO → Extract to helper function or new file
│
└─ Open draft PR → Make changes → Sync daily → Merge promptly
```

## Measuring Success

Track these metrics to ensure guidelines are working:

- **Merge conflict rate:** Should be < 10%
- **Average PR size:** Should be < 500 lines
- **Time to merge:** Should be < 3 days
- **Rebase frequency:** Should be < 2 times per PR

## Summary for Quick Reference

**DO:**
- ✅ Check for conflicting PRs before starting
- ✅ Open draft PR early
- ✅ Add code at end of sections
- ✅ Extract helpers to minimize changes
- ✅ Sync with main daily
- ✅ Merge promptly after approval

**DON'T:**
- ❌ Modify existing function signatures
- ❌ Insert code in middle of sections
- ❌ Work on shared files without coordination
- ❌ Let PRs sit after approval
- ❌ Skip the process thinking "it's just a small change"

## Last Updated

- **Date:** 2026-02-11
- **Related Documents:**
  - `docs/DEVELOPMENT-MODULARITY-GUIDELINES.md`
  - `docs/SHARED-COMPONENT-PROCESS.md`
- **Next Review:** When modularity metrics improve or team grows

---

**Remember:** These guidelines exist to help the team work in parallel efficiently. Following them saves everyone time by preventing merge conflicts and reducing coordination overhead.
