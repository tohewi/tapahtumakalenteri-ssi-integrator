// ============================================================
// Production parameter values for main.bicep
//
// IMPORTANT: postgresAdminPassword must be supplied at deploy time.
// Never commit a real password here.
// Supply via: --parameters postgresAdminPassword=$POSTGRES_ADMIN_PASSWORD
// ============================================================

using './main.bicep'

param environmentName        = 'prod'
param appName                = 'turres'
param location               = 'swedencentral'
param postgresAdminLogin     = 'pgadmin'

// Supplied at deploy time via CLI or GitHub Actions secret — NOT stored here.
// param postgresAdminPassword = ''

param appServicePlanSku      = 'B2'
param postgresSkuName        = 'Standard_B2ms'
param postgresStorageSizeGB  = 32
param logRetentionDays       = 30
