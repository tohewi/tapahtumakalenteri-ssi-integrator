// ============================================================
// turres-ssi-tools — Azure Production Infrastructure
//
// Region: swedencentral (migrate to finlandsouth when available ~Q1 2027)
// All modules use Azure Verified Modules (AVM) from the public registry.
// Check https://aka.ms/avm for latest module versions before deploying.
//
// Deployment order (managed by Bicep dependency graph):
//   0.  App UAMI (id-turres-prod)
//   0.1 GitHub Actions UAMI (id-github-turres-prod) + OIDC federation + role assignments
//   1.  Log Analytics Workspace
//   2.  Application Insights
//   3.  Key Vault (empty)
//   4.  PostgreSQL Flexible Server
//   5.  Azure Cache for Redis
//   6.  Key Vault secrets (connection strings)
//   7.  App Service Plan
//   8.  App Service (user-assigned MI, KV references)
//   9.  Role assignment: KV Secrets User → App UAMI
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

@description('App Service Plan SKU (B2 minimum for production; upgrade to P1v3 for VNet).')
param appServicePlanSku string = 'B2'

@description('PostgreSQL Flexible Server compute SKU.')
param postgresSkuName string = 'Standard_B2ms'

@description('PostgreSQL storage size in GB.')
param postgresStorageSizeGB int = 32

@description('Log Analytics data retention in days.')
param logRetentionDays int = 30

@description('GitHub repository in owner/repo format for OIDC federation.')
param githubRepository string = 'tohewi/tapahtumakalenteri-ssi-integrator'

@description('GitHub Actions environment name used in the OIDC subject claim.')
param githubEnvironment string = 'production'

// ── Computed names ───────────────────────────────────────────

var kvName     = 'kv-${appName}-${environmentName}'
var logName    = 'log-${appName}-${environmentName}'
var appiName   = 'appi-${appName}-${environmentName}'
var psqlName   = 'psql-${appName}-${environmentName}'
var redisName  = 'redis-${appName}-${environmentName}'
var aspName    = 'asp-${appName}-${environmentName}'
var appSvcName = 'app-${appName}-${environmentName}'
var uamiName     = 'id-${appName}-${environmentName}'
var ghUamiName   = 'id-github-${appName}-${environmentName}'
var dbName       = 'turres_platform'

// Built-in role definition IDs
var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'  // Key Vault Secrets User
var contributorRoleId   = 'b24988ac-6180-42a0-ab88-20f7382dd24c'  // Contributor
var rbacAdminRoleId     = 'f58310d9-a9f6-439a-9e8d-f62e7b41a168'  // Role Based Access Control Administrator

// ABAC condition: limits RBAC Admin to assigning ONLY Key Vault Secrets User.
// Prevents privilege escalation while still allowing the KV role assignment in Bicep.
var rbacAdminCondition = '(!(ActionMatches{''Microsoft.Authorization/roleAssignments/write''}) OR @Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6}) AND (!(ActionMatches{''Microsoft.Authorization/roleAssignments/delete''}) OR @Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6})'

// ── 0. User-Assigned Managed Identity ──────────────────────────
// Created before all other resources so its principalId is available
// for Key Vault role assignment and the identity survives App Service
// recreation (unlike system-assigned).
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/managed-identity/user-assigned-identity

module uami 'br/public:avm/res/managed-identity/user-assigned-identity:0.4.0' = {
  name: 'uamiDeployment'
  params: {
    name: uamiName
    location: location
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// ── 0.1 GitHub Actions UAMI + OIDC federation ───────────────
// Separate identity for CI/CD — no overlap with app runtime identity.
// Federates with GitHub Actions environment-scoped OIDC, enabling keyless
// Azure login from the workflow (no AZURE_CREDENTIALS service principal needed).
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/managed-identity/user-assigned-identity

module ghUami 'br/public:avm/res/managed-identity/user-assigned-identity:0.4.0' = {
  name: 'ghUamiDeployment'
  params: {
    name: ghUamiName
    location: location
    federatedIdentityCredentials: [
      {
        // Subject must match the GitHub Actions token exactly:
        // environment-scoped claim → repo:<owner>/<repo>:environment:<env>
        name: 'github-actions-${githubEnvironment}'
        audiences: ['api://AzureADTokenExchange']
        issuer: 'https://token.actions.githubusercontent.com'
        subject: 'repo:${githubRepository}:environment:${githubEnvironment}'
      }
    ]
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// Contributor on RG: create / update / delete any resource during infra + app deploy.
resource ghActionsContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: resourceGroup()
  name: guid(resourceGroup().id, ghUami.outputs.principalId, contributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
    principalId: ghUami.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role Based Access Control Administrator on RG, constrained by ABAC condition to
// only assign/revoke Key Vault Secrets User — prevents any privilege escalation.
resource ghActionsRbacAdminRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: resourceGroup()
  name: guid(resourceGroup().id, ghUami.outputs.principalId, rbacAdminRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', rbacAdminRoleId)
    principalId: ghUami.outputs.principalId
    principalType: 'ServicePrincipal'
    condition: rbacAdminCondition
    conditionVersion: '2.0'
  }
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

// ── 3. Key Vault (RBAC-enabled) ──────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/key-vault/vault

module keyVault 'br/public:avm/res/key-vault/vault:0.12.1' = {
  name: 'keyVaultDeployment'
  params: {
    name: kvName
    location: location
    sku: 'standard'
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// ── 4. PostgreSQL Flexible Server ────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/db-for-postgre-sql/flexible-server

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
    highAvailabilityMode: 'Disabled'
    backupRetentionDays: 7
    geoRedundantBackup: 'Disabled'
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

// ── 5. Azure Cache for Redis ─────────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/cache/redis

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
      maxmemoryPolicy: 'allkeys-lru'
    }
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// ── 6. Key Vault secrets — connection strings ─────────────────
// Computed from deployed resources, stored in KV so App Service can reference them.

var postgresUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresql.outputs.fqdn}:5432/${dbName}?sslmode=require'
var redisKey    = listKeys(redis.outputs.resourceId, '2023-08-01').primaryKey
var redisUrl    = 'rediss://:${redisKey}@${redis.outputs.hostName}:6380'

resource kvResource 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: kvName
  dependsOn: [keyVault]
}

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvResource
  name: 'DatabaseUrl'
  properties: {
    value: postgresUrl
  }
}

resource secretRedisUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvResource
  name: 'RedisUrl'
  properties: {
    value: redisUrl
  }
}

// Placeholder secrets — operator must populate these before the app can start.
// The App Service will report unhealthy until all KV references resolve.
resource secretSessionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvResource
  name: 'SessionSecret'
  properties: {
    value: 'REPLACE_ME_64_char_random_hex'
  }
}

resource secretPlatformKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvResource
  name: 'PlatformCredentialsKey'
  properties: {
    value: 'REPLACE_ME_32_byte_base64_key'
  }
}

resource secretMfaKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvResource
  name: 'MfaSecretKey'
  properties: {
    value: 'REPLACE_ME_32_byte_base64_key'
  }
}

resource secretSsiEmail 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvResource
  name: 'SsiAdminEmail'
  properties: {
    value: 'REPLACE_ME'
  }
}

resource secretSsiPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvResource
  name: 'SsiAdminPassword'
  properties: {
    value: 'REPLACE_ME'
  }
}

resource secretResend 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvResource
  name: 'ResendApiKey'
  properties: {
    value: 'REPLACE_ME'
  }
}

// ── 7. App Service Plan ───────────────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/web/serverfarm

module appServicePlan 'br/public:avm/res/web/serverfarm:0.4.1' = {
  name: 'appServicePlanDeployment'
  params: {
    name: aspName
    location: location
    sku: {
      name: appServicePlanSku
    }
    reserved: true  // Required for Linux
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// ── 8. App Service ────────────────────────────────────────────
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/web/site
//
// Startup: node scoring-proxy/server.js
// The ZIP deploy extracts to /home/site/wwwroot/ maintaining:
//   scoring-proxy/ (Express server, __dirname = .../scoring-proxy)
//   scoring-ui/dist/ (static frontend, resolved via ../scoring-ui/dist)

var kvRef = 'VaultName=${kvName}'

module appService 'br/public:avm/res/web/site:0.12.0' = {
  name: 'appServiceDeployment'
  params: {
    name: appSvcName
    location: location
    kind: 'app,linux'
    serverFarmResourceId: appServicePlan.outputs.resourceId
    managedIdentities: {
      userAssignedResourceIds: [uami.outputs.resourceId]
    }
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandFile: 'node scoring-proxy/server.js'
      alwaysOn: true
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
      // All sensitive settings via Key Vault references
      DATABASE_URL: '@Microsoft.KeyVault(${kvRef};SecretName=DatabaseUrl)'
      REDIS_URL: '@Microsoft.KeyVault(${kvRef};SecretName=RedisUrl)'
      SESSION_SECRET: '@Microsoft.KeyVault(${kvRef};SecretName=SessionSecret)'
      PLATFORM_CREDENTIALS_KEY: '@Microsoft.KeyVault(${kvRef};SecretName=PlatformCredentialsKey)'
      MFA_SECRET_KEY: '@Microsoft.KeyVault(${kvRef};SecretName=MfaSecretKey)'
      SSI_ADMIN_EMAIL: '@Microsoft.KeyVault(${kvRef};SecretName=SsiAdminEmail)'
      SSI_ADMIN_PASSWORD: '@Microsoft.KeyVault(${kvRef};SecretName=SsiAdminPassword)'
      RESEND_API_KEY: '@Microsoft.KeyVault(${kvRef};SecretName=ResendApiKey)'
    }
    httpsOnly: true
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
  dependsOn: [
    secretDatabaseUrl
    secretRedisUrl
    secretSessionSecret
    secretPlatformKey
    secretMfaKey
    secretSsiEmail
    secretSsiPassword
    secretResend
  ]
}

// ── 9. Role assignment: KV Secrets User → App Service MI ─────
// Grants the App Service managed identity permission to read Key Vault secrets.

resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kvResource
  name: guid(keyVault.outputs.resourceId, uami.outputs.principalId, kvSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: uami.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs ───────────────────────────────────────────────────

@description('User-assigned managed identity resource ID')
output uamiResourceId string = uami.outputs.resourceId

@description('User-assigned managed identity principal ID')
output uamiPrincipalId string = uami.outputs.principalId

@description('App Service default hostname')
output appServiceUrl string = 'https://${appService.outputs.defaultHostname}'

@description('Key Vault URI')
output keyVaultUri string = keyVault.outputs.uri

@description('PostgreSQL FQDN')
output postgresFqdn string = postgresql.outputs.fqdn

@description('Redis hostname')
output redisHostName string = redis.outputs.hostName

@description('Application Insights connection string')
output appInsightsConnectionString string = appInsights.outputs.connectionString

@description('GitHub Actions UAMI client ID — set as AZURE_CLIENT_ID GitHub Actions secret')
output ghActionsClientId string = ghUami.outputs.clientId

@description('Azure tenant ID — set as AZURE_TENANT_ID GitHub Actions secret')
output tenantId string = subscription().tenantId
