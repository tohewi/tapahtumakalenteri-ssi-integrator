# Kupittaa Cup Creation - Developer Process Guide

This guide describes the process for creating a Kupittaa RESUL CUP with matches and squads on Shoot'n'ScoreIt (SSI).

## Overview

The creation process follows these steps:

```
1. CREATE CUP → 2. CREATE MATCHES → 3. LINK MATCHES TO CUP → 4. CREATE SQUADS
```

## Prerequisites

- Valid SSI session ID (browser cookie)
- PowerShell Core with `PowerShell-Yaml` module
- Configuration files:
  - `config/kupittaa-cup-config.yml` - Event settings
  - `config.yml` - Secrets (sessionId)

## Process Flow

### Step 1: Create RESUL CUP

**Endpoint:** `POST /series/nordic/create-resul-cup/`

**Key Fields:**
| Field | Value | Description |
|-------|-------|-------------|
| `group` | 25874 | Management group ID |
| `name` | TurRes Kupittan Reserviläisammunta CUP {date} | Cup name |
| `scoring_mode` | pts | Points-based scoring |
| `match_registration_mode` | all | Auto-register to all matches |
| `visibility` | res | Restricted (participants only) |
| `categories` | Open | Single category |
| `max_competitors` | 25 | Maximum participants |

**Output:** Cup URL containing `TypeId` and `EventId` (e.g., `/event/136/108/`)

---

### Step 2: Create Child Matches (×3)

**Endpoint:** `POST /nordic/create-resul-25-kuvio-pistol/`

Three matches are created:
1. **Tarkkuus** - Precision shooting
2. **Pika** - Rapid fire
3. **Kuvio** - Pattern shooting

**Key Fields:**
| Field | Value | Description |
|-------|-------|-------------|
| `group` | 25874 | Same management group as Cup |
| `name` | Kupittaa {date} {suffix} | Match name |
| `verify_using` | xxx | No verification required |
| `reg_start_date` | Same as Cup | Registration synced with Cup |
| `description` | From config | Match-specific description |

**Output:** Match URLs containing `TypeId` and `EventId` for each match

---

### Step 3: Link Matches to Cup

**Endpoint:** `POST /event/{cupTypeId}/{cupEventId}/add-existing-match/`

Each match is linked to the Cup as a component:

| Field | Value |
|-------|-------|
| `number` | 1, 2, 3 (sequential) |
| `match` | Match EventId |
| `included` | on |

---

### Step 4: Create Squads (×3 per match)

**Endpoint:** `POST /nordic/match/{matchId}/add-squads/`

Three squads per match:

| Squad Name | Max Shooters |
|------------|--------------|
| Oma ase 1 | 9 |
| Oma ase 2 | 9 |
| Laina-ase | 7 |

---

## Authentication

SSI uses Django session-based authentication:

1. **Session Cookie:** `sessionid` - Obtained from browser after login
2. **CSRF Token:** Retrieved from form page before each POST request
3. **Language Cookie:** `django_language=en` - Ensures English responses

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.Cookies.Add((New-Object System.Net.Cookie("sessionid", $SessionId, "/", "shootnscoreit.com")))
```

---

## Error Handling

### Common Issues

1. **CSRF Token Missing:** Always fetch fresh token before each POST
2. **Redirect Loop:** Check if form validation failed (stayed on same page)
3. **Missing Required Fields:** SSI returns to form with error messages

### Debug Strategy

```powershell
# Save response HTML for inspection
$response.Content | Out-File -FilePath "debug-response.html" -Encoding UTF8
```

---

## Configuration Reference

### `kupittaa-cup-config.yml` Structure

```yaml
management:
  groupId: "25874"      # Management group
  organizerId: "1215"   # Organizer

cup:
  nameTemplate: "..."   # Cup name pattern
  description: "..."    # Cup description
  # ... other cup settings

match:
  nameTemplate: "..."   # Match name pattern
  verifyUsing: "xxx"    # No verification
  # ... other match settings

matchTypes:
  - suffix: "Tarkkuus"
    description: "..."
  - suffix: "Pika"
    description: "..."
  - suffix: "Kuvio"
    description: "..."

squads:
  definitions:
    - name: "Oma ase 1"
      maxShooters: 9
    # ... other squads
```

---

## Quick Reference

| Action | URL Pattern |
|--------|-------------|
| Create Cup | `/series/nordic/create-resul-cup/` |
| Create Match | `/nordic/create-resul-25-kuvio-pistol/` |
| Link Match | `/event/{typeId}/{eventId}/add-existing-match/` |
| Add Squads | `/nordic/match/{matchId}/add-squads/` |
| View Event | `/event/{typeId}/{eventId}/` |

---

## Example Usage

```powershell
.\New-KupittaaCup.ps1 -Date "25-01-2026" -SessionId "your-session-id"
```

This creates:
- 1 RESUL CUP
- 3 Matches (Tarkkuus, Pika, Kuvio)
- 9 Squads (3 per match)

All linked and configured according to `kupittaa-cup-config.yml`.
