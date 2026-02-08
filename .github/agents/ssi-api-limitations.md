# SSI GraphQL API Limitations - Agent Instructions

**Critical Information for AI Agents Working on This Codebase**

## Overview

The ShootNScoreIt (SSI) GraphQL API has **known limitations** that affect how we can interact with it. This document provides essential context for AI agents to make informed decisions when working with SSI integration code.

## GraphQL API Status

### ✅ What Works (Read Operations)

The following GraphQL operations are **fully functional**:

- `token_auth` - JWT authentication (email + password → JWT token)
- `refresh_token` - Token refresh
- `Get-SSIMe` (whoami) - Returns authenticated user info
- `events(search: ...)` query - Search and read events
- `event(content_type, id)` query - Read single event with full details
- `get_abstract_event` query - Returns form choices for rule/sub_rule/serie_type
- Schema introspection - Full mutation/query schema is accessible

### ❌ What Does NOT Work (Write Operations / Mutations)

**CRITICAL**: GraphQL mutations are **broken server-side** in most cases:

- `create_event` mutation - **DOES NOT WORK** for both Cups and Matches
  - Error: `'NoneType' object has no attribute '_meta'`
  - Root cause: Server-side bug in the mutation resolver
  - Status: Awaiting fix from SSI development team
- Any dependent mutations that require `create_event` to work first

## Root Cause

The `create_event` mutation fails at the resolver entry point before any form data is processed. The Django error indicates the mutation resolver maps `(rule, sub_rule, serie_type)` → Django model class, gets `None`, then crashes accessing `None._meta`.

**Evidence**:
- Every combination fails identically (cup/match, full/minimal fields, with/without organizer)
- Error occurs at mutation entry point
- Read operations with same parameters work fine
- Web form creation (HTTP POST) works with the same data
- This is confirmed as an SSI server-side regression

## Workarounds

### Current Approach: Web Scraping

Until the SSI development team fixes the GraphQL API, **web scraping is the required approach** for write operations:

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

1. **Read Operations**: Use GraphQL freely
   - Queries work reliably
   - Use the shared client in `scoring-proxy/lib/ssi-core/client.js`

2. **Write Operations**: Use web scraping approach
   - **DO NOT** attempt to use GraphQL mutations for creating/updating data
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
- **Reference** `docs/ssi-graphql-findings.md` for detailed technical information
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

## Timeline

- **Current Status**: GraphQL mutations broken (as of 2026-02-06)
- **Depends On**: SSI development team fixing the server-side resolver bug
- **ETA**: Unknown - this is external to our codebase
- **Validation**: Run Pester tests when fix is suspected

## References

- Detailed technical analysis: `docs/ssi-graphql-findings.md`
- Working web scraping scripts: `archive/scripts-legacy/New-KupittaaCup.ps1`
- GraphQL test suite: `scripts-graphql/tests/SSI-GraphQL.Tests.ps1`
- SSI client implementation: `scoring-proxy/lib/ssi-core/client.js`

## Last Updated

- **Date**: 2026-02-08
- **Status**: GraphQL mutations still broken, web scraping required
- **Next Review**: When SSI team announces API fix

---

**Summary for Quick Reference:**
- ✅ GraphQL reads work perfectly
- ❌ GraphQL writes (mutations) are broken server-side
- ✅ Web scraping works for all write operations
- ⏳ Waiting for SSI team to fix the API
- 🧪 Pester tests exist to validate when fixed
