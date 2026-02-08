<#
.SYNOPSIS
    Creates multiple Kupittaa Cup events from a date list file.

.DESCRIPTION
    Processes a list of dates and creates SSI Cup + Tapahtumakalenteri events for each.
    Stops on first error. Skips dates marked with ! prefix (already created).
    Authenticates once at the beginning for both SSI and WordPress.

.PARAMETER DateListFile
    Path to a text file with dates (one per line, format: d.M.yyyy).
    Lines starting with # are comments.
    Lines starting with ! are skipped (already created).

.PARAMETER SsiUsername
    SSI username for authentication.

.PARAMETER SsiPassword
    SSI password for authentication.

.PARAMETER WpUsername
    WordPress username for authentication.

.PARAMETER WpPassword
    WordPress password for authentication.

.PARAMETER ConfigPath
    Path to the configuration file. Defaults to config/kupittaa-cup-config.yml.

.PARAMETER StartFromDate
    Optional. Start processing from this date (skip earlier dates).

.EXAMPLE
    .\New-KupittaaCupBatch.ps1 -DateListFile "config\kupittaa-cup-dates.txt" -SsiUsername "user" -SsiPassword "pass" -WpUsername "wpuser" -WpPassword "wppass"

.EXAMPLE
    .\New-KupittaaCupBatch.ps1 -DateListFile "config\kupittaa-cup-dates.txt" -SsiUsername "user" -SsiPassword "pass" -WpUsername "wpuser" -WpPassword "wppass" -StartFromDate "21.3.2026"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$DateListFile,

    [Parameter(Mandatory = $true)]
    [string]$SsiUsername,

    [Parameter(Mandatory = $true)]
    [string]$SsiPassword,

    [Parameter(Mandatory = $true)]
    [string]$WpUsername,

    [Parameter(Mandatory = $true)]
    [string]$WpPassword,

    [string]$ConfigPath = "config\kupittaa-cup-config.yml",

    [string]$StartFromDate
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "    KUPITTAA CUP BATCH CREATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Resolve paths
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot

if (-not [System.IO.Path]::IsPathRooted($DateListFile)) {
    $DateListFile = Join-Path $projectRoot $DateListFile
}
if (-not [System.IO.Path]::IsPathRooted($ConfigPath)) {
    $ConfigPath = Join-Path $projectRoot $ConfigPath
}

# Validate files exist
if (-not (Test-Path $DateListFile)) {
    Write-Error "Date list file not found: $DateListFile"
    return
}
if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config file not found: $ConfigPath"
    return
}

# Read and parse date list
Write-Host "`nReading date list from: $DateListFile" -ForegroundColor Gray
$dateLines = Get-Content $DateListFile

$datesToProcess = @()
$skippedDates = @()

foreach ($line in $dateLines) {
    $line = $line.Trim()
    
    # Skip empty lines and comments
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
        continue
    }
    
    # Check for skip marker (!)
    if ($line.StartsWith("!")) {
        $dateStr = $line.Substring(1).Trim()
        $skippedDates += $dateStr
        continue
    }
    
    $datesToProcess += $line
}

Write-Host "`nDates to process: $($datesToProcess.Count)" -ForegroundColor Yellow
Write-Host "Dates skipped (already created): $($skippedDates.Count)" -ForegroundColor Gray

if ($skippedDates.Count -gt 0) {
    foreach ($d in $skippedDates) {
        Write-Host "  ! $d (skipped)" -ForegroundColor DarkGray
    }
}

if ($datesToProcess.Count -eq 0) {
    Write-Host "`nNo dates to process. Exiting." -ForegroundColor Yellow
    return
}

# Apply StartFromDate filter if specified
if ($StartFromDate) {
    $startDate = [DateTime]::ParseExact($StartFromDate, "d.M.yyyy", [System.Globalization.CultureInfo]::InvariantCulture)
    $filteredDates = @()
    foreach ($dateStr in $datesToProcess) {
        $date = [DateTime]::ParseExact($dateStr, "d.M.yyyy", [System.Globalization.CultureInfo]::InvariantCulture)
        if ($date -ge $startDate) {
            $filteredDates += $dateStr
        }
        else {
            Write-Host "  Skipping $dateStr (before start date)" -ForegroundColor DarkGray
        }
    }
    $datesToProcess = $filteredDates
    Write-Host "`nDates after applying StartFromDate filter: $($datesToProcess.Count)" -ForegroundColor Yellow
}

Write-Host "`nDates to create:" -ForegroundColor Green
for ($i = 0; $i -lt $datesToProcess.Count; $i++) {
    Write-Host "  $($i + 1). $($datesToProcess[$i])" -ForegroundColor White
}

# Script paths
$connectSsiScript = Join-Path $scriptRoot "Connect-SSI.ps1"
$connectWpScript = Join-Path $scriptRoot "Connect-WordPress.ps1"
$newCupScript = Join-Path $scriptRoot "New-KupittaaCup.ps1"

# Authenticate once upfront
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "    AUTHENTICATION (ONE-TIME)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n--- SSI Authentication ---" -ForegroundColor Yellow
$ssiSession = & $connectSsiScript -Username $SsiUsername -Password $SsiPassword
if (-not $ssiSession) {
    Write-Error "Failed to authenticate to SSI"
    return
}

Write-Host "`n--- WordPress Authentication ---" -ForegroundColor Yellow
Write-Host "You will only need to enter OTP once for all events." -ForegroundColor Gray
$wpSession = & $connectWpScript -Username $WpUsername -Password $WpPassword
if (-not $wpSession) {
    Write-Error "Failed to authenticate to WordPress"
    return
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "    AUTHENTICATION COMPLETE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Process each date
$results = @()
$successCount = 0
$failCount = 0

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "    PROCESSING DATES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

for ($i = 0; $i -lt $datesToProcess.Count; $i++) {
    $dateStr = $datesToProcess[$i]
    $progress = "[$($i + 1)/$($datesToProcess.Count)]"
    
    Write-Host "`n$progress Processing: $dateStr" -ForegroundColor Cyan
    Write-Host ("-" * 50) -ForegroundColor Gray
    
    try {
        # Convert date from d.M.yyyy to dd-mm-yyyy format expected by New-KupittaaCup.ps1
        $parsedDate = [DateTime]::ParseExact($dateStr, "d.M.yyyy", [System.Globalization.CultureInfo]::InvariantCulture)
        $formattedDate = $parsedDate.ToString("dd-MM-yyyy")
        
        # Call New-KupittaaCup.ps1 with pre-authenticated sessions
        & $newCupScript `
            -Date $formattedDate `
            -ConfigPath $ConfigPath `
            -SsiSession $ssiSession `
            -WpSession $wpSession
        
        $successCount++
        $results += [PSCustomObject]@{
            Date = $dateStr
            Status = "SUCCESS"
            Error = $null
        }
        
        Write-Host "`n$progress $dateStr - SUCCESS" -ForegroundColor Green
    }
    catch {
        $failCount++
        $errorMsg = $_.Exception.Message
        $results += [PSCustomObject]@{
            Date = $dateStr
            Status = "FAILED"
            Error = $errorMsg
        }
        
        Write-Host "`n$progress $dateStr - FAILED: $errorMsg" -ForegroundColor Red
        Write-Host "`nStopping batch processing due to error." -ForegroundColor Red
        break
    }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "    BATCH CREATION SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nResults:" -ForegroundColor Yellow
foreach ($result in $results) {
    $statusColor = if ($result.Status -eq "SUCCESS") { "Green" } else { "Red" }
    Write-Host "  $($result.Date): $($result.Status)" -ForegroundColor $statusColor
    if ($result.Error) {
        Write-Host "    Error: $($result.Error)" -ForegroundColor DarkRed
    }
}

Write-Host "`nTotal: $($results.Count) processed" -ForegroundColor White
Write-Host "  Success: $successCount" -ForegroundColor Green
Write-Host "  Failed: $failCount" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Gray" })

$remainingCount = $datesToProcess.Count - $results.Count
if ($remainingCount -gt 0) {
    Write-Host "  Remaining (not processed): $remainingCount" -ForegroundColor Yellow
}

return $results
