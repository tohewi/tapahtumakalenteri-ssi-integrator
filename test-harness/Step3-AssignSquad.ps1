<#
.SYNOPSIS
  Step 3: Assign squad 3 to turreskuko1 in all matches of CUP 158.
  Uses the participant edit form to change the squad.
#>
param(
    [int]$TargetSquadNumber = 3,
    [int[]]$CompetitorIds = @(21901, 21902, 21903),
    [int[]]$MatchIds = @(1903, 1904, 1905)
)

$ErrorActionPreference = "Stop"
$base = "https://shootnscoreit.com"

# Load admin credentials
$envFile = Join-Path $PSScriptRoot "..\scoring-proxy\.env"
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^(\w+)=(.*)$') { $envVars[$Matches[1]] = $Matches[2] }
}

# Login
Write-Host "=== Admin login ===" -ForegroundColor Cyan
$loginUrl = "$base/login/?next=/dashboard/"
$null = Invoke-WebRequest -Uri $loginUrl -SessionVariable session -UseBasicParsing
$loginBody = @{ username = $envVars['SSI_ADMIN_EMAIL']; password = $envVars['SSI_ADMIN_PASSWORD']; keep = "on" }
try {
    $null = Invoke-WebRequest -Uri $loginUrl -Method POST -Body $loginBody -WebSession $session -UseBasicParsing -MaximumRedirection 0
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 302) {
        Write-Host "  Login OK" -ForegroundColor Green
    } else { throw }
}

# For each competitor, get the edit form, find squad options, and assign squad 3
for ($i = 0; $i -lt $CompetitorIds.Count; $i++) {
    $compId = $CompetitorIds[$i]
    $matchId = $MatchIds[$i]

    Write-Host "`n=== Match $matchId — Competitor $compId ===" -ForegroundColor Cyan

    # 1. GET the edit form
    $editUrl = "$base/event/participant/93/$compId/edit/"
    Write-Host "  GET $editUrl" -ForegroundColor Gray
    $editPage = Invoke-WebRequest -Uri $editUrl -WebSession $session -UseBasicParsing
    $editPage.Content | Out-File "test-harness/debug-step3-edit-$compId.html" -Encoding UTF8
    Write-Host "  Edit page: $($editPage.Content.Length) chars" -ForegroundColor Gray

    # 2. Find squad select options
    $squadSelect = [regex]::Match($editPage.Content, '<select[^>]*name="squad"[^>]*>([\s\S]*?)</select>')
    if (-not $squadSelect.Success) {
        Write-Host "  ERROR: No squad select found!" -ForegroundColor Red
        continue
    }

    $options = [regex]::Matches($squadSelect.Groups[1].Value, '<option\s+value="([^"]*)"([^>]*)>([\s\S]*?)</option>')
    Write-Host "  Squad options:" -ForegroundColor Gray
    $targetSquadValue = $null
    foreach ($opt in $options) {
        $val = $opt.Groups[1].Value
        $label = $opt.Groups[3].Value.Trim()
        $selected = if ($opt.Groups[2].Value -match "selected") { " (CURRENT)" } else { "" }
        Write-Host "    value=$val — $label$selected" -ForegroundColor $(if ($selected) { "Yellow" } else { "White" })

        # Find squad 3 by the label containing the squad number or by position
        if ($label -match "^$TargetSquadNumber\b" -or $label -match "Squad $TargetSquadNumber" -or $label -match "#$TargetSquadNumber") {
            $targetSquadValue = $val
        }
    }

    # If we couldn't match by label, use the Nth option (squad numbers are 1-indexed, option 0 is empty)
    if (-not $targetSquadValue -and $options.Count -gt $TargetSquadNumber) {
        $targetSquadValue = $options[$TargetSquadNumber].Groups[1].Value
        Write-Host "  Using option index $TargetSquadNumber as target squad" -ForegroundColor Yellow
    }

    if (-not $targetSquadValue) {
        Write-Host "  ERROR: Could not find squad $TargetSquadNumber!" -ForegroundColor Red
        continue
    }
    Write-Host "  Target squad value: $targetSquadValue" -ForegroundColor Green

    # 3. Extract current form values
    $formBody = @{}

    # Hidden inputs
    $hiddens = [regex]::Matches($editPage.Content, '<input[^>]*type="hidden"[^>]*name="([^"]*)"[^>]*value="([^"]*)"')
    foreach ($h in $hiddens) { $formBody[$h.Groups[1].Value] = $h.Groups[2].Value }

    # Selected options from all selects (except squad — we override that)
    $selects = [regex]::Matches($editPage.Content, '<select[^>]*name="([^"]*)"[^>]*>([\s\S]*?)</select>')
    foreach ($sel in $selects) {
        $selName = $sel.Groups[1].Value
        $selectedOpt = [regex]::Match($sel.Groups[2].Value, '<option[^>]*value="([^"]*)"[^>]*selected')
        if ($selectedOpt.Success) {
            $formBody[$selName] = $selectedOpt.Groups[1].Value
        } else {
            # No selected attr — use first option with a non-empty value
            $firstOpt = [regex]::Match($sel.Groups[2].Value, '<option\s+value="([^"]+)"')
            if ($firstOpt.Success) {
                $formBody[$selName] = $firstOpt.Groups[1].Value
            }
        }
    }

    # Input text and number fields
    $inputs = [regex]::Matches($editPage.Content, '<input[^>]*type="(?:text|number)"[^>]*name="([^"]*)"[^>]*value="([^"]*)"')
    foreach ($inp in $inputs) { $formBody[$inp.Groups[1].Value] = $inp.Groups[2].Value }
    # Also reversed order (name before type)
    $inputs2 = [regex]::Matches($editPage.Content, '<input[^>]*name="([^"]*)"[^>]*(?:type="(?:text|number)")[^>]*value="([^"]*)"')
    foreach ($inp in $inputs2) { if (-not $formBody.ContainsKey($inp.Groups[1].Value)) { $formBody[$inp.Groups[1].Value] = $inp.Groups[2].Value } }
    # Also value before name
    $inputs3 = [regex]::Matches($editPage.Content, '<input[^>]*value="([^"]*)"[^>]*name="([^"]*)"[^>]*type="(?:text|number)"')
    foreach ($inp in $inputs3) { if (-not $formBody.ContainsKey($inp.Groups[2].Value)) { $formBody[$inp.Groups[2].Value] = $inp.Groups[1].Value } }

    # Override squad with target
    $formBody["squad"] = $targetSquadValue

    # Set status to approved ("a") — may be "x" (Deleted) from previous deletion
    $formBody["status"] = "a"

    Write-Host "  Form fields: $($formBody.Keys -join ', ')" -ForegroundColor Gray
    Write-Host "  squad = $targetSquadValue" -ForegroundColor White

    # 4. POST the edit form
    Write-Host "  Submitting edit..." -ForegroundColor Yellow
    $editStatus = 0
    try {
        $editResp = Invoke-WebRequest -Uri $editUrl -Method POST -Body $formBody -WebSession $session -UseBasicParsing -MaximumRedirection 0
        $editStatus = $editResp.StatusCode
    } catch {
        $editStatus = $_.Exception.Response.StatusCode.value__
        $editResp = $null
    }

    if ($editStatus -eq 302) {
        Write-Host "  SUCCESS: Squad assigned (302 redirect)" -ForegroundColor Green
    } elseif ($editResp) {
        Write-Host "  Response: $editStatus" -ForegroundColor Yellow
        $editResp.Content | Out-File "test-harness/debug-step3-result-$compId.html" -Encoding UTF8
        if ($editResp.Content -match "errorlist") {
            $errMatch = [regex]::Match($editResp.Content, '<ul class="errorlist"[^>]*>([\s\S]*?)</ul>')
            if ($errMatch.Success) {
                Write-Host "  ERROR: $($errMatch.Groups[1].Value -replace '<[^>]+>','' -replace '\s+',' ')" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "  Response: $editStatus (no body)" -ForegroundColor Yellow
    }
}

Write-Host "`nDone. Please check SSI to verify squad assignments." -ForegroundColor Cyan
