---
description: How to create and delete SRA test matches on SSI (shootnscoreit.com)
---

# SRA Test Match Management

## Overview

SRA test matches are created for development/testing purposes. They use the `TEST TR-SRA` prefix to distinguish them from real matches. The scripts handle full lifecycle: create matches (GraphQL) → create squads (web scraping) → delete (web scraping).

## Scripts

- **Create**: `scripts-graphql/New-SRATestMatches.ps1`
- **Delete**: `scripts-graphql/Remove-SRATestMatches.ps1`

## Modules Used

- `scripts-graphql/lib/SSI-GraphQL.psm1` — GraphQL auth + event creation
- `scripts-graphql/lib/SSI-WebSquad.psm1` — Web auth (`Connect-SSIWeb`) + squad creation (`New-SSIWebSquad`)

## Create Test Matches

Creates 4 matches (2× SRAO "Oldies" + 2× SRAN "Newbie") with 5 squads each (4× Anyone + 1× Trainer Restricted).

```powershell
.\scripts-graphql\New-SRATestMatches.ps1 -Email <email> -Password <password> -ApiKey <api-key>
```

## Delete Test Matches

Deletes only matches with exact `TEST TR-SRA[ON]` name prefix. Safety: verifies exact name on the SSI delete confirmation page before POSTing.

```powershell
# Dry run first
.\scripts-graphql\Remove-SRATestMatches.ps1 -Email <email> -Password <password> -ApiKey <api-key> -DryRun

# Actual delete
.\scripts-graphql\Remove-SRATestMatches.ps1 -Email <email> -Password <password> -ApiKey <api-key>
```

## SSI API Limitations

The SSI GraphQL API only supports:
- `create_event` — create matches/cups
- `create_stage` — create stages

It does NOT support (must use web form POST):
- Squad creation → `New-SSIWebSquad` (POST to `/event/{ct}/{id}/add-squads/`)
- Event update → no known API
- Event deletion → POST to `/event/{ct}/{id}/delete/` with body `remove=Delete`

## Key Values

- **IPSC/SRA content type**: `22`
- **Match name pattern**: `TEST TR-SRAO dd.MM.yyyy` / `TEST TR-SRAN dd.MM.yyyy`
- **Config**: `config/kupittaa-cup-config.yml` (groupId, organizerId)
- **API key**: `scripts-graphql/config/api-key.yml` (gitignored)
- **Credentials**: passed as `-Email` / `-Password` / `-ApiKey` parameters

## Squad Registration Types

- `aa` = Anyone can register (used for Squad 1-4)
- `os` = Restricted registration (used for Trainer Squad)
