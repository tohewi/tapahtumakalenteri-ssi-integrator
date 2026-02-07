# Registration & Re-registration Flow

## Overview

The registration system allows shooters to register for Kupittaa RESUL CUP events via a mobile-friendly web form. The backend acts as an admin proxy, performing all SSI operations on behalf of the user using web scraping.

## Frontend Flow (User perspective)

```mermaid
flowchart TD
    START([User opens #/register]) --> CAPTCHA[Step 1: Captcha\nSolve math question]
    CAPTCHA -->|Correct| CUPS[Step 2: Select Cup\nOpen cups highlighted green\nClosed cups greyed out]
    CAPTCHA -->|Wrong| CAPTCHA

    CUPS -->|Tap cup| SQUADS[Step 3: Select Squad\nLaina-ase / Oma ase 1 / Oma ase 2\nShows available spots]
    SQUADS -->|Tap squad| EMAIL[Step 4: Enter Email\nSSI account email]
    EMAIL -->|Submit| SUBMITTING[Step 5: Submitting\nProgress bar: 1/3, 2/3, 3/3]

    SUBMITTING -->|Success| RESULT_OK[✅ Ilmoittautuminen onnistui!]
    SUBMITTING -->|Already registered| RESULT_ALREADY[⚠️ Olet jo ilmoittautunut]
    SUBMITTING -->|User not found| RESULT_404[❌ Rekisteröidy ensin SSI:hin\n+ link to SSI register]
    SUBMITTING -->|Captcha expired| CAPTCHA_RETRY[Back to Step 1\nSelections preserved\nNew captcha loaded]
    CAPTCHA_RETRY -->|Correct| EMAIL

    RESULT_OK --> RESET([Ilmoita toinen])
    RESULT_ALREADY --> RESET
    RESULT_404 --> RESET
    RESET --> CAPTCHA
```

## Backend Flow — First Registration

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant S as Scoring Proxy
    participant SSI as ShootNScoreIt

    U->>S: POST /api/register/submit<br/>{cupId, squadNumber, email, captchaId, captchaAnswer}

    Note over S: Validate captcha (15 min TTL)

    S->>SSI: POST /event/136/{cupId}/participant-search-and-add/<br/>Search by email
    SSI-->>S: Search results table (shows user name)

    Note over S: Extract shooterName from search results table

    S->>SSI: GET register-participant/{userId}/
    SSI-->>S: Confirmation form (competence_class, shooter, weapon_group...)

    Note over S: Wait 5s (SSI anti-bot)

    S->>SSI: POST confirmation form
    SSI-->>S: 302 redirect (success)

    Note over S: shooterName = "TurRes Bot" (from form or search table)

    S-->>U: NDJSON: {"type":"progress","step":"approve","message":"Cup-hyväksyntä..."}

    S->>SSI: GET /event/136/{cupId}/participants/
    Note over S: Find participant by shooterName
    S->>SSI: GET /event/participant/137/{participantId}/edit/
    S->>SSI: POST status=a (Approved)
    SSI-->>S: 302 (approved)

    loop For each match (Tarkkuus, Pika, Kuvio)
        S-->>U: NDJSON: {"type":"progress","step":"match","current":N,"total":3}

        S->>SSI: POST /event/91/{matchId}/participant-search-and-add/<br/>Search by email
        SSI-->>S: Search results + register link
        S->>SSI: GET register-participant/{userId}/
        Note over S: Wait 5s (anti-bot)
        S->>SSI: POST confirmation form
        SSI-->>S: 302 (added)

        S->>SSI: GET /event/91/{matchId}/participants/
        Note over S: Find competitor by shooterName
        S->>SSI: GET /event/participant/93/{participantId}/edit/
        S->>SSI: POST squad={squadValue}, status=a
        SSI-->>S: 302 (squad assigned + approved)
    end

    S-->>U: NDJSON: {"type":"result","success":true,"message":"Ilmoittautuminen onnistui!"}
```

## Current Re-registration Handling

```mermaid
flowchart TD
    SUBMIT([User submits with email\nalready registered in CUP]) --> SEARCH[POST search-and-add]
    SEARCH --> REGISTER[GET register-participant link]
    REGISTER --> CONFIRM[POST confirmation form]
    CONFIRM --> CHECK{SSI response?}

    CHECK -->|"Shooter already registered"| ALREADY[addResult.message = 'Already registered'\naddResult.success = true]
    ALREADY --> SERVER{server.js check}
    SERVER -->|"message === 'Already registered'"| BLOCK[❌ HTTP 409\n'Olet jo ilmoittautunut tähän cupiin.']
    BLOCK --> USER_SEES[User sees error\nCannot change squad]

    CHECK -->|302 redirect| SUCCESS[addResult.success = true\nmessage = 'Participant added']
    SUCCESS --> CONTINUE[Continue to approve + matches + squads]

    style BLOCK fill:#fee,stroke:#c00
    style USER_SEES fill:#fee,stroke:#c00
```

### Problem

When a user is already registered in the CUP, the current code returns HTTP 409 and stops. This means:

1. **User cannot change their squad** — they're stuck with whatever they originally picked
2. **User cannot fix mistakes** — wrong squad selection requires admin intervention
3. **No feedback** — user doesn't know which squad they're currently in

The CUP registration is blocked, but the user may or may not be registered in the component matches (Tarkkuus, Pika, Kuvio). If they registered before the match registration step completed, they could be in an inconsistent state.

## Proposed Re-registration Flow

Instead of blocking, treat "already registered" as a valid state and proceed to update squad assignments:

```mermaid
flowchart TD
    SUBMIT([User submits with email]) --> CUP_ADD[POST search-and-add to CUP]
    CUP_ADD --> CHECK{SSI response?}

    CHECK -->|New registration| APPROVE[Approve CUP participant\nstatus = 'a']
    CHECK -->|"Already registered"| SKIP_CUP[Skip CUP add\nProceed with shooterName]

    APPROVE --> MATCHES
    SKIP_CUP --> MATCHES

    MATCHES[For each match: Tarkkuus, Pika, Kuvio] --> MATCH_ADD[POST search-and-add to match]
    MATCH_ADD --> MATCH_CHECK{Already in match?}

    MATCH_CHECK -->|New| FIND_AND_SQUAD[Find competitor → Assign squad]
    MATCH_CHECK -->|Already registered| FIND_AND_SQUAD

    FIND_AND_SQUAD --> SQUAD_EDIT[POST edit form:\nsquad = new selection\nstatus = 'a']
    SQUAD_EDIT --> NEXT{More matches?}
    NEXT -->|Yes| MATCHES
    NEXT -->|No| RESULT[✅ Success\nNew: 'Ilmoittautuminen onnistui!'\nUpdate: 'Squad päivitetty!']

    style SKIP_CUP fill:#ffe,stroke:#aa0
    style RESULT fill:#efe,stroke:#0a0
```

### Key changes needed

1. **Don't block on "Already registered"** — treat it as success, continue to match registration
2. **`ssiSearchAndAddParticipant` for matches** already handles "already registered" gracefully — it returns `success: true`
3. **`ssiSetParticipantSquad` overwrites** the squad — calling it again simply updates the assignment
4. **`ssiFindAndApproveCupParticipant` checks** if already approved and skips if so
5. **Differentiate UI message** — "Ilmoittautuminen onnistui!" vs "Squad päivitetty!"

### What already works for re-registration

| Step | Already handles re-registration? | Notes |
|---|---|---|
| CUP search-and-add | ✅ Returns `success: true, message: 'Already registered'` | But server blocks with 409 |
| CUP approve | ✅ Checks if already approved, skips | `"Already approved"` |
| Match search-and-add | ✅ Returns `success: true` for both new and existing | Same "Already registered" handling |
| Match find competitor | ✅ Finds by name regardless of state | Works for existing participants |
| Squad assignment | ✅ Overwrites squad via edit form | Simply sets new squad value |

**The only change needed is in `server.js`**: remove the 409 block and let the flow continue.

## SSI State Diagram (per participant)

```mermaid
stateDiagram-v2
    [*] --> NotRegistered: User has SSI account

    NotRegistered --> Pending: search-and-add\n(admin registers user)
    Pending --> Approved: edit status='a'\n(admin approves)
    Approved --> Approved: re-registration\n(squad updated)

    Pending --> ApprovedNoResults: toggle-status
    ApprovedNoResults --> Deleted: toggle-status
    Deleted --> Pending: toggle-status

    note right of Approved
        This is the target state.
        Squad can be changed via
        edit form at any time.
    end note

    note right of Pending
        Default state after
        user self-registers or
        admin adds participant.
    end note
```

## Timing & TTL Considerations

```mermaid
gantt
    title Registration Timeline
    dateFormat X
    axisFormat %M:%S

    section User Actions
    Captcha answer        :a1, 0, 10
    Browse cups           :a2, 10, 60
    Select squad          :a3, 60, 30
    Enter email           :a4, 90, 30
    Submit                :a5, 120, 5

    section Backend (per submit)
    CUP search-and-add    :b1, 125, 7
    CUP approve           :b2, 132, 3
    Match 1 add + squad   :b3, 135, 8
    Match 2 add + squad   :b4, 143, 8
    Match 3 add + squad   :b5, 151, 8

    section Captcha TTL
    15 min window         :crit, c1, 0, 900
```

- **Captcha TTL**: 15 minutes from creation (step 1) to validation (submit)
- **Anti-bot delay**: 5 seconds per SSI form submission (4 forms = 20s minimum)
- **Total backend time**: ~25-35 seconds for full registration (CUP + 3 matches)
- **Re-registration**: Slightly faster since CUP add returns immediately with "Already registered"
