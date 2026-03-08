# Deployment Topology & Branch Strategy

**Last updated:** 2026-03-08

---

## Current Branch → Deployment Map

```mermaid
graph TB
    subgraph "GitHub Repository"
        main["main branch<br/>(R7.x stable)"]
        r80["release/r80-match-manager-base<br/>(R8.0–R9.2, all enhancements)"]
        feature["Feature branches<br/>(R821-hotfix-*, etc.)"]
    end

    subgraph "CI/CD Workflows"
        ci["ci-deploy.yml<br/>Tests + Build"]
        azure_wf["azure-deploy.yml<br/>OIDC + ZIP deploy"]
        pr_preview["pr-preview.yml<br/>Render API calls"]
    end

    subgraph "Render (Frankfurt)"
        render_prod["turres-ssi-tools<br/>Starter $7/mo<br/>⚠️ REDUNDANT"]
        render_redis["turres-ssi-tools-redis<br/>Starter $7/mo<br/>⚠️ REDUNDANT"]
        render_pr["turres-ssi-tools-pr-{N}<br/>Starter $7/mo per PR"]
        render_pr_db["PR Postgres<br/>Free (30-day expiry)"]
        render_pr_redis["PR Redis<br/>Free"]
    end

    subgraph "Azure (Sweden Central)"
        azure_app["app-turres-prod<br/>App Service B1 ~€13/mo"]
        azure_pg["psql-turres-prod<br/>PostgreSQL B1ms ~€21/mo"]
        azure_redis["redis-turres-prod<br/>Redis C1 ~€16/mo"]
        azure_kv["kv-turres-prod<br/>Key Vault"]
    end

    %% Triggers
    main -->|"push"| ci
    ci -->|"success on main"| azure_wf
    ci -->|"deploy hook"| render_prod
    main -.->|"PR opened"| pr_preview

    %% Deployments
    azure_wf -->|"ZIP deploy"| azure_app
    azure_app --> azure_pg
    azure_app --> azure_redis
    azure_app --> azure_kv

    render_prod --> render_redis
    pr_preview -->|"creates per PR"| render_pr
    render_pr --> render_pr_db
    render_pr --> render_pr_redis

    %% Manual
    r80 -.->|"manual az deploy"| azure_app
    feature -->|"merge"| r80

    style render_prod fill:#ff9999,stroke:#cc0000
    style render_redis fill:#ff9999,stroke:#cc0000
    style render_pr fill:#ffcc99,stroke:#ff8800
    style azure_app fill:#99ccff,stroke:#0066cc
    style azure_pg fill:#99ccff,stroke:#0066cc
    style azure_redis fill:#99ccff,stroke:#0066cc
```

---

## Cost Summary (Current — Dual Deployment)

| Platform | Resource | Monthly Cost | Notes |
|----------|----------|-------------|-------|
| **Azure** | App Service B1 | ~€13 | Stopped when idle |
| **Azure** | PostgreSQL B1ms | ~€21 | Stopped when idle (~€4 storage only) |
| **Azure** | Redis C1 | ~€16 | Always running |
| **Azure** | KV + Logs | ~€1 | Negligible |
| **Render** | Production web | $7 (~€6.50) | ⚠️ **Redundant** — same app runs on Azure |
| **Render** | Production Redis | $7 (~€6.50) | ⚠️ **Redundant** — sessions on Azure |
| **Render** | Per-PR preview web | $7 (~€6.50) | Per active PR |
| **Render** | Per-PR Postgres | $0 | Free tier, **expires after 30 days** |
| **Render** | Per-PR Redis | $0 | Free tier |
| **Total running** | | **~€70/mo** | Azure + Render overlap |
| **Total stopped** | | **~€46/mo** | Azure stopped + Render still running |

---

## Problem: PR Preview Environments

The `pr-preview.yml` workflow triggers on every PR to `main` and provisions:
1. **Web service** (Starter plan, $7/mo) — runs until PR is closed
2. **PostgreSQL** (Free, 30-day expiry) — will become paid when Render drops free tier
3. **Redis** (Free) — will become paid when Render drops free tier

**Issues observed:**
- Previews sometimes fail to build/deploy (wasted cost)
- Stale previews persist (e.g., PR-138 is still running)
- Free Postgres expires after 30 days, breaking long-lived PRs
- Each PR costs **$7/mo minimum** even if never actually tested
- Production on Render is **redundant** now that Azure is the primary

---

## Proposed Options

### Option A: Remove Render Production, Keep Lightweight PR Previews (Recommended)

```mermaid
graph TB
    subgraph "GitHub"
        main["main"]
        r80["release/r80"]
        feature["Feature branches"]
    end

    subgraph "CI/CD"
        ci["ci-deploy.yml<br/>Tests only (remove deploy hook)"]
        azure_wf["azure-deploy.yml<br/>OIDC + ZIP deploy"]
        pr_preview["pr-preview.yml<br/>Lightweight: web only, no DB/Redis"]
    end

    subgraph "Render (previews only)"
        render_pr["turres-ssi-tools-pr-{N}<br/>Free/Starter, no DB"]
    end

    subgraph "Azure (production)"
        azure_app["app-turres-prod"]
        azure_pg["psql-turres-prod"]
        azure_redis["redis-turres-prod"]
    end

    main -->|"push"| ci
    ci -->|"success"| azure_wf
    azure_wf --> azure_app
    azure_app --> azure_pg
    azure_app --> azure_redis

    main -.->|"PR"| pr_preview
    pr_preview --> render_pr

    feature -->|"merge"| r80
    r80 -.->|"merge to main"| main

    style render_pr fill:#ffffcc,stroke:#cccc00
    style azure_app fill:#99ccff,stroke:#0066cc
```

**Changes:**
1. **Delete** Render production web service + Redis ($14/mo saved)
2. **Simplify** PR previews: web service only (no Postgres, no Redis)
   - App works without DB (platform login disabled, scoring still works)
   - App works without Redis (falls back to in-memory sessions)
3. **Use Free tier** for PR previews (sleeps after 15min — acceptable for review)
4. Remove `RENDER_DEPLOY_HOOK` from `ci-deploy.yml` (Azure is primary)

**Cost:** Azure ~€50/mo running (~€25 stopped) + $0 Render free previews = **~€50/mo running**

### Option B: Remove Render Entirely

**Changes:**
- Delete all Render resources
- No PR preview environments
- Test changes manually or via Azure staging slot (requires P-tier, expensive)
- Or: run locally for testing

**Cost:** Azure only ~€50/mo running (~€25 stopped)
**Downside:** No way to share a live preview URL for PR review

### Option C: Keep Render as Primary, Remove Azure

**Changes:**
- Revert to Render-only deployment
- No auto-stop capability (Render always runs)
- PostgreSQL and Redis will become paid soon

**Cost:** ~$21/mo now, ~$35/mo when free tiers expire
**Downside:** No Entra ID auth, no auto-stop, weaker security model

---

## Recommendation: Option A

1. **Delete** Render production resources (web + Redis) — saves $14/mo immediately
2. **Simplify** `pr-preview.yml` to deploy **web-only on Free tier** (no DB/Redis provisioning)
3. **Remove** deploy hook from `ci-deploy.yml` (line 101-108)
4. **Clean up** stale PR-138 preview and databases
5. **Azure remains primary** with auto-stop scripts for cost management

**Resulting cost:**
- Running: ~€50/mo (Azure only)
- Stopped: ~€25/mo (Azure stopped)
- PR previews: $0 (Render Free tier)
