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

## First-time deployment

### 1. Login and select subscription

```bash
az login
az account set --subscription "<your-subscription-id>"
```

### 2. Create the resource group

```bash
az group create \
  --name rg-turres-prod \
  --location swedencentral
```

### 3. Generate a strong PostgreSQL password

```bash
POSTGRES_ADMIN_PASSWORD=$(openssl rand -base64 32)
echo "Save this: $POSTGRES_ADMIN_PASSWORD"
```

### 4. Deploy the Bicep template

```bash
az deployment group create \
  --resource-group rg-turres-prod \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam \
  --parameters postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD" \
  --name turres-prod-$(date +%Y%m%d%H%M)
```

The deployment takes approximately 10–15 minutes (PostgreSQL provisioning is the slowest step).

### 5. Populate secrets in Key Vault

After the template deploys, update the placeholder secrets with real values.
The Key Vault name is `kv-turres-prod`.

```bash
KV=kv-turres-prod

az keyvault secret set --vault-name $KV --name SessionSecret \
  --value "$(openssl rand -hex 64)"

az keyvault secret set --vault-name $KV --name PlatformCredentialsKey \
  --value "$(openssl rand -base64 32)"

az keyvault secret set --vault-name $KV --name MfaSecretKey \
  --value "$(openssl rand -base64 32)"

az keyvault secret set --vault-name $KV --name SsiAdminEmail \
  --value "your-ssi-admin@example.com"

az keyvault secret set --vault-name $KV --name SsiAdminPassword \
  --value "your-ssi-admin-password"

az keyvault secret set --vault-name $KV --name ResendApiKey \
  --value "re_xxxxxxxxxx"
```

> `DatabaseUrl` and `RedisUrl` are populated automatically by the Bicep template.

### 6. Restart App Service to pick up KV references

```bash
az webapp restart --resource-group rg-turres-prod --name app-turres-prod
```

The app should now be healthy at `https://app-turres-prod.azurewebsites.net`.

### 7. Run the database schema migration

```bash
# SSH into App Service or use the Kudu console:
az webapp ssh --resource-group rg-turres-prod --name app-turres-prod
# Inside the shell:
cd /home/site/wwwroot/scoring-proxy
node -e "import('./lib/db/postgres.js').then(m => m.initPostgres())"
```

---

## Subsequent deployments

Application deployments are handled by GitHub Actions (`.github/workflows/azure-deploy.yml`).
Infrastructure changes:

```bash
az deployment group create \
  --resource-group rg-turres-prod \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam \
  --parameters postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD" \
  --name turres-prod-$(date +%Y%m%d%H%M)
```

Bicep is idempotent — re-running only applies changes (no downtime for unchanged resources).

---

## GitHub Actions secrets required

Add these to the repository's **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `AZURE_CREDENTIALS` | JSON output of `az ad sp create-for-rbac` (see below) |
| `AZURE_SUBSCRIPTION_ID` | Your Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | `rg-turres-prod` |
| `AZURE_APP_SERVICE_NAME` | `app-turres-prod` |

### Create the service principal

```bash
az ad sp create-for-rbac \
  --name "github-turres-deploy" \
  --role "Website Contributor" \
  --scopes /subscriptions/<sub-id>/resourceGroups/rg-turres-prod \
  --sdk-auth
```

Copy the JSON output into the `AZURE_CREDENTIALS` secret.

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
