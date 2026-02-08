<#
.SYNOPSIS
    Discover SSI admin pages for registration, squad assignment, and user lookup.

.DESCRIPTION
    Logs in as admin and systematically explores SSI pages to find:
    1. How to register/invite a shooter to a Cup
    2. How to assign a shooter to a squad in a match
    3. How to look up a user by email

    Saves discovered pages as debug-*.html for manual inspection.

.PARAMETER CupId
    A real Cup ID to explore. If not provided, searches for "Kupittaa" cups.

.EXAMPLE
    .\Discover-AdminOperations.ps1
    .\Discover-AdminOperations.ps1 -CupId 1234
#>

param(
    [string]$CupId
)

$ErrorActionPreference = "Stop"
Import-Module PowerShell-Yaml -ErrorAction Stop

# Load admin credentials from scripts-graphql config
$apiKeyPath = Join-Path $PSScriptRoot "..\scripts-graphql\config\api-key.yml"
if (-not (Test-Path $apiKeyPath)) {
    Write-Error "Admin config not found: $apiKeyPath"
    return
}
$apiConfig = Get-Content $apiKeyPath -Raw -Encoding UTF8 | ConvertFrom-Yaml
$BaseUri = "https://shootnscoreit.com"

# Also load the GraphQL module for queries
$gqlModulePath = Join-Path $PSScriptRoot "..\scripts-graphql\lib\SSI-GraphQL.psm1"
Import-Module $gqlModulePath -Force

# ============================================================
# Step 1: Authenticate (both web session and GraphQL)
# ============================================================
Write-Host "=== Step 1: Authentication ===" -ForegroundColor Cyan

# GraphQL auth
$gqlHeaders = Connect-SSIGraphQL -Email $apiConfig.email -Password $apiConfig.password -ApiKey $apiConfig.apiKey
Write-Host "  GraphQL: OK" -ForegroundColor Green

# Web session auth
Import-Module (Join-Path $PSScriptRoot "lib\SSI-TestHelpers.psm1") -Force
$session = Connect-SSIWeb -Email $apiConfig.email -Password $apiConfig.password
Write-Host "  Web session: OK" -ForegroundColor Green

# ============================================================
# Step 2: Find a Cup and its matches
# ============================================================
Write-Host "`n=== Step 2: Find a Cup ===" -ForegroundColor Cyan

if (-not $CupId) {
    # Search for Kupittaa cups via GraphQL (same query pattern as scoring-proxy)
    $searchQuery = @{
        query     = 'query SearchCups($s: String!) { events(search: $s) { id name starts status get_content_type_key } }'
        variables = @{ s = "Kupittaa CUP" }
    }
    $searchResult = Invoke-RestMethod -Uri "$BaseUri/graphql/" -Method POST -Headers $gqlHeaders `
        -Body ($searchQuery | ConvertTo-Json -Depth 5) -ContentType "application/json"

    $allEvents = $searchResult.data.events
    Write-Host "  Total events found: $($allEvents.Count)" -ForegroundColor Gray
    $cups = @($allEvents | Where-Object { $_.get_content_type_key -eq 136 })

    if ($cups.Count -eq 0) {
        Write-Host "  No cups (CT=136) found. All events:" -ForegroundColor Yellow
        foreach ($ev in $allEvents) {
            Write-Host "    $($ev.id) — $($ev.name) (CT=$($ev.get_content_type_key))" -ForegroundColor Gray
        }
    }

    foreach ($cup in $cups) {
        Write-Host "  Cup: $($cup.id) — $($cup.name) ($($cup.starts))" -ForegroundColor White
    }

    # Pick the cup closest to today
    if ($cups.Count -gt 0) {
        $now = Get-Date
        $sorted = $cups | Sort-Object { [Math]::Abs(([DateTime]$_.starts - $now).TotalSeconds) }
        $CupId = $sorted[0].id
        Write-Host "  Using closest cup: $CupId — $($sorted[0].name)" -ForegroundColor Green
    }
    else {
        Write-Host "  No cups found. Please provide -CupId manually." -ForegroundColor Red
        return
    }
}

# Get cup details with matches via GraphQL
$cupGql = @'
query CupDetail($cid: String!) {
  event(content_type: 136, id: $cid) {
    id name starts status
    ... on NordicSerieNode {
      component_matches {
        number included
        match {
          id name starts status
          squads {
            id number comment
            ... on NordicSquadNode {
              max_competitors
              competitors { id first_name last_name status }
            }
          }
        }
      }
    }
  }
}
'@
$cupQuery = @{
    query     = $cupGql
    variables = @{ cid = $CupId }
}
$cupResult = Invoke-RestMethod -Uri "$BaseUri/graphql/" -Method POST -Headers $gqlHeaders `
    -Body ($cupQuery | ConvertTo-Json -Depth 5) -ContentType "application/json"

$cupData = $cupResult.data.event
Write-Host "  Cup: $($cupData.name)" -ForegroundColor White

$cupMatches = ($cupData.component_matches | Where-Object { $_.included -and $_.match }) |
    ForEach-Object { $_.match }
Write-Host "  Matches: $($cupMatches.Count)" -ForegroundColor White
foreach ($m in $cupMatches) {
    $squadInfo = ($m.squads | ForEach-Object {
        $current = ($_.competitors | Where-Object { $_.status -eq "a" }).Count
        "$($_.comment): $current/$($_.max_competitors)"
    }) -join ", "
    Write-Host "    $($m.id) — $($m.name) [$squadInfo]" -ForegroundColor Gray
}

$matchId = $cupMatches[0].id
Write-Host "  Using match: $matchId" -ForegroundColor Green

# ============================================================
# Step 3: Discover registration/enrollment pages (Cup level)
# ============================================================
Write-Host "`n=== Step 3: Cup Admin Pages ===" -ForegroundColor Cyan

$cupUrls = @(
    @{ url = "$BaseUri/event/136/$CupId/"; label = "Cup event page" }
    @{ url = "$BaseUri/event/136/$CupId/admin/"; label = "Cup admin" }
    @{ url = "$BaseUri/event/136/$CupId/register/"; label = "Cup register" }
    @{ url = "$BaseUri/event/136/$CupId/competitors/"; label = "Cup competitors" }
    @{ url = "$BaseUri/event/136/$CupId/add-competitor/"; label = "Cup add competitor" }
    @{ url = "$BaseUri/event/136/$CupId/invite/"; label = "Cup invite" }
    @{ url = "$BaseUri/nordic/serie/$CupId/"; label = "Nordic serie page" }
    @{ url = "$BaseUri/nordic/serie/$CupId/admin/"; label = "Nordic serie admin" }
    @{ url = "$BaseUri/nordic/serie/$CupId/register/"; label = "Nordic serie register" }
    @{ url = "$BaseUri/nordic/serie/$CupId/competitors/"; label = "Nordic serie competitors" }
    @{ url = "$BaseUri/nordic/serie/$CupId/add-competitor/"; label = "Nordic serie add-competitor" }
    @{ url = "$BaseUri/series/nordic/$CupId/"; label = "Series nordic page" }
    @{ url = "$BaseUri/series/nordic/resul-cup/$CupId/"; label = "Series nordic resul-cup" }
)

foreach ($entry in $cupUrls) {
    try {
        $resp = Invoke-WebRequest -Uri $entry.url -WebSession $session -UseBasicParsing -ErrorAction Stop
        $hasForm = $resp.Content -match '<form'
        $hasCompetitor = $resp.Content -match 'competitor|ampuja|shooter'
        $hasRegister = $resp.Content -match 'register|enroll|ilmoittaudu'
        $hasSquad = $resp.Content -match 'squad'
        $hasEmail = $resp.Content -match 'email'

        $indicators = @()
        if ($hasForm) { $indicators += "FORM" }
        if ($hasCompetitor) { $indicators += "COMPETITOR" }
        if ($hasRegister) { $indicators += "REGISTER" }
        if ($hasSquad) { $indicators += "SQUAD" }
        if ($hasEmail) { $indicators += "EMAIL" }

        $indStr = if ($indicators.Count -gt 0) { " [" + ($indicators -join ", ") + "]" } else { "" }
        Write-Host "  200: $($entry.label)$indStr" -ForegroundColor Green

        if ($hasForm -or $hasCompetitor -or $hasRegister) {
            $safeName = ($entry.label -replace '[^a-zA-Z0-9]', '_').ToLower()
            $debugFile = Join-Path $PSScriptRoot "debug-$safeName.html"
            $resp.Content | Out-File $debugFile -Encoding UTF8
            Write-Host "       Saved: debug-$safeName.html" -ForegroundColor DarkGray
        }
    }
    catch {
        $status = if ($_.Exception.Response) { $_.Exception.Response.StatusCode } else { "ERROR" }
        if ($status -eq 302 -or $status -eq "Found") {
            $location = $_.Exception.Response.Headers.Location
            Write-Host "  302: $($entry.label) → $location" -ForegroundColor Yellow
        }
        elseif ($status -eq 404 -or $status -eq "NotFound") {
            Write-Host "  404: $($entry.label)" -ForegroundColor DarkGray
        }
        else {
            Write-Host "  $status`: $($entry.label)" -ForegroundColor Red
        }
    }
}

# Also scrape the cup page for all links
Write-Host "`n  --- Links on cup page ---" -ForegroundColor Yellow
try {
    $cupPage = Invoke-WebRequest -Uri "$BaseUri/event/136/$CupId/" -WebSession $session -UseBasicParsing
    $links = [regex]::Matches($cupPage.Content, 'href="([^"]*)"') |
        ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
    $relevant = $links | Where-Object {
        $_ -match "register" -or $_ -match "competitor" -or $_ -match "squad" -or
        $_ -match "admin" -or $_ -match "invite" -or $_ -match "add" -or $_ -match $CupId
    }
    foreach ($link in $relevant) {
        Write-Host "    $link" -ForegroundColor White
    }
    if (-not $relevant) {
        Write-Host "    (no relevant links found, showing all)" -ForegroundColor Gray
        foreach ($link in $links) {
            Write-Host "    $link" -ForegroundColor DarkGray
        }
    }
}
catch {
    Write-Host "    Failed: $_" -ForegroundColor Red
}

# ============================================================
# Step 4: Discover match admin pages (squad assignment)
# ============================================================
Write-Host "`n=== Step 4: Match Admin Pages ===" -ForegroundColor Cyan

$matchUrls = @(
    @{ url = "$BaseUri/event/93/$matchId/"; label = "Match event page (CT=93)" }
    @{ url = "$BaseUri/event/91/$matchId/"; label = "Match event page (CT=91)" }
    @{ url = "$BaseUri/event/93/$matchId/admin/"; label = "Match admin" }
    @{ url = "$BaseUri/event/93/$matchId/competitors/"; label = "Match competitors" }
    @{ url = "$BaseUri/event/93/$matchId/add-competitor/"; label = "Match add-competitor" }
    @{ url = "$BaseUri/event/93/$matchId/squads/"; label = "Match squads" }
    @{ url = "$BaseUri/nordic/match/$matchId/"; label = "Nordic match page" }
    @{ url = "$BaseUri/nordic/match/$matchId/admin/"; label = "Nordic match admin" }
    @{ url = "$BaseUri/nordic/match/$matchId/competitors/"; label = "Nordic match competitors" }
    @{ url = "$BaseUri/nordic/match/$matchId/add-competitor/"; label = "Nordic match add-competitor" }
    @{ url = "$BaseUri/nordic/match/$matchId/add-squads/"; label = "Nordic match add-squads" }
    @{ url = "$BaseUri/nordic/match/$matchId/squads/"; label = "Nordic match squads" }
    @{ url = "$BaseUri/nordic/match/$matchId/manage-squads/"; label = "Nordic match manage-squads" }
)

foreach ($entry in $matchUrls) {
    try {
        $resp = Invoke-WebRequest -Uri $entry.url -WebSession $session -UseBasicParsing -ErrorAction Stop
        $hasForm = $resp.Content -match '<form'
        $hasCompetitor = $resp.Content -match 'competitor|ampuja|shooter'
        $hasSquad = $resp.Content -match 'squad'
        $hasEmail = $resp.Content -match 'email'
        $hasDragDrop = $resp.Content -match 'drag|drop|sortable'

        $indicators = @()
        if ($hasForm) { $indicators += "FORM" }
        if ($hasCompetitor) { $indicators += "COMPETITOR" }
        if ($hasSquad) { $indicators += "SQUAD" }
        if ($hasEmail) { $indicators += "EMAIL" }
        if ($hasDragDrop) { $indicators += "DRAG-DROP" }

        $indStr = if ($indicators.Count -gt 0) { " [" + ($indicators -join ", ") + "]" } else { "" }
        Write-Host "  200: $($entry.label)$indStr" -ForegroundColor Green

        if ($hasForm -or $hasSquad -or $hasCompetitor) {
            $safeName = ($entry.label -replace '[^a-zA-Z0-9]', '_').ToLower()
            $debugFile = Join-Path $PSScriptRoot "debug-$safeName.html"
            $resp.Content | Out-File $debugFile -Encoding UTF8
            Write-Host "       Saved: debug-$safeName.html" -ForegroundColor DarkGray
        }
    }
    catch {
        $status = if ($_.Exception.Response) { $_.Exception.Response.StatusCode } else { "ERROR" }
        if ($status -eq 302 -or $status -eq "Found") {
            $location = $_.Exception.Response.Headers.Location
            Write-Host "  302: $($entry.label) → $location" -ForegroundColor Yellow
        }
        elseif ($status -eq 404 -or $status -eq "NotFound") {
            Write-Host "  404: $($entry.label)" -ForegroundColor DarkGray
        }
        else {
            Write-Host "  $status`: $($entry.label)" -ForegroundColor Red
        }
    }
}

# ============================================================
# Step 5: Discover user search / lookup by email
# ============================================================
Write-Host "`n=== Step 5: User Lookup ===" -ForegroundColor Cyan

# Try GraphQL user search
$userSearchQuery = @{
    query = "query { me { id email first_name last_name } }"
}
$meResult = Invoke-RestMethod -Uri "$BaseUri/graphql/" -Method POST -Headers $gqlHeaders `
    -Body ($userSearchQuery | ConvertTo-Json) -ContentType "application/json"
Write-Host "  me query: $($meResult.data.me.email) (id=$($meResult.data.me.id))" -ForegroundColor Green

# Try web admin pages for user search
$userUrls = @(
    @{ url = "$BaseUri/admin/"; label = "Django admin" }
    @{ url = "$BaseUri/admin/users/"; label = "Django admin users" }
    @{ url = "$BaseUri/api/users/"; label = "API users" }
    @{ url = "$BaseUri/users/search/"; label = "User search" }
    @{ url = "$BaseUri/dashboard/"; label = "Dashboard" }
    @{ url = "$BaseUri/settings/"; label = "Settings" }
    @{ url = "$BaseUri/groups/"; label = "Groups" }
    @{ url = "$BaseUri/groups/25874/"; label = "Group 25874 (TurRes)" }
    @{ url = "$BaseUri/groups/25874/members/"; label = "Group members" }
)

foreach ($entry in $userUrls) {
    try {
        $resp = Invoke-WebRequest -Uri $entry.url -WebSession $session -UseBasicParsing -ErrorAction Stop
        $hasSearch = $resp.Content -match 'search|find|lookup'
        $hasEmail = $resp.Content -match 'email'
        $hasUser = $resp.Content -match 'user|member|jäsen'

        $indicators = @()
        if ($hasSearch) { $indicators += "SEARCH" }
        if ($hasEmail) { $indicators += "EMAIL" }
        if ($hasUser) { $indicators += "USER" }

        $indStr = if ($indicators.Count -gt 0) { " [" + ($indicators -join ", ") + "]" } else { "" }
        Write-Host "  200: $($entry.label)$indStr" -ForegroundColor Green

        if ($hasSearch -or $hasEmail -or $hasUser) {
            $safeName = ($entry.label -replace '[^a-zA-Z0-9]', '_').ToLower()
            $debugFile = Join-Path $PSScriptRoot "debug-$safeName.html"
            $resp.Content | Out-File $debugFile -Encoding UTF8
            Write-Host "       Saved: debug-$safeName.html" -ForegroundColor DarkGray
        }
    }
    catch {
        $status = if ($_.Exception.Response) { $_.Exception.Response.StatusCode } else { "ERROR" }
        if ($status -eq 302 -or $status -eq "Found") {
            Write-Host "  302: $($entry.label)" -ForegroundColor Yellow
        }
        elseif ($status -eq 404 -or $status -eq "NotFound") {
            Write-Host "  404: $($entry.label)" -ForegroundColor DarkGray
        }
        else {
            Write-Host "  $status`: $($entry.label)" -ForegroundColor Red
        }
    }
}

# ============================================================
# Summary
# ============================================================
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Cup ID: $CupId" -ForegroundColor White
Write-Host "Match ID: $matchId" -ForegroundColor White
Write-Host "Debug files saved in: $PSScriptRoot" -ForegroundColor White
Write-Host "`nReview debug-*.html files to identify:" -ForegroundColor Yellow
Write-Host "  1. How to add a competitor to a Cup (look for add-competitor forms)" -ForegroundColor White
Write-Host "  2. How to assign a competitor to a squad (look for squad management forms)" -ForegroundColor White
Write-Host "  3. How to look up a user by email (look for search/lookup forms)" -ForegroundColor White
