param([string]$TypeName = "ScoringProgressNode")
$schema = Get-Content (Join-Path $PSScriptRoot "schema-output.json") -Raw | ConvertFrom-Json
$t = $schema.data.__schema.types | Where-Object { $_.name -eq $TypeName }
if ($t) {
    Write-Host "$TypeName ($($t.kind)):"
    if ($t.fields) { $t.fields | ForEach-Object { Write-Host "  $($_.name)" } }
    if ($t.inputFields) { $t.inputFields | ForEach-Object { Write-Host "  $($_.name) (input)" } }
} else {
    Write-Host "$TypeName not found"
}
