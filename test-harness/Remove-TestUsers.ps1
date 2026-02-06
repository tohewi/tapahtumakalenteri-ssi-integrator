<#
.SYNOPSIS
    Verify and optionally deactivate SSI test user accounts.

.DESCRIPTION
    Checks which test users exist by attempting login.
    SSI does not expose a public account deletion API, so this script:
    1. Reports which test accounts exist and can login
    2. Optionally changes passwords to random values (soft-disable)
    
    For full deletion, contact SSI support or use the SSI web UI manually.

.PARAMETER ConfigPath
    Path to the test users YAML config.

.PARAMETER Disable
    If set, change test user passwords to random values to prevent login.

.EXAMPLE
    .\Remove-TestUsers.ps1                # just report status
    .\Remove-TestUsers.ps1 -Disable       # change passwords to disable accounts
#>

param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "config\test-users.yml"),
    [switch]$Disable
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

foreach ($user in $users) {
    Write-Host "--- $($user.id) ($($user.email)) ---" -ForegroundColor Yellow
    try {
        $session = Connect-SSIWeb -Email $user.email -Password $user.password
        Write-Host "  Status: ACTIVE (login successful)" -ForegroundColor Green

        if ($Disable) {
            Write-Host "  Disabling account (changing password)..." -ForegroundColor Yellow
            # Navigate to password change page
            $pwUrl = "$($config.ssi.baseUri)/settings/password/"
            try {
                $pwPage = Invoke-WebRequest -Uri $pwUrl -WebSession $session -UseBasicParsing
                $csrfToken = $null
                if ($pwPage.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
                    $csrfToken = $Matches[1]
                }
                $randomPw = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 20 | ForEach-Object { [char]$_ })
                $pwBody = @{
                    old_password  = $user.password
                    new_password1 = "${randomPw}!Aa1"
                    new_password2 = "${randomPw}!Aa1"
                }
                if ($csrfToken) { $pwBody["csrfmiddlewaretoken"] = $csrfToken }
                $headers = @{ Origin = $config.ssi.baseUri; Referer = $pwUrl }
                $null = Invoke-WebRequest -Uri $pwUrl -Method POST -WebSession $session `
                    -Body $pwBody -Headers $headers -ContentType "application/x-www-form-urlencoded" `
                    -MaximumRedirection 5 -ErrorAction Stop
                Write-Host "  DISABLED: Password changed to random value" -ForegroundColor Red
            }
            catch {
                Write-Host "  Failed to change password: $_" -ForegroundColor Red
            }
        }
    }
    catch {
        Write-Host "  Status: INACTIVE (login failed)" -ForegroundColor Gray
    }
}
