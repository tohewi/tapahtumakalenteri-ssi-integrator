<#
.SYNOPSIS
    Analyzes the saved SSI GraphQL schema for scoring-related types and mutations
#>

$schemaPath = Join-Path $PSScriptRoot "schema-output.json"
if (-not (Test-Path $schemaPath)) {
    Write-Error "Run Get-SSISchema.ps1 first to generate schema-output.json"
    exit 1
}

$schema = Get-Content $schemaPath -Raw | ConvertFrom-Json

# ============================================================
# 1. Scoring-related mutations
# ============================================================
Write-Host "`n========== SCORING MUTATIONS ==========" -ForegroundColor Cyan

$mutations = $schema.data.__schema.mutationType.fields | Where-Object {
    $_.name -match "score|scorecard|verify_comp|did_not_finish"
}

foreach ($m in $mutations) {
    Write-Host "`n--- $($m.name) ---" -ForegroundColor Yellow
    if ($m.description) {
        Write-Host "  Desc: $($m.description)" -ForegroundColor Gray
    }
    
    # Return type
    $retType = if ($m.type.name) { $m.type.name } else { "($($m.type.kind))" }
    Write-Host "  Returns: $retType" -ForegroundColor DarkGray
    
    foreach ($a in $m.args) {
        $tn = "unknown"
        if ($a.type.name) {
            $tn = "$($a.type.name) ($($a.type.kind))"
        } elseif ($a.type.ofType) {
            if ($a.type.ofType.name) {
                $tn = "$($a.type.ofType.name) ($($a.type.kind))"
            } elseif ($a.type.ofType.ofType) {
                $tn = "$($a.type.ofType.ofType.name) (LIST, $($a.type.kind))"
            }
        }
        Write-Host "  arg: $($a.name) -> $tn" -ForegroundColor White
    }
}

# ============================================================
# 2. All types with "score" or "nordic" in the name
# ============================================================
Write-Host "`n`n========== SCORING/NORDIC TYPES ==========" -ForegroundColor Cyan

$scoringTypes = $schema.data.__schema.types | Where-Object {
    ($_.name -match "Score|Scorecard|Nordic") -and ($_.name -notmatch "^__")
}

foreach ($t in $scoringTypes) {
    Write-Host "`n--- $($t.name) ($($t.kind)) ---" -ForegroundColor Yellow
    if ($t.description) {
        Write-Host "  $($t.description)" -ForegroundColor Gray
    }
    
    # Show fields
    $fields = if ($t.fields) { $t.fields } elseif ($t.inputFields) { $t.inputFields }
    if ($fields) {
        foreach ($f in $fields) {
            $ft = "unknown"
            if ($f.type.name) {
                $ft = $f.type.name
            } elseif ($f.type.kind) {
                $ft = $f.type.kind
            }
            Write-Host "  $($f.name): $ft" -ForegroundColor White
        }
    }
}

# ============================================================
# 3. Queries related to scoring/competitors/nordic
# ============================================================
Write-Host "`n`n========== SCORING/NORDIC QUERIES ==========" -ForegroundColor Cyan

$queries = $schema.data.__schema.queryType.fields | Where-Object {
    $_.name -match "score|competitor|nordic|squad"
}

foreach ($q in $queries) {
    Write-Host "`n--- $($q.name) ---" -ForegroundColor Yellow
    if ($q.description) {
        Write-Host "  Desc: $($q.description)" -ForegroundColor Gray
    }
    
    $retType = if ($q.type.name) { $q.type.name } else { "($($q.type.kind))" }
    Write-Host "  Returns: $retType" -ForegroundColor DarkGray
    
    foreach ($a in $q.args) {
        $tn = "unknown"
        if ($a.type.name) {
            $tn = "$($a.type.name) ($($a.type.kind))"
        } elseif ($a.type.ofType) {
            if ($a.type.ofType.name) {
                $tn = "$($a.type.ofType.name) ($($a.type.kind))"
            }
        }
        Write-Host "  arg: $($a.name) -> $tn" -ForegroundColor White
    }
}
