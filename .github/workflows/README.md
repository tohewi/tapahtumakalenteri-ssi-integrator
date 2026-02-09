# GitHub Actions Workflows

This directory contains the CI/CD workflows for the tapahtumakalenteri-ssi-integrator project.

## Workflows

### 1. ci-deploy.yml - Main CI/CD Pipeline

**Purpose:** Runs tests, security audits, and deploys to production.

**Triggers:**
- Pull requests targeting `main` (runs tests only)
- Pushes to `main` (runs tests + deploys to production)

**Steps:**
1. Install dependencies (UI and proxy)
2. Run unit tests (UI and proxy)
3. Security vulnerability scan (npm audit)
4. Build production assets
5. Deploy to Render production (main branch only)

**Required Secrets:**
- `RENDER_DEPLOY_HOOK` - Deploy webhook URL from Render Dashboard

### 2. pr-preview.yml - PR Preview Environments

**Purpose:** Automatically creates, updates, and deletes preview environments for pull requests.

**Triggers:**
- `opened` - Creates a new preview service on Render
- `synchronize` - Updates the preview service when new commits are pushed
- `reopened` - Re-creates preview service if needed
- `closed` - Deletes the preview service

**How It Works:**

1. **Service Creation (PR opened):**
   - Generates unique service name: `ssi-scoring-pr-{NUMBER}`
   - Creates Render service via API with same config as production
   - Posts preview URL as PR comment

2. **Service Update (new commits):**
   - Checks if service exists
   - Triggers new deployment via Render API
   - Updates PR comment with deployment status

3. **Service Deletion (PR closed):**
   - Finds the preview service by name
   - Deletes service via Render API
   - Posts deletion confirmation as PR comment

**Required Secrets:**
- `RENDER_API_KEY` - Render API authentication token
  - Generate in: Render Dashboard → Account Settings → API Keys
  - Needs permissions: Create, update, delete services
- `RENDER_OWNER_ID` - Your Render workspace ID (format: `tea-XXXXXXXXXXXXX`)
  - Find by running: `curl --request GET --url 'https://api.render.com/v1/owners?limit=20' --header 'authorization: Bearer YOUR_API_KEY' | jq '.[0].owner.id'`
  - For this repository: `tea-d62r4ucoud1c73d50qg0`

**Preview Service Configuration:**
- **Runtime:** Node.js
- **Plan:** Starter (same as production)
- **Region:** Frankfurt (same as production)
- **Build Command:** `cd scoring-ui && npm install --include=dev && npm run build && cd ../scoring-proxy && npm install`
- **Start Command:** `cd scoring-proxy && node server.js`
- **Auto-deploy:** Yes (on every commit to PR branch)
- **Environment Variables:** `NODE_ENV=production`, `PORT=3001`

**Preview URLs:**
- Format: `https://ssi-scoring-pr-{NUMBER}.onrender.com`
- Example: PR #42 → `https://ssi-scoring-pr-42.onrender.com`

## Setting Up Required Secrets

### For Repository Maintainers

1. **Navigate to Repository Settings:**
   ```
   GitHub Repository → Settings → Secrets and variables → Actions
   ```

2. **Add RENDER_API_KEY:**
   - Click "New repository secret"
   - Name: `RENDER_API_KEY`
   - Value: Your Render API key from Render Dashboard → Account Settings → API Keys
   - Save

3. **Add RENDER_OWNER_ID:**
   - Click "New repository secret"
   - Name: `RENDER_OWNER_ID`
   - Value: Your Render workspace ID (format: `tea-XXXXXXXXXXXXX`)
   - **To find this ID:**
     - **Method 1 (Recommended):** Use the Render API `/v1/owners` endpoint:
       ```bash
       # In Bash or PowerShell:
       curl --request GET --url 'https://api.render.com/v1/owners?limit=20' --header 'accept: application/json' --header 'authorization: Bearer YOUR_API_KEY' | jq '.[0].owner.id'
       
       # In Windows CMD:
       curl --request GET --url "https://api.render.com/v1/owners?limit=20" --header "accept: application/json" --header "authorization: Bearer YOUR_API_KEY" | jq ".[0].owner.id"
       ```
     - **Method 2 (Alternative):** Query existing services:
       ```bash
       curl -H "Authorization: Bearer YOUR_API_KEY" https://api.render.com/v1/services | jq '.[0].ownerId'
       ```
     - The workspace ID for this repository is: `tea-d62r4ucoud1c73d50qg0`
   - Save

4. **Add RENDER_DEPLOY_HOOK (if not already set):**
   - Click "New repository secret"
   - Name: `RENDER_DEPLOY_HOOK`
   - Value: Deploy hook URL from Render Dashboard → Service → Settings → Deploy Hook
   - Save

## Workflow Permissions

Both workflows require specific permissions:

```yaml
permissions:
  pull-requests: write  # For posting PR comments
  contents: read        # For checking out code
```

These permissions are configured in each workflow file and should not need modification.

## Troubleshooting

### Preview Service Not Created

**Symptoms:** No PR comment with preview URL appears

**Possible Causes:**
1. `RENDER_API_KEY` not set or invalid
2. `RENDER_OWNER_ID` not set or invalid
3. Insufficient API key permissions
4. Workflow failed (check Actions tab)

**Solutions:**
1. Verify secrets in repository settings
2. Check workflow logs in GitHub Actions tab
3. Ensure API key has create/delete permissions
4. Regenerate API key if needed

### Preview Deployment Fails

**Symptoms:** Service created but deployment fails

**Possible Causes:**
1. Build errors (npm install/build failures)
2. Invalid branch reference
3. Render service quota exceeded

**Solutions:**
1. Check Render Dashboard → Service → Events for build logs
2. Verify branch exists and is pushed
3. Check Render account limits

### PR Comment Not Posted

**Symptoms:** Service created but no PR comment

**Possible Causes:**
1. Workflow lacks `pull-requests: write` permission
2. GitHub Actions bot blocked
3. API rate limit exceeded

**Solutions:**
1. Verify `permissions:` in workflow file
2. Check workflow logs for errors
3. Manually find service in Render Dashboard

### Service Not Deleted After PR Close

**Symptoms:** Preview service still exists after PR closed

**Possible Causes:**
1. Workflow failed during deletion
2. Service name mismatch
3. API permission issue

**Solutions:**
1. Check workflow logs in closed PR
2. Manually delete in Render Dashboard
3. Verify API key has delete permissions

## Monitoring

### GitHub Actions

View workflow runs:
```
Repository → Actions tab → Select workflow → View run logs
```

### Render Dashboard

Monitor deployments:
```
Render Dashboard → Services → Select service → Events tab
```

View service logs:
```
Render Dashboard → Services → Select service → Logs tab
```

## Documentation

For detailed documentation, see:

- **[PR Preview Deployments](../../docs/PR-PREVIEW-DEPLOYMENTS.md)** - Complete preview environment guide
- **[Branching Strategy](../../docs/BRANCHING-STRATEGY.md)** - GitHub Flow and release process
- **[Render API Docs](https://api-docs.render.com/)** - Render API reference

## Maintenance

### Updating Workflow

When modifying workflows:

1. Test changes in a feature branch first
2. Verify workflow syntax with yamllint
3. Test with a real PR before merging
4. Update this README if behavior changes

### Updating Service Configuration

To update preview service configuration:

1. Edit `pr-preview.yml` → `Create preview service` step
2. Modify the `PAYLOAD` JSON with new configuration
3. Test with a PR to ensure services are created correctly

Example: To change region from Frankfurt to Oregon:

```yaml
"region": "oregon",  # Changed from "frankfurt"
```

## Support

For issues or questions:

1. Check [documentation](../../docs/)
2. Review [GitHub Actions logs](../../actions)
3. Check [Render service status](https://status.render.com/)
4. Open an issue in this repository

---

**Last Updated:** 2026-02-09
**Workflow Version:** 1.0
