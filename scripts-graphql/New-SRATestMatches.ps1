<#
.SYNOPSIS
    Creates 4 SRA test matches (2 Oldies + 2 Newbie) with squads using GraphQL API

.DESCRIPTION
    Creates standalone NordicMatch events on shootnscoreit.com for staffing testing.
    Matches are scheduled on consecutive Tuesdays starting from next Tuesday.
    Order: Oldies → Newbie → Oldies → Newbie
    Each match gets 4 shooter squads + 1 Trainer squad.
    
    Naming: "TEST TR-SRAO dd.MM.yyyy" / "TEST TR-SRAN dd.MM.yyyy"

    Uses the SSI GraphQL API (same mechanics as New-KupittaaCup.ps1).

.PARAMETER Email
    SSI account email (required)

.PARAMETER Password
    SSI account password (required)

.PARAMETER ApiKey
    SSI GraphQL API key (required)

.PARAMETER GroupId
    SSI group ID that manages the events. Default from kupittaa-cup-config.yml.

.PARAMETER Rule
    SSI rule code for match creation. Default: 'sr' (SRA)

.PARAMETER SubRule
    SSI sub-rule code. Default: 'to' (SRA Total)

.PARAMETER Firearms
    Comma-separated firearms. Default: 'rf,sg,hg' (rifle, shotgun, handgun)

.EXAMPLE
    .\New-SRATestMatches.ps1 -Email user@example.com -Password secret -ApiKey abc123

.EXAMPLE
    .\New-SRATestMatches.ps1 -Email user@example.com -Password secret -ApiKey abc123 -GroupId "25874"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Email,
    
    [Parameter(Mandatory = $true)]
    [string]$Password,
    
    [Parameter(Mandatory = $true)]
    [string]$ApiKey,
    
    [string]$GroupId,
    [string]$OrganizerId,
    [string]$Rule = "sr",
    [string]$SubRule = "to",
    [string]$Firearms = "rf,sg,hg"
)

# Import required modules
Import-Module -Name PowerShell-Yaml -ErrorAction Stop
Import-Module -Name (Join-Path -Path $PSScriptRoot -ChildPath "lib\SSI-GraphQL.psm1") -Force -ErrorAction Stop
Import-Module -Name (Join-Path -Path $PSScriptRoot -ChildPath "lib\SSI-WebSquad.psm1") -Force -ErrorAction Stop

#region Load Configuration
# GroupId is optional — when omitted, use "xxx" which means "itself" (self-managed) in SSI
if (-not $GroupId) {
    $GroupId = "xxx"
    Write-Host "No group specified — match will be managed by self (group=xxx)" -ForegroundColor Gray
} else {
    Write-Host "Using group: $GroupId" -ForegroundColor Gray
}
#endregion

#region Authenticate
Write-Host "Authenticating with SSI GraphQL API..." -ForegroundColor Cyan
try {
    $headers = Connect-SSIGraphQL -Email $Email -Password $Password -ApiKey $ApiKey
    $me = Get-SSIMe -Headers $headers
    Write-Host "  Authenticated as: $($me.email)" -ForegroundColor Green
}
catch {
    Write-Error "Authentication failed: $($_.Exception.Message)"
    exit 1
}
#endregion

#region Calculate Dates — next 4 Tuesdays
$today = [DateTime]::Today
$daysUntilTuesday = (([int][DayOfWeek]::Tuesday - [int]$today.DayOfWeek + 7) % 7)
if ($daysUntilTuesday -eq 0) { $daysUntilTuesday = 7 }  # If today is Tuesday, use next week

$tuesdays = @()
for ($i = 0; $i -lt 4; $i++) {
    $tuesdays += $today.AddDays($daysUntilTuesday + ($i * 7))
}

# Match definitions: Oldies, Newbie, Oldies, Newbie
$matchDefs = @(
    @{ Type = "SRAO"; Label = "SRA Oldies"; Tuesday = $tuesdays[0] },
    @{ Type = "SRAN"; Label = "SRA Newbie"; Tuesday = $tuesdays[1] },
    @{ Type = "SRAO"; Label = "SRA Oldies"; Tuesday = $tuesdays[2] },
    @{ Type = "SRAN"; Label = "SRA Newbie"; Tuesday = $tuesdays[3] }
)

Write-Host "`nPlanned test matches:" -ForegroundColor Cyan
foreach ($md in $matchDefs) {
    $displayDate = $md.Tuesday.ToString("dd.MM.yyyy")
    Write-Host "  TEST TR-$($md.Type) $displayDate  ($($md.Label))" -ForegroundColor White
}
#endregion

#region Check for Duplicates
Write-Host "`n--- Checking for Duplicate Names ---" -ForegroundColor Yellow
$duplicateFound = $false

foreach ($md in $matchDefs) {
    $displayDate = $md.Tuesday.ToString("dd.MM.yyyy")
    $matchName = "TEST TR-$($md.Type) $displayDate"
    Write-Host "  Checking: $matchName" -ForegroundColor Gray
    if (Test-SSIEventExists -Headers $headers -EventName $matchName) {
        Write-Host "  ERROR: '$matchName' already exists!" -ForegroundColor Red
        $duplicateFound = $true
    }
}

if ($duplicateFound) {
    Write-Host "`nERROR: Duplicate names found. Run Remove-SRATestMatches.ps1 first." -ForegroundColor Red
    exit 1
}
Write-Host "  No duplicates found." -ForegroundColor Green
#endregion

#region Create Matches
$createdMatches = @()

foreach ($md in $matchDefs) {
    $isoDate = $md.Tuesday.ToString("yyyy-MM-dd")
    $displayDate = $md.Tuesday.ToString("dd.MM.yyyy")
    $matchName = "TEST TR-$($md.Type) $displayDate"

    Write-Host "`n--- Creating Match: $matchName ---" -ForegroundColor Yellow

    # Registration opens 7 days before, closes 24h before
    $regStartDate = $md.Tuesday.AddDays(-7).ToString("yyyy-MM-dd")
    $regCloseDate = $md.Tuesday.AddDays(-1).ToString("yyyy-MM-dd")

    $matchData = @{
        # Core fields (snake_case)
        group                  = $GroupId
        name                   = $matchName
        visibility             = "pub"
        status                 = "on"
        results                = "org"
        registration           = "op"
        max_competitors        = "50"
        description            = "TEST match for SRA staffing development. $($md.Label)."
        information            = "Test match created by New-SRATestMatches.ps1 for staffing development."
        region                 = "FIN"
        level                  = "tr"
        verify_using           = "xxx"
        timezone               = "Europe/Helsinki"
        currency               = "EUR"
        venue                  = ""

        # Dates (snake_case)
        starts_date            = $isoDate
        starts_time            = "18:00"
        ends_date              = $isoDate
        ends_time              = "21:00"
        reg_start_date         = $regStartDate
        reg_start_time         = "00:00"
        reg_close_date         = $regCloseDate
        reg_close_time         = "18:00"
        sq_start_date          = $regStartDate
        sq_start_time          = "00:00"
        sq_close_date          = $isoDate
        sq_close_time          = "18:00"

        # SRA/IPSC fields (arrays for multi-value)
        firearms               = @("rf", "sg", "hg")
        categories             = @("L", "S", "SS", "LS")
        cat_result_limit       = "1"
        has_accepted_event_data_ass_agreement = "on"
        prematch               = "no"
        max_prematch_competitors = "0"
        number_of_team_members = "4"
        result_from_team_members = "3"

        # Division fields (arrays)
        handgun_divs           = @("hg1","hg2","hg37","hg33","hg3","hg5","hg12","hg14","hg15","hg16","hg17","hg18","hg19","hg30","hg31","hgc")
        rifle_divs             = @("rf1","rf2","rf12","rf3","rf4","rf11","rf16","rf17","rf18","rf19","rf20","rfc")
        shotgun_divs           = @("sg1","sg2","sg3","sg4","sgc")
        pcc_divs               = @("pc1","pc2","pc3","pcc")
        air_divs               = @("ai1","ai2","ai3","ai3a","ai8","ai9","ai10","ai11","ai12","aic")
        mini_rifle_divs        = @("mr1","mr2","mr3","mrc")
        prec_rifle_divs        = @("rf1","rf2","rf12","rf3","rf4","rf11","rf16","rf17","rf18","rf19","rf20","rfc")
        tournament_divisions   = @("sop","sst","sml")

        # Additional settings
        merge_ss_with_s        = "true"
        multiple_reg_allowed   = "true"
        include_pcc_in_combined = "false"
        transfer_mode          = "no"
        state                  = ""
        url                    = ""
        url_display            = ""
    }

    try {
        $match = New-SSIEvent -Headers $headers -FormInput $matchData -Rule $Rule -SubRule $SubRule -Firearms $Firearms
        Write-Host "  SUCCESS: Created match ID $($match.id)  content_type=$($match.get_content_type_key)" -ForegroundColor Green
        Write-Host "  URL: $($match.get_full_absolute_url)" -ForegroundColor Gray

        $createdMatches += @{
            Name        = $matchName
            Id          = $match.id
            ContentType = $match.get_content_type_key
            Url         = $match.get_full_absolute_url
            Type        = $md.Type
        }
    }
    catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Tried rule='$Rule', sub_rule='$SubRule'" -ForegroundColor Yellow
        Write-Host "  If this fails, try different -Rule / -SubRule values" -ForegroundColor Yellow
    }

    Start-Sleep -Milliseconds 500
}
#endregion

#region Create Squads for Each Match (via web form POST)
Write-Host "`n--- Creating Squads ---" -ForegroundColor Yellow

# Web session needed for squad creation (no GraphQL mutation exists)
Write-Host "  Logging in to SSI web for squad creation..." -ForegroundColor Gray
try {
    $webSession = Connect-SSIWeb -Email $Email -Password $Password
    Write-Host "  Web session ready." -ForegroundColor Green
}
catch {
    Write-Host "  ERROR: Web login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Squads must be created manually via SSI web UI." -ForegroundColor Yellow
    $webSession = $null
}

$squadDefs = @(
    @{ Name = "Squad 1"; Max = 10 },
    @{ Name = "Squad 2"; Max = 10 },
    @{ Name = "Squad 3"; Max = 10 },
    @{ Name = "Squad 4"; Max = 10 },
    @{ Name = "Trainer Squad"; Max = 10; Registration = "os" }
)

if ($webSession) {
    foreach ($match in $createdMatches) {
        Write-Host "`n  Squads for $($match.Name) (ID: $($match.Id)):" -ForegroundColor Gray

        foreach ($sq in $squadDefs) {
            try {
                $reg = if ($sq.Registration) { $sq.Registration } else { "aa" }
                New-SSIWebSquad -Session $webSession `
                    -EventId $match.Id `
                    -ContentType $match.ContentType `
                    -MaxCompetitors $sq.Max `
                    -Comment $sq.Name `
                    -Registration $reg | Out-Null
                Write-Host "    OK: $($sq.Name) (max: $($sq.Max))" -ForegroundColor Green
            }
            catch {
                Write-Host "    ERROR: $($sq.Name): $($_.Exception.Message)" -ForegroundColor Red
            }
        }

        Start-Sleep -Milliseconds 300
    }
}
#endregion

#region Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "     SRA TEST MATCHES — SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nCreated $($createdMatches.Count) / 4 matches:" -ForegroundColor Yellow
foreach ($m in $createdMatches) {
    Write-Host "  - $($m.Name): $($m.Url)" -ForegroundColor White
}

Write-Host "`nSquads per match: $($squadDefs.Count) (4 shooter + 1 trainer)" -ForegroundColor Yellow

Write-Host "`nTo delete test matches:" -ForegroundColor Cyan
Write-Host "  .\Remove-SRATestMatches.ps1" -ForegroundColor White
#endregion
