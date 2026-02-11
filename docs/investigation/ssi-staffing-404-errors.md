# SSI Staffing Integration - Investigation Summary

**Date**: 2026-02-11  
**Issue**: HTTP 404 errors during instructor registration to test matches  
**PR**: #70 (feature/sra-match-staffing)

## Error Analysis

### Observed Errors

From the error logs:
```
[staffing] SSI trainer squad failed for turreskuko1@foo.bar: Trainer squad search failed HTTP 404
[staffing] SSI management add failed for turreskuko1@foo.bar: Management search failed HTTP 404
```

### Root Cause Investigation

The HTTP 404 errors occur at two specific SSI endpoints:

1. **Trainer Squad Registration**
   - URL: `POST /event/22/{eventId}/participant-search-and-add/`
   - Purpose: Search for user by email and add to trainer squad
   - Error indicates: Either event doesn't exist, wrong content type, or user lacks admin access

2. **Management Group Search**
   - URL: `POST /groups/{groupId}/role/search/`
   - Purpose: Search for user by email to add to management group
   - Error indicates: Group ID is incorrect or user lacks group access

### Possible Causes

1. **Event doesn't exist**: Event ID 27391 may not exist in SSI
2. **Wrong content type**: Event might not be content type 22 (SRA/IPSC)
3. **Permission issue**: User `turreskuko1@foo.bar` may not have admin access to the event
4. **Group not configured**: Event may not have a management group set up
5. **User not found**: Email may not be registered/verified in SSI

## Diagnostic Test Created

I've created a comprehensive diagnostic test at:
- `test-harness/test-staffing-integration.mjs`
- `test-harness/TEST-STAFFING-INTEGRATION.md` (documentation)

### Test Features

The test performs 7 sequential checks:
1. ✅ Login authentication
2. ✅ Event page access
3. ✅ Participant search page access
4. ✅ Staff page access
5. ✅ Management group search access
6. ✅ Actual trainer squad registration
7. ✅ Actual management group registration

Each step provides detailed diagnostics on failure.

### Running the Test

```bash
cd test-harness
node test-staffing-integration.mjs <email> <password> <apiKey> <eventId>
```

Example:
```bash
node test-staffing-integration.mjs turreskuko1@foo.bar mypass mykey 27391
```

## Required Information for Testing

To complete the diagnosis, I need:

1. **Valid SSI credentials** for a test user in the allowlist
   - Email: `turreskuko1@foo.bar` (or another allowlisted user)
   - Password: (not available in CI environment)
   - API Key: (not available in CI environment)

2. **Test event details**
   - Event ID: 27391 (from error logs)
   - Confirmation that event exists and uses content type 22
   - Confirmation that test user has admin access

## Next Steps

1. **User runs the diagnostic test** with real credentials
2. **Identify the failing step** from test output
3. **Fix the root cause**:
   - If event doesn't exist → create test event
   - If permission issue → grant admin access to test user
   - If content type wrong → update config or event
   - If group missing → configure management group for event
4. **Re-run test** to verify fix
5. **Test in preview environment** to confirm end-to-end flow works

## Code References

### SSI Integration Functions

1. **ssiRegisterToTrainerSquad** (`scoring-proxy/lib/ssi-core/client.js:1234-1394`)
   - Searches by email
   - Registers to Squad 5 with Approved status
   - Uses 5-second anti-bot delay

2. **ssiAddToMatchManagement** (`scoring-proxy/lib/ssi-core/client.js:1014-1091`)
   - Searches by email in management group
   - Adds with admin role
   - Assigns event official codes (MD/QM)

3. **ssiGetMatchGroupId** (`scoring-proxy/lib/ssi-core/client.js:935-954`)
   - Scrapes staff page for group ID
   - Returns group ID for management operations

### Staffing Routes

**POST /api/staffing/events/:eventId/signup** (`scoring-proxy/routes/staffing.js:220-270`)
- Gets user info from SSI GraphQL
- Calls signup in engine
- Performs blocking SSI integration:
  - Registers to trainer squad
  - Adds to management group with role
- Returns success + SSI status to frontend

## Environment Notes

- This investigation was performed in GitHub Actions CI environment
- No access to real SSI credentials or live event data
- Diagnostic test requires manual execution with real credentials
- Test must be run by someone with:
  - SSI admin credentials
  - Access to a test event in SSI
  - Ability to verify event configuration

## Status

- ✅ Error analysis complete
- ✅ Diagnostic test created
- ⏳ Awaiting test execution with real credentials
- ⏳ Root cause identification pending
- ⏳ Fix pending
