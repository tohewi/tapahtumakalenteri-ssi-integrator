<#
.SYNOPSIS
    Validates data integrity between SSI events and WordPress Tapahtumakalenteri.

.DESCRIPTION
    Performs cross-reference checks between SSI (Shoot'n'ScoreIt) and WordPress calendar:
    1. Lists all Cups owned by SSI login and verifies each has a WordPress event
    2. Validates date list file against both systems
    3. Verifies cross-references (permalink contains Cup ID, content links to SSI)

.PARAMETER EventType
    The type of event to check (e.g., "KupittaaCup"). Used to filter SSI events.

.PARAMETER ConfigPath
    Path to the configuration file containing SSI and WordPress settings.

.PARAMETER DateListFile
    Path to the date list file to validate against both systems.

.PARAMETER SsiUsername
    SSI account username/email.

.PARAMETER SsiPassword
    SSI account password.

.PARAMETER WpUsername
    WordPress username.

.PARAMETER WpPassword
    WordPress password.

.PARAMETER SsiSession
    Pre-authenticated SSI session (alternative to username/password).

.PARAMETER WpSession
    Pre-authenticated WordPress session (alternative to username/password).

.EXAMPLE
    .\Test-EventIntegrity.ps1 -EventType "KupittaaCup" `
        -ConfigPath "config\kupittaa-cup-config.yml" `
        -DateListFile "config\kupittaa-cup-dates.txt" `
        -SsiUsername "user@example.com" -SsiPassword "password" `
        -WpUsername "wpuser" -WpPassword "wppassword"
#>

[CmdletBinding(DefaultParameterSetName = "Credentials")]
param(
    [Parameter(Mandatory = $true)]
    [string]$EventType,

    [Parameter(Mandatory = $false)]
    [string]$ConfigPath = "config\kupittaa-cup-config.yml",

    [Parameter(Mandatory = $false)]
    [string]$DateListFile,

    [Parameter(ParameterSetName = "Credentials", Mandatory = $true)]
    [string]$SsiUsername,

    [Parameter(ParameterSetName = "Credentials", Mandatory = $true)]
    [string]$SsiPassword,

    [Parameter(ParameterSetName = "Credentials", Mandatory = $true)]
    [string]$WpUsername,

    [Parameter(ParameterSetName = "Credentials", Mandatory = $true)]
    [string]$WpPassword,

    [Parameter(ParameterSetName = "PreAuth", Mandatory = $true)]
    [Microsoft.PowerShell.Commands.WebRequestSession]$SsiSession,

    [Parameter(ParameterSetName = "PreAuth", Mandatory = $true)]
    [Microsoft.PowerShell.Commands.WebRequestSession]$WpSession
)

# Import required module
if (-not (Get-Module -ListAvailable -Name powershell-yaml)) {
    Write-Error "powershell-yaml module is required. Install with: Install-Module powershell-yaml"
    exit 1
}
Import-Module powershell-yaml

# Load configuration
$configFullPath = Join-Path -Path $PSScriptRoot -ChildPath "..\$ConfigPath"
if (-not (Test-Path $configFullPath)) {
    $configFullPath = $ConfigPath
}
if (-not (Test-Path $configFullPath)) {
    Write-Error "Configuration file not found: $ConfigPath"
    exit 1
}

$configContent = Get-Content -Path $configFullPath -Raw
$config = ConvertFrom-Yaml $configContent

# Extract settings
$ssiBaseUri = "https://shootnscoreit.com"
$wpBaseUri = $config.tapahtumakalenteri.baseUri
$groupId = $config.management.groupId

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "    DATA INTEGRITY CHECK" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Event Type: $EventType" -ForegroundColor Gray
Write-Host "SSI Base: $ssiBaseUri" -ForegroundColor Gray
Write-Host "WordPress Base: $wpBaseUri" -ForegroundColor Gray

# ============================================
# AUTHENTICATION
# ============================================

Write-Host "`n--- Authentication ---" -ForegroundColor Yellow

# SSI Authentication
if ($PSCmdlet.ParameterSetName -eq "PreAuth") {
    $ssiSessionActive = $SsiSession
    Write-Host "Using pre-authenticated SSI session" -ForegroundColor Gray
}
else {
    $connectSsiScript = Join-Path -Path $PSScriptRoot -ChildPath "Connect-SSI.ps1"
    $ssiSessionActive = & $connectSsiScript -Username $SsiUsername -Password $SsiPassword
    if (-not $ssiSessionActive) {
        Write-Error "SSI authentication failed"
        exit 1
    }
}
Write-Host "SSI: OK" -ForegroundColor Green

# WordPress Authentication
if ($PSCmdlet.ParameterSetName -eq "PreAuth") {
    $wpSessionActive = $WpSession
    Write-Host "Using pre-authenticated WordPress session" -ForegroundColor Gray
}
else {
    $connectWpScript = Join-Path -Path $PSScriptRoot -ChildPath "Connect-WordPress.ps1"
    $wpSessionActive = & $connectWpScript -Username $WpUsername -Password $WpPassword
    if (-not $wpSessionActive) {
        Write-Error "WordPress authentication failed"
        exit 1
    }
}
Write-Host "WordPress: OK" -ForegroundColor Green

# ============================================
# STEP 1: GET ALL SSI CUPS
# ============================================

Write-Host "`n--- Step 1: Fetching SSI Cups ---" -ForegroundColor Yellow

$ssiCups = @()

# Fetch events managed by the group
$eventsUrl = "$ssiBaseUri/group/$groupId/events/"
try {
    $eventsPage = Invoke-WebRequest -Uri $eventsUrl -WebSession $ssiSessionActive -Method GET
    
    # Parse Cup events from the page
    # Pattern: /event/136/XXX/ where 136 is the RESUL CUP type
    $cupMatches = [regex]::Matches($eventsPage.Content, '/event/136/(\d+)/')
    $cupIds = $cupMatches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    
    foreach ($cupId in $cupIds) {
        # Get Cup details
        $cupUrl = "$ssiBaseUri/event/136/$cupId/"
        try {
            $cupPage = Invoke-WebRequest -Uri $cupUrl -WebSession $ssiSessionActive -Method GET
            
            # Extract Cup name from page title or h1
            $cupName = ""
            if ($cupPage.Content -match '<h1[^>]*>([^<]+)</h1>') {
                $cupName = $Matches[1].Trim()
            }
            elseif ($cupPage.Content -match '<title>([^<]+)</title>') {
                $cupName = $Matches[1].Trim()
            }
            
            # Extract date from Cup name (format: dd.mm.yyyy)
            $cupDate = ""
            if ($cupName -match '(\d{2}\.\d{2}\.\d{4})') {
                $cupDate = $Matches[1]
            }
            
            # Check if this matches our event type pattern
            if ($EventType -eq "KupittaaCup" -and $cupName -match "Kupittaa CUP") {
                $ssiCups += @{
                    Id = $cupId
                    Name = $cupName
                    Date = $cupDate
                    Url = $cupUrl
                }
                Write-Host "  Found: Cup $cupId - $cupName" -ForegroundColor Gray
            }
        }
        catch {
            Write-Host "  Warning: Could not fetch Cup $cupId" -ForegroundColor Yellow
        }
    }
    
    Write-Host "  Total SSI Cups found: $($ssiCups.Count)" -ForegroundColor Cyan
}
catch {
    Write-Error "Failed to fetch SSI events: $_"
    exit 1
}

# ============================================
# STEP 2: GET ALL WORDPRESS CALENDAR EVENTS
# ============================================

Write-Host "`n--- Step 2: Fetching WordPress Events ---" -ForegroundColor Yellow

$wpEvents = @()

# Search for events in WordPress admin
$searchUrl = "$wpBaseUri/wp-admin/edit.php?post_type=event&posts_per_page=100"
try {
    $eventsListPage = Invoke-WebRequest -Uri $searchUrl -WebSession $wpSessionActive -Method GET
    
    # Parse event post IDs and titles
    # Pattern: post.php?post=XXXX&action=edit
    $postMatches = [regex]::Matches($eventsListPage.Content, 'post\.php\?post=(\d+)&amp;action=edit[^"]*"[^>]*>([^<]+)</a>')
    
    foreach ($match in $postMatches) {
        $postId = $match.Groups[1].Value
        $postTitle = [System.Web.HttpUtility]::HtmlDecode($match.Groups[2].Value.Trim())
        
        # Check if this is a Kupittaa event
        if ($EventType -eq "KupittaaCup" -and $postTitle -match "Kupittaan ampumavuoro") {
            # Get the post to check permalink and content
            $editUrl = "$wpBaseUri/wp-admin/post.php?post=$postId&action=edit"
            try {
                $editPage = Invoke-WebRequest -Uri $editUrl -WebSession $wpSessionActive -Method GET
                
                # Extract permalink
                $permalink = ""
                if ($editPage.Content -match 'id="sample-permalink"[^>]*>.*?<a[^>]*href="([^"]+)"') {
                    $permalink = $Matches[1]
                }
                elseif ($editPage.Content -match 'href="([^"]*cup\d+[^"]*)"') {
                    $permalink = $Matches[1]
                }
                
                # Extract Cup ID from permalink (pattern: cupXXX)
                $linkedCupId = ""
                if ($permalink -match 'cup(\d+)') {
                    $linkedCupId = $Matches[1]
                }
                
                # Extract SSI link from content
                $ssiLinkInContent = ""
                if ($editPage.Content -match 'shootnscoreit\.com/event/136/(\d+)') {
                    $ssiLinkInContent = $Matches[1]
                }
                
                # Extract date from title
                $eventDate = ""
                if ($postTitle -match '(\d{2}\.\d{2}\.\d{4})') {
                    $eventDate = $Matches[1]
                }
                
                $wpEvents += @{
                    PostId = $postId
                    Title = $postTitle
                    Date = $eventDate
                    Permalink = $permalink
                    LinkedCupId = $linkedCupId
                    SsiLinkInContent = $ssiLinkInContent
                    EditUrl = $editUrl
                }
                Write-Host "  Found: Post $postId - $postTitle (Cup: $linkedCupId)" -ForegroundColor Gray
            }
            catch {
                Write-Host "  Warning: Could not fetch Post $postId details" -ForegroundColor Yellow
            }
        }
    }
    
    Write-Host "  Total WordPress Events found: $($wpEvents.Count)" -ForegroundColor Cyan
}
catch {
    Write-Error "Failed to fetch WordPress events: $_"
    exit 1
}

# ============================================
# STEP 3: CROSS-REFERENCE VALIDATION
# ============================================

Write-Host "`n--- Step 3: Cross-Reference Validation ---" -ForegroundColor Yellow

$issues = @()

# Check each SSI Cup has a WordPress event
Write-Host "`n  Checking SSI Cups -> WordPress Events:" -ForegroundColor Cyan
foreach ($cup in $ssiCups) {
    $matchingWpEvent = $wpEvents | Where-Object { $_.LinkedCupId -eq $cup.Id }
    
    if (-not $matchingWpEvent) {
        $issues += @{
            Type = "MissingWpEvent"
            Message = "SSI Cup $($cup.Id) ($($cup.Name)) has no WordPress event"
            SsiCupId = $cup.Id
            Date = $cup.Date
        }
        Write-Host "    ❌ Cup $($cup.Id) ($($cup.Date)): No WordPress event found" -ForegroundColor Red
    }
    else {
        # Verify the WordPress event links back to SSI
        if ($matchingWpEvent.SsiLinkInContent -ne $cup.Id) {
            $issues += @{
                Type = "BrokenLink"
                Message = "WordPress event $($matchingWpEvent.PostId) does not link to SSI Cup $($cup.Id)"
                WpPostId = $matchingWpEvent.PostId
                SsiCupId = $cup.Id
            }
            Write-Host "    ⚠️ Cup $($cup.Id) ($($cup.Date)): WordPress event exists but link mismatch" -ForegroundColor Yellow
        }
        else {
            Write-Host "    ✅ Cup $($cup.Id) ($($cup.Date)): OK - WP Post $($matchingWpEvent.PostId)" -ForegroundColor Green
        }
    }
}

# Check each WordPress event has an SSI Cup
Write-Host "`n  Checking WordPress Events -> SSI Cups:" -ForegroundColor Cyan
foreach ($wpEvent in $wpEvents) {
    if ($wpEvent.LinkedCupId) {
        $matchingSsiCup = $ssiCups | Where-Object { $_.Id -eq $wpEvent.LinkedCupId }
        
        if (-not $matchingSsiCup) {
            $issues += @{
                Type = "OrphanWpEvent"
                Message = "WordPress event $($wpEvent.PostId) references non-existent SSI Cup $($wpEvent.LinkedCupId)"
                WpPostId = $wpEvent.PostId
                LinkedCupId = $wpEvent.LinkedCupId
            }
            Write-Host "    ❌ Post $($wpEvent.PostId) ($($wpEvent.Date)): References non-existent Cup $($wpEvent.LinkedCupId)" -ForegroundColor Red
        }
        else {
            Write-Host "    ✅ Post $($wpEvent.PostId) ($($wpEvent.Date)): OK - Cup $($wpEvent.LinkedCupId)" -ForegroundColor Green
        }
    }
    else {
        $issues += @{
            Type = "MissingCupLink"
            Message = "WordPress event $($wpEvent.PostId) has no Cup ID in permalink"
            WpPostId = $wpEvent.PostId
            Date = $wpEvent.Date
        }
        Write-Host "    ⚠️ Post $($wpEvent.PostId) ($($wpEvent.Date)): No Cup ID in permalink" -ForegroundColor Yellow
    }
}

# ============================================
# STEP 4: DATE LIST VALIDATION (if provided)
# ============================================

if ($DateListFile) {
    Write-Host "`n--- Step 4: Date List Validation ---" -ForegroundColor Yellow
    
    $dateListPath = Join-Path -Path $PSScriptRoot -ChildPath "..\$DateListFile"
    if (-not (Test-Path $dateListPath)) {
        $dateListPath = $DateListFile
    }
    
    if (Test-Path $dateListPath) {
        $dateLines = Get-Content -Path $dateListPath
        $expectedDates = @()
        
        foreach ($line in $dateLines) {
            $line = $line.Trim()
            # Skip comments and empty lines
            if ($line -eq "" -or $line.StartsWith("#")) { continue }
            
            # Remove skip marker for comparison
            $dateStr = $line.TrimStart("!")
            
            # Parse date (format: d.M.yyyy)
            try {
                $parsedDate = [datetime]::ParseExact($dateStr, "d.M.yyyy", [System.Globalization.CultureInfo]::InvariantCulture)
                $formattedDate = $parsedDate.ToString("dd.MM.yyyy")
                $expectedDates += $formattedDate
            }
            catch {
                Write-Host "  Warning: Could not parse date: $dateStr" -ForegroundColor Yellow
            }
        }
        
        Write-Host "  Expected dates from file: $($expectedDates.Count)" -ForegroundColor Cyan
        
        # Check each expected date has both SSI Cup and WordPress event
        foreach ($expectedDate in $expectedDates) {
            $ssiCup = $ssiCups | Where-Object { $_.Date -eq $expectedDate }
            $wpEvent = $wpEvents | Where-Object { $_.Date -eq $expectedDate }
            
            $ssiStatus = if ($ssiCup) { "✅" } else { "❌" }
            $wpStatus = if ($wpEvent) { "✅" } else { "❌" }
            
            if (-not $ssiCup) {
                $issues += @{
                    Type = "MissingSsiCup"
                    Message = "Date $expectedDate has no SSI Cup"
                    Date = $expectedDate
                }
            }
            if (-not $wpEvent) {
                $issues += @{
                    Type = "MissingWpEventForDate"
                    Message = "Date $expectedDate has no WordPress event"
                    Date = $expectedDate
                }
            }
            
            $statusColor = if ($ssiCup -and $wpEvent) { "Green" } elseif ($ssiCup -or $wpEvent) { "Yellow" } else { "Red" }
            Write-Host "    $expectedDate : SSI $ssiStatus | WP $wpStatus" -ForegroundColor $statusColor
        }
    }
    else {
        Write-Host "  Date list file not found: $DateListFile" -ForegroundColor Yellow
    }
}

# ============================================
# SUMMARY
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "    INTEGRITY CHECK SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nStatistics:" -ForegroundColor White
Write-Host "  SSI Cups found: $($ssiCups.Count)" -ForegroundColor Gray
Write-Host "  WordPress Events found: $($wpEvents.Count)" -ForegroundColor Gray
Write-Host "  Issues found: $($issues.Count)" -ForegroundColor $(if ($issues.Count -eq 0) { "Green" } else { "Red" })

if ($issues.Count -gt 0) {
    Write-Host "`nIssues:" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "  - [$($issue.Type)] $($issue.Message)" -ForegroundColor Yellow
    }
    
    Write-Host "`nIntegrity check: FAILED" -ForegroundColor Red
    exit 1
}
else {
    Write-Host "`nIntegrity check: PASSED" -ForegroundColor Green
    exit 0
}
