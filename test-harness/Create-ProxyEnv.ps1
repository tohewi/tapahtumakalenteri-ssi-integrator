# Create scoring-proxy/.env from scripts-graphql/config/api-key.yml
Import-Module PowerShell-Yaml -ErrorAction Stop
$c = Get-Content (Join-Path $PSScriptRoot "..\scripts-graphql\config\api-key.yml") -Raw -Encoding UTF8 | ConvertFrom-Yaml
$envFile = Join-Path $PSScriptRoot "..\scoring-proxy\.env"
$content = "SSI_ADMIN_EMAIL=$($c.email)`nSSI_ADMIN_PASSWORD=$($c.password)`nSSI_ADMIN_API_KEY=$($c.apiKey)"
$content | Out-File $envFile -Encoding UTF8 -NoNewline
Write-Host "Created $envFile"
