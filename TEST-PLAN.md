# Test Plan: Email-Based Shooter Identification Fix

## Overview

This test plan validates the fix for the ambiguous name matching bug where clicking "Hyväksy" (Approve) on a pending shooter would approve the wrong person when multiple shooters share similar names.

## Root Cause

**Before Fix:**
- State management functions (`ssiFindAndApproveCupParticipant`, `ssiFindAndDeleteCupParticipant`) used name-only matching from HTML scraping
- When multiple shooters had similar names (e.g., "Jari Virtanen" and "Ari Virtanen"), the function would find all matches but always select the first one
- Email parameter was passed but only used for logging warnings, not for actual identification

**After Fix:**
- Backend GET endpoint includes `cupParticipantId` from GraphQL (where emails are available)
- State functions accept optional `participantId` parameter
- When `participantId` provided, functions use it directly (email-verified from GraphQL)
- Fallback to legacy name-based search only when `participantId` not provided

## Test Scenarios

### Scenario 1: Two Shooters with Similar Names, One Pending

**Setup:**
1. Two shooters in SSI database:
   - Shooter A: "Jari Virtanen" (jari.virtanen@example.com) - **Pending** in CUP
   - Shooter B: "Ari Virtanen" (ari.virtanen@example.com) - **Deleted** in CUP
2. Both have different email addresses

**Test Steps:**
1. Navigate to ManagePage for the CUP
2. Verify "Odottaa hyväksyntää" section shows only "Jari Virtanen" with email `jari.virtanen@example.com`
3. Click "Hyväksy" button for "Jari Virtanen"
4. Wait for action to complete

**Expected Result:**
- ✅ "Jari Virtanen" (jari.virtanen@example.com) status changes to **Approved**
- ✅ "Ari Virtanen" (ari.virtanen@example.com) remains **Deleted**
- ✅ Server logs show: `Using GraphQL participant ID [ID] for "Jari Virtanen" (jari.virtanen@example.com)`

**Failure Indicators:**
- ❌ Wrong shooter is approved (Ari instead of Jari)
- ❌ Server logs show name-based HTML scraping instead of ID-based lookup
- ❌ Warning about "Multiple name matches found"

---

### Scenario 2: Two Shooters with Same Name, Different Emails, Both Pending

**Setup:**
1. Two shooters in SSI database:
   - Shooter A: "Jari Virtanen" (jari.v1@example.com) - **Pending** in CUP (participant ID: 12345)
   - Shooter B: "Jari Virtanen" (jari.v2@example.com) - **Pending** in CUP (participant ID: 67890)
2. Same name, different emails

**Test Steps:**
1. Navigate to ManagePage for the CUP
2. Verify "Odottaa hyväksyntää" section shows **two separate entries**:
   - "Jari Virtanen" with email `jari.v1@example.com`
   - "Jari Virtanen" with email `jari.v2@example.com`
3. Click "Hyväksy" button for the first "Jari Virtanen" (jari.v1@example.com)
4. Wait for action to complete
5. Refresh page
6. Click "Hyväksy" button for the second "Jari Virtanen" (jari.v2@example.com)

**Expected Result:**
- ✅ First click approves only jari.v1@example.com (ID 12345)
- ✅ Second click approves only jari.v2@example.com (ID 67890)
- ✅ Each action uses the correct participant ID from GraphQL
- ✅ No "Multiple name matches" warnings in logs

---

### Scenario 3: Remove Pending Shooter with Similar Name

**Setup:**
1. Two shooters in SSI database:
   - Shooter A: "Jari Virtanen" (jari.virtanen@example.com) - **Pending** in CUP
   - Shooter B: "Kari Virtanen" (kari.virtanen@example.com) - **Pending** in CUP

**Test Steps:**
1. Navigate to ManagePage for the CUP
2. Verify "Odottaa hyväksyntää" section shows both shooters
3. Click "Poista" (Remove) button for "Jari Virtanen"
4. Wait for action to complete
5. Refresh page

**Expected Result:**
- ✅ "Jari Virtanen" status changes to **Deleted**
- ✅ "Kari Virtanen" remains **Pending**
- ✅ Server logs show ID-based deletion for correct shooter

---

### Scenario 4: Legacy Fallback - No cupParticipantId Available

**Setup:**
1. Manually trigger approve/remove endpoint without `cupParticipantId` parameter
2. Use curl or API testing tool:
   ```bash
   curl -X POST http://localhost:3001/api/manage/cup/12345/approve-pending \
     -H "Content-Type: application/json" \
     -d '{"shooterName": "Test Shooter", "email": "test@example.com"}'
   ```

**Expected Result:**
- ✅ Function falls back to legacy name-based HTML scraping
- ✅ Server logs show: `GET /event/136/12345/participants/ (looking for "Test Shooter")`
- ✅ Backward compatibility maintained for old API clients

---

### Scenario 5: Missing Email in GraphQL Data

**Setup:**
1. Shooter with missing email in SSI database:
   - "Test Shooter" with no email - **Pending** in CUP

**Test Steps:**
1. Navigate to ManagePage for the CUP
2. Verify pending shooter shows "🚨 Sähköposti puuttuu" warning
3. Click "Hyväksy" button

**Expected Result:**
- ✅ Shooter is approved using cupParticipantId (email not required for ID-based lookup)
- ✅ No false matches with other shooters with same name
- ✅ Server logs show: `Using GraphQL participant ID [ID] for "Test Shooter" (no email)`

---

## Regression Tests

### Regression 1: Existing Squadding Workflow

**Test Steps:**
1. Approve a pending shooter
2. Add them to matches
3. Assign them to a squad
4. Verify squad assignment persists

**Expected Result:**
- ✅ All existing squadding functionality works unchanged
- ✅ No errors in console or server logs

---

### Regression 2: CupOnly and MatchOnly Shooters

**Test Steps:**
1. Add shooter to CUP only (not in matches)
2. Verify they appear in "Cupissa mutta ei osakilpailussa" section
3. Add shooter to match only (not in CUP)
4. Verify they appear in "Osakilpailussa mutta ei cupissa" section

**Expected Result:**
- ✅ Shooters appear in correct sections
- ✅ Email-based identification works for both scenarios

---

### Scenario 6: Match-Only Pending Shooter (No CUP Participant)

**Setup:**
1. Shooter "Ari Tammelin" is pending in one or more matches
2. Shooter is NOT in the CUP at all (no CUP participant entry)
3. Two different "Ari Tammelin" exist with different emails (identity conflict)

**Test Steps:**
1. Navigate to ManagePage for the CUP
2. Verify "Odottaa hyväksyntää" section shows "Ari Tammelin" with:
   - Email displayed
   - Text showing "• Osakilpailuissa: 1. Match Name"
   - NO text showing "• Cupissa (pending)"
   - NO "Hyväksy" or "Poista" buttons
   - Instead shows italic text: "(Vain osakilpailuissa)"
3. Verify buttons are NOT clickable (they don't exist for match-only pending)

**Expected Result:**
- ✅ UI clearly indicates shooter is only in matches
- ✅ NO approve/remove buttons shown (prevents error)
- ✅ User sees "(Vain osakilpailuissa)" label
- ✅ No backend errors logged

**Why This Matters:**
- CUP-level approve/remove endpoints only work on CUP participants
- Match-only pending shooters would cause "Participant not found in CUP" errors
- UI now prevents this by hiding the buttons for match-only shooters

---

## Performance Tests

### Performance 1: Large Cup with Many Pending Shooters

**Test Steps:**
1. Navigate to CUP with 50+ pending shooters
2. Measure page load time
3. Approve multiple shooters in sequence
4. Monitor network tab for request timing

**Expected Result:**
- ✅ Page loads in < 3 seconds
- ✅ Each approve action completes in < 2 seconds
- ✅ No noticeable performance degradation vs. baseline

---

## Manual Testing Checklist

**Before Merge:**
- [ ] Scenario 1: Similar names (Jari vs Ari) - **CRITICAL**
- [ ] Scenario 2: Same name, different emails - **CRITICAL**
- [ ] Scenario 3: Remove with similar names
- [ ] Scenario 4: Legacy fallback without cupParticipantId
- [ ] Scenario 5: Missing email handling
- [ ] Scenario 6: Match-only pending (no CUP buttons) - **CRITICAL**
- [ ] Regression 1: Squadding workflow unchanged
- [ ] Regression 2: CupOnly and MatchOnly sections

**CI/CD Validation:**
- [ ] Frontend build passes
- [ ] Backend build passes
- [ ] No new ESLint warnings
- [ ] No new npm audit vulnerabilities

---

## Debugging Tips

**If test fails:**

1. Check server logs for these indicators:
   ```
   # Good: ID-based lookup
   [cup-approve] Using GraphQL participant ID 12345 for "Jari Virtanen" (jari@example.com)

   # Bad: Name-based fallback (should only happen in Scenario 4)
   [cup-approve] GET /event/136/12345/participants/ (looking for "Jari Virtanen")

   # Bad: Ambiguity warning (should never happen with fix)
   [cup-approve] WARNING: Multiple name matches found for "Jari Virtanen"
   ```

2. Check network tab in browser DevTools:
   - POST request to `/api/manage/cup/:id/approve-pending`
   - Request body should include: `{"shooterName": "...", "email": "...", "cupParticipantId": "12345"}`

3. Check GraphQL response structure:
   - GET request to `/api/manage/cup/:id`
   - Response should include `pendingShooters` array with `cupParticipantId` field

---

## Success Criteria

The fix is considered successful when:

1. ✅ All 6 test scenarios pass without errors
2. ✅ No regression in existing functionality (2 regression tests pass)
3. ✅ Server logs confirm ID-based identification is being used
4. ✅ No "Multiple name matches" warnings in production logs for ID-based flows
5. ✅ Match-only pending shooters show "(Vain osakilpailuissa)" instead of buttons
6. ✅ CI/CD pipeline passes all checks

---

## Rollback Plan

If critical issues are found after deployment:

1. **Immediate:** Monitor production logs for errors related to approve/remove actions
2. **If broken:** Revert PR using GitHub UI (creates revert commit)
3. **Fallback:** Legacy name-based matching will continue to work (backward compatible)
4. **Fix forward:** Address issues in new PR with additional test cases
