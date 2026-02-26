# SSI GraphQL Data Model — Event Type Hierarchy

> Last updated: 2026-02-27
> Source: Production error messages, schema introspection, and web scraping observations.

## Overview

ShootNScoreIt (SSI) uses a **polymorphic event model** built on Django's content type framework. The GraphQL API exposes events through **interfaces** with discipline-specific **node types**. Fields available depend on the concrete node type, not just the interface.

This document describes the type hierarchy, which fields are on which types, and the two-step discovery logic used by `seed-import.js` to query events discipline-agnostically.

---

## 1. Event Type Hierarchy

```
EventInterface (abstract)
├── NordicSerieNode      (CT 136) — Nordic Cup (RESUL CUP, etc.)
├── PrecisionSerieNode              — Precision Cup
├── IpscSerieNode                   — IPSC/SRA Cup
└── PpcSerieNode                    — PPC Cup

ComponentMatchInterface (abstract)
├── NordicResulMatchNode (CT 91)  — Nordic 25m Kuvio match
├── PrecisionMatchNode            — Precision match
├── IpscMatchNode                 — IPSC/SRA match
└── PpcMatchNode                  — PPC match

SquadInterface (abstract)
├── NordicSquadNode               — Nordic squad
├── PrecisionSquadNode            — Precision squad
├── CmpSquadNode                  — CMP squad
└── GenericSquadNode              — Generic/fallback squad
```

## 2. Fields by Interface vs Node Type

### EventInterface (common to all event types)

These fields are queryable on **any** event via the `event(content_type, id)` query:

| Field | Type | Notes |
|-------|------|-------|
| `id` | String | Event ID |
| `name` | String | Display name |
| `starts` | DateTime | Event start |
| `ends` | DateTime | Event end |
| `status` | String | on, off, etc. |
| `rule` | String | Event rule code |
| `description` | String | HTML description |
| `information` | String | HTML additional info |
| `venue` | String | Venue name |
| `url` | String | External URL |
| `url_display` | String | URL display text |
| `max_competitors` | Int | Max registrations |
| `region` | String | Country code (FIN, etc.) |
| `visibility` | String | pub, prv, etc. |
| `registration` | String | op, cl, etc. |
| `results` | String | cmp, org, etc. |
| `currency` | String | EUR, etc. |
| `component_matches` | [ComponentMatchInterface] | Child matches (cups only) |
| `squads` | [SquadInterface] | Event-level squads |

### Fields on specific Serie node types (NOT on EventInterface)

These must be queried via inline fragments: `... on NordicSerieNode { field }`

| Field | NordicSerieNode | PrecisionSerieNode | IpscSerieNode | PpcSerieNode |
|-------|:-:|:-:|:-:|:-:|
| `scoring_mode` | ✅ | ✅ | ❓ | ❓ |
| `match_registration_mode` | ✅ | ✅ | ✅ | ✅ |
| `timezone` | ✅ | ✅ | ✅ | ✅ |

> ❓ = Not yet confirmed in production. May exist but untested.

### ComponentMatchInterface (common to all match types in a cup)

| Field | Type | Notes |
|-------|------|-------|
| `id` | String | Match ID |
| `name` | String | Match display name |
| `starts` | DateTime | Match start |
| `ends` | DateTime | Match end |
| `status` | String | Match status |
| `rule` | String | Match rule code |
| `get_content_type_key` | String | Django content type key |
| `description` | String | HTML description |
| `information` | String | HTML info |

### Fields NOT on ComponentMatchInterface

| Field | Where it lives | Access method |
|-------|---------------|---------------|
| `squads` | Specific match node types (e.g. `NordicResulMatchNode`) | `... on NordicResulMatchNode { squads { ... } }` |

> **Key limitation**: `squads` is NOT queryable directly on `ComponentMatchInterface`. You must use an inline fragment on the specific match node type.

### SquadInterface (common to all squad types)

| Field | Type | Notes |
|-------|------|-------|
| `id` | String | Squad ID |
| `max_competitors` | Int | Squad capacity |

### Fields NOT on SquadInterface

| Field | Where it lives | Access method |
|-------|---------------|---------------|
| `name` | Specific squad node types | `... on NordicSquadNode { name }` |
| `starts` | Specific squad node types | `... on NordicSquadNode { starts }` |
| `competitors` | Some squad node types | `... on NordicSquadNode { competitors { id } }` |

## 3. Variable Types

| Parameter | Expected Type | Notes |
|-----------|--------------|-------|
| `content_type` / `$ct` | `Int!` | Content type ID (136, 91, etc.) |
| `id` / `$id` | `String!` | Event ID — **NOT `ID!`** despite being an ID |

> **Pitfall**: The `event()` query expects `$id: String!`, not `$id: ID!`. Using `ID!` causes a type mismatch error.

## 4. Known Content Type IDs

| CT ID | Node Type | Description |
|-------|-----------|-------------|
| 136 | NordicSerieNode | Nordic Cup (RESUL CUP) |
| 91 | NordicResulMatchNode | Nordic 25m Kuvio Pistol match |

> Other CT IDs not yet mapped. Use `get_content_type_key` on component matches to discover their types.

## 5. Two-Step Discovery Logic

The seed import (`lib/ssi-core/seed-import.js`) uses a two-step approach to query events without hardcoding discipline-specific types.

### Step 1: Discovery Query

A lightweight query fetches `__typename` for all polymorphic nodes:

```graphql
query EventDiscovery($ct: Int!, $id: String!) {
  event(content_type: $ct, id: $id) {
    __typename           # → e.g. "NordicSerieNode"
    id
    name
    component_matches {
      __typename         # → e.g. "NordicResulMatchNode"
      id
    }
    squads {
      __typename         # → e.g. "NordicSquadNode"
      id
    }
  }
}
```

**What this tells us:**
- `event.__typename` → which Serie type (determines available fields)
- `component_matches[0].__typename` → which Match type (needed for squads access)
- `squads[0].__typename` → which Squad type (name/starts access)
- `component_matches.length > 0` → whether this is a Cup (has child matches)

**What this does NOT include:**
- `squads` under `component_matches` — NOT on `ComponentMatchInterface`
- Type-specific fields (scoring_mode, timezone, etc.)

### Step 2: Type-Specific Structure Query

Using the discovered `__typename` values, `buildStructureQuery()` generates a query with the correct inline fragments:

```
Discovery result:                   Generated query uses:
─────────────────                   ────────────────────
event = NordicSerieNode          →  ... on NordicSerieNode { scoring_mode ... }
match = NordicResulMatchNode     →  ... on NordicResulMatchNode { squads { ... } }
squad = NordicSquadNode          →  ... on NordicSquadNode { name starts ... }
```

### Lookup Tables

The code uses two lookup tables to map `__typename` → fields:

```javascript
// Serie-level type-specific fields
SERIE_TYPE_FIELDS = {
  NordicSerieNode:    'scoring_mode match_registration_mode timezone',
  PrecisionSerieNode: 'scoring_mode match_registration_mode timezone',
  IpscSerieNode:      'match_registration_mode timezone',
  PpcSerieNode:       'match_registration_mode timezone',
}

// Squad-level type-specific fields
SQUAD_TYPE_FIELDS = {
  NordicSquadNode:    'name starts competitors { id }',
  PrecisionSquadNode: 'name starts competitors { id }',
  CmpSquadNode:       'name starts',
  GenericSquadNode:   'name starts',
}
```

### Fallback Behavior

- Unknown event `__typename` → no inline fragment (only EventInterface fields)
- Unknown squad `__typename` → falls back to `GenericSquadNode` with `name starts`
- No squads in discovery → uses `GenericSquadNode`
- No component_matches → treated as single match (not a cup)

## 6. Event-Level vs Match-Level Squads

**Critical business rule: Cups (Serie types) do NOT have squads.** Only matches have squads.

| Event Type | Has `squads` field? | How to access squads | Notes |
|------------|:-:|---|-------|
| Cup (Serie) | ❌ **No** | Via `component_matches → ... on MatchType { squads }` | Querying `squads` on a Serie **crashes SSI** |
| Match (standalone) | ✅ Yes | Direct `squads { ... }` on event | Works on EventInterface |
| Component Match (in cup) | ✅ Yes | Via inline fragment on match type | NOT on ComponentMatchInterface |

**Cup structure example:**
```
NordicSerieNode (Cup)
├── squads: ✗ DOES NOT EXIST    ← DO NOT QUERY THIS
├── component_matches:
│   ├── NordicResulMatchNode
│   │   └── squads:              ← Squads live here (via inline fragment)
│   │       ├── NordicSquadNode (Squad 1, max 9)
│   │       └── NordicSquadNode (Squad 2, max 9)
│   ├── NordicResulMatchNode
│   │   └── squads: [...]
│   └── NordicResulMatchNode
│       └── squads: [...]
```

### Squad Type Inference

Since cups don't expose squads for discovery, squad types are **inferred** from event/match types:

```javascript
EVENT_TO_SQUAD_TYPE = {
  NordicSerieNode:      'NordicSquadNode',
  NordicResulMatchNode: 'NordicSquadNode',
  PrecisionSerieNode:   'PrecisionSquadNode',
  PrecisionMatchNode:   'PrecisionSquadNode',
  IpscSerieNode:        'GenericSquadNode',
  PpcSerieNode:         'GenericSquadNode',
}
```

## 7. Event Creation — Form URLs by Discipline

| Discipline | Cup Create URL | Match Create URL |
|-----------|---------------|-----------------|
| Nordic | `/series/nordic/create-resul-cup/` | `/nordic/create-resul-25-kuvio-pistol/` |
| Precision | Unknown | Unknown |
| IPSC/SRA | Unknown | Unknown |
| PPC | Unknown | Unknown |

> These are web scraping URLs for form POSTs. GraphQL `create_event` mutation status is tracked in GQL7.

## 8. Snapshot Schema

The seed import produces a snapshot stored in `match_templates.ssi_seed_snapshot` (JSONB):

```javascript
{
  importedAt: "2026-02-27T...",
  sourceUrl: "https://shootnscoreit.com/event/136/160/",
  contentType: "136",
  eventId: "160",
  isCup: true,
  eventTypeName: "NordicSerieNode",      // Discovered in step 1
  squadTypeName: "NordicSquadNode",      // Discovered in step 1
  name: "TurRes Kupittaa CUP 14.02.2026",
  starts: "2026-02-14T...",
  ends: "2026-02-14T...",
  // ... event details ...
  settings: {
    scoringMode: "pts",                  // From NordicSerieNode fragment
    matchRegistrationMode: "all",        // From NordicSerieNode fragment
    timezone: "Europe/Helsinki",         // From NordicSerieNode fragment
    // ... common settings ...
  },
  matches: [
    {
      id: "...",
      name: "Match 1",
      contentTypeKey: "nordicresulmatch", // From get_content_type_key
      squads: [
        { id: "...", name: "Squad 1", maxCompetitors: 9, starts: "..." }
      ]
    }
  ]
}
```

## 9. Adding Support for New Disciplines

To support a new SSI discipline:

1. **Run discovery** against a real event of that type to get `__typename` values
2. **Add to `SERIE_TYPE_FIELDS`** with the correct type-specific fields
3. **Add to `SQUAD_TYPE_FIELDS`** if squad node type is new
4. **Add form URL** for event creation (web scraping) in `event-creation-service.js`
5. **Test** seed import end-to-end against the new discipline

No code changes needed for discovery step 1 — it works for any discipline automatically.
