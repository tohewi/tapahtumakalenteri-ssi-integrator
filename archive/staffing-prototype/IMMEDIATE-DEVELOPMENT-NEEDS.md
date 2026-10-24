# Immediate Development Needs

**Date**: 2026-02-10
**Context**: Post-manual port of SRA staffing system
**Priority**: High to Critical

---

## Critical Needs (Must Do Before Production)

### 1. Implement Missing Backend Functions (P0 - CRITICAL)

**File**: `scoring-proxy/lib/staffing/engine.js`

**Missing exports**:
```javascript
// Currently missing - needed by cron.js
export function getEventsDueForFinalization() {
  // Logic to find events that need finalization
  // Check training date + finalization window
  // Return array of eventIds
}

export function finalizeEvent(eventId) {
  // Logic to finalize event staffing
  // Lock registrations
  // Send notifications
  // Mark event as finalized
}
```

**Impact if not implemented**: Cron job will crash on startup

**Estimated effort**: 2-3 hours

---

### 2. Fix Broken Frontend Imports (P0 - CRITICAL)

**Files affected**:
- `scoring-ui/src/components/StaffStatusBoard.jsx`
- `scoring-ui/src/components/StaffSignupPanel.jsx`

**Issues**:
```javascript
// StaffStatusBoard.jsx - staffFinalize not exported
- import { staffFinalize } from '../staffing-api'
+ // Remove or implement staffFinalize in api.js

// StaffSignupPanel.jsx - staffCancelSignup not exported
- import { staffCancelSignup } from '../staffing-api'
+ import { staffResign } from '../api'
```

**Impact if not fixed**: Components will fail to render, app crashes

**Estimated effort**: 15 minutes

---

### 3. Implement Missing API Endpoint (P0 - CRITICAL)

**Endpoint**: `GET /api/staffing/events/:eventId`

**Current status**: Called by frontend but doesn't exist

**Options**:
- **A**: Remove frontend calls (if not actually needed)
- **B**: Implement endpoint in `scoring-proxy/routes/staffing.js`

```javascript
// Option B: Implement endpoint
router.get('/events/:id', requireAuth('staffing'), async (req, res) => {
  try {
    const eventId = req.params.id
    const event = getEventStatus(eventId)

    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    res.json(event)
  } catch (err) {
    console.error('Failed to fetch staffing event:', err.message)
    res.status(500).json({ error: err.message })
  }
})
```

**Impact if not fixed**: 404 errors in frontend, poor UX

**Estimated effort**: 30 minutes

---

### 4. Fix Config Loader Logic (P1 - HIGH)

**File**: `scoring-proxy/lib/staffing/config-loader.js` (lines 58-73)

**Current issue**: `getTrainingType()` has broken event-name matching

**Fix**:
```javascript
export function getTrainingType(nameOrKey) {
  const types = loadConfig().trainingTypes

  // Direct key match only
  if (types[nameOrKey]) {
    return { key: nameOrKey, config: types[nameOrKey] }
  }

  // Event name matching moved to routes/staffing.js
  return null
}
```

**Impact if not fixed**: Training type detection may fail

**Estimated effort**: 15 minutes

---

### 5. Remove Unused Code (P1 - HIGH)

**Files affected**:
- `scoring-ui/src/components/StaffingPage.jsx` (unused imports, computed values)
- `scoring-proxy/routes/staffing.js` (unused `getAdminSession` parameter)

**Cleanup**:
```javascript
// StaffingPage.jsx
- import AppHeader from './AppHeader.jsx'  // Remove unused
- const specialsTaken = ...  // Remove if unused
- const maxVetajat = ...    // Remove if unused
- const vetajatSlots = ...  // Remove if unused

// staffing.js
- export function createStaffingRouter({ requireAuth, graphqlWithRefresh, getAdminSession }) {
+ export function createStaffingRouter({ requireAuth, graphqlWithRefresh }) {
```

**Impact if not fixed**: Code clutter, confusion, linter warnings

**Estimated effort**: 30 minutes

---

## High Priority (Should Do Soon)

### 6. Add Automated Tests (P1 - HIGH)

**Current status**: No tests for staffing features

**Tests needed**:

```javascript
// scoring-proxy/test/staffing.test.js
describe('Staffing API', () => {
  it('should require authentication', async () => { ... })
  it('should check instructor allowlist', async () => { ... })
  it('should list training events', async () => { ... })
  it('should register to trainer squad', async () => { ... })
  it('should add to management group', async () => { ... })
  it('should handle resignations', async () => { ... })
})

// scoring-proxy/test/staffing-engine.test.js
describe('Staffing Engine', () => {
  it('should enforce max instructor limits', async () => { ... })
  it('should track event status', async () => { ... })
  it('should identify events due for finalization', async () => { ... })
})
```

**Impact if not done**: Regressions not caught, hard to maintain

**Estimated effort**: 4-6 hours

---

### 7. Implement Cron Finalization Logic (P1 - HIGH)

**File**: `scoring-proxy/lib/staffing/cron.js`

**Current status**: Skeleton only, imports broken functions

**Requirements**:
- Find events X days before training date
- Send reminder notifications to registered staff
- Lock registrations after deadline
- Send final staff list to organizers

**Implementation needed**:
```javascript
import { getAllEvents } from './engine.js'
import { sendReminderEmail, sendFinalListEmail } from './notifier.js'

async function runFinalization() {
  const now = new Date()
  const events = getAllEvents()

  for (const event of events) {
    const daysUntil = daysBetween(now, event.eventDate)

    // 7 days before: reminder
    if (daysUntil === 7 && !event.reminderSent) {
      await sendReminderEmail(event)
      markReminderSent(event.eventId)
    }

    // 3 days before: lock and finalize
    if (daysUntil === 3 && !event.finalized) {
      await finalizeEvent(event.eventId)
      await sendFinalListEmail(event)
    }
  }
}
```

**Impact if not done**: Manual work required, poor UX

**Estimated effort**: 3-4 hours

---

### 8. Add Finalization API Endpoint (P2 - MEDIUM)

**Endpoint**: `POST /api/staffing/finalize-due`

**Current status**: Called by cron but doesn't exist

**Options**:
- **A**: Have cron call functions directly (simpler)
- **B**: Implement endpoint with secret auth

```javascript
// Option B: API endpoint
router.post('/finalize-due', async (req, res) => {
  // Check cron secret
  const secret = req.headers['x-cron-secret']
  if (secret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const events = getEventsDueForFinalization()
    const results = []

    for (const eventId of events) {
      await finalizeEvent(eventId)
      results.push({ eventId, finalized: true })
    }

    res.json({ success: true, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

**Impact if not done**: Cron job fails if calling via HTTP

**Estimated effort**: 1 hour

---

### 9. Improve Error Handling (P2 - MEDIUM)

**Files affected**: All staffing files

**Improvements needed**:
- Better error messages for users
- Logging for debugging
- Graceful degradation when SSI is down
- Retry logic for transient failures

**Example**:
```javascript
// Current
try {
  await ssiRegisterToTrainerSquad(...)
} catch (err) {
  res.status(500).json({ error: err.message })
}

// Better
try {
  await ssiRegisterToTrainerSquad(...)
} catch (err) {
  console.error('[staffing] Trainer squad registration failed:', err)

  if (err.message.includes('not found')) {
    return res.status(404).json({
      error: 'Käyttäjää ei löytynyt SSI:stä',
      details: 'Tarkista että SSI-tilisi on aktiivinen'
    })
  }

  res.status(500).json({
    error: 'Ilmoittautuminen epäonnistui',
    details: 'Yritä myöhemmin uudelleen tai ota yhteyttä järjestelmänvalvojaan'
  })
}
```

**Impact if not done**: Poor user experience, hard to debug

**Estimated effort**: 2-3 hours

---

### 10. Add Loading States and UI Feedback (P2 - MEDIUM)

**File**: `scoring-ui/src/components/StaffingPage.jsx`

**Improvements needed**:
- Show loading spinner during operations
- Show success/error messages
- Disable buttons during operations
- Show current role clearly

**Example**:
```javascript
const [loading, setLoading] = useState(false)
const [message, setMessage] = useState(null)

const handleSignup = async (role) => {
  setLoading(true)
  setMessage(null)

  try {
    await staffSignup(eventId, role)
    setMessage({ type: 'success', text: 'Ilmoittautuminen onnistui!' })
    // Refresh events
  } catch (err) {
    setMessage({ type: 'error', text: err.message })
  } finally {
    setLoading(false)
  }
}
```

**Impact if not done**: Confusing UX, users don't know if action succeeded

**Estimated effort**: 2 hours

---

## Medium Priority (Nice to Have)

### 11. Add Email Notifications (P2 - MEDIUM)

**File**: `scoring-proxy/lib/staffing/notifier.js`

**Current status**: Placeholder implementation

**Notifications needed**:
- Welcome email on signup
- Reminder email 7 days before
- Final staff list 3 days before
- Cancellation confirmation on resign

**Integration**: Use existing Resend API setup

**Estimated effort**: 3-4 hours

---

### 12. Add Admin Dashboard (P3 - LOW)

**New page**: `scoring-ui/src/components/StaffingAdminPage.jsx`

**Features needed**:
- View all events and their staff
- Override registrations
- Send manual notifications
- View statistics

**Estimated effort**: 6-8 hours

---

### 13. Improve Slot Calculation Logic (P3 - LOW)

**File**: `scoring-proxy/lib/staffing/squad-optimizer.js`

**Current status**: Basic implementation

**Improvements needed**:
- Account for "special" instructors (vetajat)
- Handle overbooking gracefully
- Suggest alternative events when full

**Estimated effort**: 2-3 hours

---

### 14. Add Audit Logging (P3 - LOW)

**New file**: `scoring-proxy/lib/staffing/audit-log.js`

**Track**:
- Who registered/resigned when
- Admin overrides
- Email sends
- Finalization events

**Storage**: Database or log file

**Estimated effort**: 2-3 hours

---

### 15. Internationalization (P3 - LOW)

**File**: `scoring-ui/src/i18n.js`

**Current status**: Finnish only

**Add**: English translations for all staffing strings

**Estimated effort**: 1-2 hours

---

## Technical Debt

### 16. Consolidate staffing-api.js into api.js (P3 - LOW)

**Current**: Staffing API functions in separate file
**Better**: All API functions in one place

**Reason**: Consistency, easier to maintain

**Estimated effort**: 30 minutes

---

### 17. Extract Common Patterns (P3 - LOW)

**Patterns to extract**:
- Role mapping (SSI role codes + officials)
- Training type detection
- Slot availability calculation

**Benefit**: Reusability, testability

**Estimated effort**: 2 hours

---

### 18. Add TypeScript Type Definitions (P3 - LOW)

**Files**: All staffing files

**Add JSDoc or TypeScript**:
```javascript
/**
 * @typedef {Object} StaffingEvent
 * @property {string} eventId - SSI event ID
 * @property {string} eventName - Event name
 * @property {string} trainingType - "oldies" or "newbie"
 * @property {Date} eventDate - Training date
 * @property {number} shooterCount - Number of registered shooters
 * @property {boolean} finalized - Whether staffing is finalized
 */
```

**Benefit**: Better IDE support, fewer bugs

**Estimated effort**: 2-3 hours

---

## Summary by Priority

| Priority | Tasks | Total Effort |
|----------|-------|--------------|
| **P0 - Critical** | 5 tasks | ~4.5 hours |
| **P1 - High** | 5 tasks | ~17 hours |
| **P2 - Medium** | 5 tasks | ~11 hours |
| **P3 - Low** | 8 tasks | ~16 hours |
| **TOTAL** | 23 tasks | **~48.5 hours** |

---

## Recommended Execution Order

### Sprint 1: Make it Work (Week 1)
1. Fix broken imports (P0, 15 min)
2. Implement missing functions (P0, 2-3 hours)
3. Implement missing endpoint (P0, 30 min)
4. Fix config loader (P1, 15 min)
5. Remove unused code (P1, 30 min)

**Goal**: Staffing feature functional and stable
**Effort**: ~4.5 hours

### Sprint 2: Make it Reliable (Week 2)
6. Add automated tests (P1, 4-6 hours)
7. Implement cron finalization (P1, 3-4 hours)
8. Add finalization endpoint (P2, 1 hour)
9. Improve error handling (P2, 2-3 hours)

**Goal**: Staffing feature robust and maintainable
**Effort**: ~12 hours

### Sprint 3: Make it Great (Week 3)
10. Add loading states (P2, 2 hours)
11. Add email notifications (P2, 3-4 hours)
12. Technical debt cleanup (P3, 2-3 hours)

**Goal**: Staffing feature polished and user-friendly
**Effort**: ~8 hours

### Sprint 4: Future Enhancements (Backlog)
13-18. Admin dashboard, internationalization, etc.

**Goal**: Advanced features as needed
**Effort**: ~24 hours (do as needed)

---

## Dependencies and Blockers

### External Dependencies
- **Resend API**: For email notifications (already set up)
- **SSI API**: For trainer squad and management group (working)
- **Render Cron**: For scheduled finalization (configured)

### Internal Dependencies
- **useRememberMe hook**: Required, present in main ✅
- **Email tracking**: Required, present in main ✅
- **Session management**: Required, working ✅
- **GraphQL + web scraping**: Required, documented ✅

### No Blockers Identified
All dependencies are met or already documented.

---

## Risk Assessment

### Low Risk (Likely to succeed)
- ✅ File copying and integration
- ✅ Basic staffing operations
- ✅ SSI integration (patterns established)
- ✅ UI components (simple React)

### Medium Risk (May need iteration)
- ⚠️ Cron finalization logic (requirements unclear)
- ⚠️ Email notification content (needs review)
- ⚠️ Slot calculation edge cases
- ⚠️ Error handling completeness

### High Risk (Needs attention)
- 🔴 Missing function implementations (will break on deploy)
- 🔴 Broken imports (will crash frontend)
- 🔴 Instructor allowlist management (who maintains it?)

**Mitigation**: Address all P0 issues before deploying to production.

---

## Success Metrics

Track these to measure implementation success:

1. **Functionality**: All staffing operations work without errors
2. **Stability**: No crashes, no 500 errors
3. **Performance**: Page loads in <2 seconds
4. **User Satisfaction**: Instructors successfully use the system
5. **Maintenance**: Tests pass, code is clean, documented

---

## Questions to Resolve

Before finalizing implementation:

1. **Cron finalization**: What exactly should happen? Who decides timing?
2. **Instructor allowlist**: Who maintains it? How to add/remove?
3. **Email content**: Who writes the notification texts?
4. **Admin access**: Who can override registrations?
5. **Backup plan**: What if SSI is down during training?

**Action**: Schedule meeting with stakeholders to answer these.

---

## Resources Needed

- **Developer time**: ~4.5 hours for P0, ~12 hours for P1, ~8 hours for P2
- **Tester time**: ~2 hours for manual testing after each sprint
- **Stakeholder time**: ~1 hour to answer questions and review

**Total**: ~28 hours of effort across 2-3 weeks

---

**Last Updated**: 2026-02-10
**Next Review**: After completing Sprint 1
**Owner**: Development team
