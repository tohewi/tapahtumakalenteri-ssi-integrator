# SSI GraphQL API Limitations - Agent Instructions

**Critical Information for AI Agents Working on This Codebase**

## Overview

The ShootNScoreIt (SSI) GraphQL API has **known limitations** that affect how we can interact with it. This document provides essential context for AI agents to make informed decisions when working with SSI integration code.

## Mandatory GraphQL Request Rules

- **Always send `x-api-key`.** Every GraphQL request requires this header in
  addition to `Authorization: JWT ...` when an authenticated query is needed.
  The shared client rejects requests without a key; configure `SSI_ADMIN_API_KEY`
  or pass the key explicitly.
- **Do not send parallel query bursts.** Sequence SSI GraphQL requests rather
  than launching batches concurrently (for example, do not use `Promise.all` for
  multiple SSI GraphQL queries). The upstream API is sensitive to query bursts.
- **Do not select deprecated scorecard fields** `scorecards` or
  `scorecards_count` on `EventInterface` or `CompetitorInterface`. Use
  `competitor_scorecards()` / `competitor_scorecards_count()` instead, or query
  `StageInterface.scorecards` only when stage scorecards are needed.

## GraphQL API Status

### ✅ What Works (Read Operations)

The following GraphQL operations are **fully functional**:

- `token_auth` - JWT authentication (email + password → JWT token)
- `refresh_token` - Token refresh
- `Get-SSIMe` (whoami) - Returns authenticated user info
- `events(search: ...)` query - Search and read events
- `event(content_type, id)` query - Read single event with full details
  - **Important schema rule for `squads`:** `match.squads` returns `SquadInterface` (which only exposes `id`, `number`, `comment`). Selecting `competitors` or `max_competitors` directly on `squads` throws `GraphQL Error: Cannot query field 'competitors' on type 'SquadInterface'`. Always use an inline fragment such as `... on NordicSquadNode { max_competitors competitors { ... } }`.
- `get_abstract_event` query - Returns form choices for rule/sub_rule/serie_type
- Schema introspection - Full mutation/query schema is accessible, subject to
  the required `x-api-key` header and request pacing rules above

### ⚠️ Historical Write Limitation (Last Tested February 2026)

The following `create_event` failure was observed in February 2026; the current
mutation status has not been revalidated:

- `create_event` mutation failed for both Cups and Matches
  - Error: `'NoneType' object has no attribute '_meta'`
  - Root cause: Server-side bug in the mutation resolver
- Any dependent mutations that require `create_event` to work first

## Root Cause

In the February 2026 observations, the `create_event` mutation failed at the
resolver entry point before any form data was processed. The Django error
indicates the mutation resolver maps `(rule, sub_rule, serie_type)` → Django
model class, gets `None`, then crashes accessing `None._meta`.

**Evidence**:
- Every combination fails identically (cup/match, full/minimal fields, with/without organizer)
- Error occurs at mutation entry point
- Read operations with same parameters work fine
- Web form creation (HTTP POST) works with the same data
- This is confirmed as an SSI server-side regression

## Workarounds

### Current Approach: Web Scraping

Until the mutation is verified to work, use web scraping for the affected write
operations:

1. **Cup Creation**: Use `scripts/New-KupittaaCup.ps1` (web scraping version)
   - Location: `archive/scripts-legacy/New-KupittaaCup.ps1`
   - This submits data via HTTP POST to Django forms
   - **Reliable and tested** for all operations (cups, matches, squads, linking)

2. **GraphQL Scripts**: `scripts-graphql/New-KupittaaCup.ps1` exists but **will not work** until API is fixed
   - Keep this for future use when API is fixed
   - Pester tests exist to validate when the fix is deployed

### Testing GraphQL Availability

To check if the GraphQL API has been fixed:

```powershell
# Run Pester tests
Invoke-Pester -Path .\scripts-graphql\tests\SSI-GraphQL.Tests.ps1 -Output Detailed

# If these tests pass, the API is fixed:
# - "Should create a TEST RESUL Cup"
# - "Should create a TEST RESUL Match"
```

## Instructions for AI Agents

### When Adding SSI Integration Features

1. **Read Operations**: Use GraphQL with the request rules above
   - Use the domain client in `scoring-proxy/lib/ssi-core/graphql.js`
   - Include the required API key and sequence queries; do not issue bursts
   - Avoid the deprecated scorecard fields on event and competitor interfaces

2. **Write Operations**: Use web scraping approach
   - Do not rely on GraphQL mutations for creating/updating data until their
     behavior has been verified
   - Refer to existing web scraping implementations in `archive/scripts-legacy/`
   - Follow the Django form submission pattern

3. **Future-Proofing**: 
   - Keep GraphQL mutation code for reference
   - Add comments indicating "This will work when SSI fixes the API"
   - Reference this document in code comments

### When Refactoring SSI Client Code

- **Preserve both approaches**: GraphQL (for reads) and web scraping (for writes)
- **Do not remove** GraphQL mutation code - it will be needed when API is fixed
- **Document clearly** which operations use which approach
- Keep the Pester tests for validation of future API fixes

### When Asked About SSI Integration

- **Always mention** the GraphQL limitation
- **Recommend** web scraping for write operations
- **Reference** `docs/design/ssi-graphql-findings.md` for detailed technical information
- **Note** that this is a server-side issue requiring SSI team action

## Dependencies

This limitation affects:

- **Cup creation workflows** - Must use web scraping
- **Match creation** - Must use web scraping
- **Squad creation** - Must use web scraping
- **Event linking operations** - Must use web scraping

This **does not** affect:

- Reading event data
- Searching for events
- Authentication and token management
- Competitor information retrieval

## Status and Review

- The `create_event` mutation failure described above was observed in February
  2026; its current status has not been revalidated here.
- The API-key, query-pacing, and deprecated-scorecard rules above apply to
  GraphQL integrations regardless of mutation availability.
- **Last updated**: 2026-10-26

## References

- Detailed technical analysis: `docs/design/ssi-graphql-findings.md`
- Working web scraping scripts: `archive/scripts-legacy/New-KupittaaCup.ps1`
- GraphQL test suite: `scripts-graphql/tests/SSI-GraphQL.Tests.ps1`
- SSI GraphQL implementation: `scoring-proxy/lib/ssi-core/graphql.js`

---

**Summary for Quick Reference:**
- ✅ GraphQL reads work subject to the request rules above
- 🔑 Every GraphQL request requires `x-api-key`
- 🐢 Sequence queries; do not send parallel bursts
- ⚠️ Avoid deprecated event/competitor `scorecards` and `scorecards_count`
- ⚠️ `create_event` failure was reported in February 2026; current status has
  not been revalidated
- ✅ Web scraping is the documented workaround for writes
- 🧪 Pester tests exist to validate when the mutation fix is suspected
