#!/usr/bin/env pwsh
# ============================================================
# Stop-TurresInfra.ps1 — Stop Azure resources to save costs
#
# Stops (in order): App Service → PostgreSQL Flexible Server
# Redis Basic C0 stays running (~€8/mo) — no stop/start API for Basic tier.
#
# Data preservation:
#   - PostgreSQL: all data preserved (storage continues, compute stops)
#   - Redis: sessions lost on restart — users simply re-login
#   - Key Vault, Log Analytics: always-on, negligible cost
#
# Estimated cost when stopped: ~€25/mo (PG storage + Redis C0 + App Plan)
#
# Usage:
#   ./infra/scripts/Stop-TurresInfra.ps1
#   ./infra/scripts/Stop-TurresInfra.ps1 -ResourceGroup rg-turres-prod
# ============================================================

param(
    [string]$ResourceGroup = 'rg-turres-prod',
    [string]$AppName       = 'app-turres-prod',
    [string]$PostgresName  = 'psql-turres-prod'
)

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Stopping Turres Azure Infrastructure ===" -ForegroundColor Yellow
Write-Host "Resource Group: $ResourceGroup"
Write-Host ""

# 1. Stop App Service (immediate — plan still charges but app doesn't run)
Write-Host "[1/2] Stopping App Service '$AppName'..." -ForegroundColor Cyan
az webapp stop --resource-group $ResourceGroup --name $AppName
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to stop App Service"; exit 1 }
Write-Host "      App Service stopped." -ForegroundColor Green

# 2. Stop PostgreSQL Flexible Server (takes ~1-2 min, compute billing stops)
Write-Host "[2/2] Stopping PostgreSQL '$PostgresName' (compute billing stops, data preserved)..." -ForegroundColor Cyan
az postgres flexible-server stop --resource-group $ResourceGroup --name $PostgresName
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to stop PostgreSQL"; exit 1 }
Write-Host "      PostgreSQL stopped. Storage billing continues (~€4/mo for 32GB)." -ForegroundColor Green

Write-Host "`n=== All stoppable resources stopped ===" -ForegroundColor Green
Write-Host "Still running: Redis Basic C0 (~€8/mo), App Service Plan B1 (~€13/mo)"
Write-Host "Estimated stopped cost: ~€25/mo"
Write-Host "To restart: ./infra/scripts/Start-TurresInfra.ps1`n"
