#!/usr/bin/env pwsh
# ============================================================
# Start-TurresInfra.ps1 — Start Azure resources after a cost-saving stop
#
# Starts (in order): PostgreSQL Flexible Server → App Service
# PostgreSQL takes ~2-3 min to start; App Service starts immediately.
#
# Usage:
#   ./infra/scripts/Start-TurresInfra.ps1
#   ./infra/scripts/Start-TurresInfra.ps1 -ResourceGroup rg-turres-prod
# ============================================================

param(
    [string]$ResourceGroup = 'rg-turres-prod',
    [string]$AppName       = 'app-turres-prod',
    [string]$PostgresName  = 'psql-turres-prod'
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Starting Turres Azure Infrastructure ===" -ForegroundColor Yellow
Write-Host "Resource Group: $ResourceGroup"
Write-Host ""

# 1. Start PostgreSQL first (App Service depends on it)
Write-Host "[1/2] Starting PostgreSQL '$PostgresName' (takes ~2-3 min)..." -ForegroundColor Cyan
az postgres flexible-server start --resource-group $ResourceGroup --name $PostgresName
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to start PostgreSQL"; exit 1 }
Write-Host "      PostgreSQL started." -ForegroundColor Green

# 2. Start App Service
Write-Host "[2/2] Starting App Service '$AppName'..." -ForegroundColor Cyan
az webapp start --resource-group $ResourceGroup --name $AppName
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to start App Service"; exit 1 }
Write-Host "      App Service started." -ForegroundColor Green

# 3. Health check
Write-Host "`nWaiting 15s for App Service to warm up..." -ForegroundColor Gray
Start-Sleep -Seconds 15

$healthUrl = "https://${AppName}.azurewebsites.net/api/v1/"
Write-Host "Checking health: $healthUrl" -ForegroundColor Gray
try {
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 30
    Write-Host "Health check passed: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "Health check failed (app may still be warming up): $_" -ForegroundColor Yellow
    Write-Host "Try again in a minute: Invoke-RestMethod $healthUrl"
}

Write-Host "`n=== All resources started ===" -ForegroundColor Green
Write-Host "App URL: https://${AppName}.azurewebsites.net`n"
