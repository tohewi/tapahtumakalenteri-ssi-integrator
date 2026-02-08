<#
.SYNOPSIS
    Scrapes any authenticated SSI web page by logging in and fetching HTML content.

.DESCRIPTION
    Logs in to shootnscoreit.com using credentials from the GraphQL config file,
    then fetches the specified page URL and outputs the HTML content.
    Useful for discovering page structures, data fields, and API patterns.

.PARAMETER Path
    The SSI page path to scrape (e.g. "/event/136/160/staff/")

.PARAMETER BaseUri
    SSI base URL. Defaults to https://shootnscoreit.com

.PARAMETER ConfigPath
    Path to the api-key.yml config file with credentials.
    Defaults to ../scripts-graphql/config/api-key.yml relative to this script.

.PARAMETER Raw
    If set, outputs the raw HTML. Otherwise outputs a cleaned text summary.

.EXAMPLE
    .\Get-SSIPage.ps1 -Path "/event/136/160/staff/"

.EXAMPLE
    .\Get-SSIPage.ps1 -Path "/event/136/160/staff/" -Raw | Out-File staff.html

.OUTPUTS
    String (HTML content or cleaned text)
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [string]$BaseUri = "https://shootnscoreit.com",

    [string]$ConfigPath = "",

    [switch]$Raw
)

$ErrorActionPreference = "Stop"

# Resolve config path
if (-not $ConfigPath) {
    $ConfigPath = Join-Path $PSScriptRoot "..\scripts-graphql\config\api-key.yml"
}

if (-not (Test-Path $ConfigPath)) {
    throw "Config file not found at $ConfigPath"
}

# Parse YAML-like config (simple key: value format)
$config = @{}
foreach ($line in (Get-Content $ConfigPath)) {
    if ($line -match '^\s*(\w+)\s*:\s*"?([^"#]+)"?\s*$') {
        $config[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

if (-not $config.email -or -not $config.password) {
    throw "Config file must contain 'email' and 'password' fields"
}

# Create web session
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.Cookies.Add((New-Object System.Net.Cookie("django_language", "en", "/", "shootnscoreit.com")))

# Get login page for CSRF token
Write-Host "Logging in to SSI..." -ForegroundColor Cyan
$loginPageUrl = "$BaseUri/login/"
$loginPage = Invoke-WebRequest -Uri $loginPageUrl -WebSession $session -UseBasicParsing

$csrfToken = $null
if ($loginPage.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
    $csrfToken = $Matches[1]
}

# Login
$loginBody = @{
    "username" = $config.email
    "password" = $config.password
    "keep"     = "on"
}
if ($csrfToken) {
    $loginBody["csrfmiddlewaretoken"] = $csrfToken
}

$loginUrl = "$BaseUri/login/?next=/dashboard/"
$loginHeaders = @{
    "Origin"  = $BaseUri
    "Referer" = "$BaseUri/login/?next=/dashboard/"
}

try {
    Invoke-WebRequest -Uri $loginUrl -Method POST -WebSession $session `
        -Body $loginBody -Headers $loginHeaders `
        -ContentType "application/x-www-form-urlencoded" `
        -MaximumRedirection 0 -ErrorAction SilentlyContinue | Out-Null
}
catch {
    # 302 redirect is expected on successful login
    if ($_.Exception.Response.StatusCode -ne 302 -and $_.Exception.Response.StatusCode -ne "Found") {
        $sessionCookie = $session.Cookies.GetCookies($BaseUri) | Where-Object { $_.Name -eq "sessionid" }
        if (-not $sessionCookie) {
            throw "Login failed: $_"
        }
    }
}

Write-Host "Logged in. Fetching $Path ..." -ForegroundColor Green

# Fetch the target page
$url = "$BaseUri$Path"
$response = Invoke-WebRequest -Uri $url -WebSession $session -UseBasicParsing

if ($Raw) {
    Write-Output $response.Content
}
else {
    # Output a cleaned text version: strip tags, collapse whitespace
    $text = $response.Content -replace '<script[^>]*>[\s\S]*?</script>', ''
    $text = $text -replace '<style[^>]*>[\s\S]*?</style>', ''
    $text = $text -replace '<[^>]+>', "`n"
    $text = $text -replace '&nbsp;', ' '
    $text = $text -replace '&amp;', '&'
    $text = $text -replace '&lt;', '<'
    $text = $text -replace '&gt;', '>'
    $text = $text -replace '&#39;', "'"
    $text = $text -replace '&quot;', '"'
    # Collapse multiple blank lines
    $text = ($text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }) -join "`n"
    Write-Output $text
}
