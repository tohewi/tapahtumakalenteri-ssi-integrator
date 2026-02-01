<#
.SYNOPSIS
    Creates a Kupittaa RESUL CUP with three child matches (Tarkkuus, Pika, Kuvio) and squads

.DESCRIPTION
    This script creates a RESUL CUP event on shootnscoreit.com for a given date,
    then creates three child matches linked to that Cup, and creates squads for each match.
    Optionally creates a corresponding event in the Turun Reservilaiset WordPress calendar.
    Configuration is loaded from config/kupittaa-cup-config.yml

.PARAMETER Date
    Match date in dd-mm-yyyy format

.PARAMETER SessionId
    Browser session ID cookie value for authentication (legacy method)

.PARAMETER Username
    SSI account email/username for login

.PARAMETER Password
    SSI account password for login

.PARAMETER ConfigPath
    Path to the configuration file (default: config/kupittaa-cup-config.yml)

.PARAMETER TestMode
    If specified, adds "TEST" prefix to event names

.PARAMETER CreateCalendarEvent
    If specified, creates a corresponding event in the WordPress calendar (tapahtumakalenteri)

.PARAMETER WpUsername
    WordPress username for tapahtumakalenteri (required if -CreateCalendarEvent is used)

.PARAMETER WpPassword
    WordPress password for tapahtumakalenteri (required if -CreateCalendarEvent is used)

.EXAMPLE
    .\New-KupittaaCup.ps1 -Date "25-01-2026" -SessionId "your-session-id"

.EXAMPLE
    .\New-KupittaaCup.ps1 -Date "25-01-2026" -Username "user@example.com" -Password "pass"

.EXAMPLE
    .\New-KupittaaCup.ps1 -Date "25-01-2026" -SessionId "your-session-id" -TestMode

.EXAMPLE
    .\New-KupittaaCup.ps1 -Date "25-01-2026" -Username "user@example.com" -Password "pass" -CreateCalendarEvent -WpUsername "wpuser" -WpPassword "wppass"
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^\d{2}-\d{2}-\d{4}$")]
    [string]$Date,  # dd-mm-yyyy format

    [Parameter(Mandatory = $true, ParameterSetName = "SessionId")]
    [string]$SessionId,

    [Parameter(Mandatory = $true, ParameterSetName = "Login")]
    [string]$Username,

    [Parameter(Mandatory = $true, ParameterSetName = "Login")]
    [string]$Password,

    [string]$BaseUri = "https://shootnscoreit.com",
    
    [string]$ConfigPath,
    
    [switch]$TestMode,
    
    [switch]$CreateCalendarEvent,
    
    [string]$WpUsername,
    
    [string]$WpPassword
)

# Import YAML module
Import-Module -Name PowerShell-Yaml -ErrorAction Stop

# ============================================
# AUTHENTICATION PHASE (Requirement 40)
# Authenticate to all systems upfront before creating any events
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "    AUTHENTICATION PHASE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Authenticate to SSI
Write-Host "`n--- SSI Authentication ---" -ForegroundColor Yellow
if ($PSCmdlet.ParameterSetName -eq "Login") {
    Write-Host "Authenticating with username/password..." -ForegroundColor Gray
    $connectScript = Join-Path -Path $PSScriptRoot -ChildPath "Connect-SSI.ps1"
    $session = & $connectScript -Username $Username -Password $Password -BaseUri $BaseUri
    if (-not $session) {
        Write-Error "SSI authentication failed"
        exit 1
    }
} else {
    # Legacy: Use SessionId cookie
    Write-Host "Using session ID cookie..." -ForegroundColor Gray
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $session.Cookies.Add((New-Object System.Net.Cookie("sessionid", $SessionId, "/", "shootnscoreit.com")))
    $session.Cookies.Add((New-Object System.Net.Cookie("django_language", "en", "/", "shootnscoreit.com")))
    Write-Host "SUCCESS: SSI session configured" -ForegroundColor Green
}

# 2. Authenticate to WordPress (if calendar event creation is requested)
$wpSession = $null
if ($CreateCalendarEvent) {
    Write-Host "`n--- WordPress Authentication ---" -ForegroundColor Yellow
    if (-not $WpUsername -or -not $WpPassword) {
        Write-Error "WordPress credentials required when using -CreateCalendarEvent. Use -WpUsername and -WpPassword parameters."
        exit 1
    }
    
    $connectWpScript = Join-Path -Path $PSScriptRoot -ChildPath "Connect-WordPress.ps1"
    $wpSession = & $connectWpScript -Username $WpUsername -Password $WpPassword
    
    if (-not $wpSession) {
        Write-Error "WordPress authentication failed"
        exit 1
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "    AUTHENTICATION COMPLETE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Load configuration
if (-not $ConfigPath) {
    $ConfigPath = Join-Path -Path $PSScriptRoot -ChildPath "..\config\kupittaa-cup-config.yml"
}

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Configuration file not found: $ConfigPath"
    exit 1
}

$configContent = Get-Content -Path $ConfigPath -Raw -Encoding UTF8
$config = $configContent | ConvertFrom-Yaml

# Extract configuration values
$GroupId = $config.management.groupId
$OrganizerId = $config.management.organizerId

# Parse the date
$dateObj = [DateTime]::ParseExact($Date, "dd-MM-yyyy", $null)
$isoDate = $dateObj.ToString("yyyy-MM-dd")
$displayDate = $dateObj.ToString("dd.MM.yyyy")


# Get times from config
$startTime = $config.cup.startTime
$endTime = $config.cup.endTime

# Registration settings from config
$regDaysBefore = $config.cup.registrationDaysBeforeEvent
$regStartDateObj = $dateObj.AddDays(-$regDaysBefore)
$regStartDate = $regStartDateObj.ToString("yyyy-MM-dd")
$regStartTime = $config.cup.registrationStartTime

# Cup registration closes 12 hours before Cup start time
$cupStartDateTime = $dateObj.Add([TimeSpan]::Parse($startTime))
$regCloseDateTime = $cupStartDateTime.AddHours(-12)
$regCloseDate = $regCloseDateTime.ToString("yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture)
$regCloseTime = $regCloseDateTime.ToString("HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)

# Cup end date/time (used for match end and registration close)
$cupEndDate = $isoDate
$cupEndTime = $endTime

# Build cup name from template
$cupNameTemplate = $config.cup.nameTemplate
$cupName = $cupNameTemplate -replace '\{displayDate\}', $displayDate
if ($TestMode) {
    $cupName = "TEST $cupName"
}

# Match name template for duplicate checking
$matchNameTemplate = $config.match.nameTemplate

Write-Host "Creating Kupittaa Cup for $displayDate" -ForegroundColor Cyan
Write-Host "  Group ID: $GroupId" -ForegroundColor Gray
Write-Host "  Organizer ID: $OrganizerId" -ForegroundColor Gray

$uriObj = [Uri]$BaseUri

# Function to get CSRF token
function Get-CsrfToken {
    param($Session, $Url, $UriObj)
    
    $getHeaders = @{
        "Accept" = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        "Referer" = $Url
    }
    
    $formPage = Invoke-WebRequest -Uri $Url -Method GET -WebSession $Session -Headers $getHeaders
    
    $csrfToken = $null
    $cookiesForHost = $Session.Cookies.GetCookies($UriObj)
    foreach ($c in $cookiesForHost) {
        if ($c.Name -eq "csrftoken") { $csrfToken = $c.Value }
    }
    
    if (-not $csrfToken) {
        $m = [regex]::Match($formPage.Content, 'name="csrfmiddlewaretoken"\s+value="([^"]+)"')
        if ($m.Success) { $csrfToken = $m.Groups[1].Value }
    }
    
    return @{
        Token = $csrfToken
        Page = $formPage
    }
}

# Function to build URL-encoded body with array support
function Build-FormBody {
    param($Body, $ArrayFields)
    
    $encodedPairs = @()
    foreach ($key in $Body.Keys) {
        $encodedPairs += "$([Uri]::EscapeDataString($key))=$([Uri]::EscapeDataString($Body[$key]))"
    }
    
    foreach ($fieldName in $ArrayFields.Keys) {
        foreach ($value in $ArrayFields[$fieldName]) {
            $encodedPairs += "$([Uri]::EscapeDataString($fieldName))=$([Uri]::EscapeDataString($value))"
        }
    }
    
    return $encodedPairs -join "&"
}

# Function to extract event ID from redirect URL
function Get-EventIdFromUrl {
    param($Url)
    
    if ($Url -match "/event/(\d+)/(\d+)/") {
        return @{
            TypeId = $Matches[1]
            EventId = $Matches[2]
        }
    }
    return $null
}

# Function to check for duplicate event names using user's events page
function Test-EventNameExists {
    param(
        $Session,
        $BaseUri,
        [string]$EventName
    )
    
    # Check user's own events page (more reliable than public search)
    $myEventsUrl = "$BaseUri/my-events/"
    
    try {
        $myEventsResponse = Invoke-WebRequest -Uri $myEventsUrl -WebSession $Session -UseBasicParsing
        
        # Check if exact match exists in user's events
        # Event names appear in the HTML content
        $escapedName = [regex]::Escape($EventName)
        if ($myEventsResponse.Content -match $escapedName) {
            return $true
        }
    }
    catch {
        Write-Host "  Warning: Could not check for duplicates: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    return $false
}

#region Check for Duplicate Names
Write-Host "`n--- Checking for Duplicate Names ---" -ForegroundColor Yellow

$duplicateFound = $false

# Check Cup name
Write-Host "  Checking Cup: $cupName" -ForegroundColor Gray
if (Test-EventNameExists -Session $session -BaseUri $BaseUri -EventName $cupName) {
    Write-Host "  ERROR: Cup with name '$cupName' already exists!" -ForegroundColor Red
    $duplicateFound = $true
}

# Check Match names
foreach ($matchType in $config.matchTypes) {
    $checkMatchName = $matchNameTemplate -replace '\{displayDate\}', $displayDate -replace '\{matchSuffix\}', $matchType.suffix
    if ($TestMode) { $checkMatchName = "TEST $checkMatchName" }
    
    Write-Host "  Checking Match: $checkMatchName" -ForegroundColor Gray
    if (Test-EventNameExists -Session $session -BaseUri $BaseUri -EventName $checkMatchName) {
        Write-Host "  ERROR: Match with name '$checkMatchName' already exists!" -ForegroundColor Red
        $duplicateFound = $true
    }
}

if ($duplicateFound) {
    Write-Host "`nERROR: Duplicate event names found. Aborting to prevent duplicates." -ForegroundColor Red
    Write-Host "Please delete existing events or use a different date." -ForegroundColor Yellow
    exit 1
}

Write-Host "  No duplicates found. Proceeding with creation." -ForegroundColor Green
#endregion

#region Create RESUL CUP
Write-Host "`n--- Creating RESUL CUP ---" -ForegroundColor Yellow
Write-Host "  Name: $cupName" -ForegroundColor Gray

$cupUrl = "$BaseUri/series/nordic/create-resul-cup/"

$csrf = Get-CsrfToken -Session $session -Url $cupUrl -UriObj $uriObj

# Get cup description and information from config (trim trailing whitespace)
$cupDescription = $config.cup.description.Trim()
$cupInformation = if ($config.cup.information) { $config.cup.information.Trim() } else { "" }

$cupBody = @{
    "csrfmiddlewaretoken" = $csrf.Token
    "group" = $GroupId
    "name" = $cupName
    "organizer" = $OrganizerId
    "visibility" = $config.cup.visibility
    "status" = $config.cup.status
    "results" = $config.cup.results
    "registration" = $config.cup.registration
    "max_competitors" = $config.cup.maxCompetitors.ToString()
    "description" = $cupDescription
    "information" = $cupInformation
    "region" = $config.cup.region
    
    # Required Cup-specific fields
    "scoring_mode" = $config.cup.scoringMode
    "match_registration_mode" = $config.cup.matchRegistrationMode
    "has_accepted_event_data_ass_agreement" = "on"
    "count" = $config.cup.matchCount.ToString()
    
    # Dates/times
    "starts_date" = $isoDate
    "starts_time" = $startTime
    "ends_date" = $isoDate
    "ends_time" = $endTime
    "reg_start_date" = $regStartDate
    "reg_start_time" = $regStartTime
    
    # Additional fields from form
    "timezone" = $config.cup.timezone
    "currency" = $config.cup.currency
    "venue" = $config.cup.venue
    "url" = $config.cup.url
    "url_display" = $config.cup.urlDisplay
    "reg_close_date" = $regCloseDate
    "reg_close_time" = $regCloseTime
    "sq_start_date" = ""
    "sq_start_time" = ""
    "sq_close_date" = ""
    "sq_close_time" = ""
    "pm_sq_start_date" = ""
    "pm_sq_start_time" = ""
    "imported" = ""
}

$cupArrayFields = @{
    "weapon_groups" = $config.cup.weaponGroups
    "categories" = $config.cup.categories
    "competence_classes" = $config.cup.competenceClasses
}

$cupEncodedBody = Build-FormBody -Body $cupBody -ArrayFields $cupArrayFields

$cupHeaders = @{
    "Content-Type" = "application/x-www-form-urlencoded"
    "Referer" = $cupUrl
    "Origin" = $BaseUri
    "X-CSRFToken" = $csrf.Token
}

try {
    $cupResponse = Invoke-WebRequest -Uri $cupUrl -Method POST -WebSession $session -Headers $cupHeaders -Body $cupEncodedBody -MaximumRedirection 5
    
    $cupFinalUrl = if ($cupResponse.BaseResponse.ResponseUri) {
        $cupResponse.BaseResponse.ResponseUri.AbsoluteUri
    } elseif ($cupResponse.BaseResponse.RequestMessage.RequestUri) {
        $cupResponse.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
    } else {
        "Unknown"
    }
    
    if ($cupFinalUrl -match "/event/\d+/\d+") {
        Write-Host "SUCCESS: Created Cup at: $cupFinalUrl" -ForegroundColor Green
        $cupEventInfo = Get-EventIdFromUrl -Url $cupFinalUrl
        Write-Host "  Cup Event ID: $($cupEventInfo.EventId)" -ForegroundColor Gray
    } else {
        Write-Host "FAILED: Cup creation failed. Final URL: $cupFinalUrl" -ForegroundColor Red
        $cupResponse.Content | Out-File -FilePath "debug-cup-response.html" -Encoding UTF8
        Write-Host "Response saved to debug-cup-response.html" -ForegroundColor Yellow
        exit 1
    }
}
catch {
    Write-Host "ERROR creating Cup: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
#endregion

#region Create Child Matches
# Now we need to create 3 matches linked to the Cup
# Match types are loaded from config

$matchUrl = "$BaseUri$($config.match.createUrl)"
$createdMatches = @()

foreach ($matchTypeConfig in $config.matchTypes) {
    $matchSuffix = $matchTypeConfig.suffix
    
    # Build match name from template
    $matchNameTemplate = $config.match.nameTemplate
    $matchName = $matchNameTemplate -replace '\{displayDate\}', $displayDate -replace '\{matchSuffix\}', $matchSuffix
    if ($TestMode) {
        $matchName = "TEST $matchName"
    }
    
    Write-Host "`n--- Creating Match: $matchSuffix ---" -ForegroundColor Yellow
    Write-Host "  Name: $matchName" -ForegroundColor Gray
    
    # Get fresh CSRF token for each request
    $csrf = Get-CsrfToken -Session $session -Url $matchUrl -UriObj $uriObj
    
    # Get match description and information from config (trim trailing whitespace)
    $matchDescription = $matchTypeConfig.description.Trim()
    $matchInformation = if ($matchTypeConfig.information) { $matchTypeConfig.information.Trim() } else { "" }
    
    $matchBody = @{
        "csrfmiddlewaretoken" = $csrf.Token
        "group" = $GroupId
        "name" = $matchName
        "organizer" = $OrganizerId
        "visibility" = $config.match.visibility
        "status" = $config.match.status
        "results" = $config.match.results
        "registration" = $config.match.registration
        "max_competitors" = $config.match.maxCompetitors.ToString()
        "description" = $matchDescription
        "information" = $matchInformation
        "region" = $config.match.region
        
        # 25m Pistooli Kuvio specific fields
        "layouts" = $config.match.layouts
        "precision_strings" = $config.match.precisionStrings
        "precision_shots_per_string" = $config.match.precisionShotsPerString
        "string_scoring_format" = $config.match.stringScoringFormat
        
        # Required fields
        "level" = $config.match.level
        "has_accepted_event_data_ass_agreement" = "on"
        "number_of_team_members" = $config.match.numberOfTeamMembers
        "result_from_team_members" = $config.match.resultFromTeamMembers
        "prematch" = $config.match.prematch
        "max_prematch_competitors" = $config.match.maxPrematchCompetitors
        "verify_using" = $config.match.verifyUsing
        
        # Dates/times - Match registration starts same time as Cup
        "starts_date" = $isoDate
        "starts_time" = $startTime
        "reg_start_date" = $regStartDate
        "reg_start_time" = $regStartTime
        
        # Additional fields
        "timezone" = $config.match.timezone
        "currency" = $config.match.currency
        "venue" = $config.match.venue
        # Note: Coordinates (lat/lng) cannot be set via form - must be added manually via SSI map UI
        "url" = ""
        "url_display" = ""
        # Match end date/time = Cup end date/time
        "ends_date" = $cupEndDate
        "ends_time" = $cupEndTime
        # Match registration close = Cup end date/time
        "reg_close_date" = $cupEndDate
        "reg_close_time" = $cupEndTime
        # Squading start = Match registration start
        "sq_start_date" = $regStartDate
        "sq_start_time" = $regStartTime
        # Squading close = Match start
        "sq_close_date" = $isoDate
        "sq_close_time" = $startTime
        "pm_sq_start_date" = ""
        "pm_sq_start_time" = ""
        "imported" = ""
    }
    
    $matchArrayFields = @{
        "weapon_groups" = $config.match.weaponGroups
        "categories" = $config.match.categories
        "competence_classes" = $config.match.competenceClasses
    }
    
    $matchEncodedBody = Build-FormBody -Body $matchBody -ArrayFields $matchArrayFields
    
    $matchHeaders = @{
        "Content-Type" = "application/x-www-form-urlencoded"
        "Referer" = $matchUrl
        "Origin" = $BaseUri
        "X-CSRFToken" = $csrf.Token
    }
    
    try {
        $matchResponse = Invoke-WebRequest -Uri $matchUrl -Method POST -WebSession $session -Headers $matchHeaders -Body $matchEncodedBody -MaximumRedirection 5
        
        $matchFinalUrl = if ($matchResponse.BaseResponse.ResponseUri) {
            $matchResponse.BaseResponse.ResponseUri.AbsoluteUri
        } elseif ($matchResponse.BaseResponse.RequestMessage.RequestUri) {
            $matchResponse.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
        } else {
            "Unknown"
        }
        
        if ($matchFinalUrl -match "/event/\d+/\d+") {
            Write-Host "SUCCESS: Created $matchSuffix at: $matchFinalUrl" -ForegroundColor Green
            $matchEventInfo = Get-EventIdFromUrl -Url $matchFinalUrl
            $createdMatches += @{
                Name = $matchSuffix
                Url = $matchFinalUrl
                TypeId = $matchEventInfo.TypeId
                EventId = $matchEventInfo.EventId
            }
        } else {
            Write-Host "FAILED: $matchSuffix creation failed. Final URL: $matchFinalUrl" -ForegroundColor Red
            $matchResponse.Content | Out-File -FilePath "debug-match-response.html" -Encoding UTF8
            Write-Host "Response saved to debug-match-response.html" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "ERROR creating $matchSuffix`: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Small delay between requests
    Start-Sleep -Milliseconds 500
}
#endregion

#region Link Matches to Cup
Write-Host "`n--- Linking Matches to Cup ---" -ForegroundColor Yellow

$linkUrl = "$BaseUri/event/$($cupEventInfo.TypeId)/$($cupEventInfo.EventId)/add-existing-match/"
$matchNumber = 1

foreach ($match in $createdMatches) {
    Write-Host "Linking $($match.Name) (ID: $($match.EventId)) to Cup..." -ForegroundColor Gray
    
    # Get fresh CSRF token
    $csrf = Get-CsrfToken -Session $session -Url $linkUrl -UriObj $uriObj
    
    $linkBody = @{
        "csrfmiddlewaretoken" = $csrf.Token
        "number" = $matchNumber.ToString()
        "match" = $match.EventId
        "included" = "on"
    }
    
    $linkEncodedBody = Build-FormBody -Body $linkBody -ArrayFields @{}
    
    $linkHeaders = @{
        "Content-Type" = "application/x-www-form-urlencoded"
        "Referer" = $linkUrl
        "Origin" = $BaseUri
        "X-CSRFToken" = $csrf.Token
    }
    
    try {
        $linkResponse = Invoke-WebRequest -Uri $linkUrl -Method POST -WebSession $session -Headers $linkHeaders -Body $linkEncodedBody -MaximumRedirection 5
        
        $linkFinalUrl = if ($linkResponse.BaseResponse.ResponseUri) {
            $linkResponse.BaseResponse.ResponseUri.AbsoluteUri
        } elseif ($linkResponse.BaseResponse.RequestMessage.RequestUri) {
            $linkResponse.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
        } else {
            "Unknown"
        }
        
        # Check if we're redirected back to the Cup page (success) or stayed on the form (error)
        if ($linkFinalUrl -match "/event/$($cupEventInfo.TypeId)/$($cupEventInfo.EventId)/" -and $linkFinalUrl -notmatch "add-existing-match") {
            Write-Host "  SUCCESS: Linked $($match.Name) as component #$matchNumber" -ForegroundColor Green
            $match.Linked = $true
        } else {
            Write-Host "  WARNING: Link may have failed for $($match.Name). Check manually." -ForegroundColor Yellow
            $match.Linked = $false
        }
    }
    catch {
        Write-Host "  ERROR linking $($match.Name): $($_.Exception.Message)" -ForegroundColor Red
        $match.Linked = $false
    }
    
    $matchNumber++
    Start-Sleep -Milliseconds 500
}
#endregion

#region Create Squads for Each Match
Write-Host "`n--- Creating Squads for Matches ---" -ForegroundColor Yellow

foreach ($match in $createdMatches) {
    Write-Host "`nCreating squads for $($match.Name) (ID: $($match.EventId))..." -ForegroundColor Gray
    
    # Squad URL uses the match EventId
    $squadUrl = "$BaseUri$($config.squads.addSquadsUrlTemplate -replace '\{eventId\}', $match.EventId)"
    Write-Host "  Squad URL: $squadUrl" -ForegroundColor Gray
    
    foreach ($squadDef in $config.squads.definitions) {
        $squadName = $squadDef.name
        $maxShooters = $squadDef.maxShooters
        
        # Squad form fields (note: squad names are auto-generated by SSI)
        # Squad registration follows the same schedule as match registration
        # Based on browser network capture - NO CSRF token needed for this form
        $squadBody = @{
            "quantity" = "1"  # Number of squads to create
            "max_competitors" = $maxShooters.ToString()
            "registration" = "aa"  # Anyone can register (aa=Anyone, os=Restricted)
            "comment" = $squadName  # Use squad name as comment since name is auto-generated
            # Squad registration dates (same as match registration)
            "starts_date" = $regStartDate  # ISO format: YYYY-MM-DD
            "starts_time" = $regStartTime  # HH:MM format
            "issue_dates" = "False"  # Required field
            "length" = "60"  # Squad duration in minutes
            "split" = "10"  # Split time
            "prematch" = "False"  # Required field
            "submit" = "Submit"  # Submit button value
        }
        
        # Array fields for categories, weapon_groups, competence_classes
        $squadArrayFields = @{
            "categories" = @("-")  # "-" means "Any" category
            "weapon_groups" = @("-")  # "-" means "Any" weapon group
            "competence_classes" = @("-")  # "-" means "Any" competence class
        }
        
        $squadEncodedBody = Build-FormBody -Body $squadBody -ArrayFields $squadArrayFields
        
        $squadHeaders = @{
            "Content-Type" = "application/x-www-form-urlencoded"
            "Referer" = $squadUrl
            "Origin" = $BaseUri
        }
        
        try {
            $squadResponse = Invoke-WebRequest -Uri $squadUrl -Method POST -WebSession $session -Headers $squadHeaders -Body $squadEncodedBody -MaximumRedirection 5
            
            $squadFinalUrl = if ($squadResponse.BaseResponse.ResponseUri) {
                $squadResponse.BaseResponse.ResponseUri.AbsoluteUri
            } elseif ($squadResponse.BaseResponse.RequestMessage.RequestUri) {
                $squadResponse.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
            } else {
                "Unknown"
            }
            
            # Check for errors in response
            if ($squadResponse.Content -match 'is-invalid|alert-danger|error') {
                Write-Host "  WARNING: Squad '$squadName' may have validation errors. Check manually." -ForegroundColor Yellow
                $squadResponse.Content | Out-File -FilePath "debug-squad-response-$($match.EventId)-$squadName.html" -Encoding UTF8
            } elseif ($squadFinalUrl -match "add-squads" -and $squadResponse.StatusCode -eq 200) {
                # Stayed on form but got 200 - likely success (form allows adding more)
                Write-Host "  SUCCESS: Created squad '$squadName' (max: $maxShooters)" -ForegroundColor Green
            } else {
                Write-Host "  SUCCESS: Created squad '$squadName' (max: $maxShooters)" -ForegroundColor Green
            }
        }
        catch {
            Write-Host "  ERROR creating squad '$squadName': $($_.Exception.Message)" -ForegroundColor Red
            if ($_.Exception.Response) {
                Write-Host "    Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            }
        }
        
        Start-Sleep -Milliseconds 300
    }
}
#endregion

#region Calendar Event (Tapahtumakalenteri)
$calendarEvent = $null

if ($CreateCalendarEvent -and $wpSession) {
    Write-Host "`n" -NoNewline
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host "    CREATING CALENDAR EVENT" -ForegroundColor Magenta
    Write-Host "========================================" -ForegroundColor Magenta
    
    # wpSession was already authenticated at the beginning (Requirement 40)
    # Build calendar event content from config
    $tkConfig = $config.tapahtumakalenteri
    $calendarTitle = $tkConfig.titleTemplate -replace '\{displayDate\}', $displayDate
    if ($TestMode) { $calendarTitle = "TEST $calendarTitle" }
    
    # Short description from config
    $calendarShortDesc = $tkConfig.shortDescription.Trim()
    
    # Full content from config - replace {ssiCupLink} placeholder with actual link
    $ssiCupLink = "<a href=`"$cupFinalUrl`" target=`"_blank`">SSI</a>"
    $calendarContent = $tkConfig.content.Trim() -replace '\{ssiCupLink\}', $ssiCupLink
    
    # Create calendar event
    $newEventScript = Join-Path -Path $PSScriptRoot -ChildPath "New-TapahtumakalenteriEvent.ps1"
    $calendarEvent = & $newEventScript `
        -Session $wpSession `
        -Title $calendarTitle `
        -Date $dateObj `
        -StartTime $config.general.startTime `
        -EndTime $config.general.endTime `
        -ShortDescription $calendarShortDesc `
        -Content $calendarContent `
        -Location $tkConfig.location `
        -MapLink $tkConfig.mapLink `
        -SsiCupUrl $cupFinalUrl `
        -SsiCupId ([int]$cupEventInfo.EventId) `
        -EventFormatTaxonomyIds $tkConfig.eventFormatTaxonomyIds
    
    if ($calendarEvent) {
        Write-Host "`nCalendar event created successfully!" -ForegroundColor Green
        Write-Host "  Permalink includes Cup ID: cup$($cupEventInfo.EventId)" -ForegroundColor Gray
    }
    else {
        Write-Host "`nWARNING: Failed to create calendar event." -ForegroundColor Yellow
    }
}
#endregion

#region Summary
Write-Host "`n" -NoNewline
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "           CREATION SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nCup: $cupFinalUrl" -ForegroundColor Green

Write-Host "`nMatches created and linked:" -ForegroundColor Yellow
foreach ($match in $createdMatches) {
    $linkStatus = if ($match.Linked) { "[LINKED]" } else { "[NOT LINKED]" }
    Write-Host "  - $($match.Name): $($match.Url) $linkStatus" -ForegroundColor White
}

Write-Host "`nSquads created per match:" -ForegroundColor Yellow
foreach ($squadDef in $config.squads.definitions) {
    Write-Host "  - $($squadDef.name) (max: $($squadDef.maxShooters))" -ForegroundColor White
}

if ($calendarEvent) {
    Write-Host "`nCalendar Event (tapahtumakalenteri):" -ForegroundColor Magenta
    Write-Host "  - Status: $($calendarEvent.Status)" -ForegroundColor White
    Write-Host "  - Edit: $($calendarEvent.EditUrl)" -ForegroundColor White
    Write-Host "  - Preview: $($calendarEvent.EventUrl)" -ForegroundColor White
}

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Verify Cup and Matches at the URLs above" -ForegroundColor White
Write-Host "  2. Check squad configuration for each match" -ForegroundColor White
if ($calendarEvent) {
    Write-Host "  3. Review and PUBLISH the calendar event (currently draft)" -ForegroundColor White
    Write-Host "  4. Delete TEST events if this was a test run" -ForegroundColor White
}
else {
    Write-Host "  3. Delete TEST events if this was a test run" -ForegroundColor White
}
#endregion
