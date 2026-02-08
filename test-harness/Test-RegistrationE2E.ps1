<#
.SYNOPSIS
  End-to-end test of the registration API flow.
  Exercises: captcha → cups → cup detail → submit registration.
.PARAMETER BaseUri
  Proxy base URL (default: http://localhost:3001)
.PARAMETER TestEmail
  SSI test user email to register
.PARAMETER CupId
  Specific cup ID to test with (default: auto-select TEST cup)
.PARAMETER SquadNumber
  Squad number to assign (default: 1)
#>
param(
    [string]$BaseUri = "http://localhost:3001",
    [string]$TestEmail = "",
    [string]$CupId = "",
    [int]$SquadNumber = 1
)

# If no email specified, read SSI_ADMIN_EMAIL from scoring-proxy/.env
if (-not $TestEmail) {
    $envFile = Join-Path $PSScriptRoot "..\scoring-proxy\.env"
    if (Test-Path $envFile) {
        $envLine = Get-Content $envFile | Where-Object { $_ -match '^SSI_ADMIN_EMAIL=' }
        if ($envLine) {
            $TestEmail = ($envLine -split '=', 2)[1].Trim()
            Write-Host "Using admin email from .env: $TestEmail" -ForegroundColor Gray
        }
    }
    if (-not $TestEmail) {
        Write-Host "ERROR: No -TestEmail and no .env file found" -ForegroundColor Red
        exit 1
    }
}

$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0

function Test-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    try {
        & $Action
        $script:passed++
        Write-Host "  ✓ PASS" -ForegroundColor Green
    }
    catch {
        $script:failed++
        Write-Host "  ✗ FAIL: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ──────────────────────────────────────────────
# Step 1: Health check
# ──────────────────────────────────────────────
Test-Step "Health check" {
    $resp = Invoke-RestMethod -Uri "$BaseUri/api/health" -Method GET
    if ($resp.status -ne "ok") { throw "Health check status: $($resp.status)" }
    Write-Host "  Status: $($resp.status), Uptime: $($resp.uptime)s" -ForegroundColor Gray
}

# ──────────────────────────────────────────────
# Step 2: Get captcha
# ──────────────────────────────────────────────
$captcha = $null
Test-Step "GET /api/register/captcha" {
    $script:captcha = Invoke-RestMethod -Uri "$BaseUri/api/register/captcha" -Method GET
    if (-not $captcha.id) { throw "No captcha ID returned" }
    if (-not $captcha.question) { throw "No captcha question returned" }
    Write-Host "  ID: $($captcha.id)" -ForegroundColor Gray
    Write-Host "  Question: $($captcha.question)" -ForegroundColor White

    # Solve it: parse "a + b = ?"
    if ($captcha.question -match '(\d+)\s*\+\s*(\d+)') {
        $script:captchaAnswer = [int]$Matches[1] + [int]$Matches[2]
        Write-Host "  Answer: $($script:captchaAnswer)" -ForegroundColor Gray
    }
    else { throw "Cannot parse captcha question" }
}

# ──────────────────────────────────────────────
# Step 3: List open cups
# ──────────────────────────────────────────────
$cups = @()
Test-Step "GET /api/register/cups" {
    $resp = Invoke-RestMethod -Uri "$BaseUri/api/register/cups" -Method GET
    $script:cups = @($resp.cups)
    if ($cups.Count -eq 0) { throw "No open cups returned" }
    Write-Host "  Found $($cups.Count) open cups:" -ForegroundColor Gray
    foreach ($c in $cups | Select-Object -First 3) {
        Write-Host "    $($c.id) — $($c.name) ($($c.registered)/$($c.maxCompetitors))" -ForegroundColor White
    }
    if ($cups.Count -gt 3) { Write-Host "    ... and $($cups.Count - 3) more" -ForegroundColor Gray }
}

# ──────────────────────────────────────────────
# Step 4: Select cup (TEST cup or first available)
# ──────────────────────────────────────────────
$selectedCup = $null
Test-Step "Select test cup" {
    if ($CupId) {
        $script:selectedCup = $cups | Where-Object { $_.id -eq $CupId }
    }
    else {
        # Prefer TEST cup
        $script:selectedCup = $cups | Where-Object { $_.name -match "TEST" } | Select-Object -First 1
    }
    if (-not $selectedCup) {
        Write-Host "  No TEST cup found, using first cup" -ForegroundColor Yellow
        $script:selectedCup = $cups[0]
    }
    Write-Host "  Selected: $($selectedCup.id) — $($selectedCup.name)" -ForegroundColor White
}

# ──────────────────────────────────────────────
# Step 5: Get cup detail with squads
# ──────────────────────────────────────────────
$cupDetail = $null
Test-Step "GET /api/register/cup/$($selectedCup.id)" {
    $script:cupDetail = Invoke-RestMethod -Uri "$BaseUri/api/register/cup/$($selectedCup.id)" -Method GET
    if (-not $cupDetail.squads) { throw "No squads returned" }
    Write-Host "  Cup: $($cupDetail.name)" -ForegroundColor White
    Write-Host "  Squads:" -ForegroundColor Gray
    foreach ($sq in $cupDetail.squads) {
        $status = if ($sq.full) { "FULL" } else { "$($sq.current)/$($sq.max)" }
        Write-Host "    Squad $($sq.number): $($sq.name) [$status]" -ForegroundColor $(if ($sq.full) { "Red" } else { "White" })
    }
}

# ──────────────────────────────────────────────
# Step 6: Validate input rejection (bad data)
# ──────────────────────────────────────────────
Test-Step "Input validation — reject bad cupId" {
    try {
        Invoke-RestMethod -Uri "$BaseUri/api/register/cup/abc" -Method GET -ErrorAction Stop
        throw "Should have been rejected"
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 400 -or $_.Exception.Message -match "400") {
            Write-Host "  400 returned for invalid cupId — correct" -ForegroundColor Gray
        }
        else { throw "Expected 400, got: $($_.Exception.Message)" }
    }
}

Test-Step "Input validation — reject bad submit body" {
    try {
        $badBody = @{ cupId = "abc"; squadNumber = 999; email = "not-email"; captchaId = "not-uuid"; captchaAnswer = "x" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$BaseUri/api/register/submit" -Method POST -Body $badBody -ContentType "application/json" -ErrorAction Stop
        throw "Should have been rejected"
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 400 -or $_.Exception.Message -match "400") {
            Write-Host "  400 returned for bad body — correct" -ForegroundColor Gray
        }
        else { throw "Expected 400, got: $($_.Exception.Message)" }
    }
}

# ──────────────────────────────────────────────
# Step 7: Submit registration (real E2E)
# ──────────────────────────────────────────────
$result = $null
Test-Step "POST /api/register/submit — register $TestEmail to cup $($selectedCup.id) squad $SquadNumber" {
    $body = @{
        cupId        = $selectedCup.id
        squadNumber  = $SquadNumber
        email        = $TestEmail
        captchaId    = $captcha.id
        captchaAnswer = $captchaAnswer
    } | ConvertTo-Json

    Write-Host "  Submitting..." -ForegroundColor Gray
    $script:result = Invoke-RestMethod -Uri "$BaseUri/api/register/submit" -Method POST -Body $body -ContentType "application/json"
    Write-Host "  Success: $($result.success)" -ForegroundColor $(if ($result.success) { "Green" } else { "Yellow" })
    Write-Host "  Message: $($result.message)" -ForegroundColor White
    if ($result.details) {
        Write-Host "  Details:" -ForegroundColor Gray
        foreach ($d in $result.details) {
            $icon = if ($d.success) { "✓" } else { "✗" }
            Write-Host "    $icon Match $($d.matchId): $($d.message)" -ForegroundColor $(if ($d.success) { "Green" } else { "Red" })
        }
    }
}

# ──────────────────────────────────────────────
# Step 8: Verify registration via cup detail
# ──────────────────────────────────────────────
if ($result -and $result.success) {
    Test-Step "Verify — re-read cup squads after registration" {
        $after = Invoke-RestMethod -Uri "$BaseUri/api/register/cup/$($selectedCup.id)" -Method GET
        $targetSquad = $after.squads | Where-Object { $_.number -eq $SquadNumber }
        Write-Host "  Squad $SquadNumber ($($targetSquad.name)): $($targetSquad.current)/$($targetSquad.max)" -ForegroundColor White
    }
}

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
Write-Host "`n================================================" -ForegroundColor White
Write-Host "E2E Results: $passed passed, $failed failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
Write-Host "================================================" -ForegroundColor White
