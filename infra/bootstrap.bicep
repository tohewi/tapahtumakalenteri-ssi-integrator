// ============================================================
// turres-ssi-tools — Bootstrap: Key Vault + Managed Identities
//
// Run ONCE before main.bicep:
//   1. Get deployer object ID:
//        az ad signed-in-user show --query id -o tsv
//   2. Deploy:
//        az deployment group create \
//          --resource-group rg-turres-prod \
//          --template-file infra/bootstrap.bicep \
//          --parameters deployerObjectId=<objectId>
//   3. Populate ALL secrets in Key Vault (see infra/README.md §4).
//   4. Deploy infra/main.bicep (reads postgres password from KV).
//
// Re-running is idempotent.
// ============================================================

targetScope = 'resourceGroup'

// ── Parameters ──────────────────────────────────────────────

@description('Short environment tag appended to resource names.')
param environmentName string = 'prod'

@description('Base name used in all resource names.')
param appName string = 'turres'

@description('Azure region for all resources.')
param location string = 'swedencentral'

@description('Object ID of the operator who will populate Key Vault secrets. Get via: az ad signed-in-user show --query id -o tsv')
param deployerObjectId string

@description('GitHub repository in owner/repo format for OIDC federation.')
param githubRepository string = 'tohewi/tapahtumakalenteri-ssi-integrator'

@description('GitHub Actions environment name used in the OIDC subject claim.')
param githubEnvironment string = 'production'

// ── Computed names ───────────────────────────────────────────

var kvName     = 'kv-${appName}-${environmentName}'
var uamiName   = 'id-${appName}-${environmentName}'
var ghUamiName = 'id-github-${appName}-${environmentName}'

// Built-in role definition IDs
var kvSecretsUserRoleId    = '4633458b-17de-408a-b874-0445c86b69e6'  // Key Vault Secrets User
var kvSecretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'  // Key Vault Secrets Officer
var contributorRoleId      = 'b24988ac-6180-42a0-ab88-20f7382dd24c'  // Contributor
var rbacAdminRoleId        = 'f58310d9-a9f6-439a-9e8d-f62e7b41a168'  // Role Based Access Control Administrator

// ABAC condition: limits RBAC Admin to assigning ONLY Key Vault Secrets User.
// Prevents privilege escalation from CI/CD.
var rbacAdminCondition = '(!(ActionMatches{''Microsoft.Authorization/roleAssignments/write''}) OR @Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6}) AND (!(ActionMatches{''Microsoft.Authorization/roleAssignments/delete''}) OR @Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {4633458b-17de-408a-b874-0445c86b69e6})'

// ── 1. App Runtime UAMI ──────────────────────────────────────
// Used by App Service to authenticate against Key Vault at runtime.
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

// ── 2. GitHub Actions UAMI + OIDC federation ─────────────────
// Used by CI/CD pipeline to deploy infra and app without stored secrets.
// Subject claim must match exactly: repo:<owner>/<repo>:environment:<env>
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/managed-identity/user-assigned-identity

module ghUami 'br/public:avm/res/managed-identity/user-assigned-identity:0.4.0' = {
  name: 'ghUamiDeployment'
  params: {
    name: ghUamiName
    location: location
    federatedIdentityCredentials: [
      {
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

// ── 3. Key Vault ─────────────────────────────────────────────
// Stores all application secrets. RBAC-enabled; no legacy access policies.
// Populate secrets here before running main.bicep (see README §4).
// AVM: https://github.com/Azure/bicep-registry-modules/tree/main/avm/res/key-vault/vault

module keyVault 'br/public:avm/res/key-vault/vault:0.12.1' = {
  name: 'keyVaultDeployment'
  params: {
    name: kvName
    location: location
    sku: 'standard'
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
    tags: {
      environment: environmentName
      managedBy: 'bicep-avm'
    }
  }
}

// Existing reference used as scope for KV-level role assignments.
// dependsOn ensures KV is created before assignments are attempted.
resource kvRef 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: kvName
  dependsOn: [keyVault]
}

// ── 4. Role assignments ───────────────────────────────────────

// App UAMI → Key Vault Secrets User
// Allows the App Service to read secrets from KV at runtime.
resource appUamiKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kvRef
  name: guid(resourceGroup().id, kvName, uamiName, kvSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: uami.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// Human deployer → Key Vault Secrets Officer
// Grants the operator running this template the ability to set secrets in KV.
resource deployerKvSecretsOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kvRef
  name: guid(resourceGroup().id, kvName, deployerObjectId, kvSecretsOfficerRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsOfficerRoleId)
    principalId: deployerObjectId
    principalType: 'User'
  }
}

// GH Actions UAMI → Key Vault Secrets Officer
// Allows CI/CD pipeline to write computed secrets (DatabaseUrl, RedisUrl) during main.bicep deploy.
resource ghUamiKvSecretsOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kvRef
  name: guid(resourceGroup().id, kvName, ghUamiName, kvSecretsOfficerRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsOfficerRoleId)
    principalId: ghUami.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// GH Actions UAMI → Contributor on RG
// Allows CI/CD to create, update, and delete any resource in the resource group.
resource ghUamiContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: resourceGroup()
  name: guid(resourceGroup().id, ghUamiName, contributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
    principalId: ghUami.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// GH Actions UAMI → RBAC Administrator (conditioned)
// Allows CI/CD to assign the Key Vault Secrets User role to the App UAMI.
// ABAC condition prevents escalation beyond that one role.
resource ghUamiRbacAdmin 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: resourceGroup()
  name: guid(resourceGroup().id, ghUamiName, rbacAdminRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', rbacAdminRoleId)
    principalId: ghUami.outputs.principalId
    principalType: 'ServicePrincipal'
    condition: rbacAdminCondition
    conditionVersion: '2.0'
  }
}

// ── Outputs ───────────────────────────────────────────────────

@description('App runtime UAMI resource ID — referenced by App Service in main.bicep')
output appUamiResourceId string = uami.outputs.resourceId

@description('App runtime UAMI principal ID')
output appUamiPrincipalId string = uami.outputs.principalId

@description('GitHub Actions UAMI client ID — set as AZURE_CLIENT_ID GitHub Actions secret')
output ghActionsClientId string = ghUami.outputs.clientId

@description('Azure tenant ID — set as AZURE_TENANT_ID GitHub Actions secret')
output tenantId string = subscription().tenantId

@description('Key Vault URI — populate ALL secrets here before running main.bicep')
output keyVaultUri string = keyVault.outputs.uri

@description('Key Vault name')
output keyVaultName string = kvName
