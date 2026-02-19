# Add Competitor to Cup Flow

This document explains the complete flow of events when adding a competitor from the Matches to the Cup using the Manage tool.

## Overview

In the Manage tool, competitors can appear in three categories:
1. **"Ei squadissa"** (Not in Squad) - Competitors registered in matches but not assigned to any squad
2. **"Ei cupissa"** (Not in Cup) - Competitors registered in matches but NOT registered in the Cup itself
3. **"Cupissa mutta ei osakilpailuissa"** (In Cup but not in Matches) - Competitors registered in the Cup but not in any component matches

This document focuses on the "Add to Cup" flow for competitors in category #2.

## User Journey

1. User logs into the Manage tool with SSI credentials
2. User selects a Cup from the list
3. System displays the squadding overview with sections:
   - Unsquadded competitors
   - Inconsistent squad assignments
   - **Cup/Match mismatches** (our focus)
   - Squad overview
4. In the "Ei cupissa" section, user sees competitors like "Jari Salo" with red text: "Osakilpailuissa mutta ei cupissa" (In matches but not in cup)
5. User clicks the **"Lisää"** (Add) button next to the competitor's name
6. System performs the add-to-cup operation
7. On success: competitor moves from "Ei cupissa" to the appropriate category (usually "Ei squadissa" or proper squad)
8. On failure: error message is displayed

## Technical Flow

### Frontend (ManagePage.jsx)

```
User clicks "Lisää" button
   ↓
handleAddToCup(shooterName) [line 350]
   ↓
runAction(() => api.manageAddToCup(cupId, shooterName), shooterName) [line 351]
   ↓
Set loading state: actionLoading = shooterName [line 330]
   ↓
Call api.manageAddToCup(cupId, shooterName) [line 333]
   ↓
On success: onRefresh() to reload data [line 334]
On error: setActionError(message) [line 336]
   ↓
Clear loading state: actionLoading = null [line 338]
```

### API Client (api.js)

```
api.manageAddToCup(cupId, shooterName) [line 143]
   ↓
POST /api/manage/cup/:cupId/add-to-cup
Body: { shooterName }
   ↓
handleResponse(resp) [line 150]
   ↓
If HTTP error or data.error present: throw Error
If success: return data
```

### Backend (management.js)

```
POST /api/manage/cup/:id/add-to-cup [line 276]
   ↓
Validate: shooterName provided [line 277-280]
   ↓
Check: SSI session cookies exist [line 282-283]
   ↓
Parse name: firstName, lastName [line 287-289]
   ↓
Step 1: Add to Cup [line 291-298]
   ↓
   ssiSearchAndAddParticipant(136, cupId, null, cookies, { firstName, lastName })
      ↓
      Search for user in SSI database by name
      ↓
      Find "Register" link for the user
      ↓
      Follow register link (GET request)
      ↓
      Return: { success: true/false, message: "..." }
   ↓
   If addResult.success === false:
      Return HTTP 400 with error message [line 297]
   ↓
Step 2: Find and Approve [line 300-310]
   ↓
   ssiFindAndApproveCupParticipant(cupId, shooterName, cookies)
      ↓
      Scrape Cup participants page
      ↓
      Search for participant by name
      ↓
      Find participant ID
      ↓
      Check current status (Pending/Approved/etc.)
      ↓
      If not Approved: Toggle status (Pending → Approved)
      ↓
      Verify new status
      ↓
      Return: { success: true/false, message: "..." }
   ↓
   If approveResult.success === false:
      Return HTTP 400 with error message [line 306]
   ↓
Success: Return HTTP 200 with { success: true, message: "..." } [line 309]
```

### SSI Backend Operations

#### ssiSearchAndAddParticipant (lib/ssi-core/client.js:387)

1. **POST to search-and-add page** with form data:
   ```
   POST /event/136/{cupId}/participant-search-and-add/
   Body: last_name, first_name, email, submit=Search
   ```

2. **Handle response cases**:
   - **302 redirect**: Participant added successfully (already in system, auto-added)
   - **200 with "no results"**: User not found in SSI database → return `{ success: false, message: 'user_not_found' }`
   - **200 with results table**: Extract "Register" link from results

3. **Follow register link**:
   ```
   GET /event/.../participant-search-and-add/{userId}/register/
   ```
   - Expect 302 redirect to participants page
   - If confirmation form appears: extract and submit it
   - Extract shooter name from response

4. **Return result**:
   - Success: `{ success: true, message: 'Participant added', shooterName: '...' }`
   - Failure: `{ success: false, message: 'user_not_found' }` or error message

#### ssiFindAndApproveCupParticipant (lib/ssi-core/client.js:510)

1. **Scrape participants page**:
   ```
   GET /event/136/{cupId}/participants/
   ```

2. **Find participant in HTML**:
   - Parse links: `<a href="/event/participant/137/{id}/">Name</a>`
   - Match by name (case-insensitive, word-based matching)

3. **Check current status**:
   - Look for status toggle link and extract current status from `<abbr title="...">`
   - If already "Approved": return success immediately

4. **Toggle status** (if needed):
   ```
   GET /event/participant/137/{participantId}/toggle-status/?next=/event/.../participants/
   ```
   - Status cycle: Pending → Approved → Approved(no results) → Deleted → Pending
   - One toggle from Pending reaches Approved

5. **Verify new status**:
   - Check HTML response for new status
   - If "Approved": success
   - Otherwise: failure with explanation

6. **Return result**:
   - Success: `{ success: true, message: 'Approved' }`
   - Failure: `{ success: false, message: 'Participant not found in CUP' }` or other error

## Common Failure Scenarios

### 1. User Not Found in SSI Database

**Symptom**: "Failed to add competitor: user_not_found"

**Cause**: The competitor name doesn't match any user in the SSI database.

**Solutions**:
- Check spelling of the name
- Verify the user has a ShootNScoreIt account
- The user may need to register in SSI first
- Name may be registered differently (e.g., "Jari" vs "Jari Antero")

**Debug logs**:
```
[search-and-add] "no results" — user not found
[manage] Cup add result: user_not_found
[manage] Failed to add "Jari Salo" to cup: user_not_found
```

### 2. Participant Not Found After Adding

**Symptom**: "Failed to approve competitor: Participant not found in CUP"

**Cause**: The participant was added to matches but the Cup participant list doesn't show them yet, or name matching failed.

**Solutions**:
- Check if the participant appears in SSI web interface
- Verify the name matches exactly (including middle names, hyphens, special characters)
- Try refreshing the page and attempting again

**Debug logs**:
```
[manage] Cup add result: Participant added
[cup-approve] "{name}" not found in CUP {cupId} participants
[manage] Failed to approve "{name}" in cup: Participant not found in CUP
```

### 3. Session Expired

**Symptom**: "No SSI session cookies" or redirect to login

**Cause**: The user's SSI session has expired (30 minutes of inactivity by default).

**Solutions**:
- Log in again using the Manage tool login screen
- The page state is preserved, so the user can continue where they left off after re-authentication

### 4. Already in Cup (Not Visible in UI)

**Symptom**: Competitor disappears from "Ei cupissa" section but doesn't appear elsewhere

**Cause**: Competitor was already in the Cup but data refresh timing.

**Solutions**:
- Refresh the page
- Check the squad sections - they may have been assigned to a squad
- Check the "All OK" section

## Error Handling Changes (Bug Fix)

### Previous Behavior (Bug)

The backend returned HTTP 200 with `{ success: false, message: "..." }` when operations failed. The frontend's `handleResponse` function only checked for `data.error`, not `data.success`, so errors were silently ignored.

**Result**: No error message shown to user, operation appears to do nothing.

### Current Behavior (Fixed)

The backend now returns:
- **HTTP 400** with `{ error: "Failed to add competitor: ..." }` when `ssiSearchAndAddParticipant` fails
- **HTTP 400** with `{ error: "Failed to approve competitor: ..." }` when `ssiFindAndApproveCupParticipant` fails
- **HTTP 200** with `{ success: true, message: "..." }` only on success

The frontend's `handleResponse` function catches these HTTP 400 errors and throws, which triggers the error display in the UI.

**Result**: User sees clear error message explaining what went wrong.

## Testing the Flow

### Manual Testing

1. Create a test competitor in SSI that exists in component matches but NOT in the Cup
2. Log into Manage tool
3. Select the Cup
4. Find the competitor in "Ei cupissa" section
5. Click "Lisää" button
6. Verify:
   - Loading spinner appears during operation
   - On success: competitor moves to correct section
   - On failure: error message displays with clear explanation

### With Debug Logging

Enable debug logging (see [Debug Logging](../instructions/debug-logging.md)) and observe console output during the operation:

```bash
cd scoring-proxy
LOG_LEVEL=debug node server.js
```

Then perform the operation and check terminal output for detailed flow.

## Related Files

- **Frontend**:
  - `scoring-ui/src/components/ManagePage.jsx` - UI and state management
  - `scoring-ui/src/api.js` - API client functions

- **Backend**:
  - `scoring-proxy/routes/management.js` - API endpoints
  - `scoring-proxy/lib/ssi-core/client.js` - SSI API integration

## Related Documentation

- [Debug Logging](../instructions/debug-logging.md) - How to enable detailed logging
- [Log Design](./log-design.md) - Log level policy and environment defaults
- [Session Handling](./session-handling.md) - Authentication and session management
