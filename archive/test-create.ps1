# Test script for createEvent mutation with correct SRA values
Import-Module -Name PowerShell-Yaml -ErrorAction Stop

$configPath = Join-Path -Path $PSScriptRoot -ChildPath 'config.yml'
$configContent = Get-Content -Path $configPath -Raw
$config = $configContent | ConvertFrom-Yaml

$apiKey = $config.variables.apikey
$userEmail = $config.variables.userEmail
$userSecret = $config.variables.secret

Write-Host "Testing SSI GraphQL API - createEvent" -ForegroundColor Cyan

$endpoint = "https://shootnscoreit.com/graphql/"

$headers = @{
    'Content-Type' = 'application/json'
    'x-api-key' = $apiKey
}

# Authenticate
Write-Host "`n--- Authenticating ---" -ForegroundColor Yellow
$authQuery = @{
    query = 'mutation TokenAuth($email: String!, $password: String!) { token_auth(email: $email, password: $password) { token { token } refresh_token { token } success errors } }'
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
        Write-Host "Authentication successful!" -ForegroundColor Green
        $headers['Authorization'] = "JWT $jwtToken"
    }
    else {
        Write-Host "Auth failed: $($response.Content)" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "Auth Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# First, introspect available mutations to find the correct one
Write-Host "`n--- Introspecting mutations ---" -ForegroundColor Yellow
$introspectMutations = @{
    query = '{ __schema { mutationType { fields { name args { name type { name kind ofType { name } } } } } } }'
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $introspectMutations -Headers $headers -TimeoutSec 30
    $data = $response.Content | ConvertFrom-Json
    $createMutations = $data.data.__schema.mutationType.fields | Where-Object { $_.name -like "*event*" -or $_.name -like "*Event*" }
    Write-Host "Event-related mutations:" -ForegroundColor Green
    $createMutations | ForEach-Object {
        Write-Host "  - $($_.name)" -ForegroundColor Cyan
        $_.args | ForEach-Object {
            $typeName = if ($_.type.name) { $_.type.name } elseif ($_.type.ofType.name) { $_.type.ofType.name } else { $_.type.kind }
            Write-Host "      arg: $($_.name) ($typeName)"
        }
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# First, get abstract event to understand the form structure
Write-Host "`n--- Getting abstract event for SRA ---" -ForegroundColor Yellow
$abstractQuery = @{
    query = @'
query {
  get_abstract_event(rule: "sr", sub_rule: "to") {
    name
    rule
    sub_rule
    get_status_choices {
      value
      display
    }
    get_registration_choices {
      value
      display
    }
    get_visibility_choices {
      value
      display
    }
  }
}
'@
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $abstractQuery -Headers $headers -TimeoutSec 30
    Write-Host "Abstract event response:" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    Write-Host ($data | ConvertTo-Json -Depth 10)
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Query one of the existing Oldies events to see its full structure
Write-Host "`n--- Querying existing Oldies event for structure ---" -ForegroundColor Yellow
$eventQuery = @{
    query = @'
query {
  events(search: "oldies") {
    id
    name
    starts
    ends
    rule
    sub_rule
    status
    registration
    results
    visibility
    region
    venue
    get_content_type_key
  }
}
'@
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $eventQuery -Headers $headers -TimeoutSec 30
    $data = $response.Content | ConvertFrom-Json
    if ($data.data.events -and $data.data.events.Count -gt 0) {
        $event = $data.data.events[0]
        Write-Host "Sample event structure:" -ForegroundColor Green
        Write-Host ($event | ConvertTo-Json -Depth 5)
        Write-Host "`nContent type key: $($event.get_content_type_key)" -ForegroundColor Cyan
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Try create_event with content_type from existing event
Write-Host "`n--- Testing create_event mutation ---" -ForegroundColor Yellow

# Per API docs: SRA Match uses rule: sr, sub_rule: to, firearms: 'rf,sg,hg'
# Keep form_input as a hashtable - it will be serialized as a JSON object when the whole request is converted
$formInput = @{
    name = "Test-Kupittaa - Jan 24, 2026"
    starts = "2026-01-24T09:00:00"
    ends = "2026-01-24T18:00:00"
}

Write-Host "form_input: $($formInput | ConvertTo-Json -Compress)" -ForegroundColor Gray

$createEventQuery = @{
    query = @'
mutation CreateEvent($form_input: JSON!, $rule: String!, $sub_rule: String!, $firearms: String) {
  create_event(form_input: $form_input, rule: $rule, sub_rule: $sub_rule, firearms: $firearms) {
    id
    name
    starts
    ends
    get_full_absolute_url
  }
}
'@
    variables = @{
        form_input = $formInput  # Pass as hashtable, not pre-serialized JSON string
        rule = "sr"
        sub_rule = "to"
        firearms = "rf,sg,hg"
    }
} | ConvertTo-Json -Depth 10

Write-Host "Request:" -ForegroundColor Gray
Write-Host $createEventQuery

try {
    $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $createEventQuery -Headers $headers -TimeoutSec 30
    Write-Host "`nResponse:" -ForegroundColor Green
    Write-Host $response.Content
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
