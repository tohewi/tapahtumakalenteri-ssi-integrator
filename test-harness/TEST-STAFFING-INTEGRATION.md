# SSI Staffing Integration Test

## Purpose

This diagnostic test verifies each step of the SSI staffing integration to identify exactly where the HTTP 404 errors are occurring.

## Usage

```bash
cd /home/runner/work/tapahtumakalenteri-ssi-integrator/tapahtumakalenteri-ssi-integrator/test-harness
node test-staffing-integration.mjs <email> <password> <apiKey> <eventId>
```

### Example

```bash
node test-staffing-integration.mjs turreskuko1@foo.bar mypassword myapikey 27391
```

## What It Tests

The test performs 7 sequential steps:

1. **Login** - Authenticates with SSI and saves cookies
2. **Event Access** - Verifies the event exists and is accessible
3. **Participant Search Page** - Tests access to `/event/22/{eventId}/participant-search-and-add/`
4. **Staff Page** - Tests access to `/event/22/{eventId}/staff/`
5. **Management Group Search** - Tests access to `/groups/{groupId}/role/search/`
6. **Trainer Squad Registration** - Attempts actual registration to Squad 5
7. **Management Group Registration** - Attempts to add user as admin with MD role

Each step provides detailed diagnostic output explaining any failures.

## Common Failure Causes

### HTTP 404 on Participant Search Page
- Event ID does not exist in SSI
- Content type is wrong (should be 22 for SRA/IPSC matches)
- User account does not have admin access to the event

### HTTP 404 on Management Group Search
- Management group ID extracted incorrectly from staff page
- User does not have access to the management group
- Event does not have a management group configured

### User Not Found Errors
- Email address is not registered in SSI
- Email address does not match exactly (case-sensitive)
- User account needs email verification

## Test Requirements

- Valid SSI credentials (email, password, API key)
- User must be in the admin allowlist (`config/sra-training-config.yml`)
- User must have admin access to the test event
- Event must exist and use content type 22
- Event must have a management group configured

## Output

The test provides:
- ✅ Green checkmarks for passing tests
- ❌ Red X marks for failing tests
- ⚠️ Yellow warnings for non-critical issues
- Detailed error messages with diagnostic information
- A summary at the end showing pass/fail counts

## Next Steps

If tests fail:

1. **Login fails**: Check credentials are correct
2. **Event access fails**: Verify event ID and content type
3. **Permission errors**: Verify user has admin access to event
4. **404 errors**: Check event exists and URLs are correct
5. **User not found**: Verify email is registered and verified in SSI

Once all diagnostic tests pass, the actual staffing signup flow should work correctly.
