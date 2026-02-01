# Release Notes

## Version 2.0 (2026-02-01)

### Overview

Major release adding WordPress Tapahtumakalenteri integration and batch processing capabilities.

### New Features

#### WordPress Integration
- **Calendar Event Creation**: Automatically creates events in Turun Reservilaiset WordPress calendar
- **Auto-Publish**: Validates SSI and WordPress URLs, then publishes calendar event
- **Statistics Update**: Updates shots fired count after Cup completion (`Update-TapahtumakalenteriEvent.ps1`)
- **2FA Support**: Handles email-based OTP authentication for WordPress

#### Batch Processing
- **Batch Creation**: Create multiple events from a date list file (`New-KupittaaCupBatch.ps1`)
- **Single Authentication**: One OTP prompt for entire batch - sessions reused
- **Skip Existing**: Dates marked with `!` prefix are skipped
- **Error Handling**: Stops on first error with clear status output

#### Session Management
- **PreAuth Parameter Set**: Pass pre-authenticated sessions to scripts
- **Session Reuse**: SSI and WordPress sessions retained across batch operations

### New Scripts

| Script | Purpose |
|--------|---------|
| `Connect-WordPress.ps1` | WordPress authentication with 2FA |
| `New-TapahtumakalenteriEvent.ps1` | Calendar event creation |
| `Update-TapahtumakalenteriEvent.ps1` | Statistics update |
| `New-KupittaaCupBatch.ps1` | Batch creation from date list |

### New Configuration

- `config/kupittaa-cup-dates.txt` - Date list for batch creation

### Usage

```powershell
# Single event with calendar
.\scripts\New-KupittaaCup.ps1 -Date "14-02-2026" `
    -Username "ssi-email" -Password "ssi-password" `
    -CreateCalendarEvent `
    -WpUsername "wp-user" -WpPassword "wp-password"

# Batch creation
.\scripts\New-KupittaaCupBatch.ps1 `
    -DateListFile "config\kupittaa-cup-dates.txt" `
    -SsiUsername "ssi-email" -SsiPassword "ssi-password" `
    -WpUsername "wp-user" -WpPassword "wp-password"
```

### Requirements Met

- Req 38: Tapahtumakalenteri Integration ✅
- Req 40: Upfront authentication ✅
- Req 43: Statistics update ✅
- Req 44: Auto-publish calendar event ✅
- Req 45: Batch creation ✅
- Req 46: Single authentication with session reuse ✅

---

## Version 1.0 (2026-01-25)

### Overview

First release with full SSI Cup automation.

### Features

- **Cup Creation**: Automated RESUL CUP event creation
- **Match Creation**: Creates 3 child matches (Tarkkuus, Pika, Kuvio)
- **Match Linking**: Links matches to parent Cup as components
- **Squad Creation**: Creates 3 squads per match
- **YAML Configuration**: All settings in `kupittaa-cup-config.yml`
- **Duplicate Check**: Prevents duplicate event names
- **Test Mode**: `-TestMode` flag for testing
- **Username/Password Auth**: Login without manual session ID

### Requirements Met

- Requirements 1-34: SSI Cup automation ✅
- Requirement 37: Username/password authentication ✅

### Known Limitations

- Venue coordinates must be added manually via SSI map UI
- Event deletion must be done manually

---

*Version 2.0 Released: 2026-02-01*
*Version 1.0 Released: 2026-01-25*
