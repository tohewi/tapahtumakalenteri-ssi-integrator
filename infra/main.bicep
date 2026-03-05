// ============================================================
// turres-ssi-tools — Azure Production Infrastructure
//
// Region: swedencentral (migrate to finlandsouth when available ~Q1 2027)
// All modules use Azure Verified Modules (AVM) from the public registry.
// Check https://aka.ms/avm for latest module versions before deploying.
//
// Deployment order:
//   PRE: Run infra/bootstrap.bicep first (KV + UAMIs + role assignments).
//        Populate ALL secrets in Key Vault before running this template.
//   1.  Log Analytics Workspace
//   2.  Application Insights
//   3.  PostgreSQL Flexible Server
//   4.  Azure Cache for Redis
//   5.  Key Vault secrets (computed DatabaseUrl + RedisUrl)
//   6.  App Service Plan
//   7.  App Service (existing App UAMI, KV references)
//   8.  Budget (cost guardrail — 100 €/month, notify tohewi@gmail.com)
// ============================================================

targetScope = 'resourceGroup'

// ── Parameters ──────────────────────────────────────────────

@description('Short environment tag appended to resource names (e.g. prod, staging).')
param environmentName string = 'prod'

@description('Base name used in all resource names.')
param appName string = 'turres'

@description('Azure region for all resources.')
param location string = 'swedencentral'

@description('PostgreSQL administrator login name.')
param postgresAdminLogin string = 'pgadmin'

@description('PostgreSQL administrator password. Store securely — written to Key Vault.')
@secure()
param postgresAdminPassword string

@description('App Service Plan SKU. B1=Basic (~€13/mo, target). P1v3=Premium (~€130/mo, use if B1 unavailable in region). F1=Free (60min CPU/day limit, dev only).')
param appServicePlanSku string = 'B1'

@description('PostgreSQL Flexible Server compute SKU.')
param postgresSkuName string = 'Standard_B2ms'

@description('PostgreSQL storage size in GB.')
param postgresStorageSizeGB int = 32

@description('Log Analytics data retention in days.')
param logRetentionDays int = 30

@description('Budget start date — first of the current or a future month (YYYY-MM-01T00:00:00Z).')
param budgetStartDate string = '2026-03-01T00:00:00Z'

@description('Monthly budget cap in subscription billing currency (EUR for Finnish Pay-As-You-Go).')
param budgetAmountEur int = 100

@description('Email address for budget breach notifications.')
param budgetAlertEmail string = 'tohewi@gmail.com'

@description('Verified sender address configured in Resend (e.g. noreply@yourdomain.com).')
param emailFrom string = ''

// ── Computed names ───────────────────────────────────────────

var kvName     = 'kv-${appName}-${environmentName}'
var logName    = 'log-${appName}-${environmentName}'
var appiName   = 'appi-${appName}-${environmentName}'
var psqlName   = 'psql-${appName}-${environmentName}'
var redisName  = 'redis-${appName}-${environmentName}'
var aspName    = 'asp-${appName}-${environmentName}'
var appSvcName = 'app-${appName}-${environmentName}'
var uamiName     = 'id-${appName}-${environmentName}'
var dbName       = 'turres_platform'

// ── 0. Existing resources (provisioned by bootstrap.bicep) ─────────────
// Run infra/bootstrap.bicep once, populate KV secrets, then run this template.

resource uamiExisting 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: uamiName
}

resource kvResource 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: kvName
}

// ── 1. Log Analytics Workspace ───────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/operational-insights/workspace

module logAnalytics 'br/public:avm/res/operational-insights/workspace:0.9.0' = {
  name: 'logAnalyticsDeployment'
  params: {
    name: logName
    location: location
    skuName: 'PerGB2018'
    dataRetention: logRetentionDays
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// ── 2. Application Insights ──────────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/insights/component

module appInsights 'br/public:avm/res/insights/component:0.4.1' = {
  name: 'appInsightsDeployment'
  params: {
    name: appiName
    location: location
    kind: 'web'
    applicationType: 'web'
    workspaceResourceId: logAnalytics.outputs.resourceId
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// ── 3. PostgreSQL Flexible Server ────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/db-for-postgre-sql/flexible-server
//
// Microsoft Entra authentication only — password auth disabled.
// App connects via UAMI token (same identity pattern as Redis).
// administratorLogin/Password still required by the API at provisioning time
// but cannot be used for authentication once passwordAuth is Disabled.

module postgresql 'br/public:avm/res/db-for-postgre-sql/flexible-server:0.4.0' = {
  name: 'postgresqlDeployment'
  params: {
    name: psqlName
    location: location
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    skuName: postgresSkuName
    tier: 'Burstable'
    storageSizeGB: postgresStorageSizeGB
    version: '16'
    highAvailability: 'Disabled'
    backupRetentionDays: 7
    geoRedundantBackup: 'Disabled'
    // Entra ID only — UAMI is the Microsoft Entra administrator
    activeDirectoryAuth: 'Enabled'
    passwordAuth: 'Disabled'
    tenantId: subscription().tenantId
    administrators: [
      {
        principalType: 'ServicePrincipal'
        principalName: uamiExisting.name
        objectId: uamiExisting.properties.principalId
        tenantId: subscription().tenantId
      }
    ]
    databases: [
      {
        name: dbName
        charset: 'UTF8'
        collation: 'en_US.utf8'
      }
    ]
    firewallRules: [
      {
        // Allow all Azure services — upgrade to VNet private endpoint for stricter isolation
        name: 'AllowAllAzureServices'
        startIpAddress: '0.0.0.0'
        endIpAddress: '0.0.0.0'
      }
    ]
    maintenanceWindow: {
      customWindow: 'Enabled'
      dayOfWeek: 0   // Sunday
      startHour: 3   // 03:00 UTC
      startMinute: 0
    }
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// ── 4. Azure Cache for Redis ─────────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/cache/redis
//
// Entra ID auth enabled; access keys disabled — app uses managed identity token auth.
// RETIREMENT: Azure Cache for Redis retires Sep 30, 2028.
//   Migration path → avm/res/cache/redis-enterprise; same Entra ID auth pattern applies.
//   See: https://aka.ms/AzureCacheForRedisRetirement

module redis 'br/public:avm/res/cache/redis:0.4.0' = {
  name: 'redisDeployment'
  params: {
    name: redisName
    location: location
    skuName: 'Basic'
    capacity: 1
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    redisConfiguration: {
      'aad-enabled': 'True'    // Entra ID auth enabled
    }
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// Grant App Service UAMI the built-in Data Owner role on Redis.
// Data Owner allows all key operations needed for session storage (GET/SET/DEL/EXPIRE).
resource redisAccessPolicyAssignment 'Microsoft.Cache/redis/accessPolicyAssignments@2024-03-01' = {
  name: '${redisName}/${appSvcName}-uami'
  properties: {
    objectId: uamiExisting.properties.principalId
    objectIdAlias: appSvcName
    accessPolicyName: 'Data Owner'
  }
  dependsOn: [redis]
}

// ── 5. Key Vault secrets — connection strings ─────────────────
// Computed from deployed resources, stored in KV so App Service can reference them.

// Passwordless — app uses UAMI Entra ID token. UAMI display name is the PostgreSQL username.
// No password in the URL; postgres.js detects empty password → token auth via @azure/identity.
var postgresUrl = 'postgresql://${uamiExisting.name}@${postgresql.outputs.fqdn}:5432/${dbName}?sslmode=require'
// No access key needed — Entra ID auth. redis.outputs.hostName used directly in app settings.

// kvResource is declared in section 0 (existing ref from bootstrap.bicep)

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvResource
  name: 'DatabaseUrl'
  properties: {
    value: postgresUrl
  }
}

// RedisUrl KV secret removed — Entra ID auth requires no password;
// REDIS_URL is set directly in app settings as passwordless rediss:// URL.

// Operator-managed secrets — these must be populated in Key Vault manually
// (or via infra/bootstrap.bicep) before running this template.
// This template only READS them (existing); it never overwrites them.
// Use: az keyvault secret set --vault-name <kv> --name <name> --value <value>
resource secretSessionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: kvResource
  name: 'SessionSecret'
}

resource secretPlatformKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: kvResource
  name: 'PlatformCredentialsKey'
}

resource secretMfaKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: kvResource
  name: 'MfaSecretKey'
}

resource secretSsiEmail 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: kvResource
  name: 'SsiAdminEmail'
}

resource secretSsiPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: kvResource
  name: 'SsiAdminPassword'
}

resource secretResend 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: kvResource
  name: 'ResendApiKey'
}

// ── 7. App Service Plan ───────────────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/web/serverfarm

// Direct resource (not AVM module) to control capacity=1 and zoneRedundant=false.
// AVM web/serverfarm defaults to capacity>1 which is incompatible with F1/B1 SKUs.
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: aspName
  location: location
  sku: {
    name: appServicePlanSku
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
    zoneRedundant: false
  }
  tags: {
    environment: environmentName
    managedBy: 'bicep'
  }
}

// ── 8. App Service ────────────────────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/web/site
//
// Startup: node scoring-proxy/server.js
// The ZIP deploy extracts to /home/site/wwwroot/ maintaining:
//   scoring-proxy/ (Express server, __dirname = .../scoring-proxy)
//   scoring-ui/dist/ (static frontend, resolved via ../scoring-ui/dist)

// ClientId is required when using a user-assigned managed identity for KV reference resolution.
// Without it, Azure App Service tries the (non-existent) system-assigned identity and fails.
var kvRef = 'VaultName=${kvName};ClientId=${uamiExisting.properties.clientId}'

module appService 'br/public:avm/res/web/site:0.12.0' = {
  name: 'appServiceDeployment'
  params: {
    name: appSvcName
    location: location
    kind: 'app,linux'
    serverFarmResourceId: appServicePlan.id
    managedIdentities: {
      userAssignedResourceIds: [uamiExisting.id]
    }
    // CRITICAL: tells App Service which identity to use for KV reference resolution.
    // Without this Azure defaults to SystemAssigned (which doesn't exist here),
    // leaving all @Microsoft.KeyVault(...) app settings as unresolved literal strings.
    keyVaultAccessIdentityResourceId: uamiExisting.id
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node scoring-proxy/server.js'
      // alwaysOn requires Basic tier or higher; disable on Free/Shared (F1/D1)
      alwaysOn: (appServicePlanSku != 'F1' && appServicePlanSku != 'D1')
      minTlsVersion: '1.2'
      http20Enabled: true
      ftpsState: 'Disabled'
      healthCheckPath: '/api/v1/'
    }
    appSettingsKeyValuePairs: {
      NODE_ENV: 'production'
      WEBSITES_PORT: '8080'
      LOG_LEVEL: 'info'
      // Application Insights — not sensitive, set directly
      APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.outputs.connectionString
      ApplicationInsightsAgent_EXTENSION_VERSION: '~3'
      // Redis — not sensitive (no password); hostname + identity refs set directly
      REDIS_URL: 'rediss://${redis.outputs.hostName}:6380'  // passwordless = Entra ID auth
      REDIS_PRINCIPAL_ID: uamiExisting.properties.principalId  // Redis AUTH username
      AZURE_CLIENT_ID: uamiExisting.properties.clientId         // for ManagedIdentityCredential
      // Sensitive settings via Key Vault references
      DATABASE_URL: '@Microsoft.KeyVault(${kvRef};SecretName=DatabaseUrl)'
      SESSION_SECRET: '@Microsoft.KeyVault(${kvRef};SecretName=SessionSecret)'
      PLATFORM_CREDENTIALS_KEY: '@Microsoft.KeyVault(${kvRef};SecretName=PlatformCredentialsKey)'
      MFA_SECRET_KEY: '@Microsoft.KeyVault(${kvRef};SecretName=MfaSecretKey)'
      SSI_ADMIN_EMAIL: '@Microsoft.KeyVault(${kvRef};SecretName=SsiAdminEmail)'
      SSI_ADMIN_PASSWORD: '@Microsoft.KeyVault(${kvRef};SecretName=SsiAdminPassword)'
      RESEND_API_KEY: '@Microsoft.KeyVault(${kvRef};SecretName=ResendApiKey)'
      // Sender email for Resend — set via --parameters emailFrom=noreply@yourdomain.com
      EMAIL_FROM: !empty(emailFrom) ? emailFrom : 'REPLACE_WITH_VERIFIED_RESEND_SENDER'
    }
    httpsOnly: true
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
  dependsOn: [
    secretDatabaseUrl
    secretSessionSecret
    secretPlatformKey
    secretMfaKey
    secretSsiEmail
    secretSsiPassword
    secretResend
  ]
}

// ── 8. Budget (cost guardrail) ────────────────────────────────
// Monthly cap of 100 €. Alerts at 80% actual (early warning), 100% actual,
// and 100% forecasted. Subscription billing currency must be EUR.

resource budget 'Microsoft.Consumption/budgets@2021-10-01' = {
  name: 'budget-${appName}-${environmentName}'
  properties: {
    timePeriod: {
      startDate: budgetStartDate
    }
    timeGrain: 'Monthly'
    amount: budgetAmountEur
    category: 'Cost'
    notifications: {
      actual80pct: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        contactEmails: [budgetAlertEmail]
        thresholdType: 'Actual'
      }
      actual100pct: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        contactEmails: [budgetAlertEmail]
        thresholdType: 'Actual'
      }
      forecasted100pct: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        contactEmails: [budgetAlertEmail]
        thresholdType: 'Forecasted'
      }
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────

@description('App runtime UAMI resource ID')
output uamiResourceId string = uamiExisting.id

@description('App runtime UAMI principal ID')
output uamiPrincipalId string = uamiExisting.properties.principalId

@description('App Service default hostname')
output appServiceUrl string = 'https://${appService.outputs.defaultHostname}'

@description('Key Vault URI')
output keyVaultUri string = kvResource.properties.vaultUri

@description('PostgreSQL FQDN')
output postgresFqdn string = postgresql.outputs.fqdn

@description('Redis hostname')
output redisHostName string = redis.outputs.hostName

@description('Application Insights connection string')
output appInsightsConnectionString string = appInsights.outputs.connectionString

@description('Azure tenant ID')
output tenantId string = subscription().tenantId
