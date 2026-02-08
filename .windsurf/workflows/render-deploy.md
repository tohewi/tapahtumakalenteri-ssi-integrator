---
description: How to deploy to Render and use preview environments for feature branch testing
---

# Render Deployment Workflow

## Project Structure

- **Service:** `ssi-scoring` (web service on Render)
- **Blueprint:** `render.yaml` at repo root
- **Branch:** `main` is the production deploy branch
- **Build:** `cd scoring-ui && npm install && npm run build && cd ../scoring-proxy && npm install`
- **Start:** `cd scoring-proxy && node server.js`

## Production Deploy

Production deploys automatically when code is merged to `main`.

1. Create a feature branch from `main`:
```
git checkout main && git pull && git checkout -b feature/my-feature
```

2. Make changes, commit, and push:
```
git add -A && git commit -m "your commit message"
git push tapahtumakalenteri-ssi-integrator feature/my-feature
```

3. Open a Pull Request targeting `main`
4. CI runs tests, audit, and build
5. After PR is approved and merged, Render auto-deploys from `main`

Monitor via Render Dashboard or the Render MCP tools (`list_deploys`, `get_deploy`, `list_logs`).

## Preview Environments (Feature Branch Testing)

Preview environments create a disposable copy of the service for each PR, so you can test feature branches before merge.

### Configuration (already set up in render.yaml)

- **Generation:** `manual` — previews must be manually created via Render Dashboard or API
- **Expiry:** 3 days of inactivity
- **Plan:** `starter` for preview instances

### Creating a Preview Environment

Previews must be manually created for each PR that needs testing:

**Option 1: Via Render Dashboard (recommended)**
1. Push your feature branch to GitHub
2. Open a Pull Request targeting `main`
3. Go to the [Render Dashboard](https://dashboard.render.com)
4. Navigate to the `ssi-scoring` service
5. Click "Preview Environments" tab
6. Click "New Preview Environment"
7. Select the PR or branch to deploy
8. Render creates the preview and provides a URL

**Option 2: Via Render API**
Use the Render API to programmatically create previews. See [Render API docs](https://api-docs.render.com/) for details.

### Preview Environment Lifecycle

- **Created:** Manually via Render Dashboard or API
- **Updated:** Automatically on every push to the PR branch
- **Destroyed:** When PR is merged, closed, or after 3 days without commits

## Render MCP Tools (available in Windsurf)

The Render MCP server is configured and provides these tools:

- **list_services** — list all services in the workspace
- **get_service** — get details of a specific service
- **list_deploys** — view deploy history
- **get_deploy** — get details of a specific deploy
- **list_logs** — view service logs
- **get_service_metrics** — CPU, memory, response times

### Example prompts

- "List my Render services"
- "Show the latest deploy for ssi-scoring"
- "Show logs for ssi-scoring from the last hour"
- "What are the CPU metrics for ssi-scoring?"

## Branch Strategy

- **`main`** — production branch, auto-deploys to Render
- **`feature/*`** — feature branches, create PRs to `main`
- **Preview environments** — manually created via Render Dashboard for PR testing
- CI runs on all PRs to `main` (tests, audit, build)

## Troubleshooting

- **Deploy failed:** Check Render logs with `list_logs` or the Render Dashboard
- **Preview not created:** Previews must be manually created via the Render Dashboard - navigate to the service and click "New Preview Environment"
- **Port issues:** The service uses PORT=3001, set via render.yaml envVars
