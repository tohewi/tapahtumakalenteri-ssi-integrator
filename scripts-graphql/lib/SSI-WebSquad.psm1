<#
.SYNOPSIS
    Reusable module for creating squads on SSI matches via web form POST.

.DESCRIPTION
    Since the SSI GraphQL API has no squad creation mutation, this module
    uses authenticated web session + form POST to create squads.
    Works for any match type (RESUL/Nordic, IPSC/SRA, etc.).

    URL patterns by match type:
      - RESUL/Nordic: /nordic/match/{eventId}/add-squads/
      - IPSC/SRA:     /event/{contentType}/{eventId}/add-squads/

.NOTES
    Requires an authenticated WebRequestSession from Connect-SSI.ps1
    or equivalent login flow.
#>

function Connect-SSIWeb {
    <#
    .SYNOPSIS
        Authenticates to SSI web and returns a WebRequestSession.
    .PARAMETER Email
        SSI account email.
    .PARAMETER Password
        SSI account password.
    .PARAMETER BaseUri
        SSI base URL. Defaults to https://shootnscoreit.com
    .OUTPUTS
        Microsoft.PowerShell.Commands.WebRequestSession
    #>
    param(
        [Parameter(Mandatory)] [string]$Email,
        [Parameter(Mandatory)] [string]$Password,
        [string]$BaseUri = "https://shootnscoreit.com"
    )

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $session.Cookies.Add((New-Object System.Net.Cookie("django_language", "en", "/", $BaseUri.Replace("https://", ""))))

    # Get CSRF token from login page
    $loginPage = Invoke-WebRequest -Uri "$BaseUri/login/" -WebSession $session -UseBasicParsing
    $csrfToken = $null
    if ($loginPage.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
        $csrfToken = $Matches[1]
    }

    # POST login form
    $loginBody = @{ username = $Email; password = $Password; keep = "on" }
    if ($csrfToken) { $loginBody["csrfmiddlewaretoken"] = $csrfToken }
    $loginHeaders = @{ Origin = $BaseUri; Referer = "$BaseUri/login/" }

    try {
        Invoke-WebRequest -Uri "$BaseUri/login/?next=/dashboard/" -Method POST `
            -WebSession $session -Body $loginBody -Headers $loginHeaders `
            -ContentType "application/x-www-form-urlencoded" `
            -MaximumRedirection 0 -ErrorAction SilentlyContinue | Out-Null
    }
    catch {
        # 302 redirect is expected on successful login
    }

    # Verify we got a session cookie
    $sessionCookie = $session.Cookies.GetCookies($BaseUri) | Where-Object { $_.Name -eq "sessionid" }
    if (-not $sessionCookie) {
        throw "SSI web login failed — no session cookie received."
    }

    return $session
}


function New-SSIWebSquad {
    <#
    .SYNOPSIS
        Creates one or more squads on an SSI match via web form POST.

    .DESCRIPTION
        POSTs to the match's add-squads form. The URL is auto-detected
        from ContentType + EventId, or can be specified explicitly.

    .PARAMETER Session
        Authenticated WebRequestSession (from Connect-SSIWeb).

    .PARAMETER EventId
        The SSI event/match ID.

    .PARAMETER ContentType
        The SSI content type ID (e.g. 22 for IPSC, 136 for Nordic).
        Used to build the URL when AddSquadsUrl is not provided.

    .PARAMETER AddSquadsUrl
        Explicit URL path for adding squads (overrides auto-detection).
        e.g. "/nordic/match/12345/add-squads/"

    .PARAMETER Quantity
        Number of squads to create (default 1).

    .PARAMETER MaxCompetitors
        Maximum competitors per squad.

    .PARAMETER Registration
        Registration mode: "aa" (anyone), "os" (restricted). Default "aa".

    .PARAMETER Comment
        Squad comment/label (used as display name).

    .PARAMETER StartsDate
        Squad start date in yyyy-MM-dd format (RESUL only, optional).

    .PARAMETER StartsTime
        Squad start time in HH:mm format (RESUL only, optional).

    .PARAMETER Prematch
        Whether this is a prematch squad. Default "False".

    .PARAMETER IssueDates
        Whether to issue dates. Default "False" (RESUL only, optional).

    .PARAMETER Length
        Squad duration in minutes (RESUL only, optional).

    .PARAMETER Split
        Split time in minutes (RESUL only, optional).

    .PARAMETER Categories
        Array of category codes. Default @("-") = Any.

    .PARAMETER WeaponGroups
        Array of weapon group codes. Default @("-") = Any.

    .PARAMETER CompetenceClasses
        Array of competence class codes. Default @("-") = Any.

    .PARAMETER BaseUri
        SSI base URL. Defaults to https://shootnscoreit.com

    .OUTPUTS
        Boolean — $true if squad creation succeeded.
    #>
    param(
        [Parameter(Mandatory)]
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session,

        [Parameter(Mandatory)]
        [string]$EventId,

        [string]$ContentType,
        [string]$AddSquadsUrl,

        [int]$Quantity = 1,
        [Parameter(Mandatory)]
        [int]$MaxCompetitors,

        [string]$Registration = "aa",
        [string]$Comment = "",
        [string]$StartsDate,
        [string]$StartsTime,
        [string]$Prematch = "False",
        [string]$IssueDates = "False",
        [int]$Length = 60,
        [int]$Split = 10,
        [string[]]$Categories = @("-"),
        [string[]]$WeaponGroups = @("-"),
        [string[]]$CompetenceClasses = @("-"),
        [string]$BaseUri = "https://shootnscoreit.com"
    )

    # Build URL
    if ($AddSquadsUrl) {
        $url = "$BaseUri$AddSquadsUrl"
    }
    elseif ($ContentType) {
        $url = "$BaseUri/event/$ContentType/$EventId/add-squads/"
    }
    else {
        throw "Either -ContentType or -AddSquadsUrl must be provided."
    }

    # Build form body (scalar fields)
    $formBody = @{
        "quantity"        = $Quantity.ToString()
        "max_competitors" = $MaxCompetitors.ToString()
        "registration"    = $Registration
        "comment"         = $Comment
        "prematch"        = $Prematch
    }

    # Optional RESUL-specific fields
    if ($StartsDate) { $formBody["starts_date"] = $StartsDate }
    if ($StartsTime) { $formBody["starts_time"] = $StartsTime }
    if ($StartsDate -or $StartsTime) {
        $formBody["issue_dates"] = $IssueDates
        $formBody["length"] = $Length.ToString()
        $formBody["split"] = $Split.ToString()
    }
    $formBody["submit"] = "Submit"

    # Build URL-encoded body with array field support
    $encodedPairs = @()
    foreach ($key in $formBody.Keys) {
        $encodedPairs += "$([Uri]::EscapeDataString($key))=$([Uri]::EscapeDataString($formBody[$key]))"
    }
    foreach ($val in $Categories) {
        $encodedPairs += "categories=$([Uri]::EscapeDataString($val))"
    }
    foreach ($val in $WeaponGroups) {
        $encodedPairs += "weapon_groups=$([Uri]::EscapeDataString($val))"
    }
    foreach ($val in $CompetenceClasses) {
        $encodedPairs += "competence_classes=$([Uri]::EscapeDataString($val))"
    }
    $encodedBody = $encodedPairs -join "&"

    # POST (no CSRF token needed for squad form per legacy script)
    $headers = @{
        "Content-Type" = "application/x-www-form-urlencoded"
        "Referer"      = $url
        "Origin"       = $BaseUri
    }

    $response = Invoke-WebRequest -Uri $url -Method POST `
        -WebSession $Session -Headers $headers `
        -Body $encodedBody -MaximumRedirection 5

    # Check for errors
    if ($response.Content -match 'is-invalid|alert-danger|errorlist') {
        throw "Squad form returned validation errors. Check response HTML."
    }

    return $true
}


# Export module functions
Export-ModuleMember -Function @(
    'Connect-SSIWeb',
    'New-SSIWebSquad'
)
