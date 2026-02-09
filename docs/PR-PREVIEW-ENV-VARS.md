# PR Preview Environment Variables Design

## Overview

This document describes how environment variables are securely managed for PR preview instances in Render, ensuring that preview environments have all necessary configuration while maintaining security best practices.

## Required Environment Variables

The following environment variables are required for the application to function correctly:

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| `NODE_ENV` | Application environment mode | Yes | `production` |
| `EMAIL_FROM` | Email sender address | No | `noreply@tapahtumakalenteri-ssi-integrator.onrender.com` |
| `RESEND_API_KEY` | Resend email service API key | Yes* | none |
| `SSI_ADMIN_EMAIL` | SSI admin account email | Yes | none |
| `SSI_ADMIN_PASSWORD` | SSI admin account password | Yes | none |
| `SSI_ADMIN_API_KEY` | SSI GraphQL API key | Yes* | none |

\* Required for full functionality (registration with email confirmation)

## Security Architecture

### 1. Secret Storage

**GitHub Secrets** are used to securely store all sensitive environment variables:

- **Location:** Repository Settings → Secrets and variables → Actions
- **Access:** Only available to GitHub Actions workflows during execution
- **Security:** Encrypted at rest, never exposed in logs or PR comments
- **Scope:** Repository-level secrets are accessible to all workflows

### 2. Environment-Specific Values

The system supports different configuration for production vs preview environments:

#### Production (via Render Dashboard)
- Configured manually in Render Dashboard → Service → Environment
- Uses production SSI credentials and production email sender
- Not managed by GitHub Actions workflows

#### Preview (via GitHub Actions + Render API)
- Configured automatically by `pr-preview.yml` workflow
- Can use same credentials as production OR separate test credentials
- Secrets stored in GitHub, passed to Render API during service creation

### 3. Secret Naming Convention

GitHub Secrets follow this naming pattern:

| GitHub Secret | Purpose | Preview Service Env Var |
|--------------|---------|--------------------------|
| `PREVIEW_EMAIL_FROM` | Preview email sender | `EMAIL_FROM` |
| `PREVIEW_RESEND_API_KEY` | Resend API key for previews | `RESEND_API_KEY` |
| `PREVIEW_SSI_ADMIN_EMAIL` | SSI admin email for previews | `SSI_ADMIN_EMAIL` |
| `PREVIEW_SSI_ADMIN_PASSWORD` | SSI admin password for previews | `SSI_ADMIN_PASSWORD` |
| `PREVIEW_SSI_ADMIN_API_KEY` | SSI API key for previews | `SSI_ADMIN_API_KEY` |

**Rationale for `PREVIEW_*` prefix:**
- Separates preview secrets from production secrets
- Allows using different credentials for testing without affecting production
- Makes it clear which secrets are used by which workflow
- Enables future production deployment via GitHub Actions with separate `PROD_*` secrets

## Implementation

### Workflow Integration

The `pr-preview.yml` workflow is updated to:

1. **Service Creation:** Include all environment variables in the `envVars` array when calling Render API
2. **Service Updates:** Existing services automatically use their configured environment variables
3. **Service Deletion:** No special handling needed (service is deleted with all its configuration)

### Code Changes

**File:** `.github/workflows/pr-preview.yml`

**Location:** "Create preview service" step (line ~130)

**Change:** Add environment variables to the `envVars` array in the Render API payload:

```yaml
"envVars": [
  {
    "key": "NODE_ENV",
    "value": "production"
  },
  {
    "key": "EMAIL_FROM",
    "value": "${{ secrets.PREVIEW_EMAIL_FROM }}"
  },
  {
    "key": "RESEND_API_KEY",
    "value": "${{ secrets.PREVIEW_RESEND_API_KEY }}"
  },
  {
    "key": "SSI_ADMIN_EMAIL",
    "value": "${{ secrets.PREVIEW_SSI_ADMIN_EMAIL }}"
  },
  {
    "key": "SSI_ADMIN_PASSWORD",
    "value": "${{ secrets.PREVIEW_SSI_ADMIN_PASSWORD }}"
  },
  {
    "key": "SSI_ADMIN_API_KEY",
    "value": "${{ secrets.PREVIEW_SSI_ADMIN_API_KEY }}"
  }
]
```

### Setup Instructions

#### For Repository Maintainers

1. **Navigate to GitHub Repository Settings:**
   ```
   Repository → Settings → Secrets and variables → Actions
   ```

2. **Add Required Secrets:**

   Click "New repository secret" for each:

   - **PREVIEW_EMAIL_FROM**
     - Value: `no-reply@ssi.towi.me` (or test email with `[TEST]` prefix)
     - Example: `[TEST] SSI Scoring <no-reply@ssi.towi.me>`

   - **PREVIEW_RESEND_API_KEY**
     - Value: Your Resend API key (starts with `re_`)
     - Note: Same key can be used for both production and preview

   - **PREVIEW_SSI_ADMIN_EMAIL**
     - Value: SSI admin email address
     - Note: Can use same as production or separate test account

   - **PREVIEW_SSI_ADMIN_PASSWORD**
     - Value: SSI admin password
     - Note: Corresponding password for the admin email

   - **PREVIEW_SSI_ADMIN_API_KEY**
     - Value: SSI GraphQL API key
     - Note: Obtained from SSI platform settings

3. **Verify Secrets:**
   - All secrets should be visible in the secrets list (values are hidden)
   - Total of 7 secrets: RENDER_API_KEY, RENDER_OWNER_ID, RENDER_DEPLOY_HOOK, PREVIEW_EMAIL_FROM, PREVIEW_RESEND_API_KEY, PREVIEW_SSI_ADMIN_EMAIL, PREVIEW_SSI_ADMIN_PASSWORD, PREVIEW_SSI_ADMIN_API_KEY

## Environment Strategy Options

### Option 1: Shared Credentials (Recommended for Small Teams)

Use the same credentials for both production and preview:

**Pros:**
- Simpler setup (only one set of credentials)
- Preview environments behave identically to production
- Less maintenance overhead

**Cons:**
- Preview environments interact with production SSI data
- Test registrations may confuse real users
- Email notifications sent from production sender

**When to Use:**
- Small team with careful testing practices
- Test data clearly labeled
- Low risk of confusion with production data

### Option 2: Separate Test Credentials (Recommended for Larger Teams)

Use different credentials for preview environments:

**Pros:**
- Complete isolation from production
- Safe to test with real email addresses
- No risk of affecting production data

**Cons:**
- Requires setting up test SSI account
- May need separate Resend domain for testing
- More secrets to manage

**When to Use:**
- Multiple developers creating PRs
- Automated testing in preview environments
- Want to send test emails without confusion

### Hybrid Approach

Mix and match based on sensitivity:
- **Same:** RESEND_API_KEY (emails clearly marked with `[TEST]` prefix)
- **Different:** SSI credentials (separate test account)

## Testing

### Verification Steps

After configuring secrets, verify the setup:

1. **Create a Test PR:**
   ```bash
   git checkout -b test-env-vars
   git commit --allow-empty -m "Test: verify environment variables"
   git push origin test-env-vars
   # Open PR in GitHub
   ```

2. **Check Service Creation:**
   - Verify workflow runs successfully in GitHub Actions
   - Check PR comment for preview URL

3. **Verify Environment Variables:**
   - Open Render Dashboard → Services → Find `ssi-scoring-pr-{NUMBER}`
   - Navigate to Environment tab
   - Verify all 6 environment variables are present
   - Values are shown as `***` for security

4. **Test Application Functionality:**
   - Open preview URL
   - Test login (uses SSI_ADMIN_EMAIL/PASSWORD)
   - Test registration (uses RESEND_API_KEY and EMAIL_FROM)
   - Verify email is sent with correct sender address

5. **Clean Up:**
   - Close the test PR
   - Verify service is deleted automatically

## Security Considerations

### What's Protected

✅ **Secrets are never exposed in:**
- GitHub Actions logs (shown as `***`)
- PR comments
- Commit history
- Public API responses

✅ **Secrets are encrypted:**
- At rest in GitHub
- In transit to Render API
- At rest in Render

### Best Practices

1. **Rotate Secrets Regularly:**
   - Update GitHub Secrets when credentials change
   - Existing preview services will continue using old values until recreated

2. **Limit Access:**
   - Only repository admins can view/edit GitHub Secrets
   - Use GitHub's branch protection to control who can trigger workflows

3. **Monitor Usage:**
   - Review GitHub Actions logs for failed authentications
   - Monitor Render logs for unexpected errors

4. **Use Test Data:**
   - If using production credentials, clearly mark test registrations
   - Consider email prefix like `[TEST]` to avoid confusion

## Troubleshooting

### Preview Service Fails to Start

**Symptoms:** Service created but shows "Build failed" or "Runtime error"

**Possible Causes:**
1. Missing required environment variables
2. Invalid secret values
3. SSI authentication failure

**Solutions:**
1. Check Render Dashboard → Service → Environment
2. Verify all 6 variables are present
3. Test credentials manually (e.g., SSI login)
4. Check Render logs for specific error messages

### Email Not Sent

**Symptoms:** Registration succeeds but no email received

**Possible Causes:**
1. `RESEND_API_KEY` missing or invalid
2. `EMAIL_FROM` not verified in Resend
3. Resend domain not configured

**Solutions:**
1. Verify `RESEND_API_KEY` in GitHub Secrets
2. Check Resend Dashboard for email delivery status
3. Verify sender domain is verified in Resend
4. Check Render logs for email errors

### SSI Authentication Failure

**Symptoms:** Login fails with "Invalid credentials"

**Possible Causes:**
1. Wrong `SSI_ADMIN_EMAIL` or `SSI_ADMIN_PASSWORD`
2. SSI account locked
3. Credentials changed but GitHub Secrets not updated

**Solutions:**
1. Test credentials manually at ShootNScoreIt.com
2. Verify GitHub Secrets match current credentials
3. Update secrets if credentials changed
4. Check SSI account status

### Secrets Not Applied to Existing Service

**Symptoms:** Updated secrets not reflected in preview environment

**Cause:** Existing services are not automatically updated when secrets change

**Solution:** 
1. Close and reopen the PR (triggers service recreation)
2. OR manually delete the preview service in Render Dashboard
3. Push a new commit to trigger redeployment

## Maintenance

### Updating Secrets

When credentials change:

1. **Update GitHub Secrets:**
   - Repository Settings → Secrets → Edit secret
   - Update value, save

2. **Recreate Preview Services:**
   - Option A: Close and reopen affected PRs
   - Option B: Push new commits to trigger redeployment
   - Option C: Manually delete services in Render (will be recreated)

3. **Update Production:**
   - Production env vars managed separately in Render Dashboard
   - Update manually in Render → Service → Environment

### Adding New Variables

To add a new environment variable:

1. **Add GitHub Secret:**
   - Create `PREVIEW_NEW_VAR_NAME` secret

2. **Update Workflow:**
   - Edit `.github/workflows/pr-preview.yml`
   - Add to `envVars` array in "Create preview service" step

3. **Update Documentation:**
   - Add to this document
   - Update `.github/workflows/README.md`

4. **Test:**
   - Create test PR to verify new variable is set

## Related Documentation

- [PR Preview Deployments](./PR-PREVIEW-DEPLOYMENTS.md) - Complete preview environment guide
- [Installation Guide](./installation-guide.md) - Production environment setup
- [GitHub Actions Workflows](../.github/workflows/README.md) - Workflow documentation
- [Render API Documentation](https://api-docs.render.com/) - Render API reference

## Summary

This design provides:
- ✅ **Secure storage** of sensitive credentials via GitHub Secrets
- ✅ **Environment isolation** with separate preview credentials
- ✅ **Automated configuration** through GitHub Actions workflow
- ✅ **Zero manual setup** for new preview environments
- ✅ **Full functionality** testing in preview environments

The implementation ensures that PR preview instances have all necessary environment variables while maintaining security best practices and supporting both shared and separate credential strategies.
