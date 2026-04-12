<#
.SYNOPSIS
    PowerShell module for SSI GraphQL API interactions

.DESCRIPTION
    Provides functions for authenticating and making GraphQL requests to shootnscoreit.com API
    
    Authentication uses JWT tokens obtained via token_auth mutation, combined with API key.
    Headers required: x-api-key + authorization (JWT token)
#>

# GraphQL API endpoint
$script:GraphQLEndpoint = "https://shootnscoreit.com/graphql/"

# Store JWT token and refresh token for session
$script:JwtToken = $null
$script:RefreshToken = $null
$script:ApiKey = $null

<#
.SYNOPSIS
    Authenticates with SSI GraphQL API using email/password to get JWT token

.PARAMETER Email
    SSI account email

.PARAMETER Password
    SSI account password

.PARAMETER ApiKey
    The SSI GraphQL API key

.OUTPUTS
    Hashtable containing the headers for API requests (x-api-key + JWT authorization)
#>
function Connect-SSIGraphQL {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Email,
        
        [Parameter(Mandatory = $true)]
        [string]$Password,
        
        [Parameter(Mandatory = $true)]
        [string]$ApiKey
    )
    
    $script:ApiKey = $ApiKey
    
    # Initial headers for token_auth (only API key needed)
    $authHeaders = @{
        "x-api-key" = $ApiKey
        "Content-Type" = "application/json"
        "Accept" = "application/json"
    }
    
    $tokenAuthMutation = @"
mutation {
    token_auth(email: "$Email", password: "$Password") {
        refresh_token {
            token
            created
            expires_at
        }
        token {
            token
        }
        success
        errors
    }
}
"@
    
    $body = @{ query = $tokenAuthMutation } | ConvertTo-Json -Compress
    
    try {
        $response = Invoke-RestMethod -Uri $script:GraphQLEndpoint -Method POST -Headers $authHeaders -Body $body
        
        if ($response.errors) {
            $errorMessages = ($response.errors | ForEach-Object { $_.message }) -join "; "
            throw "Authentication failed: $errorMessages"
        }
        
        if (-not $response.data.token_auth.success) {
            $errors = $response.data.token_auth.errors
            throw "Authentication failed: $errors"
        }
        
        $script:JwtToken = $response.data.token_auth.token.token
        $script:RefreshToken = $response.data.token_auth.refresh_token.token
        
        # Return headers with JWT token
        $headers = @{
            "x-api-key" = $ApiKey
            "authorization" = "JWT $($script:JwtToken)"
            "Content-Type" = "application/json"
            "Accept" = "application/json"
        }
        
        return $headers
    }
    catch {
        throw "Failed to authenticate with SSI: $($_.Exception.Message)"
    }
}

<#
.SYNOPSIS
    Refreshes the JWT token using the refresh token

.PARAMETER Headers
    Current headers (will be updated with new JWT token)

.OUTPUTS
    Updated headers with new JWT token
#>
function Update-SSIToken {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers
    )
    
    if (-not $script:RefreshToken) {
        throw "No refresh token available. Please authenticate first."
    }
    
    $refreshMutation = @"
mutation {
    refresh_token(refresh_token: "$($script:RefreshToken)", revoke_refresh_token: false) {
        success
        errors
        token {
            token
        }
        refresh_token {
            token
            expires_at
        }
    }
}
"@
    
    $body = @{ query = $refreshMutation } | ConvertTo-Json -Compress
    
    try {
        $response = Invoke-RestMethod -Uri $script:GraphQLEndpoint -Method POST -Headers $Headers -Body $body
        
        if ($response.data.refresh_token.success) {
            $script:JwtToken = $response.data.refresh_token.token.token
            $script:RefreshToken = $response.data.refresh_token.refresh_token.token
            
            $Headers["authorization"] = "JWT $($script:JwtToken)"
        }
        
        return $Headers
    }
    catch {
        throw "Failed to refresh token: $($_.Exception.Message)"
    }
}

<#
.SYNOPSIS
    Executes a GraphQL query or mutation

.PARAMETER Headers
    The authentication headers from Initialize-SSIGraphQL

.PARAMETER Query
    The GraphQL query or mutation string

.PARAMETER Variables
    Optional hashtable of variables for the query/mutation

.PARAMETER OperationName
    Optional operation name for the query/mutation

.OUTPUTS
    The response data from the GraphQL API
#>
function Invoke-SSIGraphQL {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,
        
        [Parameter(Mandatory = $true)]
        [string]$Query,
        
        [hashtable]$Variables = @{},
        
        [string]$OperationName = $null
    )
    
    $body = @{
        query = $Query
        variables = $Variables
    }
    
    if ($OperationName) {
        $body.operationName = $OperationName
    }
    
    $jsonBody = $body | ConvertTo-Json -Depth 20 -Compress
    
    try {
        $response = Invoke-RestMethod -Uri $script:GraphQLEndpoint -Method POST -Headers $Headers -Body $jsonBody
        
        if ($response.errors) {
            $errorMessages = ($response.errors | ForEach-Object { $_.message }) -join "; "
            throw "GraphQL Error: $errorMessages"
        }
        
        return $response.data
    }
    catch {
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode
            throw "GraphQL request failed with status $statusCode`: $($_.Exception.Message)"
        }
        throw $_
    }
}

<#
.SYNOPSIS
    Gets abstract event info for creating a new event (used to get field choices)

.PARAMETER Headers
    The authentication headers

.PARAMETER Rule
    The rule code (e.g., 'rl' for RESUL, 'nd' for Nordic)

.PARAMETER SubRule
    The sub-rule code (e.g., 'p2p' for 25m Fast-pistol)

.PARAMETER SerieType
    Optional serie type for cups/leagues ('cp' for cup, 'lg' for league)

.OUTPUTS
    Abstract event data with available choices
#>
function Get-SSIAbstractEvent {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,
        
        [Parameter(Mandatory = $true)]
        [string]$Rule,
        
        [string]$SubRule = "",
        
        [string]$SerieType = ""
    )
    
    $query = @"
query GetAbstractEvent {
    get_abstract_event(rule: "$Rule", sub_rule: "$SubRule", serie_type: "$SerieType") {
        rule
        sub_rule
        get_visibility_choices { value display }
        get_status_choices { value display }
        get_registration_choices { value display }
        get_results_choices { value display }
    }
}
"@
    
    $result = Invoke-SSIGraphQL -Headers $Headers -Query $query -OperationName "GetAbstractEvent"
    return $result.get_abstract_event
}

<#
.SYNOPSIS
    Creates an event via GraphQL API using the create_event mutation
    Works for both matches and series (cups/leagues)

.PARAMETER Headers
    The authentication headers

.PARAMETER FormInput
    Hashtable containing event form data (name, starts, ends, etc.)

.PARAMETER Rule
    The rule code (e.g., 'rl' for RESUL, 'ip' for IPSC)

.PARAMETER SubRule
    The sub-rule code (e.g., 'p2p' for 25m Fast-pistol)

.PARAMETER SerieType
    Optional serie type for cups/leagues ('cp' for cup, 'lg' for league)
    Leave empty for standalone matches

.PARAMETER Firearms
    Optional firearms specification

.OUTPUTS
    The created event data
#>
function New-SSIEvent {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$FormInput,
        
        [Parameter(Mandatory = $true)]
        [string]$Rule,
        
        [string]$SubRule = "",
        
        [string]$SerieType = "",
        
        [string]$Firearms = ""
    )
    
    # Convert FormInput to JSON string for the mutation (GraphQL JSON scalar expects string)
    $formInputJson = $FormInput | ConvertTo-Json -Compress -Depth 10
    
    # Build mutation - create_event returns EventInterface directly
    $mutation = @"
mutation CreateEvent(`$form_input: JSON!, `$rule: String!, `$sub_rule: String!, `$serie_type: String, `$firearms: String) {
    create_event(form_input: `$form_input, rule: `$rule, sub_rule: `$sub_rule, serie_type: `$serie_type, firearms: `$firearms) {
        id
        name
        starts
        ends
        get_full_absolute_url
        get_content_type_key
    }
}
"@
    
    # form_input must be passed as JSON string, not as object
    $variables = @{
        form_input = $formInputJson
        rule = $Rule
        sub_rule = $SubRule
        serie_type = $SerieType
        firearms = $Firearms
    }
    
    $result = Invoke-SSIGraphQL -Headers $Headers -Query $mutation -Variables $variables -OperationName "CreateEvent"
    
    # create_event returns EventInterface directly (or null on error)
    if (-not $result.create_event) {
        throw "Event creation failed - no event returned"
    }
    
    return $result.create_event
}

<#
.SYNOPSIS
    Creates a RESUL Cup (NordicSerie) via GraphQL API

.PARAMETER Headers
    The authentication headers

.PARAMETER CupData
    Hashtable containing cup form data

.OUTPUTS
    The created cup event data
#>
function New-SSIResulCup {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$CupData
    )
    
    # Ensure correct field names for form_input
    # count, reg_start_date, reg_start_time, weapon_groups, categories, competence_classes
    # has_accepted_event_data_ass_agreement
    
    # RESUL Cup: rule='rl', serie_type='cp', sub_rule can be empty or specific
    return New-SSIEvent -Headers $Headers -FormInput $CupData -Rule "rl" -SubRule "" -SerieType "cp"
}

<#
.SYNOPSIS
    Creates a RESUL Match (NordicMatch) via GraphQL API

.PARAMETER Headers
    The authentication headers

.PARAMETER MatchData
    Hashtable containing match form data

.PARAMETER SubRule
    The RESUL sub-rule (e.g., 'p2p' for 25m Fast-pistol, 'p23' for 25m RA3 Pistol)

.OUTPUTS
    The created match event data
#>
function New-SSIResulMatch {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$MatchData,
        
        [Parameter(Mandatory = $true)]
        [string]$SubRule
    )
    
    # Ensure correct field names for form_input
    # reg_start_date, reg_start_time, weapon_groups, categories, competence_classes
    
    # RESUL Match: rule='rl', no serie_type (standalone match)
    return New-SSIEvent -Headers $Headers -FormInput $MatchData -Rule "rl" -SubRule $SubRule -SerieType ""
}

<#
.SYNOPSIS
    Links a match to a cup/serie as a component

.PARAMETER Headers
    The authentication headers

.PARAMETER CupId
    The cup event ID

.PARAMETER MatchId
    The match event ID to link

.PARAMETER ComponentNumber
    The component number (1, 2, 3, etc.)

.OUTPUTS
    Boolean indicating success
#>
function Add-SSICupMatch {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,
        
        [Parameter(Mandatory = $true)]
        [string]$CupId,
        
        [Parameter(Mandatory = $true)]
        [string]$MatchId,
        
        [Parameter(Mandatory = $true)]
        [int]$ComponentNumber
    )
    
    $mutation = @"
mutation AddCupMatch(`$input: AddCupMatchInput!) {
    addCupMatch(input: `$input) {
        success
        errors {
            field
            messages
        }
    }
}
"@
    
    $variables = @{
        input = @{
            cupId = $CupId
            matchId = $MatchId
            number = $ComponentNumber
            included = $true
        }
    }
    
    $result = Invoke-SSIGraphQL -Headers $Headers -Query $mutation -Variables $variables -OperationName "AddCupMatch"
    
    if ($result.addCupMatch.errors) {
        $errorDetails = $result.addCupMatch.errors | ForEach-Object { "$($_.field): $($_.messages -join ', ')" }
        throw "Failed to link match to cup: $($errorDetails -join '; ')"
    }
    
    return $result.addCupMatch.success
}

<#
.SYNOPSIS
    Creates a squad for a match

.PARAMETER Headers
    The authentication headers

.PARAMETER MatchId
    The match event ID

.PARAMETER SquadData
    Hashtable containing squad configuration

.OUTPUTS
    The created squad data
#>
function New-SSISquad {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,
        
        [Parameter(Mandatory = $true)]
        [string]$MatchId,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$SquadData
    )
    
    $mutation = @"
mutation CreateSquad(`$input: CreateSquadInput!) {
    createSquad(input: `$input) {
        squad {
            id
            name
            maxCompetitors
        }
        errors {
            field
            messages
        }
    }
}
"@
    
    $squadInput = $SquadData.Clone()
    $squadInput.matchId = $MatchId
    
    $variables = @{
        input = $squadInput
    }
    
    $result = Invoke-SSIGraphQL -Headers $Headers -Query $mutation -Variables $variables -OperationName "CreateSquad"
    
    if ($result.createSquad.errors) {
        $errorDetails = $result.createSquad.errors | ForEach-Object { "$($_.field): $($_.messages -join ', ')" }
        throw "Squad creation failed: $($errorDetails -join '; ')"
    }
    
    return $result.createSquad.squad
}

<#
.SYNOPSIS
    Checks if an event with the given name exists using the 'events' query

.PARAMETER Headers
    The authentication headers

.PARAMETER EventName
    The event name to check

.OUTPUTS
    Boolean indicating if event exists
#>
function Test-SSIEventExists {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,
        
        [Parameter(Mandatory = $true)]
        [string]$EventName
    )
    
    # Use 'events' query with 'search' parameter (returns list, not edges)
    # Search for events matching the name
    $query = @"
query SearchEvents {
    events(search: "$EventName") {
        name
    }
}
"@
    
    try {
        $result = Invoke-SSIGraphQL -Headers $Headers -Query $query -OperationName "SearchEvents"
        
        if ($result.events) {
            foreach ($evt in $result.events) {
                if ($evt.name -eq $EventName) {
                    return $true
                }
            }
        }
        
        return $false
    }
    catch {
        Write-Warning "Could not check for existing events: $($_.Exception.Message)"
        return $false
    }
}

<#
.SYNOPSIS
    Gets current user info to verify authentication

.PARAMETER Headers
    The authentication headers

.OUTPUTS
    User info including email
#>
function Get-SSIMe {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers
    )
    
    $query = @"
query Me {
    me {
        email
        first_name
        last_name
    }
}
"@
    
    $result = Invoke-SSIGraphQL -Headers $Headers -Query $query -OperationName "Me"
    return $result.me
}

<#
.SYNOPSIS
    Automated form field discovery via web scraping (GQL5 fallback)
    Fetches the actual web form to discover required fields and enum values
    since they are hidden behind an opaque JSON scalar in GraphQL.

.PARAMETER Session
    Web session from Invoke-WebRequest (with cookies)

.PARAMETER Rule
    Rule code (e.g. 'rl')

.PARAMETER SubRule
    Sub-rule code (e.g. 'p2p')

.PARAMETER SerieType
    Serie type ('cp' or 'lg')
#>
function Get-SSIFormFields {
    param(
        [Parameter(Mandatory = $true)]
        $Session,
        [Parameter(Mandatory = $true)]
        [string]$Url
    )
    
    Write-Host "Fetching $Url ..." -ForegroundColor Gray
    try {
        $response = Invoke-WebRequest -Uri $Url -WebSession $Session
        $formFields = @()
        
        # Extract <select> elements and their options
        $selectPattern = '<select[^>]+name="([^"]+)"[^>]*>([\s\S]*?)<\/select>'
        $optionPattern = '<option[^>]+value="([^"]*)"[^>]*>([^<]*)<\/option>'
        
        foreach ($s in [regex]::Matches($response.Content, $selectPattern)) {
            $name = $s.Groups[1].Value
            $optionsHtml = $s.Groups[2].Value
            $options = @()
            
            foreach ($o in [regex]::Matches($optionsHtml, $optionPattern)) {
                $val = $o.Groups[1].Value
                $disp = $o.Groups[2].Value.Trim()
                $options += [PSCustomObject]@{
                    Value = $val
                    Display = $disp
                }
            }
            
            $formFields += [PSCustomObject]@{
                FieldName = $name
                Type = "select"
                Options = $options
            }
            Write-Host "  Found select: $name ($($options.Count) options)" -ForegroundColor Gray
        }
        
        # Extract <input> elements with values
        # Use a more flexible regex to handle attribute order and other attributes
        $inputPattern = '<input[^>]+>'
        foreach ($i in [regex]::Matches($response.Content, $inputPattern)) {
            $tag = $i.Value
            
            # Extract name
            $name = ""
            if ($tag -match 'name="([^"]+)"') { $name = $Matches[1] }
            if (-not $name) { continue }
            
            # Extract type
            $type = "unknown"
            if ($tag -match 'type="([^"]+)"') { $type = $Matches[1] }
            
            # Extract value
            $val = ""
            if ($tag -match 'value="([^"]*)"') { $val = $Matches[1] }
            
            $formFields += [PSCustomObject]@{
                FieldName = $name
                Type = $type
                Value = $val
            }
            Write-Host "  Found input: $name ($type) = '$val'" -ForegroundColor Gray
        }
        
        return $formFields
    }
    catch {
        Write-Error "Failed to discover form fields at $($Url): $($_.Exception.Message)"
        return $null
    }
}

<#
.SYNOPSIS
    Links a match to a cup/serie as a component using web scraping fallback.
    Used because 'addCupMatch' mutation is not available in the current GQL schema.

.PARAMETER Session
    Web session with cookies
    
.PARAMETER CupId
    The cup event ID
    
.PARAMETER MatchId
    The match event ID to link
    
.PARAMETER ComponentNumber
    The component number (1, 2, 3, etc.)

.OUTPUTS
    Boolean indicating success
#>
function Add-SSICupMatchWeb {
    param(
        [Parameter(Mandatory = $true)]
        $Session,
        
        [Parameter(Mandatory = $true)]
        [string]$CupId,
        
        [Parameter(Mandatory = $true)]
        [string]$MatchId,
        
        [Parameter(Mandatory = $true)]
        [int]$ComponentNumber
    )
    
    # URL for adding existing match to a series (NordicSerie = type 136)
    $url = "https://shootnscoreit.com/event/136/$CupId/add-existing-match/"
    try {
        # 1. Get CSRF token
        $resp = Invoke-WebRequest -Uri $url -WebSession $Session
        $csrf = ""
        if ($resp.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
            $csrf = $Matches[1]
        }
        
        # 2. POST the link
        $body = @{
            "csrfmiddlewaretoken" = $csrf
            "match" = $MatchId
            "number" = $ComponentNumber.ToString()
            "included" = "on"
        }
        
        $headers = @{
            "Referer" = $url
            "Origin" = "https://shootnscoreit.com"
        }
        
        $postResp = Invoke-WebRequest -Uri $url -Method POST -WebSession $Session -Body $body -Headers $headers -MaximumRedirection 0 -ErrorAction SilentlyContinue
        
        # Success is usually a redirect back to manage page
        if ($postResp.StatusCode -eq 302) {
            return $true
        }
        return $false
    }
    catch {
        # Check if it was a redirect (which PS throws as exception)
        if ($_.Exception.Response.StatusCode -eq 302) {
            return $true
        }
        throw "Failed to link match to cup via web: $($_.Exception.Message)"
    }
}

<#
.SYNOPSIS
    Creates a squad for a match using web scraping fallback.
    Used because 'createSquad' mutation is not available in the current GQL schema.

.PARAMETER Session
    Web session with cookies

.PARAMETER MatchId
    The match event ID

.PARAMETER SquadData
    Hashtable containing squad configuration

.OUTPUTS
    Boolean indicating success
#>
function New-SSISquadWeb {
    param(
        [Parameter(Mandatory = $true)]
        $Session,
        
        [Parameter(Mandatory = $true)]
        [string]$MatchId,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$SquadData
    )
    
    $url = "https://shootnscoreit.com/nordic/match/$MatchId/add-squads/"
    try {
        # 1. Get CSRF token
        $resp = Invoke-WebRequest -Uri $url -WebSession $Session
        $csrf = ""
        if ($resp.Content -match 'name="csrfmiddlewaretoken"\s+value="([^"]+)"') {
            $csrf = $Matches[1]
        }
        
        # 2. POST the squad
        $body = @{
            "csrfmiddlewaretoken" = $csrf
            "quantity" = "1"
            "max_competitors" = $SquadData.max_competitors.ToString()
            "registration" = "aa"
            "comment" = $SquadData.comment
            "starts_date" = $SquadData.starts_date
            "starts_time" = $SquadData.starts_time
            "length" = "60"
            "split" = "10"
            "submit" = ""
        }
        
        # Build multipart/form-data or urlencoded?
        # Legacy scripts use Build-FormBody helper. Let's keep it simple for now.
        $headers = @{
            "Referer" = $url
            "Origin" = "https://shootnscoreit.com"
        }
        
        $postResp = Invoke-WebRequest -Uri $url -Method POST -WebSession $Session -Body $body -Headers $headers -MaximumRedirection 0 -ErrorAction SilentlyContinue
        
        if ($postResp.StatusCode -eq 302) {
            return $true
        }
        
        # Debug: Save failure response
        $postResp.Content | Out-File "debug-squad-fail.html" -Encoding UTF8
        Write-Host "  DEBUG: Squad creation failed with status $($postResp.StatusCode). Content saved to debug-squad-fail.html" -ForegroundColor Yellow
        return $false
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 302) {
            return $true
        }
        # Debug: Save exception response
        if ($_.Exception.Response) {
            $_.Exception.Response.Content | Out-File "debug-squad-error.html" -Encoding UTF8
        }
        throw "Failed to create squad via web: $($_.Exception.Message)"
    }
}

# Export module functions
Export-ModuleMember -Function @(
    'Connect-SSIGraphQL',
    'Update-SSIToken',
    'Invoke-SSIGraphQL',
    'Get-SSIAbstractEvent',
    'Get-SSIMe',
    'New-SSIEvent',
    'New-SSIResulCup',
    'New-SSIResulMatch',
    'Add-SSICupMatch',
    'Add-SSICupMatchWeb',
    'New-SSISquad',
    'New-SSISquadWeb',
    'Test-SSIEventExists',
    'Get-SSIFormFields'
)
