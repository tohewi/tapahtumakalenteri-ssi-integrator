# SSI Kupittaa Cup — Complete Event Management System

Comprehensive scoring, registration, and management system for TurRes Kupittaa RESUL CUP shooting competitions, integrated with [ShootNScoreIt (SSI)](https://shootnscoreit.com).

```mermaid
flowchart LR
    subgraph Web App
        UI[scoring-ui\nReact + Tailwind]
        PROXY[scoring-proxy\nExpress.js]
    end
    subgraph External
        SSI[ShootNScoreIt\nGraphQL + Web Scraping]
        RESEND[Resend\nEmail]
    end

    UI -->|/api/*| PROXY
    PROXY -->|GraphQL\nJWT auth| SSI
    PROXY -->|Web scraping\nAdmin session| SSI
    PROXY -->|Confirmation\nemail| RESEND
```

## Features

### 🎯 Scoring System
Range officers can enter match scores on mobile devices with real-time validation and SSI synchronization.

**Key capabilities:**
- Mobile-first responsive UI
- Browse cups and matches
- View competitor details and squad assignments
- Enter and submit scores with validation
- Secure session-based authentication

### 📝 Self-Registration
Shooters can register for CUP events without login using a public registration form.

**Key capabilities:**
- Public, no-login registration form
- CAPTCHA protection against bots
- Email confirmation with match details
- Automatic squad assignment
- Integration with SSI competitor database

### 👥 Management & Administration
Backend APIs for managing cup participants, squad assignments, and approvals.

**Key capabilities:**
- View cup overview with all matches and squads
- Assign shooters to specific squads
- Fix squad assignments across matches
- Approve cup participants
- Add participants to cup events

### 📊 Reports & Analytics
Generate summary reports and statistics for matches and competitions.

**Key capabilities:**
- Multi-match summary reports
- Shooter counts and squad statistics
- Staff assignment reports
- Export data for analysis

## Applications

| App | URL | Purpose |
|-----|-----|---------|
| **Scoring** | `/#/scoring` | Range officers enter match scores on mobile devices |
| **Registration** | `/#/register` | Shooters self-register for CUP events (no login required) |
| **Management** | `/api/manage/*` | Squad assignment, cup participant management, and approval workflows |
| **Reports** | `/api/report/*` | Generate summary reports and match statistics for analysis |

## Quick Start

```bash
cd scoring-ui && npm install
cd ../scoring-proxy && npm install

# Create scoring-proxy/.env with SSI credentials
node --env-file=scoring-proxy/.env scoring-proxy/server.js
```

## Documentation

| Document | Description |
|----------|-------------|
| [User Guide](docs/user-guide.md) | How to use the scoring and registration apps |
| [Installation Guide](docs/installation-guide.md) | Deploy to Render with Resend email and GitHub CI |
| **[PR Preview Deployments](docs/PR-PREVIEW-DEPLOYMENTS.md)** | **Deploy PR branches to Render for testing** |
| [Branching Strategy](docs/BRANCHING-STRATEGY.md) | GitHub Flow branching model and release process |
| [Release Notes](docs/RELEASE-NOTES.md) | Version history and changelog |
| [Requirements](docs/requirements.md) | Full requirements traceability matrix |
| [Registration Flow](docs/registration-flow.md) | Backend sequence diagrams and SSI state machine |
| [Scoring Architecture](docs/scoring-architecture.md) | Proxy architecture, session management, scoring flow |
| [SSI Admin Operations](docs/ssi-admin-operations.md) | Web scraping endpoints and form field reference |
| **[Refactoring Plan](docs/refactoring-plan.md)** | **Software architecture analysis and refactoring strategy** |
| [Refactoring Visual Summary](docs/refactoring-visual-summary.md) | Quick reference with diagrams and comparisons |
| [AI Agent Guidelines](docs/ai-agent-guidelines.md) | Token-efficient development with AI assistants |

## Creating a Kupittaa Cup

```powershell
.\scripts\New-KupittaaCup.ps1 -Date "08-02-2026" -Username "user@example.com" -Password "pass"
```

Creates: 1 Cup + 3 Matches (Tarkkuus, Pika, Kuvio) + 3 squads per match. See `-TestMode` and `-CreateCalendarEvent` flags for test mode and WordPress integration.
