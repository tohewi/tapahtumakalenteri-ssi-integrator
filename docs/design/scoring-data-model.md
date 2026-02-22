# Scoring Data Model (SSI -> Proxy -> UI)

This document defines the scoring data model used by the app today, with `resul-25-kuvio-pistol` as the first fully documented sport profile.

Goal: when scoring data looks wrong, we first verify model facts before implementing fixes.

---

## 1) Canonical terminology (Finnish)

Use these terms consistently:

- `osumat` = non-miss hits
- `ohi` = misses (`M`)
- `laukaukset` = total shots
- `pisteet` = points

Formula:

- `laukaukset = osumat + ohi`

---

## 2) Entity and ID model

### SSI entity IDs used by this project

| Entity | Content type key | Where used |
|---|---:|---|
| Cup (series) | `136` | `/api/cup/:id` query and cup URLs |
| Match (event) | `91` | `/api/match/:id` query and match URLs |
| Competitor | `93` | `/api/competitor/:id` query |

References:

- `scoring-proxy/routes/scoring.js` queries `event(content_type: 136, ...)`, `event(content_type: 91, ...)`, and `competitor(content_type: 93, ...)`.
- Legacy creation output examples in `archive/scripts-legacy/New-KupittaaCup.ps1` show cup URL `/event/136/{id}/` and match URL `/event/91/{id}/`.

### URL ID extraction model (legacy script)

- URL pattern: `/event/{TypeId}/{EventId}/`
- Parsed by `Get-EventIdFromUrl` in `archive/scripts-legacy/New-KupittaaCup.ps1`.

---

## 3) Sport profile registry

Track each sport profile separately. This avoids mixing assumptions between sports.

## Profile: `resul-25-kuvio-pistol`

### Creation definition sources

- Legacy web-form script: `archive/scripts-legacy/New-KupittaaCup.ps1`
- GraphQL script: `scripts-graphql/New-KupittaaCup.ps1`
- Config: `config/kupittaa-cup-config.yml`

### Cup creation (parent)

- Web endpoint: `/series/nordic/create-resul-cup/`
- GraphQL creation: `rule="rl"`, `serie_type="cp"`, `sub_rule=""`

### Match creation (children)

- Web endpoint from config: `/nordic/create-resul-25-kuvio-pistol/`
- GraphQL creation: `rule="rl"`, `serie_type=""`
- `sub_rule`: from `matchTypes[].subRule`, fallback default `"p2p"` in `scripts-graphql/New-KupittaaCup.ps1`

### Match definitions in config

Configured in `config/kupittaa-cup-config.yml`:

- Common match settings under `match:`
  - `layouts: "6+SO"`
  - `precisionStrings: "6"`
  - `precisionShotsPerString: "5"`
  - `stringScoringFormat: "110X"`
  - `level: "tr"`, `verifyUsing: "xxx"`, etc.
- Match list under `matchTypes:`
  - `Tarkkuus`
  - `Pika`
  - `Kuvio`

### Cup-to-match component links

- Component numbers: 1..3 in creation order.
- Legacy linking endpoint: `/event/{cupTypeId}/{cupEventId}/add-existing-match/`
- GraphQL linking mutation: `addCupMatch(input: { cupId, matchId, number, included: true })`

---

## 4) Runtime scoring payload model

Primary runtime source for UI scoring is:

- `GET /api/match/:id`

Proxy returns SSI event data containing competitors with:

- `s1..s6` (score strings)
- `s1_points..s6_points`
- `tot_hits`
- `tot_precision_points`

Important runtime fact observed in production-like data:

- `s1_points..s6_points` and `tot_hits` may be `0` even when valid scoring exists.
- UI scoring should be derived from parsing `s1..s6`.

---

## 5) Score string formats supported in parser

Parser entry point: `scoring-ui/src/api.js -> parseStringScore()`.

Zone order used by UI:

`X,10,9,8,7,6,5,4,3,2,1,M`

### Format A: canonical 13-part

`X,10,9,8,7,6,5,4,3,2,1,M,max_hits`

Example:

`0,0,2,3,0,0,0,0,0,0,0,0,0`

### Format B: compact (M omitted, max_hits present)

`X,10,9,8,7,6,5,4,3,2,1,max_hits`

### Format C: compact (M and max_hits omitted)

`X,10,9,8,7,6,5,4,3,2,1`

### Format D: trailing-miss variant (important)

Observed variant where trailing value is actual misses, while penultimate `M` slot is `0`:

`X,10,9,8,7,6,5,4,3,2,1,0,misses`

Example:

`0,0,1,0,0,0,1,0,0,0,0,0,3` -> `ohi = 3`

This variant is now explicitly handled in parser logic.

---

## 6) UI normalized score model

After parsing, scores are stored as:

```js
allScores[shooterId][seriesIndex] = {
  X: number,
  '10': number,
  '9': number,
  '8': number,
  '7': number,
  '6': number,
  '5': number,
  '4': number,
  '3': number,
  '2': number,
  '1': number,
  M: number,
}
```

Current tablet defaults:

- `SERIES_COUNT = 6`
- `MAX_HITS_PER_SERIES = 5`

Derived values:

- `ohi` = sum of `M`
- `laukaukset` = sum of all zones including `M`
- `osumat` = `laukaukset - ohi`
- `pisteet` = weighted sum (`X/10=10`, ..., `1=1`, `M=0`)

Save-time validation rules for this profile (`resul-25-kuvio-pistol`):

- Every non-empty series must contain exactly `5` shots before save.
- Empty (not-started) series are allowed during in-progress scoring.
- In 2x flow (`3*10` UI mode), this is still validated as two separate `5`-shot series (`5 + 5 = 10`).
- Validation is shared between mobile and tablet in:
  - `scoring-ui/src/api.js -> validateSeriesShotCounts()`
  - `scoring-ui/src/api.js -> buildIncompleteSeriesValidationMessage()`

---

## 7) Facts-first bug workflow (mandatory)

Before changing parsing or UI logic:

1. Capture raw competitor from Edge DevTools (`/api/match/:id` response)
   - `id`
   - `s1..s6`
   - `s1_points..s6_points`
   - `tot_hits`
   - `tot_precision_points`
2. Identify which score-string format (A/B/C/D) each `sN` uses.
3. Compute expected per-series values:
   - `osumat`
   - `ohi`
   - `laukaukset`
   - `pisteet`
4. Compare expected values against UI-rendered values.
5. Only then implement code changes + regression test with the exact payload shape.

---

## 8) Adding a new sport profile (future reuse)

When adding another sport, create a new section in this file with:

1. Sport profile key (example: `resul-25-kuvio-pistol`)
2. Creation source(s): scripts + config file
3. SSI creation details:
   - endpoint (web)
   - `rule`, `sub_rule`, `serie_type` (GraphQL)
4. Entity IDs and URL patterns
5. Score-zone order and score-string formats
6. Series count / shots-per-series constraints
7. One real payload example from `/api/match/:id`
8. Parser tests that lock the format

This keeps scoring UI reusable while making sport-specific assumptions explicit.
