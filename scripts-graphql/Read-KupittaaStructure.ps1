<#
.SYNOPSIS
    Reads the full Kupittaa Cup structure: Cup → Matches → Squads → Competitors with scores
#>

Import-Module -Name powershell-yaml -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot "lib\SSI-GraphQL.psm1") -Force

$apiKeyPath = Join-Path $PSScriptRoot "config\api-key.yml"
$apiKeyConfig = Get-Content $apiKeyPath -Raw -Encoding UTF8 | ConvertFrom-Yaml

Write-Host "=== Authenticating ===" -ForegroundColor Cyan
$headers = Connect-SSIGraphQL `
    -Email $apiKeyConfig.email `
    -Password $apiKeyConfig.password `
    -ApiKey $apiKeyConfig.apiKey
Write-Host "  OK" -ForegroundColor Green

# ============================================================
# 1. Read a Kupittaa Cup (CT=136) — find one with component matches
# ============================================================
Write-Host "`n=== 1. KUPITTAA CUP STRUCTURE ===" -ForegroundColor Cyan

# The completed Kupittaa 31.01.2026 matches are IDs 1845, 1846, 1847
# Let's find their parent cup first
# Cups are CT=136, matches are CT=91

# Read the completed Tarkkuus match to find its parent cup
$q = @"
query ReadMatch {
    event(content_type: 91, id: "1845") {
        id
        name
        rule
        status
        uses_strings
        number_of_strings
        number_of_rounds_per_string
        supports_score_string_for_squad
        group { pk }
        squads {
            id
            get_content_type_key
            get_content_type_model
            ... on NordicSquadNode {
                competitors {
                    id
                    get_content_type_key
                    get_content_type_model
                    first_name
                    last_name
                    number
                    status
                    did_not_finish
                    is_scoring_started
                    ... on NordicCompetitorNode {
                        weapon_group
                        category
                        classification
                        tot_hits
                        tot_inner_hits
                        tot_precision_points
                        s1
                        s2
                        s3
                        s4
                        s5
                        s6
                        s1_points
                        s2_points
                        s3_points
                        s4_points
                        s5_points
                        s6_points
                    }
                }
            }
        }
    }
}
"@

$r = Invoke-SSIGraphQL -Headers $headers -Query $q -OperationName "ReadMatch"
$m = $r.event

Write-Host "  Match: $($m.name) (ID: $($m.id))" -ForegroundColor White
Write-Host "  Rule: $($m.rule), Status: $($m.status)" -ForegroundColor Gray
Write-Host "  Strings: $($m.number_of_strings) x $($m.number_of_rounds_per_string) rounds" -ForegroundColor Gray
Write-Host "  Group (cup ref): $($m.group)" -ForegroundColor Gray
Write-Host "  supports_score_string_for_squad: $($m.supports_score_string_for_squad)" -ForegroundColor Gray

foreach ($sq in $m.squads) {
    Write-Host "`n  Squad $($sq.id) (CT: $($sq.get_content_type_key), Model: $($sq.get_content_type_model)):" -ForegroundColor Yellow
    if ($sq.competitors) {
        foreach ($c in $sq.competitors) {
            Write-Host "    #$($c.number) $($c.first_name) $($c.last_name) (ID: $($c.id), CT: $($c.get_content_type_key))" -ForegroundColor White
            Write-Host "      Status: $($c.status), DNF: $($c.did_not_finish), Scoring: $($c.is_scoring_started)" -ForegroundColor Gray
            Write-Host "      Weapon: $($c.weapon_group), Cat: $($c.category), Class: $($c.classification)" -ForegroundColor Gray
            Write-Host "      Totals: hits=$($c.tot_hits) inner=$($c.tot_inner_hits) pts=$($c.tot_precision_points)" -ForegroundColor Gray
            Write-Host "      S1=$($c.s1)($($c.s1_points)p) S2=$($c.s2)($($c.s2_points)p) S3=$($c.s3)($($c.s3_points)p)" -ForegroundColor Cyan
            Write-Host "      S4=$($c.s4)($($c.s4_points)p) S5=$($c.s5)($($c.s5_points)p) S6=$($c.s6)($($c.s6_points)p)" -ForegroundColor Cyan
        }
    } else {
        Write-Host "    (no competitors)" -ForegroundColor DarkGray
    }
}

# ============================================================
# 2. Now read the TEST match 1889 to see its structure
# ============================================================
Write-Host "`n`n=== 2. TEST MATCH 1889 ===" -ForegroundColor Cyan

$q2 = @"
query ReadTestMatch {
    event(content_type: 91, id: "1889") {
        id
        name
        rule
        status
        uses_strings
        number_of_strings
        number_of_rounds_per_string
        supports_score_string_for_squad
        group { pk }
        squads {
            id
            get_content_type_key
            get_content_type_model
            ... on NordicSquadNode {
                competitors {
                    id
                    get_content_type_key
                    get_content_type_model
                    first_name
                    last_name
                    number
                    status
                    did_not_finish
                    is_scoring_started
                    ... on NordicCompetitorNode {
                        weapon_group
                        category
                        classification
                        tot_hits
                        tot_inner_hits
                        tot_precision_points
                        s1
                        s2
                        s3
                        s4
                        s5
                        s6
                        s1_points
                        s2_points
                        s3_points
                        s4_points
                        s5_points
                        s6_points
                    }
                }
            }
        }
    }
}
"@

$r2 = Invoke-SSIGraphQL -Headers $headers -Query $q2 -OperationName "ReadTestMatch"
$m2 = $r2.event

Write-Host "  Match: $($m2.name) (ID: $($m2.id))" -ForegroundColor White
Write-Host "  Rule: $($m2.rule), Status: $($m2.status)" -ForegroundColor Gray
Write-Host "  Strings: $($m2.number_of_strings) x $($m2.number_of_rounds_per_string) rounds" -ForegroundColor Gray
Write-Host "  Group (cup ref): $($m2.group)" -ForegroundColor Gray

foreach ($sq in $m2.squads) {
    Write-Host "`n  Squad $($sq.id) (CT: $($sq.get_content_type_key), Model: $($sq.get_content_type_model)):" -ForegroundColor Yellow
    if ($sq.competitors) {
        foreach ($c in $sq.competitors) {
            Write-Host "    #$($c.number) $($c.first_name) $($c.last_name) (ID: $($c.id), CT: $($c.get_content_type_key))" -ForegroundColor White
            Write-Host "      Status: $($c.status), DNF: $($c.did_not_finish), Scoring: $($c.is_scoring_started)" -ForegroundColor Gray
            Write-Host "      Totals: hits=$($c.tot_hits) inner=$($c.tot_inner_hits) pts=$($c.tot_precision_points)" -ForegroundColor Gray
            Write-Host "      S1=$($c.s1)($($c.s1_points)p) S2=$($c.s2)($($c.s2_points)p) S3=$($c.s3)($($c.s3_points)p)" -ForegroundColor Cyan
            Write-Host "      S4=$($c.s4)($($c.s4_points)p) S5=$($c.s5)($($c.s5_points)p) S6=$($c.s6)($($c.s6_points)p)" -ForegroundColor Cyan
        }
    } else {
        Write-Host "    (no competitors)" -ForegroundColor DarkGray
    }
}

# ============================================================
# 3. Content type mapping summary
# ============================================================
Write-Host "`n`n=== 3. CONTENT TYPE MAPPING ===" -ForegroundColor Cyan
Write-Host "  NordicSerie (Cup): CT=136" -ForegroundColor White
Write-Host "  NordicMatch:       CT=91 (rule=rl for RESUL)" -ForegroundColor White
Write-Host "  NordicStage:       CT=68" -ForegroundColor White
Write-Host "  NordicSquad:       CT=? (from get_content_type_key)" -ForegroundColor White
Write-Host "  NordicCompetitor:  CT=? (from get_content_type_key)" -ForegroundColor White

Write-Host "`n=== DONE ===" -ForegroundColor Cyan
