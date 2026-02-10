# SSI Event Automation — GraphQL + Web Scraping

PowerShell scripts for creating and managing events on shootnscoreit.com (SSI).
Uses GraphQL API for event/match CRUD and web form POST for operations not exposed via GraphQL (squads, deletion).

## Folder Structure

```
scripts-graphql/
├── config/
│   ├── api-key.yml            # SSI API key (gitignored)
│   └── api-key.yml.template   # Template for api-key.yml
├── lib/
│   ├── SSI-GraphQL.psm1       # GraphQL API module (auth, queries, mutations)
│   └── SSI-WebSquad.psm1      # Web scraping module (squad creation, web auth)
├── tests/
│   └── SSI-GraphQL.Tests.ps1  # Pester unit tests
│
│  # --- SRA Match Scripts ---
├── New-SRATestMatches.ps1     # Create 4 SRA test matches with squads
├── Remove-SRATestMatches.ps1  # Delete SRA test matches (strict name verification)
│
│  # --- Kupittaa Cup Scripts ---
├── New-KupittaaCup.ps1        # Create Kupittaa RESUL CUP (cup + child matches + squads)
├── Find-KupittaaMatch.ps1     # Find existing Kupittaa matches
├── Read-KupittaaStructure.ps1 # Read Kupittaa cup structure
│
│  # --- Schema/Analysis Tools ---
├── Get-SSISchema.ps1          # Full GraphQL schema introspection → schema-output.json
├── Get-ScoringSchema.ps1      # Scoring-specific schema discovery
├── Analyze-ScoringSchema.ps1  # Analyze scoring types from saved schema
├── List-TypeFields.ps1        # List fields for a GraphQL type
├── Read-TestMatch1889.ps1     # Read match 1889 data (reference)
│
└── README.md
```

## Modules

### SSI-GraphQL.psm1
Core GraphQL API module. Provides:
- `Connect-SSIGraphQL` — authenticate, returns headers with Bearer token
- `Get-SSIMe` — get current user info
- `Invoke-SSIGraphQL` — execute arbitrary GraphQL queries/mutations
- `New-SSIEvent` — create events (cups, matches) via `create_event` mutation
- `New-SSIStage` — create stages via `create_stage` mutation

### SSI-WebSquad.psm1
Web scraping module for operations not in GraphQL API. Provides:
- `Connect-SSIWeb` — authenticate via web login, returns WebRequestSession
- `New-SSIWebSquad` — create squads via web form POST

**Why web scraping?** SSI GraphQL API has no mutations for:
- Squad creation → use `New-SSIWebSquad` (POST to `/event/{ct}/{id}/add-squads/`)
- Event update/delete → use web form POST (see `Remove-SRATestMatches.ps1`)

## Configuration

Two config files are needed:

1. **API Key**: `config/api-key.yml` — SSI GraphQL Bearer token (gitignored)
2. **Event Config**: `../config/kupittaa-cup-config.yml` — cup/match/squad settings

## Requirements

- PowerShell 7.0+ (pwsh)
- `powershell-yaml` module (`Install-Module powershell-yaml`)
- Valid SSI account + API key

## Usage

```powershell
# Create SRA test matches (4 matches, 5 squads each)
.\New-SRATestMatches.ps1 -Email user@example.com -Password secret -ApiKey abc123

# Delete SRA test matches (strict name+id verification)
.\Remove-SRATestMatches.ps1 -Email user@example.com -Password secret -ApiKey abc123

# Dry run (list without deleting)
.\Remove-SRATestMatches.ps1 -Email ... -Password ... -ApiKey ... -DryRun

# Create Kupittaa Cup
.\New-KupittaaCup.ps1 -Date "31-01-2026"
```

## SSI API Notes

- **GraphQL endpoint**: `https://shootnscoreit.com/graphql/`
- **IPSC/SRA content type**: `22`
- **Squad creation URL**: `/event/{contentType}/{eventId}/add-squads/`
- **Event deletion URL**: `/event/{contentType}/{eventId}/delete/` (POST with `remove=Delete`)
