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

- **Generation:** `manual` — only creates a preview when PR title contains `[render preview]`
- **Expiry:** 3 days of inactivity
- **Plan:** `starter` for preview instances

### Creating a Preview Environment

1. Push your feature branch to GitHub
2. Open a Pull Request targeting `main`
3. Add `[render preview]` to the PR title, e.g.: `[render preview] Add summary drill-down feature`
4. Render automatically creates a preview instance and posts the URL in the PR status checks
5. Click "View deployment" in the PR to open the preview

### Skipping Previews

If a PR should NOT get a preview (generation is manual, so this is the default), just don't include `[render preview]` in the title.

### Preview Environment Lifecycle

- **Created:** When PR with `[render preview]` in title is opened
- **Updated:** On every push to the PR branch
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
- **Preview environments** — created from PRs with `[render preview]` in title
- CI runs on all PRs to `main` (tests, audit, build)

## Troubleshooting

- **Deploy failed:** Check Render logs with `list_logs` or the Render Dashboard
- **Preview not created:** Ensure `[render preview]` is in the PR title (case-sensitive)
- **Port issues:** The service uses PORT=3001, set via render.yaml envVars
