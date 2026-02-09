# Environment Variables for PR Previews - Summary

## What Was Implemented

This implementation adds automatic configuration of environment variables for PR preview instances in Render. Previously, preview services were created without the necessary credentials, causing them to fail at runtime.

## The Problem

When creating PR preview instances in Render, the following mandatory environment variables were not being set:

- `EMAIL_FROM` - Email sender address
- `NODE_ENV` - Application environment mode  
- `RESEND_API_KEY` - API key for sending emails
- `SSI_ADMIN_API_KEY` - SSI GraphQL API key
- `SSI_ADMIN_EMAIL` - SSI admin account email
- `SSI_ADMIN_PASSWORD` - SSI admin account password

Without these variables, preview instances would start but fail when attempting to:
- Send registration confirmation emails
- Authenticate with SSI admin account
- Make SSI GraphQL API calls

## The Solution

### Architecture

**Secure Storage:** GitHub Secrets  
All sensitive credentials are stored as repository secrets in GitHub, encrypted at rest and never exposed in logs.

**Automated Configuration:** GitHub Actions  
The `pr-preview.yml` workflow automatically passes secrets to Render API when creating preview services.

**Environment Isolation:** Separate Preview Credentials  
Preview environments use `PREVIEW_*` prefixed secrets, allowing different values from production.

### Implementation

1. **New GitHub Secrets** (5 new secrets for preview environments):
   - `PREVIEW_EMAIL_FROM` - Email sender for preview
   - `PREVIEW_RESEND_API_KEY` - Resend API key
   - `PREVIEW_SSI_ADMIN_EMAIL` - SSI admin email
   - `PREVIEW_SSI_ADMIN_PASSWORD` - SSI admin password
   - `PREVIEW_SSI_ADMIN_API_KEY` - SSI API key

2. **Updated Workflow** (`.github/workflows/pr-preview.yml`):
   - Service creation now includes all 6 environment variables
   - Values pulled from GitHub Secrets
   - Applied automatically to every new preview service

3. **Documentation**:
   - `docs/PR-PREVIEW-ENV-VARS.md` - Complete design and architecture
   - `docs/SETUP-PREVIEW-SECRETS.md` - Quick setup guide
   - `.github/workflows/README.md` - Updated with new secrets

## What Needs to Be Done

### Required Action: Configure GitHub Secrets

Repository maintainers must add 5 new secrets to GitHub before PR preview environments will work correctly.

**Quick Setup:** Follow **[SETUP-PREVIEW-SECRETS.md](./SETUP-PREVIEW-SECRETS.md)** (10 minutes)

**Detailed Guide:** See **[PR-PREVIEW-ENV-VARS.md](./PR-PREVIEW-ENV-VARS.md)** for complete documentation

### Decision Required: Environment Strategy

Choose one of two approaches:

#### Option 1: Shared Credentials (Simpler)
Use the same credentials for both production and preview:
- ✅ **Pros:** Single set of credentials, easier to manage, identical to production
- ⚠️ **Cons:** Preview environments interact with production SSI data

**Best for:** Small teams, low PR volume, careful testing practices

#### Option 2: Separate Credentials (Safer)
Use different credentials for preview environments:
- ✅ **Pros:** Complete isolation, safe testing, no production data impact
- ⚠️ **Cons:** Requires test SSI account, more secrets to manage

**Best for:** Multiple developers, frequent PRs, automated testing

**Recommendation:** Start with Option 1, migrate to Option 2 if needed.

## Benefits

### For Developers
- ✅ PR previews now fully functional (can test login, registration, email)
- ✅ No manual configuration needed per PR
- ✅ Test environment-specific code safely

### For Repository Maintainers
- ✅ One-time secret setup (reused for all PRs)
- ✅ Secure credential management via GitHub
- ✅ Environment isolation option (prod vs preview)
- ✅ Easy credential rotation (update secrets, close/reopen PRs)

### Security
- ✅ Secrets encrypted at rest in GitHub
- ✅ Never exposed in logs or PR comments
- ✅ Passed securely to Render via API
- ✅ Access controlled by GitHub permissions

## Files Changed

1. ✅ `.github/workflows/pr-preview.yml` - Added env vars to service creation
2. ✅ `.github/workflows/README.md` - Updated with 5 new secrets documentation
3. ✅ `docs/PR-PREVIEW-ENV-VARS.md` - Complete design document (NEW)
4. ✅ `docs/SETUP-PREVIEW-SECRETS.md` - Quick setup guide (NEW)
5. ✅ `docs/PR-PREVIEW-DEPLOYMENTS.md` - Added reference to env vars docs

## Testing Plan

### Verification Steps

1. **Setup Secrets** (~10 min):
   - Follow SETUP-PREVIEW-SECRETS.md
   - Add all 5 `PREVIEW_*` secrets to GitHub

2. **Create Test PR** (~5 min):
   - Create branch: `git checkout -b test-env-vars`
   - Empty commit: `git commit --allow-empty -m "Test env vars"`
   - Push and open PR

3. **Verify Workflow** (~3 min):
   - Check GitHub Actions runs successfully
   - Verify PR comment has preview URL
   - Check Render Dashboard shows service with 6 env vars

4. **Test Application** (~5 min):
   - Open preview URL
   - Test login (uses SSI credentials)
   - Test registration (uses email credentials)
   - Verify email received with correct sender

5. **Clean Up** (~1 min):
   - Close PR
   - Verify service auto-deleted

**Total Time:** ~25 minutes

## Next Steps

### Immediate (Required)
1. ✅ **Review this summary** and the implementation
2. ⏳ **Configure GitHub Secrets** following SETUP-PREVIEW-SECRETS.md
3. ⏳ **Test with a PR** to verify everything works
4. ⏳ **Document credentials** in team password manager

### Future (Optional)
- Consider separate test SSI account for previews
- Add monitoring/alerts for failed preview deployments
- Document credential rotation procedures
- Add preview environment smoke tests

## Questions?

- **Setup help:** See [SETUP-PREVIEW-SECRETS.md](./SETUP-PREVIEW-SECRETS.md)
- **Architecture:** See [PR-PREVIEW-ENV-VARS.md](./PR-PREVIEW-ENV-VARS.md)
- **Troubleshooting:** See [PR-PREVIEW-ENV-VARS.md](./PR-PREVIEW-ENV-VARS.md#troubleshooting)
- **Workflow details:** See [.github/workflows/README.md](../.github/workflows/README.md)

## Credits

- **Issue:** "When setting up PR instance in Render, also environment settings must be set"
- **Design:** Secure GitHub Secrets + automated Render API configuration
- **Date:** 2026-02-09

---

**Status:** ✅ Implementation complete, awaiting secret configuration
