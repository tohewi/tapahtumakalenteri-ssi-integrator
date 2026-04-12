
Import-Module .\scripts-graphql\lib\SSI-GraphQL.psm1
$config = Get-Content .\scripts-graphql\config\api-key.yml | ConvertFrom-Yaml

Write-Host "Authenticating to SSI (Web Session)..."
$connectScript = ".\archive\scripts-legacy\Connect-SSI.ps1"
$session = & $connectScript -Username $config.email -Password $config.password

if ($null -eq $session) {
    Write-Error "Login failed, session is null"
    exit 1
}

Write-Host "Discovering Cup fields..."
$cupUrl = "https://shootnscoreit.com/series/nordic/create-resul-cup/"
$cupFields = Get-SSIFormFields -Session $session -Url $cupUrl
$cupFields | ConvertTo-Json -Depth 10 | Out-File "cup-fields.json"

Write-Host "Discovering Match fields..."
$matchUrl = "https://shootnscoreit.com/nordic/create-resul-25-kuvio-pistol/"
$matchFields = Get-SSIFormFields -Session $session -Url $matchUrl
$matchFields | ConvertTo-Json -Depth 10 | Out-File "match-fields.json"

Write-Host "Done. Data saved to cup-fields.json and match-fields.json"
