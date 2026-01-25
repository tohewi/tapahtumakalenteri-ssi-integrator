# Kupittaa Cup Automation Tool

A PowerShell script for automating the creation of RESUL CUP events, child matches, and squads on shootnscoreit.com.

## Features

- **Automated Cup Creation**: Creates a RESUL CUP event for a specified date
- **Child Match Creation**: Automatically creates 3 child matches (Tarkkuus, Pika, Kuvio)
- **Auto-Linking**: Links all child matches to the parent Cup event
- **Squad Creation**: Creates 3 squads per match (Oma ase 1, Oma ase 2, Laina-ase)
- **Duplicate Check**: Prevents creating events with duplicate names
- **Configuration-Driven**: All settings loaded from YAML configuration file
- **Test Mode**: Add TEST prefix to event names for testing

## Requirements

- PowerShell 7.0 or later (pwsh)
- powershell-yaml module (`Install-Module powershell-yaml`)
- Valid session ID from shootnscoreit.com (obtained from browser cookies)
- Internet connectivity

## Installation

1. Clone or download this repository
2. Install the powershell-yaml module: `Install-Module powershell-yaml -Scope CurrentUser`
3. Navigate to the `scripts` directory

## Usage

### Basic Usage

```powershell
.\scripts\New-KupittaaCup.ps1 -Date "31-01-2026" -SessionId "your-session-id"
```

### Test Mode (adds TEST prefix to names)

```powershell
.\scripts\New-KupittaaCup.ps1 -Date "31-01-2026" -SessionId "your-session-id" -TestMode
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `Date` | String | Yes | - | Match date in dd-mm-yyyy format |
| `SessionId` | String | Yes | - | Browser session cookie for authentication |
| `ConfigPath` | String | No | config/kupittaa-cup-config.yml | Path to configuration file |
| `TestMode` | Switch | No | - | Adds "TEST" prefix to event names |

### Getting Your Session ID

1. Log in to shootnscoreit.com in your browser
2. Open Settings
3. Go to Manage Cookies -> See all cookies and site data
4. Search for the `shootnscoreit.com` entry
5. Copy the value of the `sessionid` cookie

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
- **Oma ase 1**: Max 9 shooters (own firearm)
- **Oma ase 2**: Max 9 shooters (own firearm)
- **Laina-ase**: Max 7 shooters (loaner firearm)

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
  - Oma ase 1 (max: 9)
  - Oma ase 2 (max: 9)
  - Laina-ase (max: 7)
```

## Configuration

All settings are stored in `config/kupittaa-cup-config.yml`:

- **Cup settings**: Name template, description, times, registration settings
- **Match settings**: Name template, descriptions per match type, venue
- **Squad definitions**: Names and max shooters per squad

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
│   └── New-KupittaaCup.ps1      # Main automation script
├── docs/
│   ├── README.md                # This file
│   ├── requirements.md          # Requirements list
│   └── developer-guide.md       # Technical documentation
└── archive/                     # Old/experimental scripts
```

## Limitations

- **Venue coordinates**: Cannot be set programmatically. Must be added manually via SSI map UI after event creation.

## License

This tool is provided as-is for use with the SSI platform. Please ensure compliance with SSI's terms of service.
