<#
.SYNOPSIS
    Updates a Tapahtumakalenteri event with statistics from SSI Cup.

.DESCRIPTION
    Queries SSI for Cup participant count, calculates shots fired (participants × 100),
    and updates the corresponding WordPress calendar event.
    Finds the calendar event by searching for permalink containing cup{CupID}.

.PARAMETER CupId
    The SSI Cup ID to get statistics for.

.PARAMETER CupUrl
    The full SSI Cup URL (alternative to CupId - will extract ID from URL).

.PARAMETER WpSession
    Authenticated WordPress WebRequestSession from Connect-WordPress.ps1

.PARAMETER SsiSession
    Authenticated SSI WebRequestSession from Connect-SSI.ps1

.PARAMETER BaseUri
    WordPress site URL.

.EXAMPLE
    .\Update-TapahtumakalenteriEvent.ps1 -CupId 140 -WpSession $wpSession -SsiSession $ssiSession

.EXAMPLE
    .\Update-TapahtumakalenteriEvent.ps1 -CupUrl "https://shootnscoreit.com/event/136/140/" -WpSession $wpSession -SsiSession $ssiSession
#>

param(
    [Parameter(Mandatory = $true, ParameterSetName = "ById")]
    [Parameter(Mandatory = $true, ParameterSetName = "ByPostId")]
    [int]$CupId,

    [Parameter(Mandatory = $true, ParameterSetName = "ByUrl")]
    [string]$CupUrl,

    [Parameter(Mandatory = $true, ParameterSetName = "ByPostId")]
    [int]$WpPostId,

    [Parameter(Mandatory = $true)]
    [Microsoft.PowerShell.Commands.WebRequestSession]$WpSession,

    [Parameter(Mandatory = $true)]
    [Microsoft.PowerShell.Commands.WebRequestSession]$SsiSession,

    [string]$SsiBaseUri = "https://shootnscoreit.com",

    [string]$WpBaseUri = "https://turun-reservialiupseerit-turun-reservilaiset.reservilaisliitto.fi"
)

$ErrorActionPreference = "Stop"

# Load System.Web for URL encoding
Add-Type -AssemblyName System.Web

# Extract Cup ID from URL if provided
if ($PSCmdlet.ParameterSetName -eq "ByUrl") {
    if ($CupUrl -match '/event/\d+/(\d+)') {
        $CupId = [int]$Matches[1]
        Write-Host "Extracted Cup ID: $CupId from URL" -ForegroundColor Gray
    }
    else {
        Write-Error "Could not extract Cup ID from URL: $CupUrl"
        return $null
    }
}

Write-Host "`nUpdating Tapahtumakalenteri event for Cup ID: $CupId" -ForegroundColor Cyan

# Step 1: Query SSI for Cup participant count from participants page
Write-Host "`n--- Querying SSI for Cup Statistics ---" -ForegroundColor Yellow

# Fetch the participants page - more reliable than main Cup page
$participantsPageUrl = "$SsiBaseUri/event/136/$CupId/participants/"
try {
    $participantsPage = Invoke-WebRequest -Uri $participantsPageUrl -WebSession $SsiSession -Method GET
    
    # Count approved participants by looking for <abbr title="Approved">A</abbr>
    # This pattern is language-independent (works in Finnish and English)
    $approvedMatches = [regex]::Matches($participantsPage.Content, '<abbr title="Approved">A</abbr>')
    $participantCount = $approvedMatches.Count
    
    Write-Host "  Approved participants: $participantCount" -ForegroundColor Green
}
catch {
    Write-Error "Failed to query SSI participants page: $_"
    return $null
}

# Calculate shots fired (participants × 100)
$shotsFired = $participantCount * 100
Write-Host "  Shots fired (calculated): $shotsFired" -ForegroundColor Green

# Step 2: Find the WordPress calendar event
Write-Host "`n--- Finding Calendar Event ---" -ForegroundColor Yellow

$postId = $null

if ($WpPostId -gt 0) {
    # Use directly provided Post ID
    $postId = $WpPostId
    Write-Host "  Using provided Post ID: $postId" -ForegroundColor Green
}
else {
    # Search by permalink containing cup{ID}
    $searchSlug = "cup$CupId"
    Write-Host "  Searching for permalink containing: $searchSlug" -ForegroundColor Gray
    
    # Search WordPress posts for the event with matching slug
    $searchUrl = "$WpBaseUri/wp-admin/edit.php?post_type=event&s=$searchSlug"
    try {
        $searchPage = Invoke-WebRequest -Uri $searchUrl -WebSession $WpSession -Method GET
        
        # Find the post ID from the search results
        # Pattern: post.php?post=XXXX&action=edit
        if ($searchPage.Content -match 'post\.php\?post=(\d+)&amp;action=edit') {
            $postId = $Matches[1]
            Write-Host "  Found calendar event: Post ID $postId" -ForegroundColor Green
        }
        else {
            Write-Error "Could not find calendar event with permalink containing '$searchSlug'. Use -WpPostId parameter to specify directly."
            return $null
        }
    }
    catch {
        Write-Error "Failed to search WordPress: $_"
        return $null
    }
}

# Step 3: Get the event edit page to extract nonces
Write-Host "`n--- Updating Calendar Event ---" -ForegroundColor Yellow

$editUrl = "$WpBaseUri/wp-admin/post.php?post=$postId&action=edit"
try {
    $editPage = Invoke-WebRequest -Uri $editUrl -WebSession $WpSession -Method GET
    
    # Extract nonces
    $wpNonce = $null
    $acfNonce = $null
    
    if ($editPage.Content -match 'name="_wpnonce"\s+value="([^"]+)"') {
        $wpNonce = $Matches[1]
    }
    if ($editPage.Content -match 'name="_acf_nonce"\s+value="([^"]+)"') {
        $acfNonce = $Matches[1]
    }
    
    if (-not $wpNonce -or -not $acfNonce) {
        Write-Error "Could not extract nonces from edit page"
        return $null
    }
    
    Write-Host "  Extracted nonces" -ForegroundColor Gray
}
catch {
    Write-Error "Failed to get event edit page: $_"
    return $null
}

# Step 4: Build and submit the update form with ACF statistics fields
# ACF Field Keys (discovered from WordPress edit page):
# - field_4k2esk3rske32 = Ammuttujen laukausten lukumäärä (shots fired)
# - field_6j3ak3kj2kjs2 = Osallistujien lukumäärä (attendee count)
# - field_4k3ak3sj2kj6b = Tapahtumien lukumäärä (event count)

$formData = @{
    "_wpnonce" = $wpNonce
    "_wp_http_referer" = "/wp-admin/post.php?post=$postId&action=edit"
    "action" = "editpost"
    "originalaction" = "editpost"
    "post_type" = "event"
    "post_ID" = $postId
    "post_status" = "publish"  # Re-publish after updating statistics
    
    # ACF fields
    "_acf_screen" = "post"
    "_acf_post_id" = $postId
    "_acf_nonce" = $acfNonce
    "_acf_changed" = "1"
    
    # Statistics ACF fields
    "acf[field_4k2esk3rske32]" = $shotsFired.ToString()      # Ammuttujen laukausten lukumäärä
    "acf[field_6j3ak3kj2kjs2]" = $participantCount.ToString() # Osallistujien lukumäärä
    "acf[field_4k3ak3sj2kj6b]" = "1"                          # Tapahtumien lukumäärä (1 event)
}

# Build form body
$formBodyParts = @()
foreach ($key in $formData.Keys) {
    $encodedKey = [System.Web.HttpUtility]::UrlEncode($key)
    $encodedValue = [System.Web.HttpUtility]::UrlEncode($formData[$key])
    $formBodyParts += "$encodedKey=$encodedValue"
}
$formBody = $formBodyParts -join "&"

# Submit the update
$postUrl = "$WpBaseUri/wp-admin/post.php"
$headers = @{
    "Origin" = $WpBaseUri
    "Referer" = $editUrl
}

Write-Host "  Updating event with statistics..." -ForegroundColor Gray
Write-Host "    Participants: $participantCount" -ForegroundColor Gray
Write-Host "    Shots fired: $shotsFired" -ForegroundColor Gray

try {
    $updateResponse = Invoke-WebRequest -Uri $postUrl `
        -Method POST `
        -WebSession $WpSession `
        -Body $formBody `
        -Headers $headers `
        -ContentType "application/x-www-form-urlencoded" `
        -MaximumRedirection 5
    
    # Check if update was successful (redirects back to edit page)
    if ($updateResponse.StatusCode -eq 200 -or $updateResponse.BaseResponse.ResponseUri -match "post\.php") {
        Write-Host "`nSUCCESS: Event updated with statistics!" -ForegroundColor Green
        Write-Host "  Osallistujien lukumäärä: $participantCount" -ForegroundColor White
        Write-Host "  Ammuttujen laukausten lukumäärä: $shotsFired" -ForegroundColor White
        Write-Host "  Edit URL: $editUrl" -ForegroundColor Cyan
    }
    else {
        Write-Host "`nWARNING: Update may not have succeeded. Please verify manually." -ForegroundColor Yellow
        Write-Host "  Edit URL: $editUrl" -ForegroundColor Cyan
    }
}
catch {
    Write-Error "Failed to update event: $_"
    return $null
}

# Return statistics object
return [PSCustomObject]@{
    CupId = $CupId
    PostId = $postId
    ParticipantCount = $participantCount
    ShotsFired = $shotsFired
    EditUrl = $editUrl
    Status = "updated"
}
