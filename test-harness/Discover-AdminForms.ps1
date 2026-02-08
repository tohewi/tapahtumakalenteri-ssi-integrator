# Fetch send-invitation and squad-selection pages for form analysis
$ErrorActionPreference = "Stop"
Import-Module PowerShell-Yaml -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot "lib\SSI-TestHelpers.psm1") -Force

$apiConfig = Get-Content (Join-Path $PSScriptRoot "..\scripts-graphql\config\api-key.yml") -Raw -Encoding UTF8 | ConvertFrom-Yaml
$BaseUri = "https://shootnscoreit.com"

Write-Host "Logging in..." -ForegroundColor Gray
$session = Connect-SSIWeb -Email $apiConfig.email -Password $apiConfig.password

$pagesToFetch = @(
    @{ url = "$BaseUri/event/136/158/send-invitation/"; label = "Cup send-invitation" }
    @{ url = "$BaseUri/event/136/158/participants/"; label = "Cup participants" }
    @{ url = "$BaseUri/event/91/1903/squads/"; label = "Match squads view" }
    @{ url = "$BaseUri/event/91/1903/participants/"; label = "Match participants" }
)

foreach ($entry in $pagesToFetch) {
    Write-Host "`n--- $($entry.label) ---" -ForegroundColor Cyan
    Write-Host "  $($entry.url)" -ForegroundColor Gray
    try {
        $resp = Invoke-WebRequest -Uri $entry.url -WebSession $session -UseBasicParsing -ErrorAction Stop
        $safeName = ($entry.label -replace '[^a-zA-Z0-9]', '_').ToLower()
        $debugFile = Join-Path $PSScriptRoot "debug-$safeName.html"
        $resp.Content | Out-File $debugFile -Encoding UTF8
        Write-Host "  200 OK — saved debug-$safeName.html ($($resp.Content.Length) chars)" -ForegroundColor Green

        # Quick form analysis
        $forms = [regex]::Matches($resp.Content, '<form[^>]*>')
        foreach ($f in $forms) { Write-Host "  FORM: $($f.Value)" -ForegroundColor Yellow }

        $names = [regex]::Matches($resp.Content, 'name="([^"]+)"') |
            ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique |
            Where-Object { $_ -notmatch '^(viewport|robots|author|description|keywords|twitter|apple|msapplication|theme|format|google|mobile|application)' }
        if ($names) {
            Write-Host "  Fields: $($names -join ', ')" -ForegroundColor White
        }

        # Check for squad/email/competitor content
        $indicators = @()
        if ($resp.Content -match 'email') { $indicators += "EMAIL" }
        if ($resp.Content -match 'squad') { $indicators += "SQUAD" }
        if ($resp.Content -match 'invite') { $indicators += "INVITE" }
        if ($resp.Content -match 'competitor') { $indicators += "COMPETITOR" }
        if ($resp.Content -match 'drag|sortable') { $indicators += "DRAG-DROP" }
        if ($indicators) { Write-Host "  Contains: $($indicators -join ', ')" -ForegroundColor Magenta }
    }
    catch {
        $status = if ($_.Exception.Response) { $_.Exception.Response.StatusCode } else { "ERROR" }
        Write-Host "  $status" -ForegroundColor Red
    }
}
