<#
.SYNOPSIS
  Step 2: Find competitor IDs for turreskuko1 in each match of CUP 158.
  Scrapes the participants page of each match to find the competitor.
#>
param(
    [int]$CupId = 158,
    [string]$ShooterName = "Turresku"
)

$ErrorActionPreference = "Stop"
$base = "https://shootnscoreit.com"

# Load admin credentials
$envFile = Join-Path $PSScriptRoot "..\scoring-proxy\.env"
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^(\w+)=(.*)$') { $envVars[$Matches[1]] = $Matches[2] }
}

# Login
Write-Host "=== Admin login ===" -ForegroundColor Cyan
$loginUrl = "$base/login/?next=/dashboard/"
$null = Invoke-WebRequest -Uri $loginUrl -SessionVariable session -UseBasicParsing
$loginBody = @{ username = $envVars['SSI_ADMIN_EMAIL']; password = $envVars['SSI_ADMIN_PASSWORD']; keep = "on" }
try {
    $null = Invoke-WebRequest -Uri $loginUrl -Method POST -Body $loginBody -WebSession $session -UseBasicParsing -MaximumRedirection 0
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 302) {
        Write-Host "  Login OK" -ForegroundColor Green
    } else { throw }
}

# Get cup matches via the proxy GraphQL (or scrape directly)
# CUP 158 has matches — let's find them by scraping the cup participants page
Write-Host "`n=== Finding matches in CUP $CupId ===" -ForegroundColor Cyan

# Scrape the cup page to find match links
$cupUrl = "$base/event/136/$CupId/"
$cupPage = Invoke-WebRequest -Uri $cupUrl -WebSession $session -UseBasicParsing
$cupPage.Content | Out-File "test-harness/debug-step2-cup.html" -Encoding UTF8

# Find match IDs from component_matches links
# Pattern: /event/91/{matchId}/
$matchLinks = [regex]::Matches($cupPage.Content, 'href="/event/91/(\d+)/"')
$matchIds = $matchLinks | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
Write-Host "  Found $($matchIds.Count) matches: $($matchIds -join ', ')" -ForegroundColor White

# For each match, scrape the participants page to find the competitor
Write-Host "`n=== Finding competitor in each match ===" -ForegroundColor Cyan
foreach ($matchId in $matchIds) {
    Write-Host "`n--- Match $matchId ---" -ForegroundColor Yellow
    $participantsUrl = "$base/event/91/$matchId/participants/"
    $partPage = Invoke-WebRequest -Uri $participantsUrl -WebSession $session -UseBasicParsing
    $partPage.Content | Out-File "test-harness/debug-step2-match-$matchId-participants.html" -Encoding UTF8
    Write-Host "  Participants page: $($partPage.Content.Length) chars" -ForegroundColor Gray

    # Find the shooter by name — look for edit links near the name
    # Pattern: href="/event/participant/93/{competitorId}/edit/"
    # Near the shooter name "Turresku"
    $lines = $partPage.Content -split "`n"
    $found = $false
    foreach ($line in $lines) {
        if ($line -match $ShooterName) {
            Write-Host "  Found line: $($line.Trim().Substring(0, [Math]::Min(200, $line.Trim().Length)))" -ForegroundColor White
            # Extract competitor ID from nearby edit link
            $editMatch = [regex]::Match($line, '/event/participant/93/(\d+)/edit/')
            if ($editMatch.Success) {
                Write-Host "  COMPETITOR ID: $($editMatch.Groups[1].Value)" -ForegroundColor Green
                $found = $true
            }
        }
    }

    if (-not $found) {
        # Try broader search — find all edit links and names
        $editLinks = [regex]::Matches($partPage.Content, '/event/participant/93/(\d+)/edit/')
        Write-Host "  Total edit links found: $($editLinks.Count)" -ForegroundColor Gray

        # Search within a wider context for Turresku
        $turresMatch = [regex]::Match($partPage.Content, "(?s)$ShooterName[\s\S]{0,500}?/event/participant/93/(\d+)/edit/")
        if (-not $turresMatch.Success) {
            $turresMatch = [regex]::Match($partPage.Content, "(?s)/event/participant/93/(\d+)/edit/[\s\S]{0,500}?$ShooterName")
        }
        if ($turresMatch.Success) {
            Write-Host "  COMPETITOR ID (context match): $($turresMatch.Groups[1].Value)" -ForegroundColor Green
        } else {
            Write-Host "  Shooter NOT FOUND in participants page" -ForegroundColor Red
        }
    }
}

Write-Host "`nDone. Check debug HTML files for details." -ForegroundColor Cyan
