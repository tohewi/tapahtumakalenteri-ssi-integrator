param([string]$TypeName = "ScoringProgressNode")
$schemaPath = Join-Path $PSScriptRoot "schema-output.json"
if (-not (Test-Path -Path $schemaPath)) {
    Write-Error "GraphQL schema file not found at '$schemaPath'. Ensure 'schema-output.json' has been generated before running List-TypeFields.ps1."
    return
}
$schema = Get-Content $schemaPath -Raw | ConvertFrom-Json
$t = $schema.data.__schema.types | Where-Object { $_.name -eq $TypeName }
if ($t) {
    Write-Host "$TypeName ($($t.kind)):"
    if ($t.fields) { $t.fields | ForEach-Object { Write-Host "  $($_.name)" } }
    if ($t.inputFields) { $t.inputFields | ForEach-Object { Write-Host "  $($_.name) (input)" } }
} else {
    Write-Host "$TypeName not found"
}
