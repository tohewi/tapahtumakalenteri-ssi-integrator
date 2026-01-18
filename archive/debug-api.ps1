# Debug script to test SSI GraphQL API directly
Import-Module -Name PowerShell-Yaml -ErrorAction Stop

$configPath = Join-Path -Path $PSScriptRoot -ChildPath 'config.yml'
$configContent = Get-Content -Path $configPath -Raw
$config = $configContent | ConvertFrom-Yaml

$apiKey = $config.variables.apikey
$userEmail = $config.variables.userEmail
$userSecret = $config.variables.secret

Write-Host "Testing SSI GraphQL API" -ForegroundColor Cyan
Write-Host "API Key: $($apiKey.Substring(0, 10))..." -ForegroundColor Gray
Write-Host "User Email: $userEmail" -ForegroundColor Gray

$endpoint = "https://shootnscoreit.com/graphql/"

$headers = @{
    'Content-Type' = 'application/json'
    'x-api-key' = $apiKey
}

# First authenticate to get a token
Write-Host "`n--- Authenticating ---" -ForegroundColor Yellow
$authQuery = @{
    query = 'mutation TokenAuth($email: String!, $password: String!) { token_auth(email: $email, password: $password) { token { token } refresh_token { token } } }'
    variables = @{
        email = $userEmail
        password = $userSecret
    }
} | ConvertTo-Json -Depth 5

$jwtToken = $null
try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $authQuery -Headers $headers -TimeoutSec 30
    $data = $response.Content | ConvertFrom-Json
    if ($data.data.token_auth.token.token) {
        $jwtToken = $data.data.token_auth.token.token
        Write-Host "Authentication successful! Token: $($jwtToken.Substring(0, 20))..." -ForegroundColor Green
        # Add JWT token to headers for subsequent requests
        $headers['Authorization'] = "JWT $jwtToken"
    }
    elseif ($data.errors) {
        Write-Host "Auth errors: $($data.errors | ConvertTo-Json -Compress)" -ForegroundColor Red
    }
}
catch {
    Write-Host "Auth Error: $($_.Exception.Message)" -ForegroundColor Red
}

# First introspect create_event return type
Write-Host "`n--- Introspecting create_event return type ---" -ForegroundColor Yellow
$introspectQuery = @{
    query = '{ __type(name: "EventInterface") { fields { name type { name kind ofType { name } } } } }'
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $introspectQuery -Headers $headers -TimeoutSec 30
    Write-Host "EventInterface fields:" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    $data.data.__type.fields | ForEach-Object {
        $typeName = if ($_.type.name) { $_.type.name } elseif ($_.type.ofType.name) { $_.type.ofType.name } else { $_.type.kind }
        Write-Host "  - $($_.name) ($typeName)"
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# First introspect the events query arguments
Write-Host "`n--- Introspecting events query ---" -ForegroundColor Yellow
$introspectEventsQuery = @{
    query = '{ __schema { queryType { fields(includeDeprecated: true) { name args { name type { name kind ofType { name } } } } } } }'
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $introspectEventsQuery -Headers $headers -TimeoutSec 30
    $data = $response.Content | ConvertFrom-Json
    $eventsField = $data.data.__schema.queryType.fields | Where-Object { $_.name -eq 'events' }
    if ($eventsField) {
        Write-Host "events query arguments:" -ForegroundColor Green
        $eventsField.args | ForEach-Object {
            $typeName = if ($_.type.name) { $_.type.name } elseif ($_.type.ofType.name) { $_.type.ofType.name } else { $_.type.kind }
            Write-Host "  - $($_.name) ($typeName)"
        }
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Search for "oldies" event in Finland starting after January 2026
Write-Host "`n--- Searching for 'oldies' event in Finland (starts_after: 2026-01-01) ---" -ForegroundColor Yellow
$searchQuery = @{
    query = @'
query {
  events(search: "oldies", region: "fi", starts_after: "2026-01-01") {
    id
    name
    starts
    ends
    rule
    sub_rule
    status
    region
    venue
    get_full_absolute_url
  }
}
'@
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $searchQuery -Headers $headers -TimeoutSec 30
    $data = $response.Content | ConvertFrom-Json
    if ($data.data.events -and $data.data.events.Count -gt 0) {
        Write-Host "Found $($data.data.events.Count) event(s):" -ForegroundColor Green
        $data.data.events | ForEach-Object {
            Write-Host "  Name: $($_.name)" -ForegroundColor Cyan
            Write-Host "  Starts: $($_.starts)"
            Write-Host "  Ends: $($_.ends)"
            Write-Host "  Rule: $($_.rule) / $($_.sub_rule)"
            Write-Host "  Region: $($_.region)"
            Write-Host "  Venue: $($_.venue)"
            Write-Host "  URL: $($_.get_full_absolute_url)"
            Write-Host ""
        }
    } else {
        Write-Host "No events found with search='oldies', region='fi', starts_after='2026-01-01'" -ForegroundColor Yellow
        Write-Host "Trying broader search without date filter..." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Try broader search - just "oldies" in Finland without date filter
Write-Host "`n--- Broader search: 'oldies' in Finland (no date filter) ---" -ForegroundColor Yellow
$searchQuery2 = @{
    query = @'
query {
  events(search: "oldies", region: "fi") {
    id
    name
    starts
    ends
    rule
    sub_rule
    status
    region
    venue
    get_full_absolute_url
  }
}
'@
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $searchQuery2 -Headers $headers -TimeoutSec 30
    $data = $response.Content | ConvertFrom-Json
    if ($data.data.events -and $data.data.events.Count -gt 0) {
        Write-Host "Found $($data.data.events.Count) event(s):" -ForegroundColor Green
        $data.data.events | ForEach-Object {
            Write-Host "  Name: $($_.name)" -ForegroundColor Cyan
            Write-Host "  Starts: $($_.starts)"
            Write-Host "  URL: $($_.get_full_absolute_url)"
            Write-Host ""
        }
    } else {
        Write-Host "No events found. Trying search='Oldies' (capitalized)..." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Try without region filter - just search "oldies" globally
Write-Host "`n--- Search 'oldies' globally (no region filter) ---" -ForegroundColor Yellow
$searchQuery3 = @{
    query = @'
query {
  events(search: "oldies") {
    id
    name
    starts
    ends
    rule
    region
    venue
    get_full_absolute_url
  }
}
'@
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $searchQuery3 -Headers $headers -TimeoutSec 30
    $data = $response.Content | ConvertFrom-Json
    if ($data.data.events -and $data.data.events.Count -gt 0) {
        Write-Host "Found $($data.data.events.Count) event(s):" -ForegroundColor Green
        $data.data.events | ForEach-Object {
            Write-Host "  Name: $($_.name)" -ForegroundColor Cyan
            Write-Host "  Starts: $($_.starts)"
            Write-Host "  Region: $($_.region)"
            Write-Host "  URL: $($_.get_full_absolute_url)"
            Write-Host ""
        }
    } else {
        Write-Host "No events found globally with 'oldies'." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Try listing some Finland events to see what's available
Write-Host "`n--- List recent Finland events (starts_after: 2026-01-01) ---" -ForegroundColor Yellow
$searchQuery4 = @{
    query = @'
query {
  events(region: "fi", starts_after: "2026-01-01") {
    id
    name
    starts
    ends
    rule
    region
    venue
    get_full_absolute_url
  }
}
'@
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $searchQuery4 -Headers $headers -TimeoutSec 30
    $data = $response.Content | ConvertFrom-Json
    if ($data.data.events -and $data.data.events.Count -gt 0) {
        Write-Host "Found $($data.data.events.Count) Finland event(s) starting after 2026-01-01:" -ForegroundColor Green
        $data.data.events | ForEach-Object {
            Write-Host "  Name: $($_.name)" -ForegroundColor Cyan
            Write-Host "  Starts: $($_.starts)"
            Write-Host "  URL: $($_.get_full_absolute_url)"
            Write-Host ""
        }
    } else {
        Write-Host "No Finland events found starting after 2026-01-01." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
