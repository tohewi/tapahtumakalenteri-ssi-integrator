# PR Preview Deployments on Render

This document describes the automated preview deployment system for pull requests.

## Overview

**Automated preview environments are configured for this repository.** When you open a pull request, a dedicated Render service is automatically created for testing your changes.

### Benefits

- 🚀 **Fully automated** - No manual setup required
- 🔗 **Unique URL per PR** - Each PR gets its own isolated environment
- 🗄️ **Database isolation** - Each PR gets its own PostgreSQL schema (`DB_SCHEMA=pr_{N}`)
- 🧹 **Auto cleanup** - Preview services and database schemas are deleted when PRs are closed
- ✅ **Production-like** - Same configuration as the main service
- 💬 **PR integration** - Preview URLs posted as PR comments

## How It Works

The preview deployment system uses GitHub Actions (`.github/workflows/pr-preview.yml`) to automatically manage Render services:

1. **PR Opened/Updated** → Creates or updates a preview service for the PR branch with its own DB schema
2. **New Commits** → Triggers automatic deployment to the preview service
3. **PR Closed/Merged** → Drops the PR's database schema and deletes the preview service

### Preview Service Naming

Preview services follow this pattern: `ssi-scoring-pr-{NUMBER}`

Example: PR #42 → `ssi-scoring-pr-42`

### Preview URLs

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

Example: `https://ssi-scoring-pr-42.onrender.com`

## Using Preview Environments

### For PR Authors

1. **Open your PR** - The preview service is created automatically
2. **Check PR comments** - GitHub Actions bot posts the preview URL
3. **Wait for deployment** - First deployment takes 3-5 minutes
4. **Test your changes** - Visit the preview URL
5. **Push updates** - New commits trigger automatic redeployment

### For Reviewers

1. **Find the preview URL** in PR comments (posted by github-actions bot)
2. **Visit the preview** to test the changes
3. **Leave feedback** in the PR if issues are found

## Database Schema Isolation

PR previews share a single PostgreSQL instance with production but use **PostgreSQL schemas** for full data isolation:

```
turres-ssi-tools-v8-db (shared Render Starter PG)
├── public              ← v8 production (DB_SCHEMA not set)
├── pr_42               ← PR #42 preview (DB_SCHEMA=pr_42)
├── pr_43               ← PR #43 preview (DB_SCHEMA=pr_43)
└── ...
```

### How It Works

1. Preview service starts with `DB_SCHEMA=pr_{N}` env var
2. `postgres.js` creates the schema if needed (`CREATE SCHEMA IF NOT EXISTS`)
3. Sets `search_path` on every pool connection → all queries target the PR's schema
4. Each schema gets its own tables via the normal `CREATE TABLE IF NOT EXISTS` migrations
5. On PR close, the workflow runs `DROP SCHEMA IF EXISTS "pr_{N}" CASCADE` via `psql`

### Key Properties

- **Zero extra cost** — schemas are free within a single PG instance
- **Full data isolation** — PRs can't read/write each other's data or production data
- **Safe migrations** — destructive schema changes in a PR don't affect production
- **Automatic cleanup** — schema is dropped when PR is closed or merged

### Implementation

- **Backend:** `scoring-proxy/lib/db/postgres.js` — reads `DB_SCHEMA`, creates schema, sets `search_path`
- **Workflow:** `.github/workflows/pr-preview.yml` — passes `DB_SCHEMA=pr_{N}`, runs cleanup on close
- **Production:** Does NOT set `DB_SCHEMA` → defaults to `public` schema

## Configuration

### GitHub Secrets Required

The workflow requires these secrets to be configured in repository settings:

| Secret | Description | How to obtain |
|--------|-------------|---------------|
| `RENDER_API_KEY` | Render API authentication token | Generate in Render Dashboard → Account Settings → API Keys |
| `RENDER_OWNER_ID` | Your Render workspace ID (format: `tea-XXXXXXXXXXXXX`) | Run: `curl --request GET --url 'https://api.render.com/v1/owners?limit=20' --header 'authorization: Bearer YOUR_API_KEY' \| jq '.[0].owner.id'` |
| `RENDER_V8_DATABASE_URL` | Shared v8 PostgreSQL internal connection string | From Render PG dashboard → Internal Connection String |
| `RENDER_V8_DATABASE_EXTERNAL_URL` | Shared v8 PostgreSQL external URL | From Render PG dashboard → External Connection String (for schema cleanup) |
| `RENDER_V8_REDIS_URL` | Shared v8 Redis internal connection string | From Render Redis dashboard → Internal URL |

### Preview Service Configuration

Preview services are configured with:

- **Runtime:** Node.js
- **Plan:** Starter (same as production)
- **Region:** Frankfurt (same as production)
- **Build:** `cd scoring-ui && npm install --include=dev && npm run build && cd ../scoring-proxy && npm install`
- **Start:** `cd scoring-proxy && node server.js`
- **Auto-deploy:** Yes (on every commit to PR branch)
- **Environment Variables:** `NODE_ENV=production` (PORT is set by Render to 10000)

### Environment Variables

Preview services use the same environment variables as production:

- `NODE_ENV=production`
- `PORT=3001`

Additional service-specific secrets (SSI credentials, email API keys, etc.) should be configured manually in Render Dashboard for each preview service if needed, or inherited from the main service environment.

## Implementation Details

### GitHub Actions Workflow

The workflow (`.github/workflows/pr-preview.yml`) handles three scenarios:

#### 1. PR Opened or Reopened

```yaml
- Generates unique service name (ssi-scoring-pr-{NUMBER})
- Checks if service already exists
- Creates new service via Render API if needed
- Posts preview URL as PR comment
```

#### 2. PR Updated (new commits)

```yaml
- Checks if service exists
- Triggers new deployment via Render API
- Updates PR comment with deployment status
```

#### 3. PR Closed or Merged

```yaml
- Finds the preview service
- Deletes service via Render API
- Posts deletion confirmation as PR comment
```

### Render API Integration

The workflow uses the Render REST API:

- **Create Service:** `POST /v1/services`
- **List Services:** `GET /v1/services?name={SERVICE_NAME}`
- **Trigger Deploy:** `POST /v1/services/{SERVICE_ID}/deploys`
- **Delete Service:** `DELETE /v1/services/{SERVICE_ID}`

API Documentation: https://api-docs.render.com/

## Alternative Options

While the automated system works well, here are alternative approaches for specific use cases:

## Alternative Options

While the automated system works well, here are alternative approaches for specific use cases:

### Option 1: Render Native Preview Environments

Render's built-in preview environment feature (requires Team plan or higher for private repos).

**When to use:**
- You have a Render Team plan ($19/month per user) or higher
- You want Render to manage everything natively
- You prefer no GitHub Actions configuration

**Setup:**
1. In Render Dashboard → Service Settings → Pull Request Previews
2. Enable "Pull Request Previews"
3. Set branch pattern (e.g., `*` for all branches)
4. Update `render.yaml`:
   ```yaml
   previews:
     generation: automatic
     expireAfterDays: 3
   ```

**Note:** The current implementation uses GitHub Actions because it works with all Render plans, including the free tier.

### Option 2: Manual Preview Services

Create additional Render services manually for specific branches that need testing.

**When to use:**
- For critical PRs that need extended testing
- When you want a preview to persist beyond PR closure
- For demo/staging purposes

**Setup:**
1. Render Dashboard → New → Web Service
2. Connect the same GitHub repository
3. Configure:
   - **Name:** `ssi-scoring-demo-{feature}`
   - **Branch:** Your specific branch
   - **Build/Start:** Same as main service
4. Copy environment variables from main service
5. Manually delete when no longer needed

## Troubleshooting

### Workflow Fails to Create Service

**Possible causes:**
- `RENDER_API_KEY` secret not set or invalid
- `RENDER_OWNER_ID` secret not set or invalid
- Insufficient permissions on Render API key
- Service name conflict

**Solutions:**
1. Verify secrets are set in GitHub repository settings
2. Generate a new API key in Render Dashboard → Account Settings → API Keys
3. Ensure API key has permissions to create/delete services
4. Check workflow logs for specific error messages

### Preview URL Returns 502/503

**Cause:** Render services spin down after 15 minutes of inactivity (free/starter plans)

**Solution:** 
- Wait 30-60 seconds and refresh
- First request after spin-down wakes the service
- Consider upgrading to a paid plan for always-on services

### Preview Deployment Takes Too Long

**Normal behavior:**
- First deployment: 3-5 minutes (install dependencies + build)
- Subsequent deployments: 2-3 minutes (cached dependencies)

**If slower:**
- Check Render Dashboard → Service → Events for build logs
- Verify no errors in build process
- Check if dependency cache is working

### Environment Variables Not Working

**Cause:** Preview services are created with minimal environment variables

**Solution:**
- Manually add required secrets in Render Dashboard
- Or update workflow to copy environment variables from main service
- Consider using separate test credentials for preview environments

### PR Comment Not Posted

**Possible causes:**
- GitHub Actions bot doesn't have `pull-requests: write` permission
- Network issue during comment creation

**Solution:**
- Verify `permissions:` section in workflow file
- Check workflow logs for errors
- Manually find preview URL in Render Dashboard

### Service Not Deleted After PR Closes

**Possible causes:**
- Workflow failed during deletion step
- Service name mismatch
- API permission issue

**Solution:**
- Manually delete service in Render Dashboard
- Check workflow logs for deletion errors
- Verify API key has delete permissions

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

## Cost Considerations

The automated preview deployment system works with all Render plans:

| Plan | Preview Deployment | Notes |
|------|-------------------|-------|
| **Free** | ✅ Works with GitHub Actions | Services created via API, cleaned up automatically |
| **Individual ($7/mo)** | ✅ Works with GitHub Actions | Same as free |
| **Team ($19/mo per user)** | ✅ Native + GitHub Actions | Can use Render's native preview or keep GitHub Actions |

**Recommendation:** Use the GitHub Actions approach (current implementation) as it works across all plan tiers.

## Related Documentation

- [Render API Documentation](https://api-docs.render.com/)
- [GitHub Actions Workflow](./.github/workflows/pr-preview.yml) - Implementation
- [Installation Guide](./installation-guide.md) - Main deployment setup
- [Branching Strategy](./BRANCHING-STRATEGY.md) - GitHub Flow branching model
- [CI/CD Pipeline](./.github/workflows/ci-deploy.yml) - Main CI/CD workflow

## Summary

**Automated Preview Deployments:**

✅ **Enabled** - Preview environments are automatically created for all pull requests

**How it works:**
1. Open PR → GitHub Actions creates preview service on Render
2. Push commits → Preview service automatically redeploys
3. Close PR → Preview service is automatically deleted
4. Check PR comments for preview URLs

**Requirements:**
- `RENDER_API_KEY` and `RENDER_OWNER_ID` secrets configured in GitHub
- Preview services use same configuration as production
- First deployment takes 3-5 minutes

Preview deployments help catch issues early and give confidence before merging to production!
