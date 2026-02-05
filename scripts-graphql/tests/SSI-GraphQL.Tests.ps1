<#
.SYNOPSIS
    Pester integration tests for SSI GraphQL API

.DESCRIPTION
    Tests authentication, event reading, and event creation against the live SSI GraphQL API.
    Requires valid API key and credentials in config/api-key.yml.

.EXAMPLE
    Invoke-Pester -Path .\scripts-graphql\tests\SSI-GraphQL.Tests.ps1 -Output Detailed
#>

BeforeAll {
    # Import the module
    $modulePath = Join-Path -Path $PSScriptRoot -ChildPath "..\lib\SSI-GraphQL.psm1"
    Import-Module $modulePath -Force

    # Load API key configuration
    $apiKeyPath = Join-Path -Path $PSScriptRoot -ChildPath "..\config\api-key.yml"
    if (-not (Test-Path $apiKeyPath)) {
        throw "API key configuration not found: $apiKeyPath. Copy api-key.yml.template to api-key.yml and fill in credentials."
    }

    Import-Module PowerShell-Yaml -ErrorAction Stop
    $apiKeyContent = Get-Content -Path $apiKeyPath -Raw -Encoding UTF8
    $script:ApiConfig = $apiKeyContent | ConvertFrom-Yaml

    if (-not $script:ApiConfig.apiKey -or $script:ApiConfig.apiKey -eq "YOUR_API_KEY_HERE") {
        throw "API key not configured in $apiKeyPath"
    }

    # Shared state for tests
    $script:Headers = $null
    $script:TestCupId = $null
    $script:TestCupUrl = $null
    $script:TestMatchId = $null
    $script:TestMatchUrl = $null
    $script:TestSquadId = $null
    $script:GraphQLEndpoint = "https://shootnscoreit.com/graphql/"

    # Test date (mid-February 2026 - close enough to verify, easy to clean up)
    $script:TestDate = Get-Date "2026-02-15"
    $script:TestDateIso = $script:TestDate.ToString("yyyy-MM-dd")
    $script:TestDateDisplay = $script:TestDate.ToString("dd.MM.yyyy")
}

Describe "SSI GraphQL API - Authentication" {

    It "Should authenticate with valid credentials and return headers" {
        $script:Headers = Connect-SSIGraphQL `
            -Email $script:ApiConfig.email `
            -Password $script:ApiConfig.password `
            -ApiKey $script:ApiConfig.apiKey

        $script:Headers | Should -Not -BeNullOrEmpty
        $script:Headers["x-api-key"] | Should -Be $script:ApiConfig.apiKey
        $script:Headers["authorization"] | Should -Match "^JWT .+"
        $script:Headers["Content-Type"] | Should -Be "application/json"
    }

    It "Should fail authentication with invalid password" {
        { Connect-SSIGraphQL `
            -Email $script:ApiConfig.email `
            -Password "wrong_password_12345" `
            -ApiKey $script:ApiConfig.apiKey
        } | Should -Throw
    }

    It "Should authenticate even with invalid API key (API key not validated at auth)" {
        # SSI does not validate the API key during token_auth - it only validates credentials
        # The API key is checked on subsequent GraphQL calls
        $badHeaders = Connect-SSIGraphQL `
            -Email $script:ApiConfig.email `
            -Password $script:ApiConfig.password `
            -ApiKey "invalid_api_key_12345"

        $badHeaders | Should -Not -BeNullOrEmpty
        $badHeaders["x-api-key"] | Should -Be "invalid_api_key_12345"
    }

    It "Should return current user info via Get-SSIMe" {
        $script:Headers | Should -Not -BeNullOrEmpty -Because "Authentication must succeed first"

        $me = Get-SSIMe -Headers $script:Headers

        $me | Should -Not -BeNullOrEmpty
        $me.email | Should -Be $script:ApiConfig.email
        $me.first_name | Should -Not -BeNullOrEmpty
    }

    It "Should refresh JWT token" {
        $script:Headers | Should -Not -BeNullOrEmpty -Because "Authentication must succeed first"

        $oldAuth = $script:Headers["authorization"]
        $refreshedHeaders = Update-SSIToken -Headers $script:Headers

        $refreshedHeaders | Should -Not -BeNullOrEmpty
        $refreshedHeaders["authorization"] | Should -Match "^JWT .+"
        # Token should be different after refresh
        $refreshedHeaders["authorization"] | Should -Not -Be $oldAuth

        $script:Headers = $refreshedHeaders
    }
}

Describe "SSI GraphQL API - Event Read" {

    BeforeAll {
        if (-not $script:Headers) {
            $script:Headers = Connect-SSIGraphQL `
                -Email $script:ApiConfig.email `
                -Password $script:ApiConfig.password `
                -ApiKey $script:ApiConfig.apiKey
        }
    }

    It "Should query events without error" {
        $query = @"
query {
    events(search: "Kupittaa") {
        name
        id
        starts
    }
}
"@
        $result = Invoke-SSIGraphQL -Headers $script:Headers -Query $query
        $result | Should -Not -BeNullOrEmpty
        # events should be an array (possibly empty)
        $result.events | Should -Not -BeNullOrEmpty -Because "There should be existing Kupittaa events"
    }

    It "Should return event details with expected fields" {
        $query = @"
query {
    events(search: "Kupittaa CUP") {
        name
        id
        starts
        ends
        get_full_absolute_url
        get_content_type_key
    }
}
"@
        $result = Invoke-SSIGraphQL -Headers $script:Headers -Query $query

        $result.events | Should -Not -BeNullOrEmpty
        $firstEvent = $result.events[0]
        $firstEvent.name | Should -Not -BeNullOrEmpty
        $firstEvent.id | Should -Not -BeNullOrEmpty
        $firstEvent.starts | Should -Not -BeNullOrEmpty
        $firstEvent.get_full_absolute_url | Should -Not -BeNullOrEmpty
    }

    It "Should get abstract event info for RESUL Cup" {
        $abstract = Get-SSIAbstractEvent -Headers $script:Headers -Rule "rl" -SerieType "cp"

        $abstract | Should -Not -BeNullOrEmpty
        $abstract.rule | Should -Be "rl"
        $abstract.get_visibility_choices | Should -Not -BeNullOrEmpty
        $abstract.get_status_choices | Should -Not -BeNullOrEmpty
    }

    It "Should get abstract event info for RESUL Match" {
        $abstract = Get-SSIAbstractEvent -Headers $script:Headers -Rule "rl" -SubRule "p2p"

        $abstract | Should -Not -BeNullOrEmpty
        $abstract.rule | Should -Be "rl"
    }

    It "Should check for non-existent event name" {
        $exists = Test-SSIEventExists -Headers $script:Headers -EventName "NONEXISTENT_EVENT_NAME_99999"
        $exists | Should -BeFalse
    }

    It "Should find existing Kupittaa CUP event" {
        # First get an actual event name
        $query = @"
query {
    events(search: "TurRes Kupittaa CUP") {
        name
    }
}
"@
        $result = Invoke-SSIGraphQL -Headers $script:Headers -Query $query

        if ($result.events -and $result.events.Count -gt 0) {
            $eventName = $result.events[0].name
            $exists = Test-SSIEventExists -Headers $script:Headers -EventName $eventName
            $exists | Should -BeTrue
        }
        else {
            Set-ItResult -Skipped -Because "No existing Kupittaa CUP events found to test against"
        }
    }
}

Describe "SSI GraphQL API - Event Creation" -Tag "Destructive" {

    BeforeAll {
        if (-not $script:Headers) {
            $script:Headers = Connect-SSIGraphQL `
                -Email $script:ApiConfig.email `
                -Password $script:ApiConfig.password `
                -ApiKey $script:ApiConfig.apiKey
        }

        # Load shared config for event settings
        $configPath = Join-Path -Path $PSScriptRoot -ChildPath "..\..\config\kupittaa-cup-config.yml"
        if (Test-Path $configPath) {
            $configContent = Get-Content -Path $configPath -Raw
            $script:Config = ConvertFrom-Yaml $configContent
        }
    }

    It "Should create a TEST RESUL Cup" {
        $script:Config | Should -Not -BeNullOrEmpty -Because "Config must be loaded"

        $cupName = "TEST GraphQL Cup $($script:TestDateDisplay)"

        # Check it doesn't already exist
        $exists = Test-SSIEventExists -Headers $script:Headers -EventName $cupName
        if ($exists) {
            Set-ItResult -Skipped -Because "Test cup '$cupName' already exists"
            return
        }

        $cupData = @{
            name              = $cupName
            starts_date       = $script:TestDateIso
            starts_time       = "09:00"
            ends_date         = $script:TestDateIso
            ends_time         = "12:00"
            visibility        = "csd"  # Closed - not visible to public
            status            = "on"
            results           = "cmp"
            registration      = "op"
            max_competitors   = "25"
            region            = "FIN"
            scoring_mode      = "pts"
            match_registration_mode = "all"
            match_count       = "3"
            timezone          = "Europe/Helsinki"
            currency          = "EUR"
            group             = $script:Config.management.groupId
        }

        $cup = New-SSIResulCup -Headers $script:Headers -CupData $cupData

        $cup | Should -Not -BeNullOrEmpty
        $cup.id | Should -Not -BeNullOrEmpty
        $cup.name | Should -Be $cupName
        $cup.get_full_absolute_url | Should -Not -BeNullOrEmpty

        $script:TestCupId = $cup.id
        $script:TestCupUrl = $cup.get_full_absolute_url
        Write-Host "  Created test cup:" -ForegroundColor Cyan
        Write-Host "    ID:   $($cup.id)" -ForegroundColor White
        Write-Host "    Name: $($cup.name)" -ForegroundColor White
        Write-Host "    URL:  $($cup.get_full_absolute_url)" -ForegroundColor White
        Write-Host "    Type: $($cup.get_content_type_key)" -ForegroundColor Gray
    }

    It "Should create a TEST RESUL Match" {
        $matchName = "TEST GraphQL Match $($script:TestDateDisplay) Tarkkuus"

        $exists = Test-SSIEventExists -Headers $script:Headers -EventName $matchName
        if ($exists) {
            Set-ItResult -Skipped -Because "Test match '$matchName' already exists"
            return
        }

        $matchData = @{
            name            = $matchName
            starts_date     = $script:TestDateIso
            starts_time     = "09:00"
            ends_date       = $script:TestDateIso
            ends_time       = "12:00"
            visibility      = "csd"  # Closed
            status          = "on"
            results         = "org"
            registration    = "op"
            max_competitors = "25"
            region          = "FIN"
            level           = "tr"
            verify_using    = "xxx"
            timezone        = "Europe/Helsinki"
            currency        = "EUR"
            group           = $script:Config.management.groupId
        }

        $match = New-SSIResulMatch -Headers $script:Headers -MatchData $matchData -SubRule "p2p"

        $match | Should -Not -BeNullOrEmpty
        $match.id | Should -Not -BeNullOrEmpty
        $match.name | Should -Be $matchName

        $script:TestMatchId = $match.id
        $script:TestMatchUrl = $match.get_full_absolute_url
        Write-Host "  Created test match:" -ForegroundColor Cyan
        Write-Host "    ID:   $($match.id)" -ForegroundColor White
        Write-Host "    Name: $($match.name)" -ForegroundColor White
        Write-Host "    URL:  $($match.get_full_absolute_url)" -ForegroundColor White
        Write-Host "    Type: $($match.get_content_type_key)" -ForegroundColor Gray
    }

    It "Should link match to cup" {
        if (-not $script:TestCupId -or -not $script:TestMatchId) {
            Set-ItResult -Skipped -Because "Cup or Match was not created in previous tests"
            return
        }

        $success = Add-SSICupMatch -Headers $script:Headers `
            -CupId $script:TestCupId `
            -MatchId $script:TestMatchId `
            -ComponentNumber 1

        $success | Should -BeTrue
    }

    It "Should create a squad for the test match" {
        if (-not $script:TestMatchId) {
            Set-ItResult -Skipped -Because "Match was not created in previous tests"
            return
        }

        $squadData = @{
            name           = "Test Squad 1"
            maxCompetitors = 9
        }

        $squad = New-SSISquad -Headers $script:Headers -MatchId $script:TestMatchId -SquadData $squadData

        $squad | Should -Not -BeNullOrEmpty
        $squad.id | Should -Not -BeNullOrEmpty
        $squad.name | Should -Not -BeNullOrEmpty

        $script:TestSquadId = $squad.id
        Write-Host "  Created test squad:" -ForegroundColor Cyan
        Write-Host "    ID:   $($squad.id)" -ForegroundColor White
        Write-Host "    Name: $($squad.name)" -ForegroundColor White
        Write-Host "    Max:  $($squad.maxCompetitors)" -ForegroundColor Gray
    }

    It "Should verify created cup exists via search" {
        if (-not $script:TestCupId) {
            Set-ItResult -Skipped -Because "Cup was not created in previous tests"
            return
        }

        $cupName = "TEST GraphQL Cup $($script:TestDateDisplay)"
        $exists = Test-SSIEventExists -Headers $script:Headers -EventName $cupName
        $exists | Should -BeTrue
    }
}

AfterAll {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "    CREATED TEST RESOURCES" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    if ($script:TestCupId) {
        Write-Host "  Cup ID:    $($script:TestCupId)" -ForegroundColor White
        Write-Host "  Cup URL:   $($script:TestCupUrl)" -ForegroundColor White
    }
    if ($script:TestMatchId) {
        Write-Host "  Match ID:  $($script:TestMatchId)" -ForegroundColor White
        Write-Host "  Match URL: $($script:TestMatchUrl)" -ForegroundColor White
    }
    if ($script:TestSquadId) {
        Write-Host "  Squad ID:  $($script:TestSquadId)" -ForegroundColor White
    }

    if ($script:TestCupId -or $script:TestMatchId) {
        Write-Host "`n⚠️  Delete test events manually at https://shootnscoreit.com" -ForegroundColor Yellow
    }
    else {
        Write-Host "  No test events were created." -ForegroundColor Gray
    }
}
