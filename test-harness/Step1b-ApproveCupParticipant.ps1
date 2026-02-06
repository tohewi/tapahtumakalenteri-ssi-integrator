<#
.SYNOPSIS
  Step 1b: Find and approve turreskuko2 in CUP 158 participants page.
#>
param(
    [int]$CupId = 158,
    [string]$ShooterName = "Tuloskone 2"
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

# Get CUP participants page
Write-Host "`n=== CUP $CupId participants page ===" -ForegroundColor Cyan
$partUrl = "$base/event/136/$CupId/participants/"
$partPage = Invoke-WebRequest -Uri $partUrl -WebSession $session -UseBasicParsing
$partPage.Content | Out-File "test-harness/debug-cup-participants.html" -Encoding UTF8
Write-Host "  Page: $($partPage.Content.Length) chars" -ForegroundColor Gray

# Find the shooter
$lines = $partPage.Content -split "`n"
Write-Host "`n=== Looking for '$ShooterName' ===" -ForegroundColor Cyan
foreach ($line in $lines) {
    if ($line -match $ShooterName) {
        Write-Host "  MATCH: $($line.Trim().Substring(0, [Math]::Min(300, $line.Trim().Length)))" -ForegroundColor White
    }
}

# Find all participant links (any content type)
Write-Host "`n=== All participant links ===" -ForegroundColor Cyan
$allLinks = [regex]::Matches($partPage.Content, 'href="(/event/participant/\d+/\d+/[^"]*)"')
Write-Host "  Found $($allLinks.Count) participant links" -ForegroundColor Gray
foreach ($link in $allLinks | Select-Object -First 10) {
    Write-Host "  $($link.Groups[1].Value)" -ForegroundColor DarkGray
}

# Find edit links
$editLinks = [regex]::Matches($partPage.Content, 'href="(/event/participant/\d+/\d+/edit/)"')
Write-Host "`n  Found $($editLinks.Count) edit links" -ForegroundColor Gray
foreach ($link in $editLinks | Select-Object -First 10) {
    Write-Host "  $($link.Groups[1].Value)" -ForegroundColor DarkGray
}

# Find participant links near the shooter name
$shooterBlock = [regex]::Match($partPage.Content, "(?s)$ShooterName[\s\S]{0,1000}")
if ($shooterBlock.Success) {
    Write-Host "`n=== Context around shooter name ===" -ForegroundColor Cyan
    $context = $shooterBlock.Value.Substring(0, [Math]::Min(800, $shooterBlock.Value.Length))
    Write-Host $context -ForegroundColor Gray
}

Write-Host "`nDone." -ForegroundColor Cyan
