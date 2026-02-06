<#
.SYNOPSIS
    Discover the SSI match registration and squad assignment web pages.

.DESCRIPTION
    Logs in as admin and explores the match page to find URLs for:
    - Competitor registration (enrollment to match)
    - Squad assignment
    
    This is a diagnostic script — run it once to discover URL patterns,
    then update Register-ToMatch and Squad-TestUsers scripts accordingly.

.PARAMETER MatchId
    The SSI match ID to explore.

.PARAMETER ConfigPath
    Path to the test users YAML config.

.EXAMPLE
    .\Find-MatchRegistrationForm.ps1 -MatchId 1889
#>

param(
    [Parameter(Mandatory)] [string]$MatchId,
    [string]$ConfigPath = (Join-Path $PSScriptRoot "config\test-users.yml")
)

$ErrorActionPreference = "Stop"
Import-Module PowerShell-Yaml -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot "lib\SSI-TestHelpers.psm1") -Force

$config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Yaml
$admin = $config.admin
$baseUri = $config.ssi.baseUri

Write-Host "=== Discovering Match Registration Pages ===" -ForegroundColor Cyan
Write-Host "Match ID: $MatchId" -ForegroundColor White

# Login as admin
Write-Host "`nLogging in as admin ($($admin.email))..." -ForegroundColor Gray
$session = Connect-SSIWeb -Email $admin.email -Password $admin.password
Write-Host "Logged in" -ForegroundColor Green

# Try various URL patterns for the match page
$urlsToTry = @(
    @{ url = "$baseUri/event/93/$MatchId/"; label = "Match event page (CT=93)" }
    @{ url = "$baseUri/event/93/$MatchId/register/"; label = "Match register (CT=93)" }
    @{ url = "$baseUri/event/93/$MatchId/squads/"; label = "Match squads (CT=93)" }
    @{ url = "$baseUri/nordic/match/$MatchId/"; label = "Nordic match page" }
    @{ url = "$baseUri/nordic/match/$MatchId/register/"; label = "Nordic match register" }
    @{ url = "$baseUri/nordic/match/$MatchId/squads/"; label = "Nordic match squads" }
    @{ url = "$baseUri/series/nordic/$MatchId/"; label = "Series nordic page" }
    @{ url = "$baseUri/series/nordic/$MatchId/register/"; label = "Series nordic register" }
    @{ url = "$baseUri/series/nordic/$MatchId/squads/"; label = "Series nordic squads" }
    @{ url = "$baseUri/match/$MatchId/"; label = "Direct match page" }
    @{ url = "$baseUri/match/$MatchId/register/"; label = "Direct match register" }
)

Write-Host "`n--- URL Discovery ---" -ForegroundColor Yellow

foreach ($entry in $urlsToTry) {
    try {
        $resp = Invoke-WebRequest -Uri $entry.url -WebSession $session -UseBasicParsing -ErrorAction Stop
        $hasForm = $resp.Content -match '<form'
        $hasRegister = $resp.Content -match 'register|enroll|signup'
        $hasSquad = $resp.Content -match 'squad'

        $indicators = @()
        if ($hasForm) { $indicators += "FORM" }
        if ($hasRegister) { $indicators += "REGISTER" }
        if ($hasSquad) { $indicators += "SQUAD" }

        $indStr = if ($indicators.Count -gt 0) { " [" + ($indicators -join ", ") + "]" } else { "" }
        Write-Host "  200 OK: $($entry.label)$indStr" -ForegroundColor Green
        Write-Host "         $($entry.url)" -ForegroundColor Gray

        # If we found a form, dump its fields
        if ($hasForm) {
            $formFields = [regex]::Matches($resp.Content, 'name="([^"]+)"') |
                ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
            Write-Host "         Fields: $($formFields -join ', ')" -ForegroundColor DarkGray

            # Save full HTML for manual inspection
            $safeName = ($entry.label -replace '[^a-zA-Z0-9]', '_').ToLower()
            $debugFile = "debug-$safeName.html"
            $resp.Content | Out-File $debugFile -Encoding UTF8
            Write-Host "         Saved: $debugFile" -ForegroundColor DarkGray
        }
    }
    catch {
        $status = $_.Exception.Response.StatusCode
        if ($status -eq 302 -or $status -eq "Found") {
            $location = $_.Exception.Response.Headers.Location
            Write-Host "  302 →: $($entry.label) → $location" -ForegroundColor Yellow
            Write-Host "         $($entry.url)" -ForegroundColor Gray
        }
        elseif ($status -eq 404 -or $status -eq "NotFound") {
            Write-Host "  404   : $($entry.label)" -ForegroundColor DarkGray
        }
        else {
            Write-Host "  $status`: $($entry.label)" -ForegroundColor Red
        }
    }
}

# Also scrape the match event page for any links
Write-Host "`n--- Links on match page ---" -ForegroundColor Yellow
try {
    $matchPage = Invoke-WebRequest -Uri "$baseUri/event/93/$MatchId/" -WebSession $session -UseBasicParsing
    $links = [regex]::Matches($matchPage.Content, 'href="([^"]*)"') |
        ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique

    $relevant = $links | Where-Object {
        $_ -match "register" -or $_ -match "squad" -or $_ -match "enroll" -or
        $_ -match "competitor" -or $_ -match $MatchId
    }

    if ($relevant) {
        foreach ($link in $relevant) {
            Write-Host "  $link" -ForegroundColor White
        }
    }
    else {
        Write-Host "  No registration/squad links found. All links:" -ForegroundColor Gray
        $links | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }
}
catch {
    Write-Host "  Could not fetch match page: $_" -ForegroundColor Red
}

# Now login as test user 1 and try to find the "Register" button
Write-Host "`n--- Test user perspective ---" -ForegroundColor Yellow
$testUser = $config.users[0]
Write-Host "Logging in as test user: $($testUser.email)" -ForegroundColor Gray
try {
    $testSession = Connect-SSIWeb -Email $testUser.email -Password $testUser.password
    Write-Host "Logged in as test user" -ForegroundColor Green

    $matchPage = Invoke-WebRequest -Uri "$baseUri/event/93/$MatchId/" -WebSession $testSession -UseBasicParsing
    $links = [regex]::Matches($matchPage.Content, 'href="([^"]*)"') |
        ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique

    $registerLinks = $links | Where-Object { $_ -match "register" }
    if ($registerLinks) {
        Write-Host "  Register links found:" -ForegroundColor Green
        $registerLinks | ForEach-Object { Write-Host "    $_" -ForegroundColor White }
    }
    else {
        Write-Host "  No register links found from test user view" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "  Could not login as test user: $_" -ForegroundColor Yellow
    Write-Host "  (Run New-TestUsers.ps1 first to create test accounts)" -ForegroundColor Gray
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
Write-Host "Review the output above and debug-*.html files to identify the correct URLs." -ForegroundColor White
Write-Host "Then update Register-ToMatch in lib/SSI-TestHelpers.psm1 with the discovered pattern." -ForegroundColor White
