<#
.SYNOPSIS
    Reads match 1889 in detail — checking all competitor statuses
#>

Import-Module -Name powershell-yaml -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot "lib\SSI-GraphQL.psm1") -Force

$apiKeyPath = Join-Path $PSScriptRoot "config\api-key.yml"
$apiKeyConfig = Get-Content $apiKeyPath -Raw -Encoding UTF8 | ConvertFrom-Yaml

$headers = Connect-SSIGraphQL `
    -Email $apiKeyConfig.email `
    -Password $apiKeyConfig.password `
    -ApiKey $apiKeyConfig.apiKey
Write-Host "Authenticated" -ForegroundColor Green

$q = @"
query ReadTest {
    event(content_type: 91, id: "1889") {
        id
        name
        rule
        status
        uses_strings
        number_of_strings
        number_of_rounds_per_string
        starts
        registration
        is_registration_possible
        number_of_mainmatch_competitors_registered
        number_of_mainmatch_competitors_approved
        number_of_mainmatch_competitors_pending
        number_of_mainmatch_competitors_waiting
        mainmatch_competitors_registered {
            id
            get_content_type_key
            first_name
            last_name
            number
            status
            get_status_display
        }
        mainmatch_competitors {
            id
            first_name
            last_name
            number
            status
            get_status_display
        }
        mainmatch_competitors_approved {
            id
            first_name
            last_name
            number
            status
        }
        mainmatch_competitors_pending {
            id
            first_name
            last_name
            number
            status
        }
        mainmatch_competitors_waiting {
            id
            first_name
            last_name
            number
            status
        }
        squads {
            id
            get_content_type_key
            ... on NordicSquadNode {
                competitors {
                    id
                    first_name
                    last_name
                    number
                    status
                    get_status_display
                }
            }
        }
    }
}
"@

$r = Invoke-SSIGraphQL -Headers $headers -Query $q -OperationName "ReadTest"
$m = $r.event

Write-Host "`nMatch: $($m.name) (ID: $($m.id))" -ForegroundColor White
Write-Host "Status: $($m.status), Registration: $($m.registration)" -ForegroundColor Gray
Write-Host "is_registration_possible: $($m.is_registration_possible)" -ForegroundColor Gray
Write-Host "Registered: $($m.number_of_mainmatch_competitors_registered)" -ForegroundColor White
Write-Host "Approved: $($m.number_of_mainmatch_competitors_approved)" -ForegroundColor White
Write-Host "Pending: $($m.number_of_mainmatch_competitors_pending)" -ForegroundColor White
Write-Host "Waiting: $($m.number_of_mainmatch_competitors_waiting)" -ForegroundColor White

Write-Host "`n--- All registered ---" -ForegroundColor Yellow
foreach ($c in $m.mainmatch_competitors_registered) {
    Write-Host "  #$($c.number) $($c.first_name) $($c.last_name) (ID: $($c.id), CT: $($c.get_content_type_key), Status: $($c.status) / $($c.get_status_display))" -ForegroundColor White
}

Write-Host "`n--- All competitors ---" -ForegroundColor Yellow
foreach ($c in $m.mainmatch_competitors) {
    Write-Host "  #$($c.number) $($c.first_name) $($c.last_name) (ID: $($c.id), Status: $($c.status) / $($c.get_status_display))" -ForegroundColor White
}

Write-Host "`n--- Approved ---" -ForegroundColor Yellow
foreach ($c in $m.mainmatch_competitors_approved) {
    Write-Host "  #$($c.number) $($c.first_name) $($c.last_name) (ID: $($c.id), Status: $($c.status))" -ForegroundColor White
}

Write-Host "`n--- Pending ---" -ForegroundColor Yellow
foreach ($c in $m.mainmatch_competitors_pending) {
    Write-Host "  #$($c.number) $($c.first_name) $($c.last_name) (ID: $($c.id), Status: $($c.status))" -ForegroundColor White
}

Write-Host "`n--- Waiting ---" -ForegroundColor Yellow
foreach ($c in $m.mainmatch_competitors_waiting) {
    Write-Host "  #$($c.number) $($c.first_name) $($c.last_name) (ID: $($c.id), Status: $($c.status))" -ForegroundColor White
}

Write-Host "`n--- Squads ---" -ForegroundColor Yellow
foreach ($sq in $m.squads) {
    Write-Host "  Squad $($sq.id) (CT: $($sq.get_content_type_key)):" -ForegroundColor Cyan
    if ($sq.competitors) {
        foreach ($c in $sq.competitors) {
            Write-Host "    #$($c.number) $($c.first_name) $($c.last_name) (ID: $($c.id), Status: $($c.status) / $($c.get_status_display))" -ForegroundColor White
        }
    } else {
        Write-Host "    (empty)" -ForegroundColor DarkGray
    }
}
