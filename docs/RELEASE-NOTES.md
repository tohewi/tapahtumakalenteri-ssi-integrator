# Release Notes

## Version 4.0 (2026-02-07)

### Overview

Registration frontend and scoring application — shooters can self-register for Kupittaa CUP events via a mobile-friendly web form, and range officers score matches on phones/tablets. Both apps share a single backend deployed on Render.

### New: Registration App (`#/register`)

- **Self-service registration**: Shooters register for CUP events without admin intervention
- **Mobile-first wizard**: Captcha → Cup selection → Squad selection → Email → Submit
- **Real-time progress**: NDJSON streaming shows match-by-match registration progress
- **Re-registration**: Returning shooters can change their squad — system is fully idempotent
- **Confirmation email**: HTML email via Resend with match list, squad assignments, and instructions
- **User not found**: Links to SSI signup page when email isn't in the system

### New: Scoring App (`#/scoring`)

- **Touch-optimized scoring**: Zone-tap buttons (X, 10–1, M) for entering scores on the range
- **PWA installable**: Works offline-capable, installable on mobile devices
- **Per-user sessions**: Multi-user JWT + cookie isolation with 8h TTL
- **Remember me**: AES-GCM encrypted credential storage with auto-login
- **Navigation persistence**: Cup/match/squad/series state survives app restarts

### Security (RSEC1–RSEC11)

All 11 registration security requirements implemented:

- **No user enumeration** — generic error responses only
- **Strict input validation** — regex/bounds on all fields
- **Request size limits** — 1KB registration, 10KB global
- **Rate limiting** — 4 limiters with IP logging and curfew tracking
- **Captcha anti-replay** — single-use, 15min TTL
- **HTML injection prevention** — `escapeHtml()` on all SSI data in email templates
- **Helmet + CORS** — locked to production origin
- **Admin credential isolation** — server-side env vars only

### Infrastructure

- **Render**: Single web service serving both UI and API
- **GitHub Actions**: CI pipeline — install → test → audit → build → deploy
- **Resend**: Transactional email from `no-reply@ssi.towi.me`

### Requirements Met

- R1–R14: Registration functional requirements ✅
- RSEC1–RSEC11: Registration security requirements ✅
- S1–S10, P1–P4, M1–M3, B1–B4, SEC1–SEC10: Scoring requirements ✅

---

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
