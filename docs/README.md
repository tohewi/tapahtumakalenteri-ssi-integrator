# Kupittaa Cup Automation Tool

A PowerShell script for automating the creation of RESUL CUP events, child matches, and squads on shootnscoreit.com, with optional integration to the Turun Reservilaiset WordPress event calendar (tapahtumakalenteri).

## Features

- **Automated Cup Creation**: Creates a RESUL CUP event for a specified date
- **Child Match Creation**: Automatically creates 3 child matches (Tarkkuus, Pika, Kuvio)
- **Auto-Linking**: Links all child matches to the parent Cup event
- **Squad Creation**: Creates 3 squads per match (Laina-ase, Oma ase 1, Oma ase 2)
- **Tapahtumakalenteri Integration**: Optionally creates a corresponding event in the WordPress calendar
- **Duplicate Check**: Prevents creating events with duplicate names
- **Configuration-Driven**: All settings loaded from YAML configuration file
- **Test Mode**: Add TEST prefix to event names for testing

## Requirements

- PowerShell 7.0 or later (pwsh)
- powershell-yaml module (`Install-Module powershell-yaml`)
- SSI account credentials (email and password)
- WordPress credentials (for tapahtumakalenteri integration, optional)
- Internet connectivity

## Installation

1. Clone or download this repository
2. Install the powershell-yaml module: `Install-Module powershell-yaml -Scope CurrentUser`
3. Navigate to the `scripts` directory

## Usage

### Basic: SSI Cup Only

```powershell
.\scripts\New-KupittaaCup.ps1 -Date "31-01-2026" -Username "your-email@example.com" -Password "your-password"
```

### With Tapahtumakalenteri Integration

```powershell
.\scripts\New-KupittaaCup.ps1 -Date "31-01-2026" `
    -Username "ssi-email" -Password "ssi-password" `
    -CreateCalendarEvent `
    -WpUsername "wp-username" -WpPassword "wp-password"
```

### Test Mode (adds TEST prefix to names)

```powershell
.\scripts\New-KupittaaCup.ps1 -Date "31-01-2026" -Username "your-email@example.com" -Password "your-password" -TestMode
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `Date` | String | Yes | - | Match date in dd-mm-yyyy format |
| `Username` | String | Yes* | - | SSI account email |
| `Password` | String | Yes* | - | SSI account password |
| `SessionId` | String | Yes* | - | Browser session cookie (alternative to Username/Password) |
| `ConfigPath` | String | No | config/kupittaa-cup-config.yml | Path to configuration file |
| `TestMode` | Switch | No | - | Adds "TEST" prefix to event names |
| `CreateCalendarEvent` | Switch | No | - | Create event in WordPress calendar |
| `WpUsername` | String | No* | - | WordPress username (for calendar) |
| `WpPassword` | String | No* | - | WordPress password (for calendar) |

*Either `Username`+`Password` OR `SessionId` is required for SSI.
*`WpUsername` and `WpPassword` are required when using `-CreateCalendarEvent`.

### Alternative: Using Session ID (Legacy)

You can use a session ID from browser cookies instead of username/password:

```powershell
.\scripts\New-KupittaaCup.ps1 -Date "31-01-2026" -SessionId "your-session-id"
```

To get your session ID:
1. Log in to shootnscoreit.com in your browser
2. Open Developer Tools (F12) → Application → Cookies
3. Copy the value of the `sessionid` cookie

## What Gets Created

### RESUL CUP Event
- Name: "TurRes Kupittaa CUP dd.mm.yyyy"
- Max competitors: 25
- Category: Open
- Scoring: Series-points same as component-match points
- Registration: Auto-register to all component matches
- Registration starts: 1 week before Cup date
- Registration closes: 12 hours before Cup start time
- Web Address: Link to club website with "Lisätietoa" description
- Venue: Kupittaan urheiluhalli, Tahkonkuja 5, 20520 TURKU

### Child Matches (25m Pistooli Kuvio)
Three matches are created and linked to the Cup:
1. **Tarkkuus** - "Kupittaa dd.mm.yyyy Tarkkuus"
2. **Pika** - "Kupittaa dd.mm.yyyy Pika"
3. **Kuvio** - "Kupittaa dd.mm.yyyy Kuvio"

Each match has:
- Max competitors: 25
- Category: Open
- Level: Training
- Verification: None
- End date/time: Same as Cup end
- Registration close: Same as Cup end
- Squading start: Same as registration start
- Squading close: Same as match start
- Venue: Kupittaan urheiluhalli

### Squads (per match)
- **Laina-ase (pieni puoli)**: Max 9 shooters (loaner firearm)
- **Oma ase 1 (iso puoli, vasen)**: Max 9 shooters (own firearm)
- **Oma ase 2 (iso puoli, oikea)**: Max 7 shooters (own firearm)

### Tapahtumakalenteri Event (optional)
When `-CreateCalendarEvent` is used:
- Creates a draft event in the WordPress calendar
- Permalink includes SSI Cup ID (e.g., `kupittaan-ampumavuoro-14-02-2026-cup141`)
- SSI Cup link embedded in event content
- Event format tags: Pistooli, Prosenttiammunta

## Example Output

```
Creating Kupittaa Cup for 31.01.2026
  Group ID: 25874
  Organizer ID:

--- Checking for Duplicate Names ---
  Checking Cup: TurRes Kupittaa CUP 31.01.2026
  Checking Match: Kupittaa 31.01.2026 Tarkkuus
  Checking Match: Kupittaa 31.01.2026 Pika
  Checking Match: Kupittaa 31.01.2026 Kuvio
  No duplicates found. Proceeding with creation.

--- Creating RESUL CUP ---
SUCCESS: Created Cup at: https://shootnscoreit.com/event/136/123/
  Cup Event ID: 123

--- Creating Match: Tarkkuus ---
SUCCESS: Created Tarkkuus at: https://shootnscoreit.com/event/91/456/

--- Creating Match: Pika ---
SUCCESS: Created Pika at: https://shootnscoreit.com/event/91/457/

--- Creating Match: Kuvio ---
SUCCESS: Created Kuvio at: https://shootnscoreit.com/event/91/458/

--- Linking Matches to Cup ---
  SUCCESS: Linked Tarkkuus as component #1
  SUCCESS: Linked Pika as component #2
  SUCCESS: Linked Kuvio as component #3

--- Creating Squads for Matches ---
Creating squads for Tarkkuus (ID: 456)...
  SUCCESS: Created squad 'Oma ase 1' (max: 9)
  SUCCESS: Created squad 'Oma ase 2' (max: 9)
  SUCCESS: Created squad 'Laina-ase' (max: 7)
...

========================================
           CREATION SUMMARY
========================================

Cup: https://shootnscoreit.com/event/136/123/

Matches created and linked:
  - Tarkkuus: https://shootnscoreit.com/event/91/456/ [LINKED]
  - Pika: https://shootnscoreit.com/event/91/457/ [LINKED]
  - Kuvio: https://shootnscoreit.com/event/91/458/ [LINKED]

Squads created per match:
  - Laina-ase (pieni puoli) (max: 9)
  - Oma ase 1 (iso puoli, vasen) (max: 9)
  - Oma ase 2 (iso puoli, oikea) (max: 7)

Calendar Event (tapahtumakalenteri):
  - Status: draft
  - Edit: https://...wp-admin/post.php?post=1234&action=edit
  - Preview: https://.../?post_type=event&p=1234&preview=true
  - Permalink: kupittaan-ampumavuoro-31-01-2026-cup123
```

## Configuration

All settings are stored in `config/kupittaa-cup-config.yml`:

- **Cup settings**: Name template, description, times, registration settings
- **Match settings**: Name template, descriptions per match type, venue
- **Squad definitions**: Names and max shooters per squad
- **Tapahtumakalenteri settings**: Title template, location, content with `{ssiCupLink}` placeholder

## Troubleshooting

### Common Issues

1. **Session Expired**
   - Get a fresh session ID from your browser
   - Session IDs expire after inactivity

2. **Form Validation Errors**
   - Check debug-cup-response.html for details
   - These files are created when creation fails

3. **Duplicate Names**
   - Script checks for existing events with same name
   - Use -TestMode to add TEST prefix for testing

4. **Permission Errors**
   - Ensure your account has permission to create events
   - Group ID 25874 is configured by default

## Project Structure

```
windsurf-project/
├── config/
│   └── kupittaa-cup-config.yml  # All event configuration
├── scripts/
│   ├── Connect-SSI.ps1          # SSI authentication script
│   ├── Connect-WordPress.ps1    # WordPress authentication (with 2FA)
│   ├── New-KupittaaCup.ps1      # Main automation script
│   └── New-TapahtumakalenteriEvent.ps1  # Calendar event creation
├── docs/
│   ├── README.md                # This file
│   ├── requirements.md          # Requirements list
│   ├── tapahtumakalenteri-design.md  # Calendar integration design
│   └── developer-guide.md       # Technical documentation
└── archive/                     # Old/experimental scripts
```

## Limitations

- **Venue coordinates**: Cannot be set programmatically. Must be added manually via SSI map UI after event creation.
- **WordPress 2FA**: Requires manual OTP entry during calendar event creation (email-based verification).
- **Calendar event status**: Events are created as drafts and must be published manually in WordPress.

## License

This tool is provided as-is for use with the SSI platform. Please ensure compliance with SSI's terms of service.
