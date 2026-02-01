<#
.SYNOPSIS
    Authenticates to WordPress and returns a web session.

.DESCRIPTION
    Logs in to WordPress using username, password, and OTP (email-based 2FA),
    returning a WebRequestSession object with the session cookies for 
    subsequent API calls.

.PARAMETER Username
    WordPress account username.

.PARAMETER Password
    WordPress account password.

.PARAMETER OTP
    One-Time Password for two-factor authentication (optional, will prompt if needed).

.PARAMETER BaseUri
    WordPress site URL. Defaults to Turun Reservilaiset tapahtumakalenteri.

.EXAMPLE
    $session = .\Connect-WordPress.ps1 -Username "user" -Password "pass"

.OUTPUTS
    Microsoft.PowerShell.Commands.WebRequestSession
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Username,

    [Parameter(Mandatory = $true)]
    [string]$Password,

    [Parameter(Mandatory = $false)]
    [string]$OTP,

    [Parameter(Mandatory = $false)]
    [string]$BaseUri = "https://turun-reservialiupseerit-turun-reservilaiset.reservilaisliitto.fi"
)

$ErrorActionPreference = "Stop"

Write-Host "Connecting to WordPress at $BaseUri..." -ForegroundColor Cyan

# Create a new web session
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$uriObj = [System.Uri]$BaseUri

# Step 1: Get the login page to obtain cookies and any required tokens
$loginPageUrl = "$BaseUri/wp-login.php"
try {
    Write-Host "  Fetching login page..." -ForegroundColor Gray
    $loginPage = Invoke-WebRequest -Uri $loginPageUrl -WebSession $session -UseBasicParsing
}
catch {
    Write-Error "Could not fetch login page: $_"
    return $null
}

# Step 2: Build login form data
$loginBody = @{
    "log" = $Username
    "pwd" = $Password
    "wp-submit" = "Kirjaudu sisään"
    "redirect_to" = "$BaseUri/wp-admin/"
    "testcookie" = "1"
}

# Add test cookie
$session.Cookies.Add((New-Object System.Net.Cookie("wordpress_test_cookie", "WP%20Cookie%20check", "/", $uriObj.Host)))

# Step 3: Perform login
$loginUrl = "$BaseUri/wp-login.php"
$headers = @{
    "Origin" = $BaseUri
    "Referer" = $loginPageUrl
}

Write-Host "  Submitting credentials..." -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri $loginUrl `
        -Method POST `
        -WebSession $session `
        -Body $loginBody `
        -Headers $headers `
        -ContentType "application/x-www-form-urlencoded" `
        -MaximumRedirection 5
}
catch {
    # Invoke-WebRequest may throw on redirects
    $response = $null
}

# Step 4: Check if 2FA is required (email-based)
$cookies = $session.Cookies.GetCookies($uriObj)
$hasAuthCookie = $cookies | Where-Object { $_.Name -like "wordpress_logged_in_*" }

if (-not $hasAuthCookie) {
    # Check if the login response contains 2FA form, or fetch the page again
    $currentPage = $response
    if (-not $currentPage -or -not $currentPage.Content) {
        $currentPage = Invoke-WebRequest -Uri $loginUrl -WebSession $session -ErrorAction SilentlyContinue
    }
    
    # Check for email-based 2FA (Two-Factor plugin)
    if ($currentPage -and $currentPage.Content -and 
        ($currentPage.Content -match "two-factor-email-code" -or 
         $currentPage.Content -match "Varmennuskoodi")) {
            
            Write-Host "  Email-based 2FA detected." -ForegroundColor Yellow
            
            # Extract hidden form fields from 2FA page for resend functionality
            $provider = "Two_Factor_Email"
            $wpAuthId = ""
            $wpAuthNonce = ""
            if ($currentPage.Content -match 'name="wp-auth-id"[^>]*value="([^"]+)"') {
                $wpAuthId = $Matches[1]
            }
            if ($currentPage.Content -match 'name="wp-auth-nonce"[^>]*value="([^"]+)"') {
                $wpAuthNonce = $Matches[1]
            }
            
            # Auto-send OTP before first prompt (WordPress doesn't always send on initial login)
            Write-Host "  Waiting 3 seconds before requesting code..." -ForegroundColor Gray
            Start-Sleep -Seconds 3
            
            # Send initial OTP
            Write-Host "  Sending verification code to your email..." -ForegroundColor Yellow
            $resendBody = @{
                "provider" = $provider
                "wp-auth-id" = $wpAuthId
                "wp-auth-nonce" = $wpAuthNonce
                "redirect_to" = "$BaseUri/wp-admin/"
                "rememberme" = "0"
                "two-factor-email-code-resend" = "Lähetä koodi uudelleen"
            }
            try {
                $resendResponse = Invoke-WebRequest -Uri "$BaseUri/wp-login.php?action=validate_2fa" `
                    -Method POST `
                    -WebSession $session `
                    -Body $resendBody `
                    -Headers $headers `
                    -ContentType "application/x-www-form-urlencoded" `
                    -MaximumRedirection 5 `
                    -ErrorAction SilentlyContinue
                
                # Update nonce from resend response
                if ($resendResponse.Content -match 'name="wp-auth-nonce"[^>]*value="([^"]+)"') {
                    $wpAuthNonce = $Matches[1]
                }
            }
            catch {
                # Ignore errors
            }
            Write-Host "  Code sent. Check your email." -ForegroundColor Green
            
            # Retry loop for OTP submission (max 2 attempts)
            $maxAttempts = 2
            $attempt = 0
            $otpSuccess = $false
            
            while ($attempt -lt $maxAttempts -and -not $otpSuccess) {
                $attempt++
                
                if ($attempt -gt 1) {
                    # Resend OTP code after failed attempt
                    Write-Host "  Resending verification code..." -ForegroundColor Yellow
                    $resendBody = @{
                        "provider" = $provider
                        "wp-auth-id" = $wpAuthId
                        "wp-auth-nonce" = $wpAuthNonce
                        "redirect_to" = "$BaseUri/wp-admin/"
                        "rememberme" = "0"
                        "two-factor-email-code-resend" = "Lähetä koodi uudelleen"
                    }
                    try {
                        $resendResponse = Invoke-WebRequest -Uri "$BaseUri/wp-login.php?action=validate_2fa" `
                            -Method POST `
                            -WebSession $session `
                            -Body $resendBody `
                            -Headers $headers `
                            -ContentType "application/x-www-form-urlencoded" `
                            -MaximumRedirection 5 `
                            -ErrorAction SilentlyContinue
                        
                        # Update nonce from resend response
                        if ($resendResponse.Content -match 'name="wp-auth-nonce"[^>]*value="([^"]+)"') {
                            $wpAuthNonce = $Matches[1]
                        }
                    }
                    catch {
                        # Ignore errors
                    }
                    Write-Host "  New code sent. Check your email." -ForegroundColor Green
                }
                
                # Prompt for OTP
                if (-not $OTP -or $attempt -gt 1) {
                    Write-Host "  Enter the 8-digit code from your email (attempt $attempt/$maxAttempts):" -ForegroundColor Cyan
                    Write-Host "  (Press Enter without code to resend)" -ForegroundColor Gray
                    $OTP = Read-Host "  Code"
                    
                    # If empty, trigger resend
                    if ([string]::IsNullOrWhiteSpace($OTP)) {
                        Write-Host "  No code entered. Will resend..." -ForegroundColor Yellow
                        continue
                    }
                }
                
                # Build 2FA form data for email-based verification (include all hidden fields)
                $otpBody = @{
                    "provider" = $provider
                    "wp-auth-id" = $wpAuthId
                    "wp-auth-nonce" = $wpAuthNonce
                    "redirect_to" = "$BaseUri/wp-admin/"
                    "rememberme" = "0"
                    "two-factor-email-code" = $OTP
                    "submit" = "Varmista"
                }
                
                # The 2FA form posts to a different action URL
                $twoFactorUrl = "$BaseUri/wp-login.php?action=validate_2fa"
                
                Write-Host "  Submitting verification code..." -ForegroundColor Gray
                
                try {
                    $otpResponse = Invoke-WebRequest -Uri $twoFactorUrl `
                        -Method POST `
                        -WebSession $session `
                        -Body $otpBody `
                        -Headers $headers `
                        -ContentType "application/x-www-form-urlencoded" `
                        -MaximumRedirection 5 `
                        -ErrorAction SilentlyContinue
                }
                catch {
                    # May throw on redirect, which is expected on success
                }
                
                # Check if login succeeded
                $cookies = $session.Cookies.GetCookies($uriObj)
                $hasAuthCookie = $cookies | Where-Object { $_.Name -like "wordpress_logged_in_*" }
                if ($hasAuthCookie) {
                    $otpSuccess = $true
                }
                elseif ($attempt -lt $maxAttempts) {
                    Write-Host "  Code invalid or expired. Will resend..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 2
                }
            }
    }
    # Check for TOTP-based 2FA (authenticator app)
    elseif ($currentPage -and $currentPage.Content -and
            ($currentPage.Content -match "two-factor-totp-authcode" -or 
             $currentPage.Content -match "authenticator")) {
            
            Write-Host "  Authenticator-based 2FA detected." -ForegroundColor Yellow
            
            if (-not $OTP) {
                $OTP = Read-Host "  Enter the code from your authenticator app"
            }
            
            $otpBody = @{
                "two-factor-totp-authcode" = $OTP
                "wp-submit" = "Kirjaudu sisään"
                "redirect_to" = "$BaseUri/wp-admin/"
            }
            
            $twoFactorUrl = "$BaseUri/wp-login.php?action=validate_2fa"
            
            Write-Host "  Submitting verification code..." -ForegroundColor Gray
            
            try {
                $otpResponse = Invoke-WebRequest -Uri $twoFactorUrl `
                    -Method POST `
                    -WebSession $session `
                    -Body $otpBody `
                    -Headers $headers `
                    -ContentType "application/x-www-form-urlencoded" `
                    -MaximumRedirection 5 `
                    -ErrorAction SilentlyContinue
            }
            catch {
                # May throw on redirect
            }
    }
}

# Step 5: Verify login by checking for auth cookies
$cookies = $session.Cookies.GetCookies($uriObj)
$hasAuthCookie = $cookies | Where-Object { $_.Name -like "wordpress_logged_in_*" }

if ($hasAuthCookie) {
    Write-Host "SUCCESS: Logged in as $Username" -ForegroundColor Green
    return $session
}

# Step 6: Try to access wp-admin to verify login
try {
    $adminPage = Invoke-WebRequest -Uri "$BaseUri/wp-admin/" -WebSession $session -UseBasicParsing -MaximumRedirection 5
    
    if ($adminPage.Content -match "wp-admin" -and $adminPage.Content -notmatch "wp-login") {
        Write-Host "SUCCESS: Logged in as $Username" -ForegroundColor Green
        return $session
    }
}
catch {
    # Ignore errors here
}

# Check if login failed
Write-Error "Login failed. Please check your credentials and OTP."
Write-Host "  Tip: If 2FA is required, provide the -OTP parameter" -ForegroundColor Yellow
return $null
