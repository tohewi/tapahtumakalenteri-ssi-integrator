<#
.SYNOPSIS
    Creates SSI (Shoot'n'ScoreIt) matches using GraphQL API

.DESCRIPTION
    This tool allows batch creation of SSI matches by providing a list of dates,
    base name, match admin email, and match type. It uses PowerShell Core and
    communicates with the SSI GraphQL API.

.PARAMETER Dates
    Array of dates for the matches. Can be string array or DateTime objects.

.PARAMETER BaseName
    Base name for the matches (will be appended with date or number).

.PARAMETER MatchAdminEmail
    Email address of the match administrator.

.PARAMETER MatchType
    Type of match to create (e.g., "USPSA", "IPSC", "IDPA", etc.).

.PARAMETER ApiUrl
    SSI GraphQL API endpoint URL. Defaults to standard SSI GraphQL endpoint.

.PARAMETER ApiKey
    API key for authentication (if required). If omitted, the script attempts to load
    variables.apikey from a config.yml file located beside the script.

.PARAMETER UserEmail
    SSI account email for authentication. Loaded from config.yml (variables.userEmail)
    when not explicitly provided.

.PARAMETER UserSecret
    SSI account secret or password used together with the email. Loaded from config.yml
    (variables.secret) when not explicitly provided.

.PARAMETER DryRun
    If specified, shows what would be created without actually creating matches.

.PARAMETER BatchSize
    Number of matches to create in parallel. Defaults to 5.

.EXAMPLE
    $dates = @("2024-02-15", "2024-02-16", "2024-02-17")
    New-SSIMatch -Dates $dates -BaseName "Winter Match" -MatchAdminEmail "admin@example.com" -MatchType "USPSA" -DryRun

.EXAMPLE
    $dates = Get-Date -Day 1..28 -Month "February" -Year 2024 | ForEach-Object { $_.ToString("yyyy-MM-dd") }
    New-SSIMatch -Dates $dates -BaseName "Daily Practice" -MatchAdminEmail "range@club.com" -MatchType "USPSA" -BatchSize 10

.NOTES
    Requires PowerShell Core 7.0 or later.
    Requires internet connectivity to reach SSI GraphQL API.
    Optionally reads configuration from config.yml when present.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string[]]$Dates,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$BaseName,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [ValidatePattern("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")]
    [string]$MatchAdminEmail,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$MatchType,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [uri]$ApiUrl = "https://shootnscoreit.com/graphql/",

    [Parameter()]
    [string]$ApiKey,

    [Parameter()]
    [string]$UserEmail,

    [Parameter()]
    [string]$UserSecret,

    [Parameter()]
    [switch]$DryRun,

    [Parameter()]
    [ValidateRange(1, 50)]
    [int]$BatchSize = 5
)

# Requires PowerShell 7.0 for better web request handling
#Requires -Version 7.0

# Import required modules
Import-Module Microsoft.PowerShell.Utility -Force

if (-not (Get-Command -Name ConvertFrom-Yaml -ErrorAction SilentlyContinue)) {
    try {
        Import-Module -Name PowerShell-Yaml -ErrorAction Stop
    }
    catch {
        throw "ConvertFrom-Yaml is unavailable. Install it with 'Install-Module -Name PowerShell-Yaml -Scope CurrentUser' and retry."
    }
}

# Script configuration
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'Continue'

function Get-ConfigVariables {
    <#
    .SYNOPSIS
        Retrieves configuration variables from a YAML configuration file.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConfigPath
    )

    if (-not (Test-Path -Path $ConfigPath)) {
        return $null
    }

    try {
        $configContent = Get-Content -Path $ConfigPath -Raw
        if (-not $configContent.Trim()) {
            Write-Warning "config.yml exists but is empty."
            return $null
        }

        $config = $configContent | ConvertFrom-Yaml

        if ($null -eq $config -or $null -eq $config.variables) {
            Write-Warning "config.yml found at '$ConfigPath' but no 'variables' section was detected."
            return $null
        }

        return [pscustomobject]@{
            ApiKey     = $config.variables.apikey
            UserEmail  = $config.variables.userEmail
            UserSecret = $config.variables.secret
        }
    }
    catch {
        Write-Warning "Failed to parse config.yml: $($_.Exception.Message)"
        return $null
    }
}

# GraphQL mutation template
$graphqlMutationTemplate = @'
mutation CreateMatch($input: MatchInput!) {
  createMatch(input: $input) {
    id
    name
    date
    matchType
    adminEmail
    status
    createdAt
  }
}
'@

class MatchInput {
    [string]$name
    [string]$date
    [string]$matchType
    [string]$adminEmail
    [hashtable]$additionalFields = @{}
}

function Test-SSIApiConnection {
    <#
    .SYNOPSIS
        Tests connectivity to the SSI GraphQL API
    #>
    param(
        [uri]$Endpoint,
        [string]$ApiKey,
        [string]$UserEmail,
        [string]$UserSecret
    )

    try {
        $headers = @{
            'Content-Type' = 'application/json'
        }

        if ($ApiKey) {
            $headers['Authorization'] = "Bearer $ApiKey"
        }

        if ($UserEmail) {
            $headers['X-User-Email'] = $UserEmail
        }

        if ($UserSecret) {
            $headers['X-User-Secret'] = $UserSecret
        }

        # Simple health check query
        $query = @{
            query = 'query { __schema { types { name } } }'
        } | ConvertTo-Json -Depth 10

        $response = Invoke-WebRequest -Uri $Endpoint -Method POST -Body $query -Headers $headers -TimeoutSec 30
        
        if ($response.StatusCode -eq 200) {
            return $true
        }
        else {
            return $false
        }
    }
    catch {
        Write-Warning "API connection test failed: $($_.Exception.Message)"
        return $false
    }
}

function New-GraphQLRequest {
    <#
    .SYNOPSIS
        Sends a GraphQL request to the SSI API
    #>
    param(
        [string]$Query,
        [hashtable]$Variables,
        [uri]$Endpoint,
        [string]$ApiKey,
        [string]$UserEmail,
        [string]$UserSecret
    )

    $headers = @{
        'Content-Type' = 'application/json'
    }

    if ($ApiKey) {
        $headers['Authorization'] = "Bearer $ApiKey"
    }

    if ($UserEmail) {
        $headers['X-User-Email'] = $UserEmail
    }

    if ($UserSecret) {
        $headers['X-User-Secret'] = $UserSecret
    }

    $requestBody = @{
        query = $Query
        variables = $Variables
    } | ConvertTo-Json -Depth 10

    try {
        $response = Invoke-WebRequest -Uri $Endpoint -Method POST -Body $requestBody -Headers $headers -TimeoutSec 60
        $responseData = $response.Content | ConvertFrom-Json

        if ($responseData.errors) {
            throw "GraphQL errors: $($responseData.errors | ConvertTo-Json -Compress)"
        }

        return $responseData.data
    }
    catch {
        throw "GraphQL request failed: $($_.Exception.Message)"
    }
}

function Format-MatchName {
    <#
    .SYNOPSIS
        Formats match name based on base name and date
    #>
    param(
        [string]$BaseName,
        [DateTime]$Date,
        [int]$Index
    )

    $formattedDate = $Date.ToString("MMM dd, yyyy")

    if ($Dates.Count -eq 1) {
        return $BaseName
    }
    elseif ($Dates.Count -le 31) {
        return "$BaseName - $formattedDate"
    }
    else {
        return "$BaseName - $($Index + 1)"
    }
}

function New-MatchInput {
    <#
    .SYNOPSIS
        Creates a match input object for GraphQL mutation
    #>
    param(
        [string]$BaseName,
        [DateTime]$Date,
        [string]$MatchType,
        [string]$MatchAdminEmail,
        [int]$Index
    )

    $matchName = Format-MatchName -BaseName $BaseName -Date $Date -Index $Index

    $matchDate = $Date.ToString("yyyy-MM-dd")

    $matchInput = [MatchInput]@{
        name = $matchName
        date = $matchDate
        matchType = $MatchType
        adminEmail = $MatchAdminEmail
    }

    # Add any additional default fields that might be required
    $matchInput.additionalFields['status'] = 'scheduled'
    $matchInput.additionalFields['createdAt'] = (Get-Date -AsUTC).ToString("yyyy-MM-ddTHH:mm:ssZ")

    return $matchInput
}

function Write-ProgressHelper {
    <#
    .SYNOPSIS
        Helper function for writing progress updates
    #>
    param(
        [int]$Current,
        [int]$Total,
        [string]$Activity,
        [string]$Status
    )

    $percentComplete = if ($Total -gt 0) { ($Current / $Total) * 100 } else { 0 }
    Write-Progress -Activity $Activity -Status $Status -PercentComplete $percentComplete
}

# Main script execution
try {
    $configPath = if ($PSScriptRoot) {
        Join-Path -Path $PSScriptRoot -ChildPath 'config.yml'
    }
    else {
        Join-Path -Path (Get-Location) -ChildPath 'config.yml'
    }

    $configValues = Get-ConfigVariables -ConfigPath $configPath

    $effectiveApiKey = if ($ApiKey) { $ApiKey } elseif ($configValues) { $configValues.ApiKey } else { $null }
    $effectiveUserEmail = if ($UserEmail) { $UserEmail } elseif ($configValues) { $configValues.UserEmail } else { $null }
    $effectiveUserSecret = if ($UserSecret) { $UserSecret } elseif ($configValues) { $configValues.UserSecret } else { $null }

    if ($effectiveApiKey) {
        $apiKeySource = if ($ApiKey) { 'parameters' } else { 'config.yml' }
        Write-Host "Using API key from $apiKeySource" -ForegroundColor DarkGreen
    }
    else {
        Write-Warning "No API key provided. Requests will be sent without authentication."
    }

    if ($effectiveUserEmail -and $effectiveUserSecret) {
        $credentialSource = if ($UserEmail -and $UserSecret) { 'parameters' } else { 'config.yml' }
        Write-Host "Using user credentials from $credentialSource" -ForegroundColor DarkGreen
    }
    else {
        Write-Warning "User email or secret not provided. Some APIs may require user credentials."
    }

    Write-Host "SSI Match Creation Tool" -ForegroundColor Green
    Write-Host "========================" -ForegroundColor Green

    # Validate and prepare dates
    $validatedDates = @()
    foreach ($date in $Dates) {
        try {
            switch ($date) {
                { $_ -is [DateTime] } {
                    $dateObj = $_
                    break
                }
                { $_ -is [string] } {
                    $dateObj = [DateTime]::Parse($_)
                    break
                }
                default {
                    throw "Invalid date format"
                }
            }

            if ($dateObj.Kind -eq [DateTimeKind]::Unspecified) {
                $dateObj = [DateTime]::SpecifyKind($dateObj, [DateTimeKind]::Local)
            }

            $dateOnly = [DateTime]::SpecifyKind($dateObj.Date, $dateObj.Kind)
            $validatedDates += $dateOnly
        }
        catch {
            Write-Error "Invalid date format: $date. Please use yyyy-MM-dd format or DateTime objects."
            return
        }
    }

    if (-not $validatedDates) {
        throw "No valid dates provided"
    }

    Write-Host "Creating $($validatedDates.Count) match(es) with the following details:" -ForegroundColor Cyan
    Write-Host "  Base Name: $BaseName" -ForegroundColor White
    Write-Host "  Match Type: $MatchType" -ForegroundColor White
    Write-Host "  Admin Email: $MatchAdminEmail" -ForegroundColor White
    Write-Host "  API Endpoint: $ApiUrl" -ForegroundColor White
    $displayDates = ($validatedDates | ForEach-Object { $_.ToString("yyyy-MM-dd") }) -join ', '
    Write-Host "  Dates: $displayDates" -ForegroundColor White

    if ($DryRun) {
        Write-Host "`nDRY RUN MODE - No matches will be created" -ForegroundColor Yellow
        Write-Host "`nMatches that would be created:" -ForegroundColor Cyan
        
        for ($i = 0; $i -lt $validatedDates.Count; $i++) {
            $matchInput = New-MatchInput -BaseName $BaseName -Date $validatedDates[$i] -MatchType $MatchType -MatchAdminEmail $MatchAdminEmail -Index $i
            Write-Host "  $($i + 1). $($matchInput.name) on $($validatedDates[$i].ToString('yyyy-MM-dd'))" -ForegroundColor White
        }
        
        return
    }

    # Test API connection
    Write-Host "`nTesting API connection..." -ForegroundColor Cyan
    if (-not (Test-SSIApiConnection -Endpoint $ApiUrl -ApiKey $effectiveApiKey -UserEmail $effectiveUserEmail -UserSecret $effectiveUserSecret)) {
        throw "Failed to connect to SSI API. Please check your internet connection and API endpoint."
    }
    Write-Host "API connection successful!" -ForegroundColor Green

    # Create matches in batches
    $createdMatches = @()
    $failedMatches = @()

    for ($batchStart = 0; $batchStart -lt $validatedDates.Count; $batchStart += $BatchSize) {
        $batchEnd = [Math]::Min($batchStart + $BatchSize - 1, $validatedDates.Count - 1)
        $batchSize = $batchEnd - $batchStart + 1
        
        Write-Host "`nProcessing batch: matches $($batchStart + 1) through $($batchEnd + 1)" -ForegroundColor Cyan
        
        $batchTasks = @()
        
        $credentialBundle = [pscustomobject]@{
            ApiKey     = $effectiveApiKey
            UserEmail  = $effectiveUserEmail
            UserSecret = $effectiveUserSecret
        }

        for ($i = $batchStart; $i -le $batchEnd; $i++) {
            $matchInput = New-MatchInput -BaseName $BaseName -Date $validatedDates[$i] -MatchType $MatchType -MatchAdminEmail $MatchAdminEmail -Index $i
            
            $batchTasks += {
                param($MatchPayload, $Endpoint, [pscustomobject]$Credentials, $Mutation)

                try {
                    $variables = @{
                        input = @{
                            name = $MatchPayload.name
                            date = $MatchPayload.date
                            matchType = $MatchPayload.matchType
                            adminEmail = $MatchPayload.adminEmail
                        }
                    }

                    # Add additional fields if they exist
                    foreach ($field in $MatchPayload.additionalFields.GetEnumerator()) {
                        $variables.input[$field.Key] = $field.Value
                    }

                    $result = New-GraphQLRequest -Query $Mutation -Variables $variables -Endpoint $Endpoint -ApiKey $Credentials.ApiKey -UserEmail $Credentials.UserEmail -UserSecret $Credentials.UserSecret
                    return @{
                        Success = $true
                        Data = $result
                        Match = $MatchPayload
                        Error = $null
                    }
                }
                catch {
                    return @{
                        Success = $false
                        Data = $null
                        Match = $MatchPayload
                        Error = $_.Exception.Message
                    }
                }
            }.Invoke($matchInput, $ApiUrl, $credentialBundle, $graphqlMutationTemplate)
        }
        
        # Wait for batch completion
        $batchResults = $batchTasks | ForEach-Object { $_ }
        
        foreach ($result in $batchResults) {
            Write-ProgressHelper -Current ($createdMatches.Count + $failedMatches.Count + 1) -Total $validatedDates.Count -Activity "Creating Matches" -Status "Processing: $($result.Match.name)"

            if ($result.Success) {
                $createdMatches += $result
                Write-Host "  ✓ Created: $($result.Match.name)" -ForegroundColor Green
            }
            else {
                $failedMatches += $result
                Write-Host "  ✗ Failed: $($result.Match.name) - $($result.Error)" -ForegroundColor Red
            }
        }
    }

    # Summary
    Write-ProgressHelper -Current $validatedDates.Count -Total $validatedDates.Count -Activity "Creating Matches" -Status "Complete"
    Write-Host "`nMatch Creation Summary" -ForegroundColor Cyan
    Write-Host "======================" -ForegroundColor Cyan
    Write-Host "Successfully created: $($createdMatches.Count)" -ForegroundColor Green
    Write-Host "Failed: $($failedMatches.Count)" -ForegroundColor Red

    if ($createdMatches.Count -gt 0) {
        Write-Host "`nSuccessfully Created Matches:" -ForegroundColor Green
        foreach ($match in $createdMatches) {
            Write-Host "  • $($match.Match.name) (ID: $($match.Data.createMatch.id))" -ForegroundColor White
        }
    }

    if ($failedMatches.Count -gt 0) {
        Write-Host "`nFailed Matches:" -ForegroundColor Red
        foreach ($match in $failedMatches) {
            Write-Host "  • $($match.Match.name) - $($match.Error)" -ForegroundColor White
        }
        
        Write-Host "`nYou can retry failed matches by running the script again with just the failed dates." -ForegroundColor Yellow
    }

    if ($createdMatches.Count -eq $validatedDates.Count) {
        Write-Host "`n🎉 All matches created successfully!" -ForegroundColor Green
    }
    elseif ($createdMatches.Count -gt 0) {
        Write-Host "`n⚠️  Some matches were created successfully. Check the failed matches above." -ForegroundColor Yellow
    }
    else {
        throw "No matches were created successfully."
    }
}
catch {
    Write-Error "Script execution failed: $($_.Exception.Message)"
    exit 1
}
finally {
    Write-Progress -Activity "Creating Matches" -Completed
}
