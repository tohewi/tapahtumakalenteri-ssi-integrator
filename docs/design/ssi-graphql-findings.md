# SSI GraphQL API — Known Issues & Test Baseline

**Last investigated**: 2026-02-06  
**Status**: `create_event` mutation is **broken server-side**  
**Workaround**: Use web scraping scripts (`scripts/New-KupittaaCup.ps1`) for event creation

---

## What Works

| Operation | Status | Notes |
|---|---|---|
| `token_auth` (JWT login) | ✅ | Email + password → JWT token |
| `refresh_token` | ✅ | Token refresh works |
| `Get-SSIMe` (whoami) | ✅ | Returns authenticated user info |
| `events(search: ...)` query | ✅ | Search and read events |
| `event(content_type, id)` query | ✅ | Read single event with full detail |
| `get_abstract_event` query | ✅ | Returns form choices for rule/sub_rule/serie_type |
| `Test-SSIEventExists` (name search) | ✅ | Duplicate detection works |
| Schema introspection | ✅ | Full mutation/query schema accessible |

## What Does NOT Work

| Operation | Status | Error |
|---|---|---|
| `create_event` (Cup) | ❌ | `'NoneType' object has no attribute '_meta'` |
| `create_event` (Match) | ❌ | Same error |
| `Add-SSICupMatch` | ⬚ Untestable | Depends on `create_event` |
| `New-SSISquad` | ⬚ Untestable | Depends on `create_event` |

## Root Cause Analysis

The `create_event` mutation fails at the resolver entry point (`path: ["create_event"]`) before any form data is processed. The Django error `'NoneType' object has no attribute '_meta'` indicates the mutation resolver maps `(rule, sub_rule, serie_type)` → Django model class, gets `None`, then crashes accessing `None._meta`.

### Evidence

1. **Every combination fails identically** — cup/match, full/minimal fields, with/without organizer, string/int IDs
2. **Error is at mutation entry** — `locations: [{"line": 2, "column": 5}]`, `path: ["create_event"]`
3. **Read operations with same parameters work** — `get_abstract_event(rule: "rl", sub_rule: "p2p")` returns valid data
4. **JSON scalar transport is correct** — server expects a JSON string (pre-serialized), round-trip verified
5. **Web form creation works** — same data via HTTP POST to `/series/nordic/create-resul-cup/` succeeds

### Conclusion

This is an SSI server-side regression. The `create_event` mutation's rule→model resolver is broken. The read-side equivalent (`get_abstract_event`) works fine with the same parameters, so the write path has a separate code path that is failing.

## JSON Scalar Behavior

The SSI `JSON` scalar (ECMA-404) has a **non-standard** implementation:

- **Expects**: A JSON **string** (pre-serialized), not a raw JSON object
- **Passing a dict** → Error: `the JSON object must be str, bytes or bytearray, not dict`
- **Passing a string** → Server calls `json.loads()` internally

This means `form_input` must be pre-serialized before being placed in variables:

```powershell
$formJson = $FormData | ConvertTo-Json -Compress -Depth 10  # → string
$variables = @{ form_input = $formJson; ... }               # string in variables
# ConvertTo-Json wraps the whole body → form_input becomes escaped JSON string
```

## Schema Reference (as of 2026-02-06)

```graphql
mutation create_event(
  $form_input: JSON!,     # Pre-serialized JSON string of form fields
  $rule: String!,         # e.g., "rl" (RESUL), "nd" (Nordic)
  $sub_rule: String!,     # e.g., "p2p" (25m Fast-pistol), "" for cups
  $serie_type: String,    # "cp" for cups, "" for matches
  $firearms: String,      # Optional
  $classifier: String     # Optional (discovered via introspection)
)
```

## Pester Test Baseline

The existing test file `scripts-graphql/tests/SSI-GraphQL.Tests.ps1` has 16 tests:

| Test | Result | Notes |
|---|---|---|
| Auth with valid credentials | ✅ Pass | |
| Auth with invalid password | ✅ Pass | Correctly throws |
| Auth with invalid API key | ✅ Pass | API key not validated at auth time |
| Get current user (Me) | ✅ Pass | |
| Refresh JWT token | ✅ Pass | |
| Query events | ✅ Pass | |
| Event details with fields | ✅ Pass | |
| Abstract event (RESUL Cup) | ✅ Pass | |
| Abstract event (RESUL Match) | ✅ Pass | |
| Non-existent event check | ✅ Pass | |
| Find existing Kupittaa CUP | ✅ Pass | |
| **Create TEST RESUL Cup** | ❌ Fail | `_meta` error |
| **Create TEST RESUL Match** | ❌ Fail | `_meta` error |
| Link match to cup | ⏭ Skipped | Depends on creation |
| Create squad for match | ⏭ Skipped | Depends on creation |
| Verify created cup via search | ⏭ Skipped | Depends on creation |

### Running Tests

```powershell
# All tests (11 pass, 2 fail, 3 skip)
Invoke-Pester -Path .\scripts-graphql\tests\SSI-GraphQL.Tests.ps1 -Output Detailed

# Only read tests (all pass)
Invoke-Pester -Path .\scripts-graphql\tests\SSI-GraphQL.Tests.ps1 -Output Detailed -ExcludeTag "Destructive"
```

### Validation: Is create_event Fixed Yet?

When SSI fixes the API, run the Pester tests. If "Should create a TEST RESUL Cup" and "Should create a TEST RESUL Match" pass, the fix is in. Then:

1. Update `scripts-graphql/New-KupittaaCup.ps1` to use the fixed API
2. Update this document
3. Remove the `Destructive` tag from passing tests

## Other Notes

- **Time format bug (fixed)**: The GraphQL script didn't convert Finnish `hh.mm` to `HH:mm`. Fixed in commit `6b95260`.
- **organizerId**: Set to `"1215"` (TurRes Kupittaa / TurResKu) in `config/kupittaa-cup-config.yml`. Not the root cause of the `_meta` error, but was missing before.
- **Web scraping alternative**: `scripts/New-KupittaaCup.ps1` works reliably for all operations (cup, matches, squads, linking). Use this until GraphQL is fixed.
