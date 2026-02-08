# Copilot Coding Agent Instructions

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

The service `ssi-scoring` auto-deploys from the branch linked in the Render Blueprint when pushed.

1. Build frontend: `cd scoring-ui && npm run build`
2. Commit changes
3. Push to `feature/scoring-ui-prototype` branch
4. Render auto-deploys

### Render Preview Environments

Preview environments are configured for PR-based testing:

- **Generation:** Manual — add `[render preview]` to PR title to trigger
- **Expiry:** 3 days of inactivity
- **Plan:** Starter instances for cost control

**To create a preview:**
1. Push feature branch to GitHub
2. Open a PR with `[render preview]` in the title
3. Render creates a disposable instance and posts the URL in PR status checks
4. Preview is destroyed when PR is merged/closed or after 3 days

### Render MCP Tools

The Render MCP server is configured for this repository. Available tools:

- **list_services** — list all services in the workspace
- **get_service** — get details of a specific service
- **list_deploys** — view deploy history for a service
- **get_deploy** — get details of a specific deploy
- **list_logs** — view service logs with filters
- **get_service_metrics** — CPU, memory, response metrics

Use these to check deploy status, view logs, and monitor the service after making changes.

## Git Workflow

- **Main deploy branch:** `feature/scoring-ui-prototype`
- **Remote name:** `tapahtumakalenteri-ssi-integrator`
- **Push command:** `git push tapahtumakalenteri-ssi-integrator feature/scoring-ui-prototype`
- **Feature branches:** Create from `feature/scoring-ui-prototype`, open PR when ready

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
