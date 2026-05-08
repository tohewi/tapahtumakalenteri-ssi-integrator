<#
.SYNOPSIS
    Discovers the SSI GraphQL API schema

.DESCRIPTION
    Uses GraphQL introspection to discover available queries, mutations, and types
    in the SSI GraphQL API. Outputs the schema to help understand the API structure.
    API key resolution order: -ApiKey parameter, SSI_ADMIN_API_KEY env var, then config file.

.PARAMETER ApiKey
    Optional GraphQL API key. If omitted, script uses SSI_ADMIN_API_KEY env var
    or falls back to the API key config file.

.PARAMETER ApiKeyPath
    Path to the API key configuration file (default: config/api-key.yml)

.PARAMETER OutputPath
    Path to save the schema output (default: schema-output.json)

.EXAMPLE
    .\Get-SSISchema.ps1
#>

param(
    [string]$ApiKey,
    [string]$ApiKeyPath,
    [string]$OutputPath = "schema-output.json"
)

$resolvedApiKey = $null

if ($ApiKey -and $ApiKey -ne "YOUR_API_KEY_HERE") {
    $resolvedApiKey = $ApiKey.Trim()
}

if (-not $resolvedApiKey -and $env:SSI_ADMIN_API_KEY) {
    $resolvedApiKey = $env:SSI_ADMIN_API_KEY.Trim()
}

if (-not $resolvedApiKey) {
    if (-not $ApiKeyPath) {
        $ApiKeyPath = Join-Path -Path $PSScriptRoot -ChildPath "config\api-key.yml"
    }

    if (-not (Test-Path $ApiKeyPath)) {
        Write-Error "API key configuration file not found: $ApiKeyPath"
        exit 1
    }

    Import-Module -Name PowerShell-Yaml -ErrorAction Stop
    $apiKeyContent = Get-Content -Path $ApiKeyPath -Raw -Encoding UTF8
    $apiKeyConfig = $apiKeyContent | ConvertFrom-Yaml

    if (-not $apiKeyConfig.apiKey -or $apiKeyConfig.apiKey -eq "YOUR_API_KEY_HERE") {
        Write-Error "API key not configured. Set SSI_ADMIN_API_KEY env var or update: $ApiKeyPath"
        exit 1
    }

    $resolvedApiKey = $apiKeyConfig.apiKey.Trim()
}

if (-not $resolvedApiKey) {
    Write-Error "API key is missing. Set SSI_ADMIN_API_KEY env var or provide -ApiKey/-ApiKeyPath"
    exit 1
}

$GraphQLEndpoint = "https://shootnscoreit.com/graphql/"

$headers = @{
    "x-api-key" = $resolvedApiKey
    "Content-Type" = "application/json"
    "Accept" = "application/json"
}

# Introspection query to get schema
$introspectionQuery = @"
query IntrospectionQuery {
    __schema {
        queryType {
            name
            fields {
                name
                description
                args {
                    name
                    type {
                        name
                        kind
                        ofType {
                            name
                            kind
                        }
                    }
                }
                type {
                    name
                    kind
                    ofType {
                        name
                        kind
                    }
                }
            }
        }
        mutationType {
            name
            fields {
                name
                description
                args {
                    name
                    type {
                        name
                        kind
                        ofType {
                            name
                            kind
                        }
                    }
                }
                type {
                    name
                    kind
                }
            }
        }
        types {
            name
            kind
            description
            fields {
                name
                type {
                    name
                    kind
                }
            }
            inputFields {
                name
                type {
                    name
                    kind
                    ofType {
                        name
                        kind
                    }
                }
            }
        }
    }
}
"@

$body = @{
    query = $introspectionQuery
} | ConvertTo-Json -Compress

Write-Host "Querying SSI GraphQL schema..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $GraphQLEndpoint -Method POST -Headers $headers -Body $body
    
    if ($response.errors) {
        Write-Host "GraphQL Errors:" -ForegroundColor Red
        $response.errors | ForEach-Object { Write-Host "  - $($_.message)" -ForegroundColor Red }
    }
    
    if ($response.data) {
        # Save full schema to file
        $response | ConvertTo-Json -Depth 20 | Out-File -FilePath $OutputPath -Encoding UTF8
        Write-Host "Full schema saved to: $OutputPath" -ForegroundColor Green
        
        # Display summary
        Write-Host "`n=== QUERIES ===" -ForegroundColor Yellow
        if ($response.data.__schema.queryType.fields) {
            $response.data.__schema.queryType.fields | ForEach-Object {
                Write-Host "  $($_.name)" -ForegroundColor White
                if ($_.description) {
                    Write-Host "    $($_.description)" -ForegroundColor Gray
                }
            }
        }
        
        Write-Host "`n=== MUTATIONS ===" -ForegroundColor Yellow
        if ($response.data.__schema.mutationType.fields) {
            $response.data.__schema.mutationType.fields | ForEach-Object {
                Write-Host "  $($_.name)" -ForegroundColor White
                if ($_.description) {
                    Write-Host "    $($_.description)" -ForegroundColor Gray
                }
            }
        }
        
        # Find event-related types
        Write-Host "`n=== EVENT-RELATED TYPES ===" -ForegroundColor Yellow
        $eventTypes = $response.data.__schema.types | Where-Object { 
            $_.name -match "Event|Match|Cup|Squad|Series" -and $_.name -notmatch "^__"
        }
        $eventTypes | ForEach-Object {
            Write-Host "  $($_.name) ($($_.kind))" -ForegroundColor White
        }
        
        # Find Input types (for mutations)
        Write-Host "`n=== INPUT TYPES ===" -ForegroundColor Yellow
        $inputTypes = $response.data.__schema.types | Where-Object { 
            $_.kind -eq "INPUT_OBJECT" -and $_.name -notmatch "^__"
        }
        $inputTypes | ForEach-Object {
            Write-Host "  $($_.name)" -ForegroundColor White
        }
    }
}
catch {
    Write-Host "Error querying schema: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}
