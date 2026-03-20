# Seed Template Process

**Date:** 2026-03-02
**Topic:** How SSI event templates are captured, stored, and used to create new events

## Overview

A **template** is a stored blueprint for creating SSI events (cups, matches, squads). Templates combine a **seed snapshot** (captured from a real SSI event via GraphQL + web scraping) with **user-configurable overrides** to produce new events that match the original's structure.

## 1. What is in a Template?

A template consists of two main data structures stored side by side:

### `overrides` — User-Configurable Values

These are values the user can change per template. They take priority over the seed snapshot.

```json
{
  "nameTemplate": "TEST TurRes Kupittaa CUP {date}",
  "description": "Lauantain pistooliampumavuoro...",
  "url": "https://turun-reservi...",
  "urlDisplay": "Lisätietoa",
  "venue": "",
  "formFields": {
    "weapon_groups": ["STD"],
    "categories": ["Open"]
  },
  "matchFormFields": {
    "weapon_groups": ["STD"],
    "categories": ["Open"]
  }
}
```

| Field | Purpose |
|-------|---------|
| `nameTemplate` | Event name with `{date}` placeholder replaced at creation time |
| `description` | SSI event description text |
| `url` / `urlDisplay` | Web address shown on the SSI event page |
| `venue` | Event location |
| `formFields` | Multi-value form fields for the **cup** (divisions, categories) |
| `matchFormFields` | Multi-value form fields for **component matches** |

### `ssiSeedSnapshot` — Captured from SSI

This is a structural snapshot of a real SSI event, captured via the seed import process. It serves as the **source of truth** for event structure (matches, squads, settings).

```json
{
  "name": "TEST TurRes Kupittaa CUP 08.02.2026",
  "isCup": true,
  "rule": "rl",
  "matchCount": 3,
  "settings": {
    "visibility": "pub",
    "registration": "op",
    "maxCompetitors": 50,
    "region": "FIN",
    "currency": "EUR",
    "scoringMode": "pts",
    "matchRegistrationMode": "all"
  },
  "matches": [
    {
      "name": "TEST Kupittaa 08.02.2026 Tarkkuus",
      "id": "1909",
      "contentTypeKey": "91",
      "description": "..."
    },
    { "name": "...Pika", "..." : "..." },
    { "name": "...Kuvio", "..." : "..." }
  ],
  "squads": [
    { "name": "Laina-ase (pieni puoli)", "maxMembers": 9 },
    { "name": "Oma ase 1 (iso puoli, vasen)", "maxMembers": 9 },
    { "name": "Oma ase 2 (iso puoli, oikea)", "maxMembers": 7 }
  ],
  "formFields": null,
  "matchFormFields": null
}
```

| Field | Purpose |
|-------|---------|
| `isCup` | Whether this is a cup (with component matches) or a standalone match |
| `rule` | SSI rule code (e.g., `rl` for RESUL, `sr` for SRA) |
| `settings` | Scalar settings (visibility, registration mode, region, etc.) |
| `matches[]` | Component match blueprints — names, IDs, descriptions |
| `squads[]` | Squad blueprints — names and max member counts |
| `formFields` | Multi-value fields captured from SSI edit page (if found) |

## 2. Where is it Stored?

Templates are persisted in the **PostgreSQL** `match_templates` table.

```
PostgreSQL → match_templates
├── id              (text, e.g., "tpl_1ebfd2dfeb14466b")
├── tenant_id       (text, FK → tenants)
├── discipline_id   (text, FK → disciplines)
├── name            (text, e.g., "Kupittaa Cup")
├── overrides       (JSONB)  ← user configuration
└── ssi_seed_snapshot (JSONB) ← captured from SSI event
```

### Key Files

| File | Role |
|------|------|
| `lib/db/platform-store.js` | CRUD operations: `createMatchTemplate`, `updateMatchTemplate`, `getMatchTemplate` |
| `routes/platform.js` | REST API: `POST/GET/PATCH/DELETE /api/v1/platform/tenants/:id/templates` |
| `lib/ssi-core/seed-import.js` | Seed capture logic: `ssiFetchEventStructure` |

## 3. How a Seed is Captured (Import)

The import process extracts the structure of an existing SSI event into a snapshot.

```
User selects an SSI event URL
  → POST /api/v1/platform/tenants/:tenantId/templates/:templateId/import-seed
    → routes/platform.js
      → lib/ssi-core/seed-import.js :: ssiFetchEventStructure()
```

### Import Steps

1. **Authenticate** — SSI GraphQL login (`ssiGraphQLAuth`) using tenant's SSI credentials
2. **Discover types** — GraphQL introspection to find the event's `__typename` (e.g., `NordicSerieNode`, `NordicMatchNode`)
3. **Fetch structure** — Type-specific GraphQL query to get: name, settings, component matches, squads with all their properties
4. **Capture form fields** (optional) — Web scrape the SSI event edit page to extract checked/selected values for `weapon_groups`, `categories`, `competence_classes`. This step probes multiple URL patterns because edit page URLs vary by discipline. If the edit page is not found, `formFields` remains `null` and `overrides.formFields` must be set manually.
5. **Return snapshot** — The assembled snapshot is stored as `ssiSeedSnapshot` in the template

### Why both GraphQL and Web Scraping?

SSI's GraphQL API exposes event structure (names, settings, squads) but does **not** expose form-level multi-value fields like divisions and categories. These exist only in the HTML admin form. The seed import therefore uses a **hybrid approach**: GraphQL for structure, web scraping for form fields.

## 4. How a Template Becomes a New Event

Event creation is a two-phase process: **schedule** then **execute**.

### Phase 1: Schedule

```
POST /api/v1/platform/tenants/:tenantId/events
Body: { templateId: "tpl_...", dates: ["2027-05-01"] }
```

- Creates a `scheduled_event` record in PostgreSQL with status `planned`
- Generates event name from `overrides.nameTemplate` replacing `{date}` with the formatted date
- No SSI interaction yet

### Phase 2: Execute (Builder Chain)

```
POST /api/v1/platform/tenants/:tenantId/events/:eventId/execute
```

The execution flow:

```
routes/platform.js
  → lib/services/event-creation-service.js :: createEventWithBuilder()
    → lib/services/event-builders/index.js  (Builder Registry)
      → Selects builder based on discipline type
        → nordic-cup-graphql-builder.js  (for RESUL cups)
```

### Builder Steps (Nordic Cup Example)

```
┌─────────────────────────────────────────────────────────────┐
│  Step 0: SSI Web Login                                      │
│  Authenticate via web form to get session cookies            │
│  Fetch cup creation form page → CSRF token + scalar defaults │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: CREATE CUP via Web Form POST                       │
│  Scalar fields: form defaults + snapshot.settings + overrides│
│  Multi-value fields: applyTemplateFormFields() merges:       │
│    (1) overrides.formFields  (priority)                      │
│    (2) snapshot.formFields   (seed capture)                  │
│    (3) SSI form page defaults (fallback)                     │
│  Result: SSI cup URL + ID                                    │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: CREATE MATCHES via Web Form POST (×3)              │
│  Name = cup name (minus "CUP") + suffix (Tarkkuus/Pika/...) │
│  Same form field merging as cup                              │
│  SSI enforces 40-character name limit                        │
│  Result: 3 SSI match URLs + IDs                              │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: LINK Matches to Cup via Web POST                   │
│  POST /event/{contentType}/{cupId}/add-existing-match/       │
│  Links each match as a component of the cup                  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: CREATE SQUADS via Web POST (×3 per match = 9)      │
│  POST /nordic/match/{matchId}/add-squads/                    │
│  Names + max members from snapshot.squads[]                  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Update Platform DB                                          │
│  scheduled_event.status = 'ssi_created'                      │
│  scheduled_event.ssi_references = {                          │
│    cupUrl, cupId, cupName,                                   │
│    matches: [{ name, url, id }, ...]                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

```
Template (PostgreSQL)
  ├── overrides.nameTemplate  →  "TEST TurRes Kupittaa CUP 01.05.2027"
  ├── overrides.formFields    →  weapon_groups=[STD], categories=[Open]
  ├── snapshot.settings       →  visibility, registration, maxCompetitors, ...
  ├── snapshot.matches[]      →  3 match blueprints (name suffixes, descriptions)
  └── snapshot.squads[]       →  3 squad blueprints (names, max members)
         │
         ▼
  SSI (via web form POSTs)
  ├── 1 Cup created
  ├── 3 Matches created + linked to cup
  └── 9 Squads created (3 per match)
         │
         ▼
  Platform DB updated
  └── scheduled_event.status = 'ssi_created'
      scheduled_event.ssi_references = { cupUrl, matches[], ... }
```

## 5. Why Web Form POST Instead of GraphQL?

SSI's GraphQL `create_event` mutation silently ignores multi-value form fields (`weapon_groups`, `categories`, `competence_classes`) — the event is created but these fields fall back to SSI defaults. Sending them as comma-separated strings causes a validation error ("Enter a list of values").

Web form POST sends multi-value fields as repeated key=value pairs (`weapon_groups=STD&weapon_groups=RVL`), which SSI handles correctly. Both cup and match creation therefore use web form POST.

GraphQL is still used for:
- Authentication (`ssiGraphQLAuth`)
- Seed import event structure discovery (`ssiFetchEventStructure`)
- SRA standalone match creation (where multi-value fields are less critical)
