// ============================================================
// Production parameter values for main.bicep
//
// PostgreSQL admin password is read directly from Key Vault via az.getSecret().
// Prerequisite: run infra/bootstrap.bicep first, then populate
//   kv-turres-prod / PostgresAdminPassword before deploying this file.
// ============================================================

using './main.bicep'

param environmentName        = 'prod'
param appName                = 'turres'
param location               = 'swedencentral'
param postgresAdminLogin     = 'pgadmin'

// Read postgres password directly from Key Vault — no CLI flag needed.
param postgresAdminPassword  = az.getSecret('5bb1981d-8206-44e6-aed0-d6ba3b7aa900', 'rg-turres-prod', 'kv-turres-prod', 'PostgresAdminPassword')

param appServicePlanSku      = 'B2'
param postgresSkuName        = 'Standard_B2ms'
param postgresStorageSizeGB  = 32
param logRetentionDays       = 30

// Budget guardrail
param budgetStartDate        = '2026-03-01T00:00:00Z'
param budgetAmountEur        = 100
param budgetAlertEmail       = 'tohewi@gmail.com'
