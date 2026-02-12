# Copilot Coding Agent Instructions

## Agent Instructions (Cascade & Copilot)

- When starting work on a requirement, create a **new branch** from `main` (or the correct base branch per the branching guide).
- **Branch naming:** start with the requirement number, then include the work type (feature/hotfix) in the name.
  - Example: `R12-feature-staffing-filters` or `R07-hotfix-squad-sync`.
- **Commit messages:** explain how the commit advances the requirement toward completion. Include the requirement number in the subject or body.
- When a requirement is completed and tests pass, **update the requirements document** to mark it ✅ **Implemented/Ready**.
- **Keep instructions in sync:** if you modify these agent instructions, update **both** `AGENTS.md` and `.github/copilot-instructions.md` with the same changes.

## Project Overview

This is a **shooting competition management system** (SSI Scoring) with two main components:

- **scoring-ui/** — React frontend (Vite, TailwindCSS), mobile-first design
- **scoring-proxy/** — Express.js backend proxy to ShootNScoreIt (SSI) API

**Key terminology:**
- **Cup:** A shooting competition event
- **Match:** A specific discipline within a cup
- **Squad:** A group of competitors assigned to shoot at the same time
- **SSI:** ShootNScoreIt, the external competition management system

## Repository Structure

```
├── scoring-ui/              # React frontend (Vite + TailwindCSS)
│   ├── src/
│   │   ├── main.jsx         # Hash-based routing
│   │   ├── App.jsx          # Scoring app (state machine)
│   │   ├── api.js           # API client
│   │   └── components/      # Page components
│   └── package.json
│
├── scoring-proxy/           # Express backend
│   ├── server.js            # All endpoints
│   ├── lib/
│   │   ├── ssi-client.js    # SSI GraphQL + web scraping
│   │   └── email.js         # Email via Resend API
│   └── package.json
│
├── render.yaml              # Render Blueprint (deploy config)
├── docs/                    # Documentation
└── config/                  # Cup templates and defaults
```

## Development Workflow

### Building

```bash
# Frontend build
cd scoring-ui && npm install && npm run build

# Backend dependencies
cd scoring-proxy && npm install
```

### Local Development

```bash
# Start the server (serves both API and built frontend)
cd scoring-proxy && node server.js
# Runs on http://localhost:3001
```

### Code Style

- No TypeScript — plain JavaScript (ES modules)
- React with hooks for state management
- TailwindCSS for styling (mobile-first)
- No comments/documentation changes unless explicitly requested
- Follow existing patterns in the codebase

## Deployment

### Render Production

The service `ssi-scoring` auto-deploys from `main` when code is merged.

1. Create a feature branch from `main`
2. Make changes, commit, push the feature branch
3. Open a PR targeting `main`
4. CI runs tests, audit, and build
5. Preview environment is automatically created for the PR
6. After merge to `main`, Render auto-deploys to production
7. Preview environment is automatically deleted

### Render Preview Environments

Preview environments are **automatically created** for all pull requests via GitHub Actions (`.github/workflows/pr-preview.yml`):

- **Generation:** Automatic — created by GitHub Actions when PR is opened
- **Deployment:** Automatic — redeploys on every commit to PR branch
- **Cleanup:** Automatic — deleted when PR is closed or merged
- **Expiry:** Services persist until PR closes (no time-based expiry)
- **Plan:** Starter instances (same as production)
- **Naming:** `ssi-scoring-pr-{NUMBER}` (e.g., `ssi-scoring-pr-42`)
- **URL:** `https://ssi-scoring-pr-{NUMBER}.onrender.com`

**How it works:**
1. Open a PR targeting `main`
2. GitHub Actions workflow automatically creates a Render service
3. Preview URL is posted as a PR comment by github-actions bot
4. Push new commits → Preview automatically redeploys
5. Close/merge PR → Preview service is automatically deleted

**Requirements:**
- GitHub secrets:
  - `RENDER_API_KEY` - API token from Render Dashboard → Account Settings → API Keys
  - `RENDER_OWNER_ID` - Workspace ID (`tea-d62r4ucoud1c73d50qg0` for this repo)
- See `docs/PR-PREVIEW-DEPLOYMENTS.md` for complete documentation

**Troubleshooting:**
- Check workflow logs in GitHub Actions tab if preview creation fails
- Verify secrets are configured in repository settings
- Preview services may take 30-60 seconds to wake up after inactivity

### Render MCP Tools

The Render MCP server is configured for this repository. Available tools:

**Workspace Management:**
- **render-list_workspaces** — List the workspaces that you have access to
- **render-get_selected_workspace** — Get the currently selected workspace
- **render-select_workspace** — Select a workspace to use for all actions (requires ownerID)

**Service Management:**
- **render-list_services** — List all services in your Render account (optional: includePreviews)
- **render-get_service** — Get details about a specific service (requires serviceId)

**Deployment Tracking:**
- **render-list_deploys** — List deploys matching the provided filters (requires serviceId, optional: cursor, limit)
- **render-get_deploy** — Retrieve the details of a particular deploy (requires serviceId, deployId)

**Monitoring & Metrics:**
- **render-get_metrics** — Get performance metrics for any Render resource (requires resourceId, metricTypes array, optional: startTime, endTime, resolution, etc.)

**Database Management:**
- **render-list_postgres_instances** — List all Postgres databases in your Render account
- **render-get_postgres** — Retrieve a Postgres instance by ID (requires postgresId)
- **render-create_postgres** — Create a new Postgres instance (requires name, optional: plan, region, version, diskSizeGb)

**Key-Value Store:**
- **render-create_key_value** — Create a new Key Value instance (requires name, optional: plan, region, maxmemoryPolicy)

Use these to check deploy status, view logs, monitor service performance, and manage infrastructure after making changes. See `docs/render-services.md` for detailed documentation and examples.

## Git Workflow

- **Production branch:** `main` (auto-deploys to Render)
- **Remote name:** `tapahtumakalenteri-ssi-integrator`
- **Feature branches:** Create from `main`, open PR targeting `main`
- **Preview environments:** Automatically created by GitHub Actions for every PR
- **CI/CD:** Two workflows run on PRs:
  - `ci-deploy.yml` - Tests, audit, build (required to pass)
  - `pr-preview.yml` - Creates/updates/deletes preview environments

## Key Files for Common Tasks

| Task | Files |
|------|-------|
| Add API endpoint | `scoring-proxy/server.js`, `scoring-ui/src/api.js` |
| Add new page | `scoring-ui/src/components/NewPage.jsx`, `scoring-ui/src/main.jsx` |
| Modify SSI integration | `scoring-proxy/lib/ssi-client.js` |
| Update home navigation | `scoring-ui/src/components/HomePage.jsx` |
| Change deploy config | `render.yaml` |

## Important Constraints

- SSI API requires authentication via session cookies (stored in-memory on server)
- Server restart clears all sessions — users must re-login
- The proxy serves the built frontend from `scoring-ui/dist/`
- Environment variables: `NODE_ENV=production`, `PORT=3001`
- Max JSON body size: 10kb
