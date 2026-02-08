# Extract form info from debug HTML files
param([string]$File)
$h = Get-Content $File -Raw
Write-Host "File: $File ($('{0:N0}' -f $h.Length) chars)"

# Forms
$forms = [regex]::Matches($h, '<form[^>]*>')
Write-Host "`n--- FORMS ($($forms.Count)) ---"
foreach ($f in $forms) { Write-Host "  $($f.Value)" }

# Input/select names
$names = [regex]::Matches($h, 'name="([^"]+)"')
$unique = $names | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
Write-Host "`n--- FORM FIELDS ($($unique.Count)) ---"
foreach ($n in $unique) { Write-Host "  $n" }

# Links with keywords
$links = [regex]::Matches($h, 'href="([^"]*(?:register|squad|competitor|invite|add|participant)[^"]*)"')
Write-Host "`n--- RELEVANT LINKS ($($links.Count)) ---"
foreach ($l in $links) { Write-Host "  $($l.Groups[1].Value)" }

# API endpoints / AJAX
$ajax = [regex]::Matches($h, '(?:url|fetch|XMLHttpRequest|api)[^"'']*["'']([^"'']+)["'']')
Write-Host "`n--- AJAX/API ($($ajax.Count)) ---"
foreach ($a in $ajax) { Write-Host "  $($a.Groups[1].Value)" }

# Data attributes
$data = [regex]::Matches($h, 'data-[a-z-]+="[^"]*"')
$dataUnique = $data | ForEach-Object { $_.Value } | Sort-Object -Unique
if ($dataUnique.Count -gt 0) {
    Write-Host "`n--- DATA ATTRIBUTES ($($dataUnique.Count)) ---"
    foreach ($d in $dataUnique | Select-Object -First 30) { Write-Host "  $d" }
}
