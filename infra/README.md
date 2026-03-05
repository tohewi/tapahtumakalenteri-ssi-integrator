# Infrastructure — Azure Production Deployment

Bicep templates using [Azure Verified Modules (AVM)](https://aka.ms/avm).  
Region: **Sweden Central** — migrate to Finland South when available (~Q1 2027).

## Prerequisites

- Azure CLI ≥ 2.60: `az --version`
- Bicep CLI (bundled with Azure CLI): `az bicep version`
- Azure subscription with Contributor + User Access Administrator on the target resource group
- GitHub secrets configured (see CI/CD section)

> **Check AVM versions before deploying.** The module versions pinned in `main.bicep`
> may be outdated. Run `az bicep registry list` or browse https://aka.ms/avm to find
> the latest compatible versions for each module.

---

## First-time deployment (two phases)

Deployment is split into two phases so that **all secrets exist in Key Vault before
any infrastructure reads them**. The postgres admin password is never passed on the
command line — it lives only in Key Vault.

---

### Phase 1 — Bootstrap (Key Vault + identities)

#### 1. Login and select subscription

```bash
az login
az account set --subscription 5bb1981d-8206-44e6-aed0-d6ba3b7aa900
```

#### 2. Create the resource group (if not already done)

```bash
az group create --name rg-turres-prod --location swedencentral
```

#### 3. Get your Azure AD object ID

```bash
DEPLOYER_OID=$(az ad signed-in-user show --query id -o tsv)
```

#### 4. Deploy bootstrap.bicep

This creates `kv-turres-prod`, `id-turres-prod`, `id-github-turres-prod`, and all
role assignments. Takes ~2 minutes.

```bash
az deployment group create \
  --resource-group rg-turres-prod \
  --template-file infra/bootstrap.bicep \
  --parameters deployerObjectId=$DEPLOYER_OID \
  --name turres-bootstrap-$(date +%Y%m%d%H%M)
```

#### 5. Read outputs (needed for GitHub Actions secrets)

```bash
az deployment group show \
  --resource-group rg-turres-prod \
  --name turres-bootstrap-$(date +%Y%m%d%H%M) \
  --query properties.outputs

# Or query individually:
az identity show -g rg-turres-prod -n id-github-turres-prod --query clientId -o tsv
az account show --query tenantId -o tsv
```

---

### Phase 2 — Populate ALL Key Vault secrets

All secrets must be set before running `main.bicep`. The postgres password is read
directly from KV via `az.getSecret()` in `main.bicepparam`.

```bash
KV=kv-turres-prod

# PostgreSQL admin password (min 12 chars, uppercase + lowercase + digit + symbol)
az keyvault secret set --vault-name $KV --name PostgresAdminPassword \
  --value "$(openssl rand -base64 24)"

# Application secrets (auto-generated)
az keyvault secret set --vault-name $KV --name SessionSecret \
  --value "$(openssl rand -hex 64)"

az keyvault secret set --vault-name $KV --name PlatformCredentialsKey \
  --value "$(openssl rand -base64 32)"

az keyvault secret set --vault-name $KV --name MfaSecretKey \
  --value "$(openssl rand -base64 32)"

# Operator-supplied secrets
az keyvault secret set --vault-name $KV --name SsiAdminEmail \
  --value "your-ssi-admin@example.com"

az keyvault secret set --vault-name $KV --name SsiAdminPassword \
  --value "your-ssi-admin-password"

az keyvault secret set --vault-name $KV --name ResendApiKey \
  --value "re_xxxxxxxxxx"
```

> `DatabaseUrl` and `RedisUrl` are computed from deployed resources and written to
> Key Vault automatically by `main.bicep`.

---

### Phase 3 — Deploy main infrastructure

With all secrets in KV, deploy the rest of the stack. No password flags needed.
Takes ~10–15 minutes (PostgreSQL is the slowest step).

```bash
az deployment group create \
  --resource-group rg-turres-prod \
  --template-file infra/main.bicep \
  --parameters @infra/main.bicepparam \
  --name turres-main-$(date +%Y%m%d%H%M)
```

#### Restart App Service to pick up KV references

```bash
az webapp restart --resource-group rg-turres-prod --name app-turres-prod
```

The app should now be healthy at `https://app-turres-prod.azurewebsites.net`.

#### Run the database schema migration

```bash
# SSH into App Service or use the Kudu console:
az webapp ssh --resource-group rg-turres-prod --name app-turres-prod
# Inside the shell:
cd /home/site/wwwroot/scoring-proxy
node -e "import('./lib/db/postgres.js').then(m => m.initPostgres())"
```

---

## Subsequent deployments

Application deployments are handled automatically by GitHub Actions
(`.github/workflows/azure-deploy.yml` triggers on every merge to `main`).

For infrastructure changes (re-run `main.bicep`; password comes from KV automatically):

```bash
# Read postgres password from KV, then deploy with inline params
# (Azure CLI 2.40 does not support .bicepparam files; use inline params instead)
PGPWD=$(az keyvault secret show --vault-name kv-turres-prod --name PostgresAdminPassword --query value -o tsv)

az deployment group create \
  --resource-group rg-turres-prod \
  --template-file infra/main.bicep \
  --parameters environmentName=prod appName=turres location=swedencentral \
               postgresAdminLogin=pgadmin postgresAdminPassword="$PGPWD" \
               appServicePlanSku=P1v3 postgresSkuName=Standard_B2ms \
               postgresStorageSizeGB=32 logRetentionDays=30 \
               budgetStartDate=2026-03-01T00:00:00Z budgetAmountEur=100 \
               budgetAlertEmail=tohewi@gmail.com \
  --name turres-main-$(date +%Y%m%d%H%M)
```

> **Note:** `.bicepparam` files with `az.getSecret()` require Azure CLI ≥ 2.53.
> Until upgraded, pass `postgresAdminPassword` as an inline param read from KV (never hard-coded).

Bicep is idempotent — re-running only applies changes (no downtime for unchanged resources).

---

## GitHub Actions secrets required

The workflow uses **keyless OIDC login** via the `id-github-turres-prod` user-assigned
managed identity — no service principal JSON secret needed.

Add these to the repository's **Settings → Secrets and variables → Actions**
(under the `production` environment):

| Secret | Value | How to get |
|---|---|---|
| `AZURE_CLIENT_ID` | GH Actions UAMI client ID | Output `ghActionsClientId` from Bicep deploy |
| `AZURE_TENANT_ID` | Azure AD tenant ID | Output `tenantId` from Bicep deploy |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID | `az account show --query id -o tsv` |
| `AZURE_RESOURCE_GROUP` | `rg-turres-prod` | Fixed value |
| `AZURE_APP_SERVICE_NAME` | `app-turres-prod` | Fixed value |

### Read output values after Bicep deployment

```bash
# After running az deployment group create (step 4 above), read the outputs:
az deployment group show \
  --resource-group rg-turres-prod \
  --name turres-prod-<timestamp> \
  --query properties.outputs

# Or query directly:
az identity show \
  --resource-group rg-turres-prod \
  --name id-github-turres-prod \
  --query clientId -o tsv
```

### GitHub Actions environment

The workflow uses `environment: production`. Make sure this environment exists in
**Settings → Environments → production** and the secrets above are scoped to it.
The OIDC subject claim is: `repo:tohewi/tapahtumakalenteri-ssi-integrator:environment:production`

---

## Redis TLS note

Azure Cache for Redis uses SSL port 6380. The app must connect with `rediss://` (double-s).
The `REDIS_URL` secret stored in Key Vault uses the format:

```
rediss://:${primaryKey}@redis-turres-prod.redis.cache.windows.net:6380
```

If the app's `lib/session/redis.js` does not accept `rediss://` URLs, add the following
to App Service config: `NODE_TLS_REJECT_UNAUTHORIZED=0` (only as a last resort — prefer
configuring TLS properly in the Redis client options).

---

## Scaling

| Scenario | Action |
|---|---|
| More traffic | Change `appServicePlanSku` to `P1v3` and redeploy |
| PostgreSQL bottleneck | Upgrade to `Standard_D2s_v3` (General Purpose tier) |
| Redis capacity | Upgrade to Standard C1 (adds replication) |
| Stricter network isolation | Add VNet integration + private endpoints (requires P-tier App Service) |

---

## Migration to Finland South

When `finlandsouth` region becomes available (~Q1 2027):

1. Update `location = 'finlandsouth'` in `main.bicepparam`
2. Create new resource group: `az group create --name rg-turres-prod-fi --location finlandsouth`
3. Deploy template to new group
4. Migrate PostgreSQL data (`pg_dump` / `pg_restore`)
5. Update DNS / App Service custom domain
6. Decommission Sweden Central resources
