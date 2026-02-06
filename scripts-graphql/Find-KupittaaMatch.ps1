<#
.SYNOPSIS
    Finds Kupittaa matches and tests reading a string-based Nordic match
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

# 1. Search for Kupittaa matches by scanning IDs with CT=91 (NordicMatch)
Write-Host "`n=== 1. Scanning for Kupittaa matches (CT=91) ===" -ForegroundColor Cyan

$found = @()
# Try a wide range of IDs - Kupittaa matches were created recently
foreach ($mid in 1800..1920) {
    try {
        $q = @"
query Probe {
    event(content_type: 91, id: "$mid") {
        id
        name
        rule
        uses_strings
        number_of_strings
        number_of_rounds_per_string
        starts
        status
    }
}
"@
        $r = Invoke-SSIGraphQL -Headers $headers -Query $q -OperationName "Probe"
        if ($r.event -and $r.event.id) {
            $e = $r.event
            $strings = if ($e.uses_strings) { "STRINGS=$($e.number_of_strings)x$($e.number_of_rounds_per_string)" } else { "no-strings" }
            Write-Host "  ID=$($e.id) '$($e.name)' $($e.starts) rule=$($e.rule) $strings status=$($e.status)" -ForegroundColor White
            $found += $e
        }
    } catch {
        # silent
    }
}

Write-Host "`n  Found $($found.Count) matches in range 1800-1920" -ForegroundColor Yellow

# 2. Also try CT=136 (NordicSerie) for cups
Write-Host "`n=== 2. Scanning for cups (CT=136) ===" -ForegroundColor Cyan

foreach ($sid in 80..120) {
    try {
        $q = @"
query ProbeSerie {
    event(content_type: 136, id: "$sid") {
        id
        name
        rule
        starts
        status
    }
}
"@
        $r = Invoke-SSIGraphQL -Headers $headers -Query $q -OperationName "ProbeSerie"
        if ($r.event -and $r.event.id) {
            $e = $r.event
            Write-Host "  ID=$($e.id) '$($e.name)' $($e.starts) rule=$($e.rule) status=$($e.status)" -ForegroundColor White
        }
    } catch {
        # silent
    }
}

# 3. Test reading a known string-based match (from the events list)
Write-Host "`n=== 3. Reading string-based match detail ===" -ForegroundColor Cyan

# Use match 141 (Kretsprecision) or 86 (Klubbmästerskap Precision) as test
$testMatchId = "141"
Write-Host "  Testing with match $testMatchId (CT=91)..." -ForegroundColor Gray

try {
    $q = @"
query StringMatch {
    event(content_type: 91, id: "$testMatchId") {
        id
        name
        rule
        uses_strings
        number_of_strings
        number_of_rounds_per_string
        supports_score_string_for_squad
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
    $r = Invoke-SSIGraphQL -Headers $headers -Query $q -OperationName "StringMatch"
    $m = $r.event
    
    Write-Host "  Match: $($m.name)" -ForegroundColor White
    Write-Host "  Strings: $($m.number_of_strings) x $($m.number_of_rounds_per_string) rounds" -ForegroundColor White
    Write-Host "  supports_score_string_for_squad: $($m.supports_score_string_for_squad)" -ForegroundColor White
    
    foreach ($sq in $m.squads) {
        Write-Host "`n  Squad $($sq.id) (CT: $($sq.get_content_type_key), Model: $($sq.get_content_type_model)):" -ForegroundColor Yellow
        if ($sq.competitors) {
            foreach ($c in $sq.competitors) {
                Write-Host "    #$($c.number) $($c.first_name) $($c.last_name) (ID: $($c.id), CT: $($c.get_content_type_key))" -ForegroundColor White
                Write-Host "      Totals: hits=$($c.tot_hits) inner=$($c.tot_inner_hits) pts=$($c.tot_precision_points)" -ForegroundColor Gray
                Write-Host "      S1=$($c.s1)($($c.s1_points)p) S2=$($c.s2)($($c.s2_points)p) S3=$($c.s3)($($c.s3_points)p) S4=$($c.s4)($($c.s4_points)p) S5=$($c.s5)($($c.s5_points)p) S6=$($c.s6)($($c.s6_points)p)" -ForegroundColor Cyan
            }
        } else {
            Write-Host "    (no competitors)" -ForegroundColor DarkGray
        }
    }
} catch {
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== DONE ===" -ForegroundColor Cyan
