# Kupittaa Cup Automation Tool

A PowerShell script for automating the creation of RESUL CUP events and child matches on shootnscoreit.com.

## Features

- **Automated Cup Creation**: Creates a RESUL CUP event for a specified date
- **Child Match Creation**: Automatically creates 3 child matches (Tarkkuus, Pika, Kuvio)
- **Auto-Linking**: Links all child matches to the parent Cup event
- **Configurable Settings**: Max competitors, categories, registration timing

## Requirements

- PowerShell 5.1 or later
- Valid session ID from shootnscoreit.com (obtained from browser cookies)
- Internet connectivity

## Installation

1. Clone or download this repository
2. Navigate to the `scripts` directory

## Usage

### Basic Usage

```powershell
.\scripts\New-KupittaaCup.ps1 -Date "31-01-2026" -SessionId "your-session-id"
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `Date` | String | Yes | - | Match date in dd-mm-yyyy format |
| `SessionId` | String | Yes | - | Browser session cookie for authentication |
| `BaseUri` | String | No | https://shootnscoreit.com | SSI base URL |
| `GroupId` | String | No | xxx | Group/club ID |
| `OrganizerId` | String | No | 1215 | Organizer ID |

### Getting Your Session ID

1. Log in to shootnscoreit.com in your browser
2. Open Developer Tools (F12)
3. Go to Application > Cookies
4. Copy the value of the `sessionid` cookie

## What Gets Created

### RESUL CUP Event
- Name: "Kupittaa dd.mm.yyyy"
- Max competitors: 25
- Category: Open
- Scoring: Series-points same as component-match points
- Registration: Auto-register to all component matches
- Registration starts: 1 week before Cup date

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

## Example Output

```
Creating Kupittaa Cup for 31.01.2026

--- Creating RESUL CUP ---
SUCCESS: Created Cup at: https://shootnscoreit.com/event/136/123/
  Cup Event ID: 123

--- Creating Match: Tarkkuus (25m Pistooli Kuvio) ---
SUCCESS: Created Tarkkuus at: https://shootnscoreit.com/event/91/456/

--- Creating Match: Pika (25m Pistooli Kuvio) ---
SUCCESS: Created Pika at: https://shootnscoreit.com/event/91/457/

--- Creating Match: Kuvio (25m Pistooli Kuvio) ---
SUCCESS: Created Kuvio at: https://shootnscoreit.com/event/91/458/

--- Linking Matches to Cup ---
  SUCCESS: Linked Tarkkuus as component #1
  SUCCESS: Linked Pika as component #2
  SUCCESS: Linked Kuvio as component #3

Cup: https://shootnscoreit.com/event/136/123/

Matches created and linked:
  - Tarkkuus: https://shootnscoreit.com/event/91/456/ [LINKED]
  - Pika: https://shootnscoreit.com/event/91/457/ [LINKED]
  - Kuvio: https://shootnscoreit.com/event/91/458/ [LINKED]
```

## Troubleshooting

### Common Issues

1. **Session Expired**
   - Get a fresh session ID from your browser
   - Session IDs expire after inactivity

2. **Form Validation Errors**
   - Check debug-cup-response.html or debug-match-response.html for details
   - These files are created when creation fails

3. **Permission Errors**
   - Ensure your account has permission to create events
   - Verify the OrganizerId is correct for your club

## Project Structure

```
windsurf-project/
├── scripts/
│   └── New-KupittaaCup.ps1    # Main automation script
├── docs/
│   ├── README.md              # This file
│   └── requirements.md        # Original requirements
└── archive/                   # Old/experimental scripts
```

## License

This tool is provided as-is for use with the SSI platform. Please ensure compliance with SSI's terms of service.
