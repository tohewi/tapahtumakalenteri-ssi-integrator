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

| Resource | Azure Service | SKU | Notes |
|---|---|---|---|
| Web app | App Service (Linux) | B2 | 1 instance; scale to P1v3 for load |
| App Service Plan | App Service Plan | B2 | Linux, Node 22 LTS |
| Database | PostgreSQL Flexible Server | Standard_B2ms | 32 GB, version 16, no HA initially |
| Cache / Sessions | Azure Cache for Redis | Basic C1 (1 GB) | SSL-only (port 6380), `allkeys-lru` |
| Secrets | Key Vault | Standard | RBAC auth, soft-delete 90 days |
| Monitoring | Application Insights | Workspace-based | Log Analytics backend |
| Logs | Log Analytics Workspace | PerGB2018 | 30-day retention |

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

## Networking

- PostgreSQL firewall: allows all Azure datacenter IPs (`AllowAllAzureServices`)
  — upgrade to VNet integration if stricter isolation needed
- Redis: SSL-only (port 6380), no public non-SSL port
- Key Vault: public endpoint with no IP restrictions (App Service outbound IPs are not static on B-tier)
  — upgrade to private endpoint with VNet integration when moving to P-tier
- App Service: public HTTPS, custom domain via Azure-managed cert

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
   - **Breaking change:** Azure Managed Redis defaults to Entra ID auth (no access keys).
     App code must switch from `REDIS_URL` password auth to managed identity token auth
     (e.g., `@azure/identity` + `ioredis` with token provider).
   - Smallest SKU: `Balanced_B0`. Pricing reportedly increased in 2026 — compare with
     Azure Cache for Redis Basic C1 (~€16/mo) before migrating.
   - Reassess cost and tooling readiness in 2027; hard deadline Sep 2028.
3. **VNet integration** — when moving to P-tier, add VNet, private endpoints for PostgreSQL + Redis + Key Vault
4. **Zone-redundant PostgreSQL** — enable HA with standby in different zone
5. **Azure Front Door** — CDN + WAF for edge caching and DDoS protection
6. **Admin site (BL-1)** — separate App Service with IP restriction via Access Restrictions
