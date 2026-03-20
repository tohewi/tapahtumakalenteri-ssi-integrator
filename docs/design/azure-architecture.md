# Azure Production Architecture

**Decision date:** 2026-03-04  
**Region:** Sweden Central (`swedencentral`) — Finland South planned Q1 2027; migrate when available  
**Staging/preview:** Render remains the test/preview environment (PRs → Render, main → Azure)

---

## Architecture Overview

```
GitHub Actions (push to main)
        │
        ▼
  Azure App Service (Linux, Node 22 LTS)
  ┌────────────────────────────────────────────────┐
  │  scoring-proxy/server.js                       │
  │  scoring-ui/dist/  (served as static files)    │
  │  System-assigned Managed Identity              │
  └──────────────┬─────────────────────────────────┘
                 │ KV references (identity-based)
        ┌────────▼────────┐
        │  Azure Key Vault │  (Standard tier, RBAC)
        │  All secrets &   │
        │  conn strings    │
        └────────┬─────────┘
                 │
    ┌────────────┼────────────────┐
    ▼            ▼                ▼
PostgreSQL   Redis Cache    App Insights
Flexible     Basic C1       (workspace-based)
Server B2ms  (session store)
```

---

## Resource Decisions

| Resource | Azure Service | SKU | Est. €/mo | Notes |
|---|---|---|---|---|
| Web app | App Service (Linux) | B1 | ~€13 | 1 instance; scale to P1v3 for load |
| App Service Plan | App Service Plan | B1 | (incl.) | Linux, Node 22 LTS |
| Database | PostgreSQL Flexible Server | Standard_B1ms | ~€21 | 1 vCore, 2GB RAM, 32 GB storage, v16, no HA |
| Cache / Sessions | Azure Cache for Redis | Basic C0 (250 MB) | ~€8 | SSL-only (port 6380), Entra ID only (access keys disabled) |
| Secrets | Key Vault | Standard | ~€0 | RBAC auth, soft-delete 7 days, purge protection |
| Monitoring | Application Insights | Workspace-based | ~€0 | Log Analytics backend |
| Logs | Log Analytics Workspace | PerGB2018 | ~€0 | 30-day retention |
| **Total running** | | | **~€43** | |
| **Total stopped** | | | **~€25** | PG compute off, App stopped, Redis stays |

### Naming convention: `{type}-turres-{env}`

| Resource | Name |
|---|---|
| Resource Group | `rg-turres-prod` |
| App Service Plan | `asp-turres-prod` |
| App Service | `app-turres-prod` |
| PostgreSQL | `psql-turres-prod` |
| Redis | `redis-turres-prod` |
| Key Vault | `kv-turres-prod` |
| Log Analytics | `log-turres-prod` |
| App Insights | `appi-turres-prod` |

---

## Secrets Management

All secrets are stored in Key Vault and referenced in App Service config via Key Vault references:
```
@Microsoft.KeyVault(VaultName=kv-turres-prod;SecretName=SecretName)
```

The App Service uses a **system-assigned managed identity** with the
`Key Vault Secrets User` RBAC role on the Key Vault.

### Secrets populated by Bicep (from deployment parameters)
| Secret name | Value |
|---|---|
| `DatabaseUrl` | Constructed from PostgreSQL FQDN + admin credentials |
| `RedisUrl` | Constructed from Redis hostname + primary key |

### Secrets requiring manual population after first deploy
| Secret name | Description |
|---|---|
| `SessionSecret` | Random 64-char hex string |
| `PlatformCredentialsKey` | AES-256 key for encrypting tenant SSI credentials |
| `MfaSecretKey` | AES-256 key for encrypting MFA TOTP secrets |
| `SsiAdminEmail` | SSI admin account email |
| `SsiAdminPassword` | SSI admin account password |
| `ResendApiKey` | Resend API key for email delivery |

---

## Security

| Layer | Implementation | Notes |
|-------|---------------|-------|
| PostgreSQL auth | **Entra ID only** — password auth disabled | UAMI is Entra admin; app uses managed identity token |
| Redis auth | **Entra ID only** — access keys disabled | `disableAccessKeyAuthentication: true` in Bicep |
| Key Vault auth | **RBAC** — no legacy access policies | App UAMI = Secrets User; deployer = Secrets Officer |
| CI/CD auth | **OIDC federation** — no stored secrets | GitHub Actions UAMI with ABAC-conditioned RBAC Admin |
| App Service | HTTPS-only, FTPS disabled, TLS 1.2, HTTP/2 | Health check at `/api/v1/` |

## Networking

- PostgreSQL firewall: allows all Azure datacenter IPs (`AllowAllAzureServices`)
  — upgrade to VNet integration if stricter isolation needed
- Redis: SSL-only (port 6380), no public non-SSL port, Entra ID auth only
- Key Vault: public endpoint with no IP restrictions (App Service outbound IPs are not static on B-tier)
  — upgrade to private endpoint with VNet integration when moving to P-tier
- App Service: public HTTPS, custom domain via Azure-managed cert

## Cost Management — Auto-Stop

For development/hobby use, resources can be stopped to reduce costs from ~€43/mo to ~€25/mo.

**Stop:** `./infra/scripts/Stop-TurresInfra.ps1`
- Stops App Service (immediate) and PostgreSQL compute (1-2 min)
- Database data is fully preserved (storage continues billing)
- Redis Basic C0 stays running (no stop API for Basic tier; sessions are ephemeral)
- App Service Plan continues billing (~€13/mo) even when app is stopped

**Start:** `./infra/scripts/Start-TurresInfra.ps1`
- Starts PostgreSQL (2-3 min cold start) then App Service
- Runs health check after 15s warmup

**Stopped cost breakdown:**
| Resource | €/mo when stopped |
|----------|-------------------|
| App Service Plan B1 | ~€13 (plan always charges) |
| PostgreSQL storage (32 GB) | ~€4 |
| Redis Basic C0 | ~€8 |
| **Total** | **~€25** |

---

## CI/CD

- **PRs → Render** (existing preview environments, unchanged)
- **`main` push → Azure** via `.github/workflows/azure-deploy.yml`
  - Triggers after `CI / Deploy` workflow completes successfully
  - Builds frontend, packages `scoring-proxy/` + `scoring-ui/dist/`, ZIP-deploys to App Service

---

## Future migration path

1. **Finland South** (Q1 2027) — redeploy Bicep with `location = 'finlandsouth'`
2. **Azure Managed Redis** (by Sep 30, 2028 — Azure Cache for Redis retirement)
   - Replace `avm/res/cache/redis` with `avm/res/cache/redis-enterprise`
   - App code already uses Entra ID token auth — migration is config-only
   - Smallest SKU: `Balanced_B0`. Compare pricing before migrating.
   - Reassess cost and tooling readiness in 2027; hard deadline Sep 2028.
3. **VNet integration** — when moving to P-tier, add VNet, private endpoints for PostgreSQL + Redis + Key Vault
4. **Zone-redundant PostgreSQL** — enable HA with standby in different zone
5. **Azure Front Door** — CDN + WAF for edge caching and DDoS protection
6. **Admin site (BL-1)** — separate App Service with IP restriction via Access Restrictions
7. **Azure Automation / Logic App** — scheduled auto-stop (e.g., stop at 22:00, start at 07:00) for further cost savings
