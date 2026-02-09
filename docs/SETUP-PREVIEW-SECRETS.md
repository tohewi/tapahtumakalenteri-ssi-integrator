# Quick Setup: PR Preview Environment Secrets

This guide helps repository maintainers configure GitHub Secrets required for automated PR preview deployments.

## Prerequisites

Before you begin, gather these values:
- ✅ Render API Key
- ✅ Render Workspace ID (Owner ID)
- ✅ Email sender address (e.g., `no-reply@ssi.towi.me`)
- ✅ Resend API Key (for sending emails)
- ✅ SSI admin email and password
- ✅ SSI GraphQL API Key

## Step-by-Step Setup

### 1. Navigate to GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** (top menu)
3. Click **Secrets and variables** → **Actions** (left sidebar)

### 2. Add Required Secrets

Click **"New repository secret"** for each of the following:

#### Secret 1: RENDER_API_KEY
- **Name:** `RENDER_API_KEY`
- **Value:** Your Render API key
- **Where to get it:** Render Dashboard → Account Settings → API Keys
- Click **Add secret**

#### Secret 2: RENDER_OWNER_ID
- **Name:** `RENDER_OWNER_ID`
- **Value:** `tea-d62r4ucoud1c73d50qg0` (workspace ID for this repo)
- **Or find yours:** Run `curl -H "Authorization: Bearer YOUR_API_KEY" https://api.render.com/v1/services | jq '.[0].ownerId'`
- Click **Add secret**

#### Secret 3: PREVIEW_EMAIL_FROM
- **Name:** `PREVIEW_EMAIL_FROM`
- **Value:** `no-reply@ssi.towi.me` (or your preferred sender address)
- **Tip:** Add `[TEST]` prefix for preview emails: `[TEST] SSI Scoring <no-reply@ssi.towi.me>`
- Click **Add secret**

#### Secret 4: PREVIEW_RESEND_API_KEY
- **Name:** `PREVIEW_RESEND_API_KEY`
- **Value:** Your Resend API key (starts with `re_`)
- **Where to get it:** Resend Dashboard → API Keys
- **Note:** Can use same key as production
- Click **Add secret**

#### Secret 5: PREVIEW_SSI_ADMIN_EMAIL
- **Name:** `PREVIEW_SSI_ADMIN_EMAIL`
- **Value:** Your SSI admin email (e.g., `tohewi@live.com`)
- **Note:** Can use same as production or separate test account
- Click **Add secret**

#### Secret 6: PREVIEW_SSI_ADMIN_PASSWORD
- **Name:** `PREVIEW_SSI_ADMIN_PASSWORD`
- **Value:** Your SSI admin password
- **Note:** Must match the SSI admin email
- Click **Add secret**

#### Secret 7: PREVIEW_SSI_ADMIN_API_KEY
- **Name:** `PREVIEW_SSI_ADMIN_API_KEY`
- **Value:** Your SSI GraphQL API key
- **Where to get it:** SSI platform settings
- Click **Add secret**

#### Secret 8: RENDER_DEPLOY_HOOK (if not already set)
- **Name:** `RENDER_DEPLOY_HOOK`
- **Value:** Deploy hook URL from Render Dashboard
- **Where to get it:** Render Dashboard → Service → Settings → Deploy Hook
- **Note:** Used for production deployments (ci-deploy.yml)
- Click **Add secret**

### 3. Verify Setup

After adding all secrets, you should see **8 secrets** in the list:
- ✅ `RENDER_API_KEY`
- ✅ `RENDER_OWNER_ID`
- ✅ `RENDER_DEPLOY_HOOK`
- ✅ `PREVIEW_EMAIL_FROM`
- ✅ `PREVIEW_RESEND_API_KEY`
- ✅ `PREVIEW_SSI_ADMIN_EMAIL`
- ✅ `PREVIEW_SSI_ADMIN_PASSWORD`
- ✅ `PREVIEW_SSI_ADMIN_API_KEY`

**Note:** The secret values are hidden (shown as `***`) for security.

## Testing the Setup

### Create a Test PR

1. Create a test branch:
   ```bash
   git checkout -b test-preview-env-vars
   git commit --allow-empty -m "Test: verify PR preview environment variables"
   git push origin test-preview-env-vars
   ```

2. Open a Pull Request in GitHub

3. **Check workflow:** Go to Actions tab → Look for "PR Preview Environment" workflow

4. **Wait for completion:** The workflow should:
   - ✅ Create preview service
   - ✅ Post PR comment with preview URL
   - ✅ Deploy successfully

5. **Verify in Render:**
   - Go to Render Dashboard
   - Find service named `ssi-scoring-pr-{NUMBER}`
   - Click service → Environment tab
   - Should see 6 environment variables (all values shown as `***`)

6. **Test the application:**
   - Open preview URL (from PR comment)
   - Try logging in (uses `SSI_ADMIN_EMAIL` and `SSI_ADMIN_PASSWORD`)
   - Try registration flow (uses `RESEND_API_KEY` and `EMAIL_FROM`)

7. **Clean up:**
   - Close the PR
   - Verify preview service is automatically deleted

## Troubleshooting

### Workflow Fails at "Create preview service"

**Possible causes:**
- Missing or invalid secrets
- Incorrect Render API key
- Wrong workspace ID

**Solution:**
1. Check GitHub Actions logs for specific error
2. Verify all secrets are present
3. Test Render API key: `curl -H "Authorization: Bearer YOUR_API_KEY" https://api.render.com/v1/services`

### Preview service created but deployment fails

**Possible causes:**
- Invalid SSI credentials
- Invalid Resend API key
- Email sender not verified in Resend

**Solution:**
1. Check Render Dashboard → Service → Logs
2. Test SSI credentials manually at ShootNScoreIt.com
3. Verify email domain in Resend Dashboard

### Environment variables not visible in Render

**Expected behavior:** 
- Values are hidden (shown as `***`) for security
- This is normal and correct

**To verify they're set:**
- Check Render logs for authentication errors
- Test the application functionality (login, registration)

## Updating Secrets

When credentials change:

1. Go to repository Settings → Secrets and variables → Actions
2. Find the secret to update
3. Click the pencil icon (Update)
4. Enter new value
5. Click **Update secret**

**Note:** Existing preview services won't automatically pick up new values. To apply changes:
- Close and reopen the PR, OR
- Push a new commit to trigger redeployment, OR  
- Manually delete the preview service in Render (will be recreated)

## Environment Strategy

### Option 1: Use Production Credentials (Simpler)
Set preview secrets to the same values as production:
- **Pros:** Single set of credentials, easier to manage
- **Cons:** Preview environments interact with production data

### Option 2: Use Separate Test Credentials (Safer)
Set up a separate test SSI account:
- **Pros:** Complete isolation from production
- **Cons:** More credentials to manage

**Recommendation:** Start with Option 1, move to Option 2 if you have multiple developers or want isolated testing.

## Additional Resources

- **[Full Design Document](./PR-PREVIEW-ENV-VARS.md)** - Complete security architecture and strategies
- **[Workflow Documentation](../.github/workflows/README.md)** - Detailed workflow reference
- **[PR Preview Guide](./PR-PREVIEW-DEPLOYMENTS.md)** - Complete preview deployment documentation
- **[Installation Guide](./installation-guide.md)** - Production environment setup

## Support

If you encounter issues:
1. Check GitHub Actions logs (Actions tab → Select workflow run)
2. Check Render service logs (Render Dashboard → Service → Logs)
3. Review the troubleshooting section above
4. See full documentation in [PR-PREVIEW-ENV-VARS.md](./PR-PREVIEW-ENV-VARS.md)

---

**Setup Time:** ~10 minutes  
**Last Updated:** 2026-02-09
