# SSI Admin Operations — Discovery Findings

**Discovered**: 2026-02-06  
**Purpose**: Enable automated registration frontend for Kupittaa Cup

---

## Discovered Admin URLs

### 1. Participant Search and Add

**URL**: `/event/{contentType}/{eventId}/participant-search-and-add/`

- Works for Cup (CT=136) and Match (CT=91)
- Form method: POST
- Form fields: `email`, `first_name`, `last_name`
- Searches SSI users by email and adds them as participants
- When used on Cup with `matchRegistrationMode: "all"`, auto-enrolls to all component matches

**Example**:
```
POST https://shootnscoreit.com/event/136/158/participant-search-and-add/
Fields: email=user@example.com
```

### 2. Participant Edit (Squad Assignment)

**URL**: `/event/participant/93/{participantId}/edit/`

- Form method: POST
- Key fields: `squad` (SELECT dropdown), `shooter`, `status`, `weapon_group`, `category`, `competence_class`, `number`, `comment`
- Squad dropdown values: Squad 1, Squad 2, Squad 3 (mapped to squad IDs)
- This is how admin assigns a competitor to a specific squad

**Example**:
```
POST https://shootnscoreit.com/event/participant/93/21898/edit/
Fields: squad=4260, status=a, weapon_group=STD, category=Open, ...
```

### 3. Match Squads Page

**URL**: `/event/91/{matchId}/squads/`

- Read-only view of squad assignments
- Has bulk assignment links:
  - `/event/91/{matchId}/squads-assign-all-even/` — distribute evenly
  - `/event/91/{matchId}/squads-assign-all-full/` — fill sequentially
- Shows current competitor count per squad

### 4. Send Invitation (Email)

**URL**: `/event/136/{cupId}/send-invitation/`

- Form fields: `to_email`, `subject`, `body`, `reply_email`
- Sends invitation email to shooter (not direct registration)
- Less useful for automated flow — prefer search-and-add

### 5. Content Types

| Entity | Content Type | Notes |
|---|---|---|
| Cup (NordicSerie) | 136 | `get_content_type_key` |
| Match (NordicMatch) | 91 | Event page CT |
| Competitor/Participant | 93 | Edit/detail CT |
| Squad | 92 | Squad view CT |

## Registration Workflow (Admin as Proxy)

```
1. POST email to /event/136/{cupId}/participant-search-and-add/
   → SSI looks up user by email
   → If found: adds to Cup + auto-enrolls to all matches
   → If not found: form returns error

2. Query matches via GraphQL to find new participant IDs
   → event(content_type: 91, id: matchId) { squads { competitors { id email } } }

3. For each match: POST to /event/participant/93/{participantId}/edit/
   → Set squad field to the desired squad ID
   → Set other required fields (status, weapon_group, category)
```

## Unknowns (To Verify During Implementation)

- Exact POST body format for search-and-add (may need CSRF token, additional fields)
- How search-and-add reports "user not found" (error message in HTML? redirect?)
- Squad SELECT option values (need to map squad names → IDs dynamically)
- Whether cup search-and-add auto-sets status to "approved" or requires manual approval
- Participant edit: which fields are required vs optional in the POST

## Test Data

| Entity | ID | Name |
|---|---|---|
| TEST Cup | 158 | TEST TurRes Kupittaa CUP 06.02.2026 |
| Match 1 | 1903 | TEST Kupittaa 06.02.2026 Tarkkuus |
| Match 2 | 1904 | TEST Kupittaa 06.02.2026 Pika |
| Match 3 | 1905 | TEST Kupittaa 06.02.2026 Kuvio |
| Participant | 21898 | Example competitor (squad 4260) |
| Squad IDs | 4260, 4261 | Laina-ase, Oma ase 1 (from match 1903) |
