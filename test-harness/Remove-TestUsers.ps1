<#
.SYNOPSIS
    Check status and optionally deactivate SSI test user accounts.

.DESCRIPTION
    For each test user in config:
    1. Attempts login to verify account is active
    2. Discovers the /deactivate-shooter/<token>/ link from settings
    3. Optionally deactivates the account via that link

    SSI deactivation URL pattern: /deactivate-shooter/<token>/
    Each account has a unique token, discoverable from the settings page.

.PARAMETER ConfigPath
    Path to the test users YAML config.

.PARAMETER Deactivate
    If set, deactivate accounts using the SSI deactivation endpoint.
    IRREVERSIBLE — the accounts cannot be re-activated.

.EXAMPLE
    .\Remove-TestUsers.ps1                    # report status + deactivation links
    .\Remove-TestUsers.ps1 -Deactivate        # actually deactivate all test accounts
#>

param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "config\test-users.yml"),
    [switch]$Deactivate
)

$ErrorActionPreference = "Stop"
Import-Module PowerShell-Yaml -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot "lib\SSI-TestHelpers.psm1") -Force

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config not found: $ConfigPath"
    return
}

$config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Yaml
$users = $config.users

Write-Host "=== SSI Test User Status ===" -ForegroundColor Cyan
if ($Deactivate) {
    Write-Host "*** DEACTIVATION MODE — accounts will be permanently disabled ***" -ForegroundColor Red
}

$results = @()

foreach ($user in $users) {
    Write-Host "`n--- $($user.id) ($($user.email)) ---" -ForegroundColor Yellow
    try {
        $session = Connect-SSIWeb -Email $user.email -Password $user.password
        Write-Host "  Status: ACTIVE (login successful)" -ForegroundColor Green

        # Discover the deactivation link
        Write-Host "  Searching for deactivation link..." -ForegroundColor Gray
        $deactivateUrl = Find-DeactivationLink -Session $session

        if ($deactivateUrl) {
            Write-Host "  Deactivation URL: $deactivateUrl" -ForegroundColor White

            if ($Deactivate) {
                $null = Disable-SSIAccount -Session $session -DeactivationUrl $deactivateUrl -Confirm
                $results += @{ id = $user.id; status = "deactivated" }
            }
            else {
                $results += @{ id = $user.id; status = "active"; deactivateUrl = $deactivateUrl }
            }
        }
        else {
            Write-Host "  Deactivation link not found on settings pages" -ForegroundColor Yellow
            $results += @{ id = $user.id; status = "active"; deactivateUrl = "not found" }
        }
    }
    catch {
        Write-Host "  Status: INACTIVE (login failed)" -ForegroundColor Gray
        $results += @{ id = $user.id; status = "inactive" }
    }
}

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
foreach ($r in $results) {
    $color = switch ($r.status) {
        "active"      { "Green" }
        "deactivated" { "Red" }
        "inactive"    { "Gray" }
        default       { "White" }
    }
    $extra = if ($r.deactivateUrl) { " → $($r.deactivateUrl)" } else { "" }
    Write-Host "  $($r.id): $($r.status)$extra" -ForegroundColor $color
}

if (-not $Deactivate) {
    $active = $results | Where-Object { $_.status -eq "active" }
    if ($active) {
        Write-Host "`nTo deactivate these accounts, run:" -ForegroundColor Yellow
        Write-Host "  .\Remove-TestUsers.ps1 -Deactivate" -ForegroundColor White
    }
}
