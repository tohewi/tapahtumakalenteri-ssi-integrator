# PR Preview Deployments on Render

This document describes how to deploy pull request branches to Render for testing before merging to main.

## Overview

Render supports **Preview Environments** that automatically deploy pull requests for testing. This allows you to:

- Test changes in a production-like environment before merging
- Share working previews with reviewers and stakeholders
- Catch integration issues early
- Validate CI/CD changes safely

## Solution Options

### Option 1: Render Preview Environments (Recommended)

Render's native preview environment feature automatically creates temporary deployments for each pull request.

**Pros:**
- Fully automated - no manual intervention needed
- Each PR gets its own isolated URL
- Automatically cleaned up when PR is closed/merged
- Free for open source projects on Render's free tier

**Cons:**
- Requires Render Team plan ($19/month per team member) or higher for private repos
- Free tier has limitations (fewer resources, may spin down after inactivity)

#### Setup Instructions

1. **Enable Preview Environments in Render Dashboard:**
   - Go to your service (`ssi-scoring`) in Render dashboard
   - Navigate to **Settings → Pull Request Previews**
   - Click **Enable Preview Environments**
   - Configure:
     - **Auto-deploy**: Enable (recommended)
     - **Branch pattern**: `*` or specific patterns like `copilot/*`

2. **Configure Environment Variables:**
   - Preview environments inherit environment variables from the main service
   - For testing, you may want to use test credentials
   - Option A: Use same production SSI account (careful with test data!)
   - Option B: Create separate test environment variables in Render dashboard

3. **Update render.yaml (optional):**
   ```yaml
   projects:
     - name: SSI Scoring
       environments:
         - name: production
           previews:
             generation: manual
             expireAfterDays: 7
           services:
             - type: web
               name: ssi-scoring
               runtime: node
               buildCommand: cd scoring-ui && npm install && npm run build && cd ../scoring-proxy && npm install
               startCommand: cd scoring-proxy && node server.js
               previews:
                 plan: starter
               envVars:
                 - key: NODE_ENV
                   value: production
                 - key: PORT
                   value: 3001
   ```

4. **Test the Setup:**
   - Open a new PR or update an existing one
   - Render will automatically create a preview deployment
   - Check the PR for a comment from Render with the preview URL
   - Visit the URL to test your changes

#### Preview Environment URLs

Format: `https://ssi-scoring-pr-<NUMBER>.onrender.com`

Example: `https://ssi-scoring-pr-123.onrender.com` for PR #123

### Option 2: Manual Preview Services

Create additional Render services manually for specific branches that need testing.

**Pros:**
- Works with any Render plan (including free)
- Full control over which branches get deployed
- Can keep preview environments running indefinitely

**Cons:**
- Manual setup required for each preview
- Must manually clean up when done
- Requires managing multiple services

#### Setup Instructions

1. **Create a New Web Service:**
   - In Render dashboard: **New → Web Service**
   - Connect the same GitHub repository
   - Configure:
     - **Name**: `ssi-scoring-preview-<branch-name>`
     - **Branch**: Your PR branch name (e.g., `copilot/refactor-application-and-cicd`)
     - **Build/Start Commands**: Same as main service
     - **Auto-Deploy**: Enable (deploys on every push to the branch)

2. **Copy Environment Variables:**
   - Go to main service → Environment
   - Copy all environment variables to the new preview service
   - Consider using test credentials if available

3. **Access the Preview:**
   - Render assigns a URL like `https://ssi-scoring-preview-feature.onrender.com`
   - Share this URL for testing

4. **Clean Up:**
   - Delete the preview service when PR is merged or closed
   - Go to service settings → Delete Service

### Option 3: GitHub Actions + Render API

Use GitHub Actions to automatically create/destroy Render services for PRs.

**Pros:**
- Fully automated
- Works with free Render tier
- Complete control via workflow

**Cons:**
- Requires workflow development
- Need to manage Render API tokens
- More complex to set up

#### Implementation Outline

1. **Create GitHub Workflow** (`.github/workflows/pr-preview.yml`):
   ```yaml
   name: PR Preview Environment
   
   on:
     pull_request:
       types: [opened, synchronize, reopened, closed]
   
   jobs:
     preview:
       runs-on: ubuntu-latest
       steps:
         - name: Create/Update Preview
           if: github.event.action != 'closed'
           run: |
             # Use Render API to create/update service
             # https://api-docs.render.com/reference/create-service
             
         - name: Delete Preview
           if: github.event.action == 'closed'
           run: |
             # Use Render API to delete service
   ```

2. **Store Render API Token:**
   - Generate API token in Render dashboard
   - Add as `RENDER_API_TOKEN` secret in GitHub

3. **Implement service creation/deletion logic**

## Recommendation

**For this project, we recommend Option 1 (Render Preview Environments)** if budget allows, or **Option 2 (Manual Preview Services)** for the free tier.

### Current Limitation

The current free tier on Render may not support automatic preview environments. In that case:

1. **Use Option 2** for critical PRs that need stakeholder review
2. Create preview service manually when needed
3. Delete when PR is closed/merged

### Example Workflow

For a PR that needs testing:

```bash
# 1. Create PR with your changes
git push origin copilot/refactor-application-and-cicd

# 2. Manually create preview service in Render:
#    - Name: ssi-scoring-preview-refactor
#    - Branch: copilot/refactor-application-and-cicd
#    - Copy env vars from main service

# 3. Share preview URL for testing:
#    https://ssi-scoring-preview-refactor.onrender.com

# 4. After PR is merged, delete the preview service
```

## Testing Checklist

When testing in a preview environment:

- [ ] Scoring UI loads correctly
- [ ] Registration form works
- [ ] SSI authentication succeeds
- [ ] Can browse cups and matches
- [ ] Email confirmations are sent (check spam folder!)
- [ ] Mobile responsive layout works
- [ ] No console errors in browser DevTools
- [ ] API endpoints respond correctly

## Environment Variables for Preview

Preview environments should use the same environment variables as production, but consider:

| Variable | Production | Preview |
|----------|-----------|---------|
| `SSI_ADMIN_EMAIL` | Production admin | Same or test admin |
| `SSI_ADMIN_PASSWORD` | Production password | Same or test password |
| `SSI_ADMIN_API_KEY` | Production API key | Same or test API key |
| `RESEND_API_KEY` | Production email | Same (sends real emails) |
| `EMAIL_FROM` | Production sender | Consider adding "[TEST]" prefix |
| `NODE_ENV` | `production` | `production` |

**Important:** If using production SSI credentials, be careful about creating test events that might confuse real users!

## Troubleshooting

### Preview Deployment Fails

- Check build logs in Render dashboard
- Verify all environment variables are set
- Ensure the branch exists and is pushed to GitHub

### Preview URL Returns 502/503

- Render free tier services spin down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds to wake up
- Refresh after 30-60 seconds

### Environment Variables Not Working

- Environment variables must be set in Render dashboard
- They don't automatically copy from the main service
- Update manually or use Render API to copy them

## Cost Considerations

| Plan | Preview Environments | Notes |
|------|---------------------|-------|
| **Free** | Manual only (Option 2) | Create services manually for specific PRs |
| **Individual ($7/mo)** | Manual only | Same as free |
| **Team ($19/mo per user)** | Automatic (Option 1) | Recommended for active development |

For this open-source project, **stick with manual preview services** (Option 2) as needed.

## Related Documentation

- [Render Preview Environments Docs](https://render.com/docs/preview-environments)
- [Render API Documentation](https://api-docs.render.com/)
- [Installation Guide](./installation-guide.md) - Main deployment setup
- [Branching Strategy](./BRANCHING-STRATEGY.md) - GitHub Flow branching model

## Summary

**Quick Start for Preview Deployments:**

1. If using Render Team plan → Enable Preview Environments in dashboard
2. If using free tier → Create manual preview service for PR branch
3. Share preview URL with reviewers
4. Test thoroughly using the checklist above
5. Delete preview service after PR is merged

Preview deployments help catch issues early and give confidence before merging to production!
