<#
.SYNOPSIS
    Creates a Kupittaa RESUL CUP with three child matches (Tarkkuus, Pika, Kuvio)

.DESCRIPTION
    This script creates a RESUL CUP event on shootnscoreit.com for a given date,
    then creates three child matches linked to that Cup.

.PARAMETER Date
    Match date in dd-mm-yyyy format

.PARAMETER SessionId
    Browser session ID cookie value for authentication

.PARAMETER OrganizerId
    Organizer ID (default: 1215 for toShootOrNot)

.EXAMPLE
    .\New-KupittaaCup.ps1 -Date "25-01-2026" -SessionId "your-session-id"
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^\d{2}-\d{2}-\d{4}$")]
    [string]$Date,  # dd-mm-yyyy format

    [Parameter(Mandatory = $true)]
    [string]$SessionId,

    [string]$BaseUri = "https://shootnscoreit.com",
    [string]$GroupId = "xxx",
    [string]$OrganizerId = "1215"
)

# Parse the date
$dateObj = [DateTime]::ParseExact($Date, "dd-MM-yyyy", $null)
$isoDate = $dateObj.ToString("yyyy-MM-dd")
$displayDate = $dateObj.ToString("dd.MM.yyyy")

# Registration starts one week before the Cup
$regStartDateObj = $dateObj.AddDays(-7)
$regStartDate = $regStartDateObj.ToString("yyyy-MM-dd")

# Default times per requirements
$startTime = "09:00"
$endTime = "12:00"

Write-Host "Creating Kupittaa Cup for $displayDate" -ForegroundColor Cyan

# Create web session with cookies
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$uriObj = [Uri]$BaseUri
$session.Cookies.Add((New-Object System.Net.Cookie("sessionid", $SessionId, "/", $uriObj.Host)))
$session.Cookies.Add((New-Object System.Net.Cookie("django_language", "en", "/", $uriObj.Host)))

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

#region Create RESUL CUP
Write-Host "`n--- Creating RESUL CUP ---" -ForegroundColor Yellow

$cupUrl = "$BaseUri/series/nordic/create-resul-cup/"
$cupName = "TEST TurRes Kupittan Reserviläisammunta CUP $displayDate"

$csrf = Get-CsrfToken -Session $session -Url $cupUrl -UriObj $uriObj

$cupBody = @{
    "csrfmiddlewaretoken" = $csrf.Token
    "group" = $GroupId
    "name" = $cupName
    "organizer" = $OrganizerId
    "visibility" = "res"  # Restricted
    "status" = "on"
    "results" = "cmp"  # Results shown only to participants
    "registration" = "op"
    "max_competitors" = "25"
    "description" = ""
    "region" = "FIN"
    
    # Required Cup-specific fields (missing these caused validation errors)
    "scoring_mode" = "pts"  # Series-points is same as component-match points
    "match_registration_mode" = "all"  # Auto-register to all component matches
    "has_accepted_event_data_ass_agreement" = "on"  # Required checkbox
    "count" = "3"  # Best #matches counted (we have 3 matches)
    
    # Dates/times
    "starts_date" = $isoDate
    "starts_time" = $startTime
    "ends_date" = $isoDate
    "ends_time" = $endTime
    "reg_start_date" = $regStartDate
    "reg_start_time" = "00:00"
    
    # Additional fields from form
    "timezone" = "Europe/Helsinki"
    "currency" = "EUR"
    "venue" = ""
    "url" = ""
    "url_display" = ""
    "reg_close_date" = ""
    "reg_close_time" = ""
    "sq_start_date" = ""
    "sq_start_time" = ""
    "sq_close_date" = ""
    "sq_close_time" = ""
    "pm_sq_start_date" = ""
    "pm_sq_start_time" = ""
    "imported" = ""
}

$cupArrayFields = @{
    "weapon_groups" = @("STD")  # Standard division
    "categories" = @("Open")  # Open category only per requirements
    "competence_classes" = @("1","2","3","D1","D2","D3","J1","J2","J3","VY","VO")
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
# The matches are: Tarkkuus, Pika, Kuvio
# Match type: 25m Pistooli Kuvio

$matchTypes = @(
    @{ Name = "Tarkkuus"; Suffix = "Tarkkuus" },
    @{ Name = "Pika"; Suffix = "Pika" },
    @{ Name = "Kuvio"; Suffix = "Kuvio" }
)

$matchUrl = "$BaseUri/nordic/create-resul-25-kuvio-pistol/"
$createdMatches = @()

foreach ($matchType in $matchTypes) {
    Write-Host "`n--- Creating Match: $($matchType.Name) (25m Pistooli Kuvio) ---" -ForegroundColor Yellow
    
    $matchName = "Kupittaa $displayDate $($matchType.Suffix)"
    
    # Get fresh CSRF token for each request
    $csrf = Get-CsrfToken -Session $session -Url $matchUrl -UriObj $uriObj
    
    $matchBody = @{
        "csrfmiddlewaretoken" = $csrf.Token
        "group" = $GroupId
        "name" = $matchName
        "organizer" = $OrganizerId
        "visibility" = "res"  # Restricted
        "status" = "on"
        "results" = "org"
        "registration" = "op"
        "max_competitors" = "25"
        "description" = ""
        "region" = "FIN"
        
        # 25m Pistooli Kuvio specific fields
        "layouts" = "6+SO"
        "precision_strings" = "6"
        "precision_shots_per_string" = "5"
        "string_scoring_format" = "110X"
        
        # Required fields (missing these caused validation errors)
        "level" = "tr"  # Training
        "has_accepted_event_data_ass_agreement" = "on"
        "number_of_team_members" = "3"
        "result_from_team_members" = "3"
        "prematch" = "no"
        "max_prematch_competitors" = "0"
        "verify_using" = "xxx"  # No verification (alternatives: sgn=Signature, pin=PIN code)
        
        # Dates/times
        "starts_date" = $isoDate
        "starts_time" = $startTime
        "reg_start_date" = $isoDate
        "reg_start_time" = "00:00"
        
        # Additional fields
        "timezone" = "Europe/Helsinki"
        "currency" = "EUR"
        "venue" = ""
        "url" = ""
        "url_display" = ""
        "ends_date" = ""
        "ends_time" = ""
        "reg_close_date" = ""
        "reg_close_time" = ""
        "sq_start_date" = ""
        "sq_start_time" = ""
        "sq_close_date" = ""
        "sq_close_time" = ""
        "pm_sq_start_date" = ""
        "pm_sq_start_time" = ""
        "imported" = ""
    }
    
    $matchArrayFields = @{
        "weapon_groups" = @("STD")  # Standard division (checked by default)
        "categories" = @("Open")  # Open category only per requirements
        "competence_classes" = @("1","2","3","D1","D2","D3","J1","J2","J3","VY","VO")
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
            Write-Host "SUCCESS: Created $($matchType.Name) at: $matchFinalUrl" -ForegroundColor Green
            $matchEventInfo = Get-EventIdFromUrl -Url $matchFinalUrl
            $createdMatches += @{
                Name = $matchType.Name
                Url = $matchFinalUrl
                EventId = $matchEventInfo.EventId
            }
        } else {
            Write-Host "FAILED: $($matchType.Name) creation failed. Final URL: $matchFinalUrl" -ForegroundColor Red
            $matchResponse.Content | Out-File -FilePath "debug-match-response.html" -Encoding UTF8
            Write-Host "Response saved to debug-match-response.html" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "ERROR creating $($matchType.Name): $($_.Exception.Message)" -ForegroundColor Red
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

#region Summary
Write-Host "`nCup: $cupFinalUrl" -ForegroundColor Green

Write-Host "`nMatches created and linked:" -ForegroundColor Yellow
foreach ($match in $createdMatches) {
    $linkStatus = if ($match.Linked) { "[LINKED]" } else { "[NOT LINKED]" }
    Write-Host "  - $($match.Name): $($match.Url) $linkStatus" -ForegroundColor White
}
#endregion
