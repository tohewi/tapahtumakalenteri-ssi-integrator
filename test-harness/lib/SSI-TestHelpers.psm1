<#
.SYNOPSIS
    SSI web scraping helpers for test user management.
    All operations use web form POST (no GraphQL writes).

.DESCRIPTION
    Provides functions to:
    - Login to SSI (reuses existing Connect-SSI pattern)
    - Register new user accounts via web form
    - Update user profile (first name, last name)
    - Enroll user to a match
    - Assign user to a squad

    All functions follow the same pattern:
    1. GET the page to discover form fields and CSRF token
    2. POST the form with required data
    3. Verify success via redirect or page content
#>

$script:BaseUri = "https://shootnscoreit.com"

function Connect-SSIWeb {
    <#
    .SYNOPSIS
        Login to SSI and return a WebRequestSession with session cookie.
    .PARAMETER Email
        SSI account email.
    .PARAMETER Password
        SSI account password.
    .OUTPUTS
        Microsoft.PowerShell.Commands.WebRequestSession
    #>
    param(
        [Parameter(Mandatory)] [string]$Email,
        [Parameter(Mandatory)] [string]$Password
    )

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $session.Cookies.Add((New-Object System.Net.Cookie("django_language", "en", "/", "shootnscoreit.com")))

    # GET login page
    $loginPageUrl = "$script:BaseUri/login/?next=/dashboard/"
    $loginPage = Invoke-WebRequest -Uri $loginPageUrl -WebSession $session -UseBasicParsing

    $csrfToken = $null
    if ($loginPage.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
        $csrfToken = $Matches[1]
    }

    # POST login form
    $loginBody = @{
        username = $Email
        password = $Password
        keep     = "on"
    }
    if ($csrfToken) { $loginBody["csrfmiddlewaretoken"] = $csrfToken }

    $headers = @{
        Origin  = $script:BaseUri
        Referer = $loginPageUrl
    }

    try {
        $null = Invoke-WebRequest -Uri $loginPageUrl -Method POST -WebSession $session `
            -Body $loginBody -Headers $headers -ContentType "application/x-www-form-urlencoded" `
            -MaximumRedirection 0 -ErrorAction SilentlyContinue
    }
    catch {
        # 302 redirect = success
        if ($_.Exception.Response.StatusCode -eq 302 -or $_.Exception.Response.StatusCode -eq "Found") {
            return $session
        }
        $sessionCookie = $session.Cookies.GetCookies($script:BaseUri) | Where-Object { $_.Name -eq "sessionid" }
        if ($sessionCookie) { return $session }
        throw "Login failed for $Email`: $_"
    }

    $sessionCookie = $session.Cookies.GetCookies($script:BaseUri) | Where-Object { $_.Name -eq "sessionid" }
    if ($sessionCookie) { return $session }
    throw "Login failed for $Email - no session cookie"
}

function Register-SSIAccount {
    <#
    .SYNOPSIS
        Register a new SSI account via the web registration form.
    .DESCRIPTION
        Submits the SSI registration form at /register/.
        After registration, SSI may send a verification email to the address.
        If using email aliases (user+tag@domain), the email goes to the main inbox.
    .PARAMETER Email
        Email address for the new account.
    .PARAMETER Password
        Password for the new account (must meet SSI complexity requirements).
    .PARAMETER Region
        Region code (e.g., "FIN").
    .PARAMETER Timezone
        Timezone (e.g., "Europe/Helsinki").
    .PARAMETER Sex
        Sex: "m" or "f".
    .OUTPUTS
        [bool] $true if registration succeeded, $false otherwise.
    #>
    param(
        [Parameter(Mandatory)] [string]$Email,
        [Parameter(Mandatory)] [string]$Password,
        [string]$Region = "FIN",
        [string]$Timezone = "Europe/Helsinki",
        [string]$Sex = "m"
    )

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $session.Cookies.Add((New-Object System.Net.Cookie("django_language", "en", "/", "shootnscoreit.com")))

    # GET registration page to discover form fields
    $regUrl = "$script:BaseUri/register/"
    Write-Host "  GET $regUrl" -ForegroundColor Gray
    $regPage = Invoke-WebRequest -Uri $regUrl -WebSession $session -UseBasicParsing

    # Extract CSRF token
    $csrfToken = $null
    if ($regPage.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
        $csrfToken = $Matches[1]
    }

    # Dump available form fields for debugging
    $formFields = [regex]::Matches($regPage.Content, 'name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
    Write-Host "  Form fields: $($formFields -join ', ')" -ForegroundColor Gray

    # Build registration form data
    $regBody = @{
        email     = $Email
        password1 = $Password
        password2 = $Password
        region    = $Region
        timezone  = $Timezone
        sex       = $Sex
    }
    if ($csrfToken) { $regBody["csrfmiddlewaretoken"] = $csrfToken }

    $headers = @{
        Origin  = $script:BaseUri
        Referer = $regUrl
    }

    Write-Host "  POST $regUrl" -ForegroundColor Gray

    try {
        $response = Invoke-WebRequest -Uri $regUrl -Method POST -WebSession $session `
            -Body $regBody -Headers $headers -ContentType "application/x-www-form-urlencoded" `
            -MaximumRedirection 5 -ErrorAction Stop

        # Check response for success indicators
        if ($response.Content -match "verification" -or $response.Content -match "confirm" -or $response.Content -match "success") {
            Write-Host "  Registration submitted (check email for verification)" -ForegroundColor Green
            return $true
        }

        # Check for error messages
        if ($response.Content -match 'class="errorlist"') {
            $errors = [regex]::Matches($response.Content, '<li>([^<]+)</li>') | ForEach-Object { $_.Groups[1].Value }
            Write-Host "  Registration errors: $($errors -join '; ')" -ForegroundColor Red
            return $false
        }

        # If we got a 200 with no clear error, save debug output
        $debugFile = "debug-register-$($Email -replace '[^a-zA-Z0-9]', '_').html"
        $response.Content | Out-File $debugFile -Encoding UTF8
        Write-Host "  Unclear response — saved to $debugFile" -ForegroundColor Yellow
        return $false
    }
    catch {
        # 302 redirect after POST often means success
        if ($_.Exception.Response.StatusCode -eq 302 -or $_.Exception.Response.StatusCode -eq "Found") {
            Write-Host "  Registration submitted (redirect — check email)" -ForegroundColor Green
            return $true
        }
        Write-Host "  Registration failed: $_" -ForegroundColor Red
        return $false
    }
}

function Update-SSIProfile {
    <#
    .SYNOPSIS
        Update SSI user profile (first name, last name) via web form.
    .PARAMETER Session
        Authenticated WebRequestSession.
    .PARAMETER FirstName
        First name to set.
    .PARAMETER LastName
        Last name to set.
    #>
    param(
        [Parameter(Mandatory)] $Session,
        [Parameter(Mandatory)] [string]$FirstName,
        [Parameter(Mandatory)] [string]$LastName
    )

    # GET profile/settings page to discover form
    $profileUrl = "$script:BaseUri/settings/"
    Write-Host "  GET $profileUrl" -ForegroundColor Gray
    $profilePage = Invoke-WebRequest -Uri $profileUrl -WebSession $Session -UseBasicParsing

    $csrfToken = $null
    if ($profilePage.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
        $csrfToken = $Matches[1]
    }

    # Dump form fields for debugging
    $formFields = [regex]::Matches($profilePage.Content, 'name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
    Write-Host "  Profile form fields: $($formFields -join ', ')" -ForegroundColor Gray

    # Build profile update body — we need to discover what fields exist
    $profileBody = @{
        first_name = $FirstName
        last_name  = $LastName
    }
    if ($csrfToken) { $profileBody["csrfmiddlewaretoken"] = $csrfToken }

    $headers = @{
        Origin  = $script:BaseUri
        Referer = $profileUrl
    }

    try {
        $response = Invoke-WebRequest -Uri $profileUrl -Method POST -WebSession $Session `
            -Body $profileBody -Headers $headers -ContentType "application/x-www-form-urlencoded" `
            -MaximumRedirection 5 -ErrorAction Stop

        if ($response.Content -match 'class="errorlist"') {
            $errors = [regex]::Matches($response.Content, '<li>([^<]+)</li>') | ForEach-Object { $_.Groups[1].Value }
            Write-Host "  Profile update errors: $($errors -join '; ')" -ForegroundColor Red
            return $false
        }

        Write-Host "  Profile updated: $FirstName $LastName" -ForegroundColor Green
        return $true
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 302) {
            Write-Host "  Profile updated: $FirstName $LastName" -ForegroundColor Green
            return $true
        }
        Write-Host "  Profile update failed: $_" -ForegroundColor Red
        return $false
    }
}

function Register-ToMatch {
    <#
    .SYNOPSIS
        Register an authenticated user to a match via web form.
    .DESCRIPTION
        Navigates to the match registration page and submits the enrollment form.
        The exact URL pattern needs to be discovered (likely /event/{matchId}/register/ or similar).
    .PARAMETER Session
        Authenticated WebRequestSession.
    .PARAMETER MatchId
        The SSI match ID to register for.
    .PARAMETER WeaponGroup
        Weapon group code (e.g., "STD" for standard).
    .PARAMETER Category
        Category code (e.g., "RE" for regular).
    #>
    param(
        [Parameter(Mandatory)] $Session,
        [Parameter(Mandatory)] [string]$MatchId,
        [string]$WeaponGroup = "STD",
        [string]$Category = "RE"
    )

    # Try common SSI registration URL patterns
    $regUrls = @(
        "$script:BaseUri/event/93/$MatchId/register/"
        "$script:BaseUri/nordic/match/$MatchId/register/"
        "$script:BaseUri/series/nordic/$MatchId/register/"
    )

    foreach ($regUrl in $regUrls) {
        Write-Host "  Trying: GET $regUrl" -ForegroundColor Gray
        try {
            $regPage = Invoke-WebRequest -Uri $regUrl -WebSession $Session -UseBasicParsing -ErrorAction Stop
            Write-Host "  Found registration page at $regUrl" -ForegroundColor Green

            # Extract CSRF token
            $csrfToken = $null
            if ($regPage.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
                $csrfToken = $Matches[1]
            }

            # Dump form fields
            $formFields = [regex]::Matches($regPage.Content, 'name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
            Write-Host "  Registration form fields: $($formFields -join ', ')" -ForegroundColor Gray

            # Build registration body
            $regBody = @{
                weapon_group = $WeaponGroup
                category     = $Category
            }
            if ($csrfToken) { $regBody["csrfmiddlewaretoken"] = $csrfToken }

            $headers = @{
                Origin  = $script:BaseUri
                Referer = $regUrl
            }

            $response = Invoke-WebRequest -Uri $regUrl -Method POST -WebSession $Session `
                -Body $regBody -Headers $headers -ContentType "application/x-www-form-urlencoded" `
                -MaximumRedirection 5 -ErrorAction Stop

            if ($response.Content -match 'class="errorlist"') {
                $errors = [regex]::Matches($response.Content, '<li>([^<]+)</li>') | ForEach-Object { $_.Groups[1].Value }
                Write-Host "  Registration errors: $($errors -join '; ')" -ForegroundColor Red
                return $false
            }

            Write-Host "  Registered to match $MatchId" -ForegroundColor Green
            return $true
        }
        catch {
            if ($_.Exception.Response.StatusCode -eq 404) { continue }
            if ($_.Exception.Response.StatusCode -eq 302) {
                Write-Host "  Registered to match $MatchId (redirect)" -ForegroundColor Green
                return $true
            }
            Write-Host "  Error: $_" -ForegroundColor Yellow
        }
    }

    Write-Host "  Could not find registration page for match $MatchId" -ForegroundColor Red
    Write-Host "  Run Discover-MatchRegistration to find the correct URL pattern" -ForegroundColor Yellow
    return $false
}

function Find-MatchPages {
    <#
    .SYNOPSIS
        Discover available pages/URLs for a match by scraping the match page.
    .DESCRIPTION
        Fetches the match page and extracts all links to help find registration and squad URLs.
    .PARAMETER Session
        Authenticated WebRequestSession.
    .PARAMETER MatchId
        The SSI match ID.
    #>
    param(
        [Parameter(Mandatory)] $Session,
        [Parameter(Mandatory)] [string]$MatchId
    )

    # First, find the match URL via the event page
    $eventUrl = "$script:BaseUri/event/93/$MatchId/"
    Write-Host "  GET $eventUrl" -ForegroundColor Gray

    try {
        $page = Invoke-WebRequest -Uri $eventUrl -WebSession $Session -UseBasicParsing

        # Extract all links that contain the match ID or register/squad keywords
        $links = [regex]::Matches($page.Content, 'href="([^"]*)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique

        $relevant = $links | Where-Object {
            $_ -match "register" -or $_ -match "squad" -or $_ -match "enroll" -or
            $_ -match "signup" -or $_ -match $MatchId
        }

        Write-Host "`n  All links containing 'register', 'squad', or match ID:" -ForegroundColor Cyan
        $relevant | ForEach-Object { Write-Host "    $_" -ForegroundColor White }

        Write-Host "`n  All links on page:" -ForegroundColor Gray
        $links | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

        return $relevant
    }
    catch {
        Write-Host "  Failed to fetch match page: $_" -ForegroundColor Red

        # Also try the register button URL pattern from the screenshot
        # The "Register" button in SSI goes somewhere — let's try common patterns
        $tryUrls = @(
            "$script:BaseUri/event/93/$MatchId/"
            "$script:BaseUri/event/93/$MatchId/register/"
            "$script:BaseUri/nordic/match/$MatchId/"
            "$script:BaseUri/nordic/match/$MatchId/register/"
        )

        foreach ($url in $tryUrls) {
            try {
                $null = Invoke-WebRequest -Uri $url -WebSession $Session -UseBasicParsing -ErrorAction Stop
                Write-Host "  200 OK: $url" -ForegroundColor Green
            }
            catch {
                $status = $_.Exception.Response.StatusCode
                Write-Host "  $status`: $url" -ForegroundColor Gray
            }
        }
    }
}

function Find-DeactivationLink {
    <#
    .SYNOPSIS
        Discover the SSI account deactivation link for an authenticated user.
    .DESCRIPTION
        Scrapes the SSI settings/profile pages looking for the /deactivate-shooter/<token>/ link.
    .PARAMETER Session
        Authenticated WebRequestSession.
    .OUTPUTS
        [string] The deactivation URL, or $null if not found.
    #>
    param(
        [Parameter(Mandatory)] $Session
    )

    # Try common settings pages where deactivation link might appear
    $pagesToCheck = @(
        "$script:BaseUri/settings/"
        "$script:BaseUri/settings/account/"
        "$script:BaseUri/dashboard/"
        "$script:BaseUri/profile/"
        "$script:BaseUri/my-account/"
    )

    foreach ($pageUrl in $pagesToCheck) {
        try {
            $page = Invoke-WebRequest -Uri $pageUrl -WebSession $Session -UseBasicParsing -ErrorAction Stop
            $match = [regex]::Match($page.Content, 'href="(/deactivate-shooter/[^"]+)"')
            if ($match.Success) {
                $deactivateUrl = "$script:BaseUri$($match.Groups[1].Value)"
                return $deactivateUrl
            }
            # Also check for full URL
            $match = [regex]::Match($page.Content, '(https?://[^"]*deactivate-shooter/[^"]+)')
            if ($match.Success) {
                return $match.Groups[1].Value
            }
        }
        catch {
            # 404 or other error — skip this page
        }
    }

    return $null
}

function Disable-SSIAccount {
    <#
    .SYNOPSIS
        Deactivate an SSI account using the /deactivate-shooter/<token>/ endpoint.
    .DESCRIPTION
        Fetches the deactivation page and submits the confirmation form.
        WARNING: This is irreversible. The account will be deactivated.
    .PARAMETER Session
        Authenticated WebRequestSession.
    .PARAMETER DeactivationUrl
        The full deactivation URL (e.g., https://shootnscoreit.com/deactivate-shooter/xTuC3DLv8y/).
    .PARAMETER Confirm
        Must be set to $true to actually deactivate. Safety switch.
    .OUTPUTS
        [bool] $true if deactivation succeeded.
    #>
    param(
        [Parameter(Mandatory)] $Session,
        [Parameter(Mandatory)] [string]$DeactivationUrl,
        [switch]$Confirm
    )

    if (-not $Confirm) {
        Write-Host "  DRY RUN: Would deactivate via $DeactivationUrl" -ForegroundColor Yellow
        Write-Host "  Pass -Confirm to actually deactivate" -ForegroundColor Yellow
        return $false
    }

    # GET the deactivation page
    Write-Host "  GET $DeactivationUrl" -ForegroundColor Gray
    try {
        $page = Invoke-WebRequest -Uri $DeactivationUrl -WebSession $Session -UseBasicParsing -ErrorAction Stop
    }
    catch {
        Write-Host "  Failed to fetch deactivation page: $_" -ForegroundColor Red
        return $false
    }

    # Extract CSRF token and form fields
    $csrfToken = $null
    if ($page.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
        $csrfToken = $Matches[1]
    }

    # Dump form fields for debugging
    $formFields = [regex]::Matches($page.Content, 'name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
    Write-Host "  Deactivation form fields: $($formFields -join ', ')" -ForegroundColor Gray

    # POST the confirmation form
    $body = @{}
    if ($csrfToken) { $body["csrfmiddlewaretoken"] = $csrfToken }

    $headers = @{
        Origin  = $script:BaseUri
        Referer = $DeactivationUrl
    }

    try {
        $null = Invoke-WebRequest -Uri $DeactivationUrl -Method POST -WebSession $Session `
            -Body $body -Headers $headers -ContentType "application/x-www-form-urlencoded" `
            -MaximumRedirection 5 -ErrorAction Stop

        Write-Host "  Account deactivated" -ForegroundColor Red
        return $true
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 302) {
            Write-Host "  Account deactivated (redirect)" -ForegroundColor Red
            return $true
        }
        Write-Host "  Deactivation failed: $_" -ForegroundColor Red
        return $false
    }
}

Export-ModuleMember -Function Connect-SSIWeb, Register-SSIAccount, Update-SSIProfile, Register-ToMatch, Find-MatchPages, Find-DeactivationLink, Disable-SSIAccount
