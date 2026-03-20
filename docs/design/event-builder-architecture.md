# SSI Event Creation Architecture

**Date:** 2026-03-01
**Topic:** Modular Event Builders & Migration from Web Scraping to GraphQL

## Context & Problem

Historically, creating events (cups and matches) on ShootnScoreIt (SSI) was done entirely via **web scraping**. The `event-creation-service.js` fetched HTML forms, parsed default values (like category lists and discipline-specific rules), overlaid user overrides (name, dates), and submitted the forms using `application/x-www-form-urlencoded` payloads.

This approach had significant drawbacks:
1. **Fragility:** Form structures change (e.g., SRA checkbox names vary from Nordic).
2. **Complexity:** Supporting multiple disciplines (SRA, IPSC, Nordic) required parsing increasingly complex and varied HTML pages.
3. **Monolithic Testing:** Testing the event creation service required mocking large sequences of interdependent HTML fetches and POSTs. Any change risked breaking all disciplines.

SSI recently introduced a more robust **GraphQL API** (via the `create_event` mutation), which we successfully verified via PowerShell scripts (`New-SRATestMatches.ps1`).

## Solution: The Event Builder Registry

To migrate to the new GraphQL API safely, we introduced a **Modular Event Builder Architecture**. Instead of a monolithic `createSsiEvent` function handling all permutations of disciplines and API methods, the core service now delegates to a **Builder Registry**.

### Architecture Design

```
lib/services/event-creation-service.js
  └── createEventWithBuilder(params)
       │
       ├── lib/services/event-builders/index.js (The Registry)
       │    ├── Builder 1: SRA GraphQL (Standalone Match)
       │    ├── Builder 2: [Future] Nordic Cup GraphQL
       │    └── Fallback: Legacy Web Scraping Builder
       │
       ├── lib/services/event-builders/sra-graphql-builder.js
       │    └── Uses lib/ssi-core/event-creation.js (ssiCreateEvent GraphQL)
       │
       └── lib/services/event-builders/legacy-web-builder.js
            └── Uses HTML scraping / fetchCsrf / postForm
```

### Rationale

1. **Phased Migration:** We cannot migrate all event types (Cups, Nordic matches, SRA matches) to GraphQL simultaneously. The schema behaves differently for cups vs matches. The builder pattern allows us to migrate **one specific type of event** (e.g., SRA Standalone Matches) to GraphQL while leaving everything else securely on the legacy web scraper.
2. **Risk Isolation:** If a new GraphQL builder fails or has missing fields, it only affects that specific discipline. The legacy fallback remains untouched.
3. **Code Modularity:** `event-creation-service.js` remains a clean orchestrator. The ugly HTML parsing logic is encapsulated in the legacy builder, and the clean JSON construction is encapsulated in the GraphQL builders.
4. **Testability:** Each builder can be unit tested independently with specific data structures (GraphQL JSON vs Form Data).

## Implementation Details

### 1. The Registry (`event-builders/index.js`)

Builders are evaluated in order. Each builder defines a `match()` function. The first builder that returns `true` is selected.

```javascript
const BUILDERS = [
  {
    name: 'SRA GraphQL (Standalone)',
    match: (snapshot, isCup, discipline) => {
      const isSRA = snapshot.rule === 'sr' || discipline?.sportCode === 'sr' || discipline?.sport === 'SRA'
      return !isCup && isSRA
    },
    build: buildSraStandaloneMatch
  }
]
```

If no builder matches, it falls back to the `legacy-web-builder.js`.

### 2. SRA GraphQL Builder (`sra-graphql-builder.js`)

This builder constructs a clean JSON payload mapping template data to the GraphQL schema. It uses `ssiCreateEvent` from `ssi-core`, which handles the JWT authentication (`ssiGraphQLAuth`) and the `create_event` mutation.

**Important Note:** Even when using GraphQL for event creation, **Squad Creation** still requires a legacy web session. SSI does not yet have a working GraphQL mutation for squad creation. Therefore, the GraphQL builder returns a web session cookie along with the new event IDs so the orchestrator can proceed with squad creation.

### 3. Legacy Web Builder (`legacy-web-builder.js`)

This file contains the exact web scraping logic that used to live in `event-creation-service.js`. It ensures that Cups and Nordic matches continue to function exactly as they did before the refactoring.

## Future Roadmap

1. Implement `ipsc-graphql-builder.js` for standalone IPSC matches.
2. Investigate GraphQL capabilities for Series/Cups (currently SSI backend crashes on certain Cup queries).
3. Migrate Nordic matches to GraphQL once the RESUL rule codes are mapped.
4. Eventually deprecate and remove `legacy-web-builder.js`.
