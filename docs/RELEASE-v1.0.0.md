# Release Notes — v1.0.0 (2026-02-06)

## First Release 🎯

SSI Scoring is a mobile-friendly web app for scoring ShootNScoreIt Nordic shooting competitions.

### Features

- **Cup search** — Wildcard search for cups by name, sorted by closest date
- **Match → Squad → Shooter flow** — Navigate through cup matches, squads, and shooters
- **Score entry** — Tap-based scoring with zone buttons (X, 10, 9...M), series navigation
- **Double series mode** — Score two series at once for efficiency
- **Score submission** — Submit scores directly to SSI backend
- **Session persistence** — Auto-login on reload, full navigation state restored
- **Score persistence** — In-progress scores saved to localStorage, survive page reload
- **Remember me** — Optional encrypted credential storage (AES-GCM)
- **PWA** — Installable on mobile via "Add to Home Screen", offline app shell caching
- **Logout** — Clears all stored data

### Architecture

- **Frontend**: React 19 + Tailwind CSS 4, built with Vite 7
- **Backend**: Express 5 proxy (JWT for GraphQL reads, session cookies for score writes)
- **Deployment**: Single Node.js process serves both API and built UI
- **Hosting**: Render (free tier)

### Security

- Credentials encrypted with AES-GCM before localStorage storage
- npm audit: 0 vulnerabilities across both projects
- Not affected by recent npm supply chain attacks (s1ngularity, popular packages, Shai-Hulud)

### Testing

- 63 automated tests (Vitest + React Testing Library)
  - API data transformers (27 tests)
  - UI components (25 tests)
  - localStorage persistence (11 tests)
- Proxy integration tests (Node.js built-in test runner)

### Build

- Node.js v22.20.0 / npm 10.9.3
- Build includes vulnerability scan and report generation
- Version badge displayed in UI (bottom-left corner)
