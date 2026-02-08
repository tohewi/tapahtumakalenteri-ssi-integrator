<#
.SYNOPSIS
    Create SSI test user accounts via web scraping.

.DESCRIPTION
    Registers 3 test user accounts on SSI using the web registration form.
    Reads user definitions from config/test-users.yml.
    Skips users that already exist (login attempt succeeds).

    After running, check the admin email inbox for verification emails
    and verify each account before they can be used.

.PARAMETER ConfigPath
    Path to the test users YAML config. Defaults to config/test-users.yml.

.PARAMETER SkipExisting
    If set, skip users that can already login (default: true).

.EXAMPLE
    .\New-TestUsers.ps1
    .\New-TestUsers.ps1 -ConfigPath .\config\test-users.yml
#>

param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "config\test-users.yml"),
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Import-Module PowerShell-Yaml -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot "lib\SSI-TestHelpers.psm1") -Force

# Load config
if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config not found: $ConfigPath. Copy test-users.yml.template to test-users.yml and fill in credentials."
    return
}

$config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Yaml
$users = $config.users
$ssi = $config.ssi

Write-Host "=== SSI Test User Creation ===" -ForegroundColor Cyan
Write-Host "Users to create: $($users.Count)" -ForegroundColor White
Write-Host "Region: $($ssi.region), Timezone: $($ssi.timezone)" -ForegroundColor Gray
Write-Host ""

$results = @()

foreach ($user in $users) {
    Write-Host "--- User: $($user.id) ($($user.email)) ---" -ForegroundColor Yellow

    # Check if user already exists by trying to login
    if (-not $Force) {
        Write-Host "  Checking if account exists..." -ForegroundColor Gray
        try {
            $session = Connect-SSIWeb -Email $user.email -Password $user.password
            Write-Host "  SKIP: Account already exists and login works" -ForegroundColor Green
            $results += @{ id = $user.id; status = "exists"; email = $user.email }

            # Still try to update profile name
            Write-Host "  Updating profile..." -ForegroundColor Gray
            $null = Update-SSIProfile -Session $session -FirstName $user.firstName -LastName $user.lastName
            continue
        }
        catch {
            Write-Host "  Account does not exist or password is wrong — will register" -ForegroundColor Gray
        }
    }

    # Register new account
    Write-Host "  Registering..." -ForegroundColor White
    $success = Register-SSIAccount `
        -Email $user.email `
        -Password $user.password `
        -Region $ssi.region `
        -Timezone $ssi.timezone `
        -Sex $user.sex

    if ($success) {
        $results += @{ id = $user.id; status = "registered"; email = $user.email }

        # Try to login and update profile
        Write-Host "  Attempting login to update profile..." -ForegroundColor Gray
        try {
            $session = Connect-SSIWeb -Email $user.email -Password $user.password
            $null = Update-SSIProfile -Session $session -FirstName $user.firstName -LastName $user.lastName
        }
        catch {
            Write-Host "  Login failed — account may need email verification first" -ForegroundColor Yellow
            $results[-1].status = "needs_verification"
        }
    }
    else {
        $results += @{ id = $user.id; status = "failed"; email = $user.email }
    }

    Write-Host ""
}

# Summary
Write-Host "=== Summary ===" -ForegroundColor Cyan
foreach ($r in $results) {
    $color = switch ($r.status) {
        "exists"             { "Green" }
        "registered"         { "Green" }
        "needs_verification" { "Yellow" }
        "failed"             { "Red" }
        default              { "White" }
    }
    Write-Host "  $($r.id): $($r.status) ($($r.email))" -ForegroundColor $color
}

$needsVerification = $results | Where-Object { $_.status -eq "needs_verification" -or $_.status -eq "registered" }
if ($needsVerification) {
    Write-Host "`nACTION REQUIRED:" -ForegroundColor Yellow
    Write-Host "  Check inbox for verification emails and verify each account." -ForegroundColor Yellow
    Write-Host "  Verification emails are sent to the admin inbox (email aliases)." -ForegroundColor Gray
}
