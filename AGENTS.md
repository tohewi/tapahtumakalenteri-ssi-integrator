# Agent Instructions (Cascade & Copilot)

- When starting work on a requirement, create a **new branch** from `main` (or the correct base branch per the branching guide).
- **Branch naming:** start with the requirement number, then include the work type (feature/hotfix) in the name.
  - Example: `R12-feature-staffing-filters` or `R07-hotfix-squad-sync`.
- **Commit messages:** explain how the commit advances the requirement toward completion. Include the requirement number in the subject or body.
- When a requirement is completed and tests pass, **update the requirements document** to mark it ✅ **Implemented/Ready**.
- **Keep instructions in sync:** if you modify these agent instructions, update **both** `AGENTS.md` and `.github/copilot-instructions.md` with the same changes.

For full project context, see: `.github/copilot-instructions.md`.

## Project Overview

This is a **shooting competition management system** to help setting up events in SSI (ShootnScoreIt, a SaaS service for competition management) with two main components:

- **scoring-ui/** — React frontend (Vite, TailwindCSS), mobile-first design
- **scoring-proxy/** — Express.js backend proxy to ShootNScoreIt (SSI) API

**Key terminology:**
- **Cup:** A shooting competition event that contains multiple matches
- **Match:** A shooting competition in a specific discipline. Match can be in a cup or in a league, or be a standalone match.
- **Squad:** A group of competitors assigned to shoot a stage together.
- **Stage:** A stage is a carefully designed challenge, presenting a unique set of targets, obstacles, and engagement scenarios. Each stage is a part of a match.
- **SSI:** ShootNScoreIt, the external competition management system

## Repository Structure

```
├── scoring-ui/              # React frontend (Vite + TailwindCSS)
│   ├── src/
│   │   ├── main.jsx         # Hash-based routing
│   │   ├── App.jsx          # Scoring app (state machine)
│   │   ├── api.js           # API client
│   │   ├── i18n.js          # Internationalization (fi/en)
│   │   └── components/      # Page components
│   └── package.json
│
├── scoring-proxy/           # Express backend
│   ├── server.js            # Main server + session management
│   ├── routes/
│   │   ├── auth.js          # Authentication (login, session, allowlist)
│   │   └── staffing.js      # Staffing endpoints (signup, resign, sync)
│   ├── lib/
│   │   ├── ssi-client.js    # SSI GraphQL + web scraping
│   │   ├── email.js         # Email via Resend API
│   │   └── staffing/        # Staffing engine
│   │       ├── engine.js    # Core staffing logic
│   │       └── config-loader.js  # Config loading + helpers
│   └── package.json
│
├── config/                  # Cup templates and defaults
│   └── sra-training-config.yml  # SRA staffing config (roles, allowlist, service accounts)
├── test-harness/            # E2E test scripts
├── render.yaml              # Render Blueprint (deploy config)
└── docs/                    # Documentation
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
Please run local development environment on port 3001, as local FW has been configured to allow that traffic.
```bash
# Start the server (serves both API and built frontend)
cd scoring-proxy && node server.js
# Runs on http://localhost:3001
```

### Code Style

- No TypeScript — plain JavaScript (ES modules)
- React with hooks for state management
- TailwindCSS for styling (mobile-first)
- Always add comments and maintain documentation up to date
- Follow existing patterns in the codebase
- If you want to refactor, please prepare a plan and reasoning and ask for approval before starting.

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
| Modify staffing logic | `scoring-proxy/lib/staffing/engine.js`, `scoring-proxy/routes/staffing.js` |
| Modify staffing config | `config/sra-training-config.yml`, `scoring-proxy/lib/staffing/config-loader.js` |
| Update staffing UI | `scoring-ui/src/components/StaffingPage.jsx` |
| Add/update translations | `scoring-ui/src/i18n.js` |
| Modify authentication | `scoring-proxy/routes/auth.js` |

## Important Constraints

- **All infrastructure must be deployed in Europe** (Render region: `frankfurt`). This applies to all services, databases, and Key Value instances — both in `render.yaml` and in GitHub Actions preview workflows. Never deploy to US or other non-EU regions.
- SSI API requires authentication via session cookies (stored in-memory on server)
  - Note that there is User session cookie and Admin session cookie.
  - User session cookie is to verify user identity and access user data.
  - Admin session cookie is used in most of the SSI API calls.
- Server restart clears all sessions — users must re-login
- The proxy serves the built frontend from `scoring-ui/dist/`
- Environment variables:
  - `NODE_ENV=development`, `PORT=3001` for local development
  - `NODE_ENV=production` for production do not specify PORT. Render will assign a port.
- Max JSON body size: 10kb
