# SSI Kupittaa Cup — Scoring & Registration

Scoring and registration system for TurRes Kupittaa RESUL CUP shooting competitions, integrated with [ShootNScoreIt (SSI)](https://shootnscoreit.com).

## Architecture

Single-server architecture: `scoring-proxy` serves both the API and the built `scoring-ui` frontend.

```
scoring-ui/          React + Tailwind frontend (Vite)
  #/                 Scoring UI (login → cup → match → squad → scoring)
  #/register         Registration UI (captcha → cup → squad → email → submit)

scoring-proxy/       Express.js backend
  /api/auth/*        Scoring authentication (per-user SSI sessions)
  /api/cups          Cup/match/competitor queries (GraphQL)
  /api/register/*    Registration endpoints (web scraping)

scoring-proxy/lib/
  ssi-client.js      SSI integration (GraphQL, web scraping, login)

scripts/
  New-KupittaaCup.ps1  Create Kupittaa Cup + matches + squads

config/
  kupittaa-cup-config.yml  Cup/match/squad configuration
```

## Deployment

### Render (Production)

Configured in `render.yaml`. Single web service `ssi-scoring`.

- **Build**: `cd scoring-ui && npm install && npm run build && cd ../scoring-proxy && npm install`
- **Start**: `cd scoring-proxy && node server.js`

### Required Render Environment Variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` (in render.yaml) |
| `PORT` | `3001` (in render.yaml) |
| `SSI_ADMIN_EMAIL` | SSI admin account email (set in Render dashboard) |
| `SSI_ADMIN_PASSWORD` | SSI admin account password (set in Render dashboard) |
| `SSI_ADMIN_API_KEY` | SSI GraphQL API key (set in Render dashboard) |

> **Security**: `SSI_ADMIN_EMAIL`, `SSI_ADMIN_PASSWORD`, and `SSI_ADMIN_API_KEY` must be added via the Render dashboard — never committed to `render.yaml` or source code.

### GitHub Actions (CI/Deploy)

Configured in `.github/workflows/ci-deploy.yml`. Triggers on push to `feature/scoring-ui-prototype`.

Pipeline: **Install → Test → Audit → Build → Deploy**

| Step | Details |
|---|---|
| Install | `npm ci` for both scoring-ui and scoring-proxy |
| Test | `vitest run` (scoring-ui unit tests) |
| Audit | `npm audit --audit-level=high` for both projects |
| Build | `vite build` (scoring-ui production bundle) |
| Deploy | Triggers Render deploy via webhook |

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `RENDER_DEPLOY_HOOK` | Render deploy webhook URL (triggers production deploy) |

> SSI credentials are **not** needed in GitHub — the CI pipeline only builds, tests, and triggers Render.

## Local Development

```bash
# Install dependencies
cd scoring-ui && npm install
cd ../scoring-proxy && npm install

# Create .env in scoring-proxy/
SSI_ADMIN_EMAIL=your-email@example.com
SSI_ADMIN_PASSWORD=your-password
SSI_ADMIN_API_KEY=your-api-key

# Start dev server (serves UI + API on port 3001)
cd .. && node --env-file=scoring-proxy/.env scoring-proxy/server.js

# Or with UI hot-reload (separate terminals)
cd scoring-ui && npm run dev          # Vite dev server on :5173
cd scoring-proxy && node server.js    # API on :3001
```

## Creating a Kupittaa Cup

```powershell
# Production
.\scripts\New-KupittaaCup.ps1 -Date "08-02-2026" -Username "user@example.com" -Password "pass"

# Test mode (adds "TEST" prefix)
.\scripts\New-KupittaaCup.ps1 -Date "08-02-2026" -Username "user@example.com" -Password "pass" -TestMode

# With WordPress calendar event
.\scripts\New-KupittaaCup.ps1 -Date "08-02-2026" -Username "user@example.com" -Password "pass" -CreateCalendarEvent -WpUsername "wpuser" -WpPassword "wppass"
```

Creates: 1 Cup (content type 136) + 3 Matches (Tarkkuus, Pika, Kuvio — content type 91) + 3 squads per match.

## SSI Content Types

| Type | Description |
|---|---|
| 136 | Cup / Series |
| 137 | Cup / Series participant |
| 91 | Match |
| 93 | Match participant |
