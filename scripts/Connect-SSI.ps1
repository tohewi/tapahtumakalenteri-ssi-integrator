<#
.SYNOPSIS
    Authenticates to Shoot'n'ScoreIt (SSI) and returns a web session.

.DESCRIPTION
    Logs in to SSI using username and password, returning a WebRequestSession
    object with the session cookie for subsequent API calls.

.PARAMETER Username
    SSI account email/username.

.PARAMETER Password
    SSI account password (SecureString recommended).

.PARAMETER BaseUri
    SSI base URL. Defaults to https://shootnscoreit.com

.EXAMPLE
    $session = .\Connect-SSI.ps1 -Username "user@example.com" -Password "mypassword"
    
.EXAMPLE
    $securePass = Read-Host -AsSecureString "Password"
    $session = .\Connect-SSI.ps1 -Username "user@example.com" -SecurePassword $securePass

.OUTPUTS
    Microsoft.PowerShell.Commands.WebRequestSession
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Username,

    [Parameter(Mandatory = $true, ParameterSetName = "PlainText")]
    [string]$Password,

    [Parameter(Mandatory = $true, ParameterSetName = "Secure")]
    [SecureString]$SecurePassword,

    [Parameter(Mandatory = $false)]
    [string]$BaseUri = "https://shootnscoreit.com"
)

$ErrorActionPreference = "Stop"

# Convert SecureString to plain text if needed
if ($PSCmdlet.ParameterSetName -eq "Secure") {
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
}

Write-Host "Connecting to SSI..." -ForegroundColor Cyan

# Create a new web session
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.Cookies.Add((New-Object System.Net.Cookie("django_language", "en", "/", "shootnscoreit.com")))

# First, get the login page to obtain CSRF token (if required)
$loginPageUrl = "$BaseUri/login/"
try {
    $loginPage = Invoke-WebRequest -Uri $loginPageUrl -WebSession $session -UseBasicParsing
    
    # Check if CSRF token is in the form
    $csrfToken = $null
    if ($loginPage.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
        $csrfToken = $Matches[1]
        Write-Host "  CSRF token obtained" -ForegroundColor Gray
    }
}
catch {
    Write-Warning "Could not fetch login page: $_"
}

# Build login form data
$loginBody = @{
    "username" = $Username
    "password" = $Password
    "keep" = "on"
}

# Add CSRF token if found
if ($csrfToken) {
    $loginBody["csrfmiddlewaretoken"] = $csrfToken
}

# Perform login
$loginUrl = "$BaseUri/login/?next=/dashboard/"
$headers = @{
    "Origin" = $BaseUri
    "Referer" = "$BaseUri/login/?next=/dashboard/"
}

try {
    $response = Invoke-WebRequest -Uri $loginUrl `
        -Method POST `
        -WebSession $session `
        -Body $loginBody `
        -Headers $headers `
        -ContentType "application/x-www-form-urlencoded" `
        -MaximumRedirection 0 `
        -ErrorAction SilentlyContinue

    # Check for redirect (successful login redirects to dashboard)
    if ($response.StatusCode -eq 302 -or $response.StatusCode -eq 301) {
        Write-Host "SUCCESS: Logged in as $Username" -ForegroundColor Green
        return $session
    }
}
catch {
    # Invoke-WebRequest throws on 3xx redirects by default
    if ($_.Exception.Response.StatusCode -eq 302 -or $_.Exception.Response.StatusCode -eq "Found") {
        Write-Host "SUCCESS: Logged in as $Username" -ForegroundColor Green
        return $session
    }
    
    # Check if we actually got logged in despite the exception
    $sessionCookie = $session.Cookies.GetCookies($BaseUri) | Where-Object { $_.Name -eq "sessionid" }
    if ($sessionCookie) {
        Write-Host "SUCCESS: Logged in as $Username" -ForegroundColor Green
        return $session
    }
    
    Write-Error "Login failed: $_"
    return $null
}

# Verify login by checking for sessionid cookie
$sessionCookie = $session.Cookies.GetCookies($BaseUri) | Where-Object { $_.Name -eq "sessionid" }
if ($sessionCookie) {
    Write-Host "SUCCESS: Logged in as $Username" -ForegroundColor Green
    return $session
}

# Check if login failed (still on login page with error)
if ($response.Content -match "Please enter a correct email" -or 
    $response.Content -match "invalid" -or
    $response.Content -match "error") {
    Write-Error "Login failed: Invalid username or password"
    return $null
}

Write-Warning "Login status uncertain - no session cookie found"
return $session
