<#
.SYNOPSIS
    Creates a Kupittaa RESUL CUP with three child matches and squads using GraphQL API

.DESCRIPTION
    This script creates a RESUL CUP event on shootnscoreit.com for a given date,
    then creates three child matches linked to that Cup, and creates squads for each match.
    Uses the SSI GraphQL API instead of web form submission.
    
    Configuration is loaded from:
    - Event config: ../config/kupittaa-cup-config.yml (shared with web version)
    - API key: config/api-key.yml (GraphQL-specific)

.PARAMETER Date
    Match date in dd-mm-yyyy format

.PARAMETER ApiKeyPath
    Path to the API key configuration file (default: config/api-key.yml)

.PARAMETER ConfigPath
    Path to the event configuration file (default: ../config/kupittaa-cup-config.yml)

.PARAMETER TestMode
    If specified, adds "TEST" prefix to event names

.EXAMPLE
    .\New-KupittaaCup.ps1 -Date "25-01-2026"

.EXAMPLE
    .\New-KupittaaCup.ps1 -Date "25-01-2026" -TestMode

.EXAMPLE
    .\New-KupittaaCup.ps1 -Date "25-01-2026" -ApiKeyPath "custom/api-key.yml"
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^\d{2}-\d{2}-\d{4}$")]
    [string]$Date,  # dd-mm-yyyy format

    [string]$ApiKeyPath,
    
    [string]$ConfigPath,
    
    [switch]$TestMode
)

# Import required modules
Import-Module -Name PowerShell-Yaml -ErrorAction Stop
Import-Module -Name (Join-Path -Path $PSScriptRoot -ChildPath "lib\SSI-GraphQL.psm1") -Force -ErrorAction Stop

# Load API key configuration
if (-not $ApiKeyPath) {
    $ApiKeyPath = Join-Path -Path $PSScriptRoot -ChildPath "config\api-key.yml"
}

if (-not (Test-Path $ApiKeyPath)) {
    Write-Error "API key configuration file not found: $ApiKeyPath"
    Write-Host "Please create the file with your SSI GraphQL API key." -ForegroundColor Yellow
    exit 1
}

$apiKeyContent = Get-Content -Path $ApiKeyPath -Raw -Encoding UTF8
$apiKeyConfig = $apiKeyContent | ConvertFrom-Yaml

# Validate API key config
if (-not $apiKeyConfig.apiKey -or $apiKeyConfig.apiKey -eq "YOUR_API_KEY_HERE") {
    Write-Error "API key not configured. Please set your API key in: $ApiKeyPath"
    exit 1
}

if (-not $apiKeyConfig.email -or $apiKeyConfig.email -eq "your.email@example.com") {
    Write-Error "Email not configured. Please set your email in: $ApiKeyPath"
    exit 1
}

if (-not $apiKeyConfig.password -or $apiKeyConfig.password -eq "your_password_here") {
    Write-Error "Password not configured. Please set your password in: $ApiKeyPath"
    exit 1
}

# Load event configuration (shared with web version)
if (-not $ConfigPath) {
    $ConfigPath = Join-Path -Path $PSScriptRoot -ChildPath "..\config\kupittaa-cup-config.yml"
}

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Event configuration file not found: $ConfigPath"
    exit 1
}

$configContent = Get-Content -Path $ConfigPath -Raw -Encoding UTF8
$config = $configContent | ConvertFrom-Yaml

# Authenticate with SSI GraphQL API (JWT + API Key)
Write-Host "Authenticating with SSI GraphQL API..." -ForegroundColor Cyan
try {
    $headers = Connect-SSIGraphQL -Email $apiKeyConfig.email -Password $apiKeyConfig.password -ApiKey $apiKeyConfig.apiKey
    
    # Verify authentication
    $me = Get-SSIMe -Headers $headers
    Write-Host "  Authenticated as: $($me.email)" -ForegroundColor Green
}
catch {
    Write-Error "GraphQL Authentication failed: $($_.Exception.Message)"
    exit 1
}

# Authenticate with SSI Web (for linking and squads)
Write-Host "Authenticating with SSI Web (for linking and squads)..." -ForegroundColor Cyan
try {
    $connectScript = ".\archive\scripts-legacy\Connect-SSI.ps1"
    $webSession = & $connectScript -Username $apiKeyConfig.email -Password $apiKeyConfig.password
    if (-not $webSession) {
        throw "Web session creation failed"
    }
    Write-Host "  Web session established" -ForegroundColor Green
}
catch {
    Write-Error "Web Authentication failed: $($_.Exception.Message)"
    exit 1
}

# Extract configuration values
$GroupId = $config.management.groupId
$OrganizerId = $config.management.organizerId

# Parse the date
$dateObj = [DateTime]::ParseExact($Date, "dd-MM-yyyy", $null)
$isoDate = $dateObj.ToString("yyyy-MM-dd")
$displayDate = $dateObj.ToString("dd.MM.yyyy")

# Get times from config (convert Finnish hh.mm to HH:mm)
$startTime = $config.cup.startTime -replace '\.', ':'
$endTime = $config.cup.endTime -replace '\.', ':'

# Registration settings from config
$regDaysBefore = $config.cup.registrationDaysBeforeEvent
$regStartDateObj = $dateObj.AddDays(-$regDaysBefore)
$regStartDate = $regStartDateObj.ToString("yyyy-MM-dd")
$regStartTime = $config.cup.registrationStartTime -replace '\.', ':'

# Cup registration closes 12 hours before Cup start time
$cupStartDateTime = $dateObj.Add([TimeSpan]::Parse($startTime))
$regCloseDateTime = $cupStartDateTime.AddHours(-12)
$regCloseDate = $regCloseDateTime.ToString("yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture)
$regCloseTime = $regCloseDateTime.ToString("HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)

# Cup end date/time
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

Write-Host "Creating Kupittaa Cup for $displayDate (GraphQL API)" -ForegroundColor Cyan
Write-Host "  Group ID: $GroupId" -ForegroundColor Gray
Write-Host "  Organizer ID: $OrganizerId" -ForegroundColor Gray

#region Check for Duplicate Names
Write-Host "`n--- Checking for Duplicate Names ---" -ForegroundColor Yellow

$duplicateFound = $false

# Check Cup name
Write-Host "  Checking Cup: $cupName" -ForegroundColor Gray
if (Test-SSIEventExists -Headers $headers -EventName $cupName) {
    Write-Host "  ERROR: Cup with name '$cupName' already exists!" -ForegroundColor Red
    $duplicateFound = $true
}

# Check Match names
foreach ($matchType in $config.matchTypes) {
    $checkMatchName = $matchNameTemplate -replace '\{displayDate\}', $displayDate -replace '\{matchSuffix\}', $matchType.suffix
    if ($TestMode) { $checkMatchName = "TEST $checkMatchName" }
    
    Write-Host "  Checking Match: $checkMatchName" -ForegroundColor Gray
    if (Test-SSIEventExists -Headers $headers -EventName $checkMatchName) {
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

# Get cup description and information from config (trim trailing whitespace)
$cupDescription = $config.cup.description.Trim()
$cupInformation = if ($config.cup.information) { $config.cup.information.Trim() } else { "" }

$cupData = @{
    group = $GroupId
    name = $cupName
    organizer = $OrganizerId
    visibility = $config.cup.visibility
    status = $config.cup.status
    results = $config.cup.results
    registration = $config.cup.registration
    maxCompetitors = $config.cup.maxCompetitors
    description = $cupDescription
    information = $cupInformation
    region = $config.cup.region
    
    # Cup-specific fields (SSI GraphQL expectations)
    scoring_mode = $config.cup.scoringMode
    match_registration_mode = $config.cup.matchRegistrationMode
    count = $config.cup.matchCount
    has_accepted_event_data_ass_agreement = $true
    
    # Dates/times
    starts_date = $isoDate
    starts_time = $startTime
    ends_date = $isoDate
    ends_time = $endTime
    reg_start_date = $regStartDate
    reg_start_time = $regStartTime
    reg_close_date = $regCloseDate
    reg_close_time = $regCloseTime
    
    # Additional fields
    timezone = $config.cup.timezone
    currency = $config.cup.currency
    venue = $config.cup.venue
    url = $config.cup.url
    url_display = $config.cup.urlDisplay
    
    # Categories and divisions (arrays)
    weapon_groups = $config.cup.weaponGroups
    categories = $config.cup.categories
    competence_classes = $config.cup.competenceClasses
}

try {
    $cup = New-SSIResulCup -Headers $headers -CupData $cupData
    Write-Host "SUCCESS: Created Cup" -ForegroundColor Green
    Write-Host "  Cup ID: $($cup.id)" -ForegroundColor Gray
    Write-Host "  URL: $($cup.get_full_absolute_url)" -ForegroundColor Gray
    
    $cupEventInfo = @{
        Id = $cup.id
        ContentType = $cup.get_content_type_key
        Url = $cup.get_full_absolute_url
    }
}
catch {
    Write-Host "ERROR creating Cup: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
#endregion

#region Create Child Matches
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
    
    # Get match description and information from config (trim trailing whitespace)
    $matchDescription = $matchTypeConfig.description.Trim()
    $matchInformation = if ($matchTypeConfig.information) { $matchTypeConfig.information.Trim() } else { "" }
    
    $matchData = @{
        group = $GroupId
        name = $matchName
        organizer = $OrganizerId
        visibility = $config.match.visibility
        status = $config.match.status
        results = $config.match.results
        registration = $config.match.registration
        maxCompetitors = $config.match.maxCompetitors
        description = $matchDescription
        information = $matchInformation
        region = $config.match.region
        
        # 25m Pistooli Kuvio specific fields
        layouts = $config.match.layouts
        precision_strings = $config.match.precisionStrings
        precision_shots_per_string = $config.match.precisionShotsPerString
        string_scoring_format = $config.match.stringScoringFormat
        
        # Required fields
        level = $config.match.level
        number_of_team_members = $config.match.numberOfTeamMembers
        result_from_team_members = $config.match.resultFromTeamMembers
        prematch = $config.match.prematch
        max_prematch_competitors = $config.match.maxPrematchCompetitors
        verify_using = $config.match.verifyUsing
        
        # Dates/times
        starts_date = $isoDate
        starts_time = $startTime
        reg_start_date = $regStartDate
        reg_start_time = $regStartTime
        ends_date = $cupEndDate
        ends_time = $cupEndTime
        reg_close_date = $cupEndDate
        reg_close_time = $cupEndTime
        sq_start_date = $regStartDate
        sq_start_time = $regStartTime
        sq_close_date = $isoDate
        sq_close_time = $startTime
        
        # Additional fields
        timezone = $config.match.timezone
        currency = $config.match.currency
        venue = $config.match.venue
        
        # Categories and divisions
        weapon_groups = $config.match.weaponGroups
        categories = $config.match.categories
        competence_classes = $config.match.competenceClasses
    }
    
    # Get sub_rule from matchType config (e.g., 'p2p' for 25m Fast-pistol)
    $subRule = if ($matchTypeConfig.subRule) { $matchTypeConfig.subRule } else { "p2p" }
    
    try {
        $match = New-SSIResulMatch -Headers $headers -MatchData $matchData -SubRule $subRule
        Write-Host "SUCCESS: Created $matchSuffix" -ForegroundColor Green
        Write-Host "  Match ID: $($match.id)" -ForegroundColor Gray
        Write-Host "  URL: $($match.get_full_absolute_url)" -ForegroundColor Gray
        
        $createdMatches += @{
            Name = $matchSuffix
            Id = $match.id
            ContentType = $match.get_content_type_key
            Url = $match.get_full_absolute_url
            Linked = $false
        }
    }
    catch {
        Write-Host "ERROR creating $matchSuffix`: $($_.Exception.Message)" -ForegroundColor Red
    }
}
#endregion

#region Link Matches to Cup
Write-Host "`n--- Linking Matches to Cup ---" -ForegroundColor Yellow

$matchNumber = 1

foreach ($match in $createdMatches) {
    Write-Host "Linking $($match.Name) (ID: $($match.Id)) to Cup..." -ForegroundColor Gray
    
    try {
        # Use web fallback since addCupMatch mutation is missing from GQL
        $success = Add-SSICupMatchWeb -Session $webSession -CupId $cupEventInfo.Id -MatchId $match.Id -ComponentNumber $matchNumber
        
        if ($success) {
            Write-Host "  SUCCESS: Linked $($match.Name) as component #$matchNumber" -ForegroundColor Green
            $match.Linked = $true
        } else {
            Write-Host "  WARNING: Link may have failed for $($match.Name). Check manually." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "  ERROR linking $($match.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
    
    $matchNumber++
}
#endregion

#region Create Squads for Each Match
Write-Host "`n--- Creating Squads for Matches ---" -ForegroundColor Yellow

foreach ($match in $createdMatches) {
    Write-Host "`nCreating squads for $($match.Name) (ID: $($match.Id))..." -ForegroundColor Gray
    
    foreach ($squadDef in $config.squads.definitions) {
        $squadName = $squadDef.name
        $maxShooters = $squadDef.maxShooters
        
        $squadData = @{
            # Use web fallback since createSquad mutation is missing from GQL
            $success = quantity = 1WebSsionwbSsion
           if($sccess) {
                maxCompetitors = $maxShooters
            } else {
                Write-Host "  WARNING: Squad creation may have failed for '$squadName'. Check manually." -ForegroundColor Yellow
            }
            registration = "aa"  # Anyone can register
            comment = $squadName
            startsDate = $regStartDate
            startsTime = $regStartTime
            issueDates = $false
            length = 60
            split = 10
            prematch = $false
            categories = @("-")
            weaponGroups = @("-")
            competenceClasses = @("-")
        }
        
        try {
            New-SSISquad -Headers $headers -MatchId $match.Id -SquadData $squadData | Out-Null
            Write-Host "  SUCCESS: Created squad '$squadName' (max: $maxShooters)" -ForegroundColor Green
        }
        catch {
            Write-Host "  ERROR creating squad '$squadName': $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}
#endregion

#region Summary
Write-Host "`n" -NoNewline
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "           CREATION SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nCup: $($cupEventInfo.Url)" -ForegroundColor Green

Write-Host "`nMatches created and linked:" -ForegroundColor Yellow
foreach ($match in $createdMatches) {
    $linkStatus = if ($match.Linked) { "[LINKED]" } else { "[NOT LINKED]" }
    Write-Host "  - $($match.Name): $($match.Url) $linkStatus" -ForegroundColor White
}

Write-Host "`nSquads created per match:" -ForegroundColor Yellow
foreach ($squadDef in $config.squads.definitions) {
    Write-Host "  - $($squadDef.name) (max: $($squadDef.maxShooters))" -ForegroundColor White
}

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Verify Cup and Matches at the URLs above" -ForegroundColor White
Write-Host "  2. Check squad configuration for each match" -ForegroundColor White
Write-Host "  3. Add venue coordinates via SSI map UI (cannot be set via API)" -ForegroundColor White
Write-Host "  4. Delete TEST events if this was a test run" -ForegroundColor White
#endregion
