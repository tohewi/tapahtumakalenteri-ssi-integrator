# Credential Rotation Notice

## Date: 2026-02-08

### Issue
Commit `6490510606ab03bf8cf2f7b94ebac44d662bbaa7` introduced hardcoded test credentials in `scoring-proxy/test/proxy.test.js`:
- Email: `tohewi@live.com`
- Password: `H3it0tt0r00!`
- API Key: `sQHSLYQolYMflK1FhQjh8hugYPJIZBv6Tfu0FWppdeA`

### Action Required
**All exposed credentials must be rotated immediately:**

1. **SSI Account Password** - Change the password for `tohewi@live.com` in the ShootNScoreIt system
2. **SSI API Key** - Generate a new API key in the SSI admin panel and invalidate the old one
3. **Update Secrets** - Update the production/test environment variables with the new credentials

### Resolution
The hardcoded credentials have been removed from the test file as of this commit. Tests now require environment variables to be explicitly set:
- `SSI_EMAIL`
- `SSI_PASSWORD`
- `SSI_API_KEY`

Tests will fail with a clear error message if these variables are not provided.

### Prevention
- Never commit real credentials, even as fallback values
- Always use environment variables for sensitive data
- Use `.env.template` with placeholder values for documentation
- Consider using separate test accounts with limited permissions
