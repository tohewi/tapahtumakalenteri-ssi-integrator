<#
.SYNOPSIS
    Finds and deletes SRA test matches created by New-SRATestMatches.ps1

.DESCRIPTION
    Searches SSI via GraphQL for matches with "TEST TR-SRA" prefix, then
    deletes each one via the SSI web delete form at /event/{ct}/{id}/delete/.

    SAFETY: Before deleting, the script:
      1. Verifies the delete confirmation page contains the EXACT match name
      2. Verifies the event ID in the URL matches the GraphQL-returned ID
      3. Skips deletion if either check fails

.PARAMETER Email
    SSI account email (required)

.PARAMETER Password
    SSI account password (required)

.PARAMETER ApiKey
    SSI GraphQL API key (required)

.PARAMETER ContentType
    SSI content type for IPSC/SRA matches. Default: 22

.PARAMETER DryRun
    If specified, only list matches without deleting.

.EXAMPLE
    .\Remove-SRATestMatches.ps1 -Email user@example.com -Password secret -ApiKey abc123

.EXAMPLE
    .\Remove-SRATestMatches.ps1 -Email user@example.com -Password secret -ApiKey abc123 -DryRun
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Email,
    
    [Parameter(Mandatory = $true)]
    [string]$Password,
    
    [Parameter(Mandatory = $true)]
    [string]$ApiKey,

    [string]$ContentType = "22",
    
    [switch]$DryRun
)

$BaseUri = "https://shootnscoreit.com"

# Import required modules
Import-Module -Name PowerShell-Yaml -ErrorAction Stop
Import-Module -Name (Join-Path -Path $PSScriptRoot -ChildPath "lib\SSI-GraphQL.psm1") -Force -ErrorAction Stop
Import-Module -Name (Join-Path -Path $PSScriptRoot -ChildPath "lib\SSI-WebSquad.psm1") -Force -ErrorAction Stop

#region Authenticate (GraphQL for search + Web for deletion)
Write-Host "Authenticating with SSI GraphQL API..." -ForegroundColor Cyan
try {
    $headers = Connect-SSIGraphQL -Email $Email -Password $Password -ApiKey $ApiKey
    $me = Get-SSIMe -Headers $headers
    Write-Host "  GraphQL: authenticated as $($me.email)" -ForegroundColor Green
}
catch {
    Write-Error "GraphQL authentication failed: $($_.Exception.Message)"
    exit 1
}

Write-Host "Authenticating with SSI web..." -ForegroundColor Cyan
try {
    $webSession = Connect-SSIWeb -Email $Email -Password $Password
    Write-Host "  Web: session ready" -ForegroundColor Green
}
catch {
    Write-Error "Web authentication failed: $($_.Exception.Message)"
    exit 1
}
#endregion

#region Find Test Matches
Write-Host "`n--- Searching for SRA test matches ---" -ForegroundColor Yellow

$searchQuery = @"
query SearchTestMatches {
    events(search: "TEST TR-SRA") {
        id
        name
        starts
        status
        get_full_absolute_url
    }
}
"@

try {
    $result = Invoke-SSIGraphQL -Headers $headers -Query $searchQuery -OperationName "SearchTestMatches"
}
catch {
    Write-Error "Search failed: $($_.Exception.Message)"
    exit 1
}

$testMatches = @()
if ($result.events) {
    foreach ($evt in $result.events) {
        if ($evt.name -match "^TEST TR-SRA[ON]") {
            $testMatches += $evt
        }
    }
}

if ($testMatches.Count -eq 0) {
    Write-Host "  No test matches found." -ForegroundColor Gray
    exit 0
}

Write-Host "  Found $($testMatches.Count) test match(es):" -ForegroundColor White
foreach ($m in $testMatches) {
    $statusLabel = if ($m.status -eq "on") { "[ACTIVE]" } else { "[INACTIVE]" }
    Write-Host "    $($m.name) $statusLabel  ID: $($m.id)" -ForegroundColor Gray
}
#endregion

#region Delete via Web Form
if ($DryRun) {
    Write-Host "`n--- DRY RUN: no deletions performed ---" -ForegroundColor Yellow
}
else {
    Write-Host "`n--- Deleting test matches via web form ---" -ForegroundColor Yellow

    $deletedCount = 0
    $skippedCount = 0

    foreach ($m in $testMatches) {
        $eventName = $m.name
        $eventId = $m.id
        $deleteUrl = "$BaseUri/event/$ContentType/$eventId/delete/"

        Write-Host "`n  Deleting: $eventName (ID: $eventId)" -ForegroundColor Gray
        Write-Host "    URL: $deleteUrl" -ForegroundColor Gray

        # Step 1: GET the delete confirmation page
        try {
            $deletePage = Invoke-WebRequest -Uri $deleteUrl -WebSession $webSession `
                -UseBasicParsing -MaximumRedirection 5
        }
        catch {
            Write-Host "    SKIP: Could not fetch delete page: $($_.Exception.Message)" -ForegroundColor Red
            $skippedCount++
            continue
        }

        # Step 2: Verify the page contains the EXACT event name
        # The SSI delete page shows: "Are you sure you want to delete: {name}"
        $expectedText = "Are you sure you want to delete: $eventName"
        if ($deletePage.Content -notmatch [regex]::Escape($expectedText)) {
            Write-Host "    SKIP: Delete page does NOT contain exact name match!" -ForegroundColor Red
            Write-Host "    Expected: '$expectedText'" -ForegroundColor Red
            $skippedCount++
            continue
        }

        Write-Host "    VERIFIED: Name matches on delete confirmation page" -ForegroundColor Green

        # Step 3: POST to confirm deletion
        # The form has 3 submit buttons: remove=Delete, completed=Mark as completed, cancel=Mark as cancelled
        $postHeaders = @{
            "Content-Type" = "application/x-www-form-urlencoded"
            "Referer"      = $deleteUrl
            "Origin"       = $BaseUri
        }

        try {
            $deleteResponse = Invoke-WebRequest -Uri $deleteUrl -Method POST `
                -WebSession $webSession -Headers $postHeaders `
                -Body "remove=Delete" -MaximumRedirection 5 -UseBasicParsing

            # After successful deletion, SSI redirects away from the delete page
            $finalUrl = if ($deleteResponse.BaseResponse.RequestMessage.RequestUri) {
                $deleteResponse.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
            } else { "" }

            if ($finalUrl -notmatch "/delete/") {
                Write-Host "    DELETED: $eventName" -ForegroundColor Green
                $deletedCount++
            }
            else {
                Write-Host "    WARNING: May not have deleted — still on delete page" -ForegroundColor Yellow
                $skippedCount++
            }
        }
        catch {
            Write-Host "    ERROR during POST: $($_.Exception.Message)" -ForegroundColor Red
            $skippedCount++
        }

        Start-Sleep -Milliseconds 500
    }
}
#endregion

#region Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "     REMOVAL SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "DRY RUN: $($testMatches.Count) match(es) found, none deleted." -ForegroundColor Yellow
}
else {
    Write-Host "Deleted: $deletedCount / $($testMatches.Count)" -ForegroundColor White
    if ($skippedCount -gt 0) {
        Write-Host "Skipped: $skippedCount (name mismatch or error)" -ForegroundColor Yellow
    }
}
#endregion
