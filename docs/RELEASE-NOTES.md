# Release Notes

## Version 0.9 (2026-01-25)

### Overview

First feature-complete release of the Kupittaa Cup Automation Tool. This version supports full automation of RESUL CUP creation with child matches and squads on Shoot'n'ScoreIt (SSI).

### Features

#### Core Functionality
- **Cup Creation**: Automated RESUL CUP event creation with all required fields
- **Match Creation**: Creates 3 child matches (Tarkkuus, Pika, Kuvio) per Cup
- **Match Linking**: Automatically links matches to parent Cup as components
- **Squad Creation**: Creates 3 squads per match (Oma ase 1, Oma ase 2, Laina-ase)

#### Configuration
- **YAML-based Configuration**: All settings stored in `config/kupittaa-cup-config.yml`
- **Customizable Templates**: Name templates for Cup and Match names
- **Match Descriptions**: Individual descriptions for each match type
- **Squad Definitions**: Configurable squad names and max shooters

#### Date/Time Management
- **Registration Start**: Configurable days before event (default: 7 days)
- **Registration Close**: Cup registration closes 12 hours before start time
- **Match End Time**: Synced with Cup end time
- **Squading Schedule**: Start with registration, close at match start

#### Validation & Safety
- **Duplicate Check**: Prevents creating events with duplicate names
- **Test Mode**: `-TestMode` flag adds "TEST" prefix to event names
- **Debug Output**: Saves HTML responses for troubleshooting

#### Additional Fields
- **Web Address**: Club website URL with "Lisätietoa" display text
- **Venue**: Location name (Kupittaan urheiluhalli)
- **Information Field**: Detailed event information (max 800 chars)

### Requirements

- PowerShell 7.0+ (pwsh)
- `powershell-yaml` module
- Valid SSI session ID

### Usage

```powershell
# Production
.\scripts\New-KupittaaCup.ps1 -Date "25-01-2026" -SessionId "your-session-id"

# Test mode
.\scripts\New-KupittaaCup.ps1 -Date "25-01-2026" -SessionId "your-session-id" -TestMode
```

### Known Limitations

- **Venue Coordinates**: Cannot be set programmatically - must be added manually via SSI map UI
- **Event Deletion**: Must be done manually via SSI web interface

### Documentation

- `docs/README.md` - User guide
- `docs/developer-guide.md` - Technical documentation
- `docs/requirements.md` - Requirements list (34 requirements, all completed)

### Files

```
windsurf-project/
├── config/
│   └── kupittaa-cup-config.yml  # Event configuration
├── scripts/
│   └── New-KupittaaCup.ps1      # Main automation script
└── docs/
    ├── README.md
    ├── developer-guide.md
    ├── requirements.md
    └── RELEASE-NOTES.md

```

---

*Released: 2026-01-25*
