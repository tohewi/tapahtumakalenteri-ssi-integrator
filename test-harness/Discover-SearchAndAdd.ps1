# Fetch participant-search-and-add and participant edit pages
$ErrorActionPreference = "Stop"
Import-Module PowerShell-Yaml -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot "lib\SSI-TestHelpers.psm1") -Force

$apiConfig = Get-Content (Join-Path $PSScriptRoot "..\scripts-graphql\config\api-key.yml") -Raw -Encoding UTF8 | ConvertFrom-Yaml
$BaseUri = "https://shootnscoreit.com"

Write-Host "Logging in..." -ForegroundColor Gray
$session = Connect-SSIWeb -Email $apiConfig.email -Password $apiConfig.password

$pagesToFetch = @(
    @{ url = "$BaseUri/event/91/1903/participant-search-and-add/"; label = "Match search-and-add" }
    @{ url = "$BaseUri/event/136/158/participant-search-and-add/"; label = "Cup search-and-add" }
    @{ url = "$BaseUri/event/participant/93/21898/edit/"; label = "Participant edit" }
    @{ url = "$BaseUri/event/participant/93/21898/"; label = "Participant detail" }
    @{ url = "$BaseUri/event/91/1903/squads/"; label = "Match squads" }
)

foreach ($entry in $pagesToFetch) {
    Write-Host "`n--- $($entry.label) ---" -ForegroundColor Cyan
    Write-Host "  $($entry.url)" -ForegroundColor Gray
    try {
        $resp = Invoke-WebRequest -Uri $entry.url -WebSession $session -UseBasicParsing -ErrorAction Stop
        $safeName = ($entry.label -replace '[^a-zA-Z0-9]', '_').ToLower()
        $debugFile = Join-Path $PSScriptRoot "debug-$safeName.html"
        $resp.Content | Out-File $debugFile -Encoding UTF8
        Write-Host "  200 OK — saved ($($resp.Content.Length) chars)" -ForegroundColor Green

        # Forms
        $forms = [regex]::Matches($resp.Content, '<form[^>]*>')
        foreach ($f in $forms) { Write-Host "  FORM: $($f.Value)" -ForegroundColor Yellow }

        # Non-meta input fields
        $names = [regex]::Matches($resp.Content, 'name="([^"]+)"') |
            ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique |
            Where-Object { $_ -notmatch '^(viewport|robots|author|description|keywords|twitter|apple|msapplication|theme|format|google|mobile|application)' }
        if ($names) { Write-Host "  Fields: $($names -join ', ')" -ForegroundColor White }

        # Select options (for squad dropdowns etc)
        $selects = [regex]::Matches($resp.Content, '<select[^>]*name="([^"]+)"[^>]*>')
        foreach ($s in $selects) { Write-Host "  SELECT: $($s.Groups[1].Value)" -ForegroundColor Magenta }

        # Squad-related content
        $squadMatches = [regex]::Matches($resp.Content, '(?i)squad[^<>"]{0,100}')
        foreach ($sq in $squadMatches | Select-Object -First 10) { Write-Host "  SQUAD: $($sq.Value)" -ForegroundColor DarkYellow }

        # Email fields
        $emailFields = [regex]::Matches($resp.Content, '(?i)type="email"|email[^<>"]{0,50}')
        foreach ($e in $emailFields | Select-Object -First 5) { Write-Host "  EMAIL: $($e.Value)" -ForegroundColor Blue }

        # Search inputs
        $searchInputs = [regex]::Matches($resp.Content, '(?i)search[^<>"]{0,100}')
        foreach ($si in $searchInputs | Select-Object -First 10) { Write-Host "  SEARCH: $($si.Value)" -ForegroundColor Gray }
    }
    catch {
        $status = if ($_.Exception.Response) { $_.Exception.Response.StatusCode } else { "ERROR" }
        Write-Host "  $status" -ForegroundColor Red
    }
}
