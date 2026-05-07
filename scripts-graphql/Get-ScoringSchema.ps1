<#
.SYNOPSIS
    Discovers SSI GraphQL scoring-related schema details
#>

param(
    [string]$ApiKey,
    [string]$ApiKeyPath
)

$resolvedApiKey = $null

if ($ApiKey -and $ApiKey -ne "YOUR_API_KEY_HERE") {
    $resolvedApiKey = $ApiKey.Trim()
}

if (-not $resolvedApiKey -and $env:SSI_ADMIN_API_KEY) {
    $resolvedApiKey = $env:SSI_ADMIN_API_KEY.Trim()
}

if (-not $resolvedApiKey) {
    Import-Module -Name powershell-yaml -ErrorAction Stop

    if (-not $ApiKeyPath) {
        $ApiKeyPath = Join-Path -Path $PSScriptRoot -ChildPath "config\api-key.yml"
    }

    if (-not (Test-Path $ApiKeyPath)) {
        Write-Error "API key configuration file not found: $ApiKeyPath"
        exit 1
    }

    $apiKeyConfig = Get-Content -Path $ApiKeyPath -Raw -Encoding UTF8 | ConvertFrom-Yaml

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
    "Content-Type"  = "application/json"
    "Accept"        = "application/json"
}

function Invoke-GQL($query) {
    $body = @{ query = $query } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod -Uri $GraphQLEndpoint -Method POST -Headers $headers -Body $body
    if ($r.errors) {
        Write-Host "GraphQL Errors:" -ForegroundColor Red
        $r.errors | ForEach-Object { Write-Host "  - $($_.message)" -ForegroundColor Red }
    }
    return $r.data
}

# 1. Get all scoring-related mutations with full arg details
Write-Host "`n========== SCORING MUTATIONS ==========" -ForegroundColor Cyan

$data = Invoke-GQL @"
{
    __type(name: "Mutations") {
        fields {
            name
            description
            args {
                name
                type {
                    name
                    kind
                    ofType { name kind ofType { name kind ofType { name kind } } }
                }
            }
            type {
                name
                kind
                ofType { name kind }
            }
        }
    }
}
"@

$scoringMutations = $data.__type.fields | Where-Object { 
    $_.name -match "score|scorecard|competitor_score|did_not_finish|verify_competitor"
}

foreach ($m in $scoringMutations) {
    Write-Host "`n--- $($m.name) ---" -ForegroundColor Yellow
    if ($m.description) { Write-Host "  Description: $($m.description)" -ForegroundColor Gray }
    
    $retType = if ($m.type.name) { $m.type.name } else { "$($m.type.ofType.name) ($($m.type.kind))" }
    Write-Host "  Returns: $retType" -ForegroundColor DarkGray
    
    foreach ($a in $m.args) {
        $typeName = if ($a.type.name) { 
            "$($a.type.name) ($($a.type.kind))"
        } elseif ($a.type.ofType) {
            $inner = if ($a.type.ofType.name) { $a.type.ofType.name } 
                     elseif ($a.type.ofType.ofType) { "$($a.type.ofType.ofType.name) (list)" }
                     else { $a.type.ofType.kind }
            "$inner ($($a.type.kind))"
        } else { $a.type.kind }
        Write-Host "  arg: $($a.name) -> $typeName" -ForegroundColor White
    }
}

# 2. Get NordicScorecardNode type details
Write-Host "`n`n========== NORDIC SCORECARD TYPE ==========" -ForegroundColor Cyan

$types = @(
    "NordicScorecardNode", "NordicScorecardInput", 
    "ScorecardInput", "CompetitorScoreInput",
    "NordicMatchNode", "NordicSquadNode",
    "NordicCompetitorNode", "CompetitorInterface"
)

foreach ($typeName in $types) {
    $data = Invoke-GQL "{ __type(name: `"$typeName`") { name kind description fields { name description type { name kind ofType { name kind } } } inputFields { name type { name kind ofType { name kind ofType { name kind } } } } } }"
    
    if ($data.__type) {
        Write-Host "`n--- $typeName ($($data.__type.kind)) ---" -ForegroundColor Yellow
        if ($data.__type.description) { Write-Host "  $($data.__type.description)" -ForegroundColor Gray }
        
        $fields = if ($data.__type.fields) { $data.__type.fields } else { $data.__type.inputFields }
        foreach ($f in $fields) {
            $ft = if ($f.type.name) { $f.type.name } 
                  elseif ($f.type.ofType) { "$($f.type.ofType.name) ($($f.type.kind))" }
                  else { $f.type.kind }
            Write-Host "  $($f.name): $ft" -ForegroundColor White
        }
    } else {
        Write-Host "`n--- ${typeName}: NOT FOUND ---" -ForegroundColor DarkGray
    }
}

# 3. Check what queries exist for reading scores/competitors
Write-Host "`n`n========== SCORING QUERIES ==========" -ForegroundColor Cyan

$data = Invoke-GQL @"
{
    __type(name: "Query") {
        fields {
            name
            description
            args {
                name
                type { name kind ofType { name kind } }
            }
            type { name kind ofType { name kind } }
        }
    }
}
"@

$scoringQueries = $data.__type.fields | Where-Object {
    $_.name -match "score|competitor|nordic|squad"
}

foreach ($q in $scoringQueries) {
    Write-Host "`n--- $($q.name) ---" -ForegroundColor Yellow
    if ($q.description) { Write-Host "  $($q.description)" -ForegroundColor Gray }
    $retType = if ($q.type.name) { $q.type.name } else { "$($q.type.ofType.name) ($($q.type.kind))" }
    Write-Host "  Returns: $retType" -ForegroundColor DarkGray
    foreach ($a in $q.args) {
        $typeName = if ($a.type.name) { "$($a.type.name)" } 
                    elseif ($a.type.ofType) { "$($a.type.ofType.name) ($($a.type.kind))" }
                    else { $a.type.kind }
        Write-Host "  arg: $($a.name) -> $typeName" -ForegroundColor White
    }
}
