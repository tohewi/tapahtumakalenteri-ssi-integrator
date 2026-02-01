<#
.SYNOPSIS
    Creates a new event in the Turun Reservilaiset WordPress event calendar.

.DESCRIPTION
    Creates a new event (tapahtuma) as a draft in the WordPress calendar.
    The event includes standard Kupittaa Cup information and a link to the SSI Cup.

.PARAMETER Session
    Authenticated WordPress WebRequestSession from Connect-WordPress.ps1

.PARAMETER Title
    Event title (e.g., "Kupittaan ampumavuoro 31.01.2026")

.PARAMETER Date
    Event date as DateTime object

.PARAMETER StartTime
    Start time string (default: "09.00")

.PARAMETER EndTime
    End time string (default: "12.00")

.PARAMETER ShortDescription
    Short description/excerpt for the event

.PARAMETER Content
    Full HTML content for the event

.PARAMETER Location
    Event location address

.PARAMETER SsiCupUrl
    URL to the SSI Cup event (for cross-reference)

.PARAMETER BaseUri
    WordPress site URL

.EXAMPLE
    $event = .\New-TapahtumakalenteriEvent.ps1 -Session $wpSession -Title "Kupittaan ampumavuoro 31.01.2026" -Date (Get-Date "2026-01-31")

.OUTPUTS
    PSCustomObject with EventId and EventUrl
#>

param(
    [Parameter(Mandatory = $true)]
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,

    [Parameter(Mandatory = $true)]
    [string]$Title,

    [Parameter(Mandatory = $true)]
    [datetime]$Date,

    [string]$StartTime = "09.00",
    [string]$EndTime = "12.00",

    [string]$ShortDescription,
    [string]$Content,
    [string]$Location = "Kupittaan urheiluhallin ampumarata",
    [string]$MapLink = "",
    [string]$SsiCupUrl = "",
    [int]$SsiCupId = 0,
    
    # Event format taxonomy IDs (e.g., 50 = Pistooli, 52 = Prosenttiammunta)
    [int[]]$EventFormatTaxonomyIds = @(),

    [string]$BaseUri = "https://turun-reservialiupseerit-turun-reservilaiset.reservilaisliitto.fi"
)

$ErrorActionPreference = "Stop"

# ACF Field Keys (from WordPress form analysis)
$ACF_FIELDS = @{
    ShortDescription = "field_5d3e9d9626a82"      # Lyhyt kuvaus (textarea)
    Content = "field_5d3e9dc926a83"               # Sisältö (wysiwyg)
    StartDate = "field_5d3e9ddc26a84"             # Alkamispäivä (date YYYYMMDD)
    EndDate = "field_5d3e9e5f26a85"               # Päättymispäivä (date YYYYMMDD)
    Time = "field_62949bdcbb12e"                  # Aika (text)
    LocationGroup = "field_5d3e9efab663d"         # Tapahtuman sijainti (group)
    LocationAddress = "field_5d3e9f0fb663e"       # Osoite (textarea, nested)
    LocationMapLink = "field_5d3e9f28b663f"       # Karttalinkki (url, nested)
    AddRegistrationForm = "field_5f080bdf06c9a"   # Lisää ilmoittautumislomake (checkbox)
    RegistrationEmail = "field_5f080c0306c9b"     # Sähköpostiosoite (email)
    ShotsFired = "field_4k2esk3rske32"            # Ammuttujen laukausten lukumäärä (number)
    AttendeeCount = "field_6j3ak3kj2kjs2"         # Osallistujien lukumäärä (number)
    EventCount = "field_4k3ak3sj2kj6b"            # Tapahtumien lukumäärä (number)
}

Write-Host "Creating calendar event: $Title" -ForegroundColor Cyan

# Step 1: Get the new event form page to obtain nonce and post ID
$newEventUrl = "$BaseUri/wp-admin/post-new.php?post_type=event"
Write-Host "  Fetching new event form..." -ForegroundColor Gray

try {
    $formPage = Invoke-WebRequest -Uri $newEventUrl -WebSession $Session -UseBasicParsing
}
catch {
    Write-Error "Could not fetch new event form: $_"
    return $null
}

# Extract required tokens from the form
$wpNonce = ""
$postId = ""
$acfNonce = ""

if ($formPage.Content -match 'id="_wpnonce"\s+name="_wpnonce"\s+value="([^"]+)"') {
    $wpNonce = $Matches[1]
}
if ($formPage.Content -match "id='post_ID'\s+name='post_ID'\s+value='(\d+)'" -or
    $formPage.Content -match 'id="post_ID"\s+name="post_ID"\s+value="(\d+)"') {
    $postId = $Matches[1]
}
if ($formPage.Content -match 'id="_acf_nonce"\s+name="_acf_nonce"\s+value="([^"]+)"') {
    $acfNonce = $Matches[1]
}

if (-not $wpNonce -or -not $postId) {
    Write-Error "Could not extract required form tokens (wpNonce: $wpNonce, postId: $postId)"
    return $null
}

Write-Host "  Post ID: $postId" -ForegroundColor Gray

# Step 2: Format the date and generate permalink
$dateFormatted = $Date.ToString("yyyyMMdd")
$timeString = "Klo $StartTime-$EndTime"

# Generate permalink slug with SSI Cup ID if provided
# Format: kupittaan-ampumavuoro-14-02-2026-cup141
$dateSlug = $Date.ToString("dd-MM-yyyy")
$postSlug = "kupittaan-ampumavuoro-$dateSlug"
if ($SsiCupId -gt 0) {
    $postSlug = "$postSlug-cup$SsiCupId"
}

# Step 3: Build the form data
$formData = @{
    # WordPress core fields
    "_wpnonce" = $wpNonce
    "_wp_http_referer" = "/wp-admin/post-new.php?post_type=event"
    "user_ID" = "904"
    "action" = "editpost"
    "originalaction" = "editpost"
    "post_author" = "904"
    "post_type" = "event"
    "original_post_status" = "auto-draft"
    "post_ID" = $postId
    "post_title" = $Title
    "post_name" = $postSlug  # Permalink slug (e.g., kupittaan-ampumavuoro-14-02-2026-cup141)
    "post_status" = "draft"  # Create as draft (safe for production)
    
    # ACF fields
    "_acf_screen" = "post"
    "_acf_post_id" = $postId
    "_acf_validation" = "1"
    "_acf_nonce" = $acfNonce
    "_acf_changed" = "1"
    
    # Event-specific ACF fields
    "acf[$($ACF_FIELDS.ShortDescription)]" = $ShortDescription
    "acf[$($ACF_FIELDS.Content)]" = $Content
    "acf[$($ACF_FIELDS.StartDate)]" = $dateFormatted
    "acf[$($ACF_FIELDS.EndDate)]" = $dateFormatted
    "acf[$($ACF_FIELDS.Time)]" = $timeString
    "acf[$($ACF_FIELDS.LocationGroup)][$($ACF_FIELDS.LocationAddress)]" = $Location
    "acf[$($ACF_FIELDS.LocationGroup)][$($ACF_FIELDS.LocationMapLink)]" = $MapLink
    "acf[$($ACF_FIELDS.AddRegistrationForm)]" = "0"  # No registration form needed
}

# Add event format taxonomy if provided
if ($EventFormatTaxonomyIds.Count -gt 0) {
    $formData["tax_input[eventformat][]"] = $EventFormatTaxonomyIds | ForEach-Object { $_.ToString() }
}

# Step 4: Submit the form
$postUrl = "$BaseUri/wp-admin/post.php"
$headers = @{
    "Origin" = $BaseUri
    "Referer" = $newEventUrl
}

Write-Host "  Submitting event as draft..." -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri $postUrl `
        -Method POST `
        -WebSession $Session `
        -Body $formData `
        -Headers $headers `
        -ContentType "application/x-www-form-urlencoded" `
        -MaximumRedirection 5
}
catch {
    Write-Error "Failed to create event: $_"
    return $null
}

# Step 5: Check for success and extract event URL
$eventUrl = ""
$eventEditUrl = ""

# Check if we got redirected to the edit page (success indicator)
if ($response.BaseResponse.RequestMessage.RequestUri -match "post=(\d+)") {
    $createdPostId = $Matches[1]
    $eventEditUrl = "$BaseUri/wp-admin/post.php?post=$createdPostId&action=edit"
    $eventUrl = "$BaseUri/?post_type=event&p=$createdPostId&preview=true"
    
    Write-Host "SUCCESS: Event created as draft" -ForegroundColor Green
    Write-Host "  Event ID: $createdPostId" -ForegroundColor Gray
    Write-Host "  Edit URL: $eventEditUrl" -ForegroundColor Gray
    Write-Host "  Preview URL: $eventUrl" -ForegroundColor Gray
    
    return [PSCustomObject]@{
        EventId = $createdPostId
        EventUrl = $eventUrl
        EditUrl = $eventEditUrl
        Status = "draft"
        Title = $Title
        Date = $Date
    }
}
elseif ($response.Content -match "message=(\d+)") {
    # WordPress shows message codes for success
    $messageCode = $Matches[1]
    if ($messageCode -eq "10" -or $messageCode -eq "1") {
        # 10 = draft saved, 1 = post updated
        Write-Host "SUCCESS: Event created as draft (Post ID: $postId)" -ForegroundColor Green
        $eventEditUrl = "$BaseUri/wp-admin/post.php?post=$postId&action=edit"
        $eventUrl = "$BaseUri/?post_type=event&p=$postId&preview=true"
        
        return [PSCustomObject]@{
            EventId = $postId
            EventUrl = $eventUrl
            EditUrl = $eventEditUrl
            Status = "draft"
            Title = $Title
            Date = $Date
        }
    }
}

# If we get here, something might have gone wrong
Write-Warning "Event may have been created but could not confirm. Check WordPress admin."
Write-Host "  Response URL: $($response.BaseResponse.RequestMessage.RequestUri)" -ForegroundColor Yellow

return [PSCustomObject]@{
    EventId = $postId
    EventUrl = "$BaseUri/?post_type=event&p=$postId&preview=true"
    EditUrl = "$BaseUri/wp-admin/post.php?post=$postId&action=edit"
    Status = "unknown"
    Title = $Title
    Date = $Date
}
