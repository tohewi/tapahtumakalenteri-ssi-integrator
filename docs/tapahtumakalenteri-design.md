# Tapahtumakalenteri Integration Design

## Overview

This document describes the integration between the Kupittaa Cup automation system and the Turun Reservilaiset WordPress event calendar (tapahtumakalenteri).

## Requirements

### Requirement 38: Event Creation
When a Cup is created in SSI:
1. Create a corresponding event in the WordPress calendar as **draft**
2. Store the SSI Cup URL in the calendar event content
3. **Cross-reference via permalink**: The calendar event permalink includes the SSI Cup ID
   - Format: `kupittaan-ampumavuoro-14-02-2026-cup141`
   - This allows finding the calendar event by Cup ID and vice versa
4. Use standard event data template for Kupittaa Cup events
5. **No automatic deletions** - only create/update operations

### Requirement 39: Statistics Update
When Cup and all matches are completed:
1. Find the calendar event by parsing the permalink (contains `cup{ID}`)
2. Query SSI for the number of Cup participants
3. Calculate shots fired: `participants × 100`
4. Update the calendar event with the shots count

---

## WordPress Event Calendar Structure

### Site Information
- **URL**: `https://turun-reservialiupseerit-turun-reservilaiset.reservilaisliitto.fi`
- **Event Type**: Custom post type `event`
- **Plugin**: Advanced Custom Fields (ACF) Pro
- **ACF Group**: `group_5d3e9d5a5094e` (Tapahtuma)

### ACF Field Mapping

| Field Label (Finnish) | ACF Field Key | Data Name | Type | Notes |
|----------------------|---------------|-----------|------|-------|
| Otsikko (Title) | `post_title` | - | text | Event title |
| Lyhyt kuvaus (Short description) | `field_5d3e9d9626a82` | short_description | textarea | Excerpt/ingressi |
| Sisältö (Content) | `field_5d3e9dc926a83` | content | wysiwyg | Full description |
| Alkamispäivä (Start date) | `field_5d3e9ddc26a84` | - | date | Format: YYYYMMDD |
| Päättymispäivä (End date) | `field_5d3e9e5f26a85` | - | date | Format: YYYYMMDD |
| Aika (Time) | `field_62949bdcbb12e` | - | text | e.g., "Klo 09.00-12.00" |
| Osoite (Address) | `field_5d3e9efab663d][field_5d3e9f0fb663e` | location | textarea | Nested in location group |
| Karttalinkki (Map link) | `field_5d3e9efab663d][field_5d3e9f28b663f` | map_link | url | Nested in location group |
| Lisää ilmoittautumislomake | `field_5f080bdf06c9a` | lisaa_ilmoittautumislomake | checkbox | Registration form toggle |
| Sähköpostiosoite | `field_5f080c0306c9b` | laheta_ilmoittautumiset | email | Registration email |
| **Ammuttujen laukausten lukumäärä** | `field_4k2esk3rske32` | amount_of_shot_bullets | number | **Shots fired (Req 39)** |
| Osallistujien lukumäärä | `field_6j3ak3kj2kjs2` | attendee_amount | number | Attendee count |
| Tapahtumien lukumäärä | `field_4k3ak3sj2kj6b` | event_amount | number | Event count |

### Event Format Taxonomy (`tax_input[eventformat][]`)

These are checkboxes for activity type classification:

| Value | Label | Used for Kupittaa |
|-------|-------|-------------------|
| 50 | 1.6 Pistooli | ✅ Yes |
| 52 | 2 Prosenttiammunta | ✅ Yes |

Both values should be submitted as an array: `tax_input[eventformat][] = @("50", "52")`

---

## Authentication

WordPress uses cookie-based authentication with CSRF tokens:
1. Login via `/wp-login.php` with username/password
2. Obtain `wordpress_logged_in_*` and `wordpress_sec_*` cookies
3. For each POST request, obtain `_wpnonce` from the form page

---

## Implementation Plan

### New Scripts

#### 1. `Connect-WordPress.ps1`
Authenticates to WordPress and returns a session.

```powershell
param(
    [string]$Username,
    [string]$Password,
    [string]$BaseUri = "https://turun-reservialiupseerit-turun-reservilaiset.reservilaisliitto.fi"
)
# Returns: WebRequestSession with auth cookies
```

#### 2. `New-TapahtumakalenteriEvent.ps1`
Creates a new event in the calendar as draft.

```powershell
param(
    $Session,
    [string]$Title,
    [datetime]$Date,
    [string]$StartTime = "09.00",
    [string]$EndTime = "12.00",
    [string]$ShortDescription,
    [string]$Content,
    [string]$Location,
    [string]$SsiCupUrl  # Cross-reference to SSI
)
# Returns: Event ID and URL
```

#### 3. `Update-TapahtumakalenteriEvent.ps1`
Updates an existing event (for statistics).

```powershell
param(
    $Session,
    [int]$EventId,
    [int]$ShotsFired,
    [int]$AttendeeCount
)
```

#### 4. `Get-CupStatistics.ps1`
Queries SSI for Cup completion status and participant count.

```powershell
param(
    $SsiSession,
    [int]$CupId
)
# Returns: @{ IsCompleted = $true; ParticipantCount = 15 }
```

### Configuration Updates

Add to `kupittaa-cup-config.yml`:

```yaml
# Tapahtumakalenteri (WordPress Event Calendar)
tapahtumakalenteri:
  baseUrl: "https://turun-reservialiupseerit-turun-reservilaiset.reservilaisliitto.fi"
  # Credentials stored separately in config/wordpress-credentials.yml
  
  # Standard event template for Kupittaa Cup
  eventTemplate:
    shortDescription: |
      Lauantain ampumavuoro Kupittaalla.
      Hio pistooliammuntatekniikkaa ja kerää harrastuskertoja käsiaseeseen.
      Ohjattu ammunta lyhennetyillä SAL ja RESUL lajeilla. Laina-aseita saatavilla.
    
    content: |
      Mahdolliset muutokset aikoihin ilmoitetaan sisäampumaradan ilmoitustaululla ja Turun Reserviläisten verkkosivuilla.
      <div>
      <div><strong>Ohjattu pienoispistooliammunta</strong> lyhennetyillä ampumaohjelmilla:</div>
      <div>    - Tarkkuus- ja pikaosio (SAL 25m urheilupistooli)</div>
      <div>    - Pistoolipika-osio (RESUL pistoolipika-ammunta)</div>
      <div>    - Laukausmäärä yhteensä: 100</div>
      <div>Tarkkuusosa ammutaan kiinteään tauluun, pika- ja pikapistooliosio kääntyviin Olympia-tauluihin.</div>
      </div>
      <b>Ilmoittautuminen <SSI Cup Link Here></b>

      <em><strong>Ensikertalaiset vain perehdytysvuoron kautta.</strong></em>

      Vakuutus (Reserviläisen toimintaturva tai SAL) ja suojalasit sekä kuulosuojaimet ovat pakollisia.

      Laina-aseita (pienoispistooli, .22lr) on rajallisesti käytettävissä (valvottu käyttö).

      <strong>Ratamaksut:</strong>
      <ul>
        <li>Harjoitusmaksu sisältäen laina-aseen, ratamaksun ja 100 kpl patruunat (.22lr) 20 €</li>
        <li>Laina-ase (omat patruunat, (.22lr)) 7 €</li>
        <li>Oma ase (omat patruunat) 6 €</li>
      </ul>
      Maksuväline: <strong>MobilePay 24130</strong>

      Ovet sulkeutuvat klo 9.30 ammunnan alkaessa.

      <strong>Lisätiedot sähköpostitse</strong>: <a href="mailto:ampumajaosto@turunreservilaiset.fi">ampumajaosto@turunreservilaiset.fi</a>
    location: "Kupittaan urheiluhallin ampumarata"
    mapLink: "https://maps.app.goo.gl/SHDoPm8ZMFjhYGBk9"  # Optional Google Maps link
```

---

## Workflow

### Cup Creation Flow (Req 38)

```
New-KupittaaCup.ps1
    │
    ├── 1. Create Cup in SSI
    │       └── Returns: Cup ID, Cup URL
    │
    ├── 2. Create Matches in SSI
    │
    ├── 3. Create Squads in SSI
    │
    └── 4. Create Calendar Event (NEW)
            │
            ├── Connect-WordPress.ps1
            │       └── Authenticate to WordPress
            │
            └── New-TapahtumakalenteriEvent.ps1
                    ├── Create event as DRAFT
                    ├── Include SSI Cup URL in content
                    └── Return calendar event URL
                    
    Output:
    - SSI Cup URL
    - Calendar Event URL (draft)
    - Instructions to publish calendar event
```

### Statistics Update Flow (Req 39)

```
Update-CupStatistics.ps1 (run manually after Cup completion)
    │
    ├── 1. Get Cup statistics from SSI
    │       └── Query participant count
    │
    ├── 2. Calculate shots fired
    │       └── shots = participants × 100
    │
    └── 3. Update calendar event
            │
            ├── Connect-WordPress.ps1
            │
            └── Update-TapahtumakalenteriEvent.ps1
                    └── Update shots_fired field
```

---

## Security Considerations

1. **Credentials**: WordPress credentials stored in separate file (`config/wordpress-credentials.yml`)
2. **Draft mode**: Events created as draft to allow review before publishing
3. **No deletions**: Script will never delete calendar events
4. **CSRF protection**: Proper nonce handling for all POST requests

---

## Implementation Status

### Requirement 38 - Event Creation (Complete)
1. [x] Create `Connect-WordPress.ps1` - WordPress authentication with email 2FA
2. [x] Create `New-TapahtumakalenteriEvent.ps1` - Event creation as draft
3. [x] Update `New-KupittaaCup.ps1` to integrate calendar event creation
4. [x] Add configuration for tapahtumakalenteri in `kupittaa-cup-config.yml`
5. [x] Test end-to-end flow
6. [x] Document usage in README and developer-guide.md

### Requirement 39 - Statistics Update (Pending)
1. [ ] Create `Update-TapahtumakalenteriEvent.ps1` - Statistics update
2. [ ] Create `Get-CupStatistics.ps1` - Query SSI for completion status
