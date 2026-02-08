<#
.SYNOPSIS
  Step 1: Register turreskuko1@foo.bar to CUP 158 via SSI admin web scraping.
  Performs search-and-add, then submits the registration confirmation form.
#>
param(
    [string]$Email = "turreskuko1@foo.bar",
    [int]$CupId = 158,
    [int]$ContentType = 136
)

$ErrorActionPreference = "Stop"

# Load admin credentials
$envFile = Join-Path $PSScriptRoot "..\scoring-proxy\.env"
$env = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^(\w+)=(.*)$') { $env[$Matches[1]] = $Matches[2] }
}
$adminEmail = $env['SSI_ADMIN_EMAIL']
$adminPassword = $env['SSI_ADMIN_PASSWORD']
$base = "https://shootnscoreit.com"

# 1. Login as admin
Write-Host "=== Step 1a: Admin login ===" -ForegroundColor Cyan
$loginUrl = "$base/login/?next=/dashboard/"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginPage = Invoke-WebRequest -Uri $loginUrl -SessionVariable session -UseBasicParsing
$loginBody = @{
    username = $adminEmail
    password = $adminPassword
    keep = "on"
}
try {
    $loginResp = Invoke-WebRequest -Uri $loginUrl -Method POST -Body $loginBody -WebSession $session -UseBasicParsing -MaximumRedirection 0
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 302) {
        Write-Host "  Login OK (302 redirect)" -ForegroundColor Green
    } else {
        throw
    }
}

# 2. Search for user
Write-Host "`n=== Step 1b: Search for $Email in CUP $CupId ===" -ForegroundColor Cyan
$searchUrl = "$base/event/$ContentType/$CupId/participant-search-and-add/"
$searchBody = @{
    last_name  = ""
    first_name = ""
    email      = $Email
    submit     = "Search"
}
$searchResp = Invoke-WebRequest -Uri $searchUrl -Method POST -Body $searchBody -WebSession $session -UseBasicParsing
Write-Host "  Search status: $($searchResp.StatusCode), $($searchResp.Content.Length) chars" -ForegroundColor Gray

# Check for "no results"
if ($searchResp.Content -match "no results|gave no results") {
    Write-Host "  USER NOT FOUND in SSI!" -ForegroundColor Red
    exit 1
}

# Save search result
$searchResp.Content | Out-File "test-harness/debug-step1-search.html" -Encoding UTF8
Write-Host "  Saved search result to debug-step1-search.html" -ForegroundColor Gray

# 3. Find register link
Write-Host "`n=== Step 1c: Find register link ===" -ForegroundColor Cyan
$registerLinks = [regex]::Matches($searchResp.Content, 'href="([^"]*register-participant/\d+/[^"]*)"')
if ($registerLinks.Count -eq 0) {
    $registerLinks = [regex]::Matches($searchResp.Content, 'href="([^"]*participant-search-and-add/\d+/register/[^"]*)"')
}
if ($registerLinks.Count -eq 0) {
    Write-Host "  No register link found!" -ForegroundColor Red
    Write-Host "  Saving HTML for analysis..." -ForegroundColor Yellow
    exit 1
}
$registerPath = $registerLinks[0].Groups[1].Value
$registerUrl = if ($registerPath.StartsWith("http")) { $registerPath } else { "$base$registerPath" }
Write-Host "  Register URL: $registerUrl" -ForegroundColor White

# 4. GET register page (confirmation form)
Write-Host "`n=== Step 1d: GET register confirmation page ===" -ForegroundColor Cyan
$regPage = Invoke-WebRequest -Uri $registerUrl -WebSession $session -UseBasicParsing
Write-Host "  Status: $($regPage.StatusCode), $($regPage.Content.Length) chars" -ForegroundColor Gray
$regPage.Content | Out-File "test-harness/debug-step1-regform.html" -Encoding UTF8
Write-Host "  Saved to debug-step1-regform.html" -ForegroundColor Gray

# 5. Extract all form fields and submit
Write-Host "`n=== Step 1e: Submit registration form ===" -ForegroundColor Cyan

# Extract hidden inputs
$hiddens = [regex]::Matches($regPage.Content, 'type="hidden"[^>]*name="([^"]*)"[^>]*value="([^"]*)"')
$formBody = @{}
foreach ($h in $hiddens) {
    $formBody[$h.Groups[1].Value] = $h.Groups[2].Value
    Write-Host "  hidden: $($h.Groups[1].Value) = $($h.Groups[2].Value)" -ForegroundColor DarkGray
}

# Extract selected options from selects
$selects = [regex]::Matches($regPage.Content, '<select[^>]*name="([^"]*)"[^>]*>([\s\S]*?)</select>')
foreach ($sel in $selects) {
    $selName = $sel.Groups[1].Value
    $selHtml = $sel.Groups[2].Value
    $selectedOpt = [regex]::Match($selHtml, '<option[^>]*value="([^"]*)"[^>]*selected')
    if ($selectedOpt.Success) {
        $formBody[$selName] = $selectedOpt.Groups[1].Value
        Write-Host "  select: $selName = $($selectedOpt.Groups[1].Value)" -ForegroundColor DarkGray
    }
}

# Required checkbox: has_accepted_event_data_policy
$formBody["has_accepted_event_data_policy"] = "on"
Write-Host "  checkbox: has_accepted_event_data_policy = on" -ForegroundColor DarkGray

# Submit button
$formBody["submit"] = "Register"
Write-Host "  submit: Register" -ForegroundColor DarkGray

# SSI anti-bot: form_loaded_at timestamp check — must wait before submitting
Write-Host "  Waiting 5 seconds (SSI anti-bot: form_loaded_at check)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "`n  Submitting to: $registerUrl" -ForegroundColor White
Write-Host "  Fields: $($formBody.Keys -join ', ')" -ForegroundColor Gray

$confirmStatus = 0
try {
    $confirmResp = Invoke-WebRequest -Uri $registerUrl -Method POST -Body $formBody -WebSession $session -UseBasicParsing -MaximumRedirection 0
    $confirmStatus = $confirmResp.StatusCode
} catch {
    $confirmStatus = $_.Exception.Response.StatusCode.value__
    $confirmResp = $null
}
Write-Host "  Confirm status: $confirmStatus" -ForegroundColor $(if ($confirmStatus -eq 302) { "Green" } else { "Yellow" })

if ($confirmStatus -eq 302) {
    Write-Host "`n  SUCCESS: turreskuko1 registered to CUP $CupId!" -ForegroundColor Green
} elseif ($confirmResp) {
    $confirmResp.Content | Out-File "test-harness/debug-step1-confirm.html" -Encoding UTF8
    Write-Host "  Saved confirm response to debug-step1-confirm.html" -ForegroundColor Yellow
    if ($confirmResp.Content -match "errorlist|text-danger") {
        $errMatch = [regex]::Match($confirmResp.Content, '<ul[^>]*(?:errorlist|text-danger)[^>]*>([\s\S]*?)</ul>')
        if ($errMatch.Success) {
            $errText = $errMatch.Groups[1].Value -replace '<[^>]+>','' -replace '\s+',' '
            Write-Host "  ERROR: $errText" -ForegroundColor Red
        }
    }
}

Write-Host "`nPlease check SSI to verify the user appears in CUP $CupId and its matches." -ForegroundColor Cyan
