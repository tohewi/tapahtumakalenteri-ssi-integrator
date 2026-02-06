# SSI Scoring UI — Integration & Deployment

## 1. SSI Integration Options

### Option A: Form POST via Proxy Backend (Recommended for v1)

The SSI scoring page is a Django form that POSTs to:
```
POST /nordic/competitor/{competitor_id}/score-in-match/
```

#### How it works

1. **Authenticate** to SSI (username/password → session cookie + CSRF token)
2. **Read squad data** by scraping the match scoring page
3. **Submit scores** by POSTing the same form data SSI expects

#### Form fields (from scoring page HTML analysis)

```
# Django formset management
form-TOTAL_FORMS=6
form-INITIAL_FORMS=6
form-MIN_NUM_FORMS=0
form-MAX_NUM_FORMS=1

# Per-series scores (N = 0..5 for S1..S6)
form-{N}-xxx=0          # X count
form-{N}-ten=0          # 10 count
form-{N}-nine=0         # 9 count
form-{N}-eight=0        # 8 count
form-{N}-seven=0        # 7 count
form-{N}-six=0          # 6 count
form-{N}-five=0         # 5 count
form-{N}-four=0         # 4 count
form-{N}-three=0        # 3 count
form-{N}-two=0          # 2 count
form-{N}-one=0          # 1 count
form-{N}-miss=0         # Miss count
form-{N}-max_hits=5     # Max hits per series

# Metadata
vid=                    # Verification ID (hidden)
signature=              # Base64 canvas signature (optional, for shooter verification)
warning=                # Checkbox (on/off)
dq_reason=no            # DQ select: no|ug|uc|sc|am|wp|ad|gr|mw|pc
score_comment=          # Free text, max 300 chars
asynchronous=False
custom_data={}

# CSRF
csrfmiddlewaretoken=... # Required Django CSRF token
```

#### Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Mobile UI   │────▶│  Proxy Backend   │────▶│  SSI Server  │
│  (React PWA) │◀────│  (Node/Express)  │◀────│  (Django)    │
└──────────────┘     └──────────────────┘     └─────────────┘
     HTTPS               HTTPS                   HTTPS
```

**Why a proxy?** The browser can't POST directly to SSI from a different origin (CORS). 
A lightweight backend:
- Holds the SSI session cookie
- Handles CSRF token extraction
- Forwards form POSTs to SSI
- Scrapes squad/competitor data from SSI HTML

#### Proxy backend endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/auth/login` | POST | Login to SSI, store session |
| `GET /api/matches?date=today` | GET | Scrape today's matches from SSI |
| `GET /api/match/:id/squads` | GET | Scrape squads + shooters for a match |
| `POST /api/competitor/:id/score` | POST | Forward score form POST to SSI |
| `GET /api/auth/status` | GET | Check if SSI session is still valid |

#### Pros & Cons

| | |
|---|---|
| ✅ Works today, no SSI API changes needed | ❌ Fragile — depends on SSI HTML structure |
| ✅ Full control over UX | ❌ Requires hosting a proxy server |
| ✅ Can add offline queue | ❌ Must maintain session/CSRF handling |

---

### Option B: GraphQL API (Recommended — verified working for reads)

SSI has a GraphQL endpoint at `https://shootnscoreit.com/graphql/` with JWT auth.

#### Content Type Mapping (Django content_type IDs)

| Type | CT ID | Model | Notes |
|------|-------|-------|-------|
| NordicSerie (Cup) | 136 | `nordicserie` | Cup container, e.g. "TurRes Kupittaa CUP 31.01.2026" |
| NordicMatch | 91 | `nordicmatch` | Individual match, `rule=rl` for RESUL |
| NordicSquad | 92 | `nordicsquad` | Squad within a match |
| NordicCompetitor | 93 | `nordiccompetitor` | Competitor in a squad |
| NordicStage | 68 | `nordicstage` | Stage (not used for RESUL precision) |
| IpscMatch | 64 | `ipscmatch` | Different match type, uses stages |

#### Kupittaa Cup Data Hierarchy

```
Cup (CT=136)  "TurRes Kupittaa CUP 31.01.2026"
 ├── Match (CT=91)  "Kupittaa 31.01.2026 Tarkkuus"   rule=rl, 6 strings x 5 rounds
 │    ├── Squad 1 (CT=92)  "Laina-ase"
 │    │    ├── Competitor (CT=93)  #2 Jarmo K.  s1="0,0,0,0,0,2,0,0,2,0,1,0,0"
 │    │    └── Competitor (CT=93)  #5 Sari L.
 │    ├── Squad 2 (CT=92)  "Oma ase vasen"
 │    │    ├── Competitor ...
 │    │    └── ...
 │    └── Squad 3 (CT=92)  "Oma ase oikea"
 │         └── ...
 ├── Match (CT=91)  "Kupittaa 31.01.2026 Pika"
 │    └── (same 3 squads)
 └── Match (CT=91)  "Kupittaa 31.01.2026 Kuvio"
      └── (same 3 squads)
```

#### String Score Format

Scores are stored on `NordicCompetitorNode` fields `s1`..`s6` as **comma-separated integers**:

```
s1 = "X,10,9,8,7,6,5,4,3,2,1,M,max_hits"
     e.g. "1,1,1,1,1,0,0,0,0,0,0,0,0" = 5 hits (X+10+9+8+7), 48 points
```

13 values per string: counts for X, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, Miss, and max_hits.
Points per string are in `s1_points`..`s6_points`.

#### Verified Queries (working)

```graphql
# Authenticate
mutation { token_auth(email: "...", password: "...") { token refresh_token } }

# Read match with squads and competitor scores
query {
  event(content_type: 91, id: "1845") {
    id name rule status
    uses_strings number_of_strings number_of_rounds_per_string
    squads {
      id get_content_type_key
      ... on NordicSquadNode {
        competitors {
          id first_name last_name number status did_not_finish
          ... on NordicCompetitorNode {
            s1 s2 s3 s4 s5 s6
            s1_points s2_points s3_points s4_points s5_points s6_points
            tot_hits tot_inner_hits tot_precision_points
            weapon_group category classification
          }
        }
      }
    }
  }
}
```

#### Scoring Mutations (discovered, not yet tested for writes)

| Mutation | Args | Description |
|----------|------|-------------|
| `create_scorecard` | `form_input: JSON!, st_content_type, st_id, cp_content_type, cp_id` | Create scorecard for competitor at stage |
| `update_scorecard` | `form_input: JSON!, content_type, id` | Update existing scorecard |
| `create_update_scorecards` | `forms_input: JSON!, content_type, id` | Batch create/update scorecards |
| `create_update_competitor_scores` | `forms_input: JSON!, content_type, id` | **Most likely for string scoring** — updates scores on competitor |
| `verify_scorecard` / `unverify_scorecard` | `content_type, id` | Mark scorecard as verified |
| `set_did_not_finish_competitor` | `content_type, id, value` | Mark DNS/DNF |

The `form_input` / `forms_input` args are `JSON!` type — likely the same Django form format as the HTML POST.

#### Write Test Results (2026-02-06)

**RESUL string-based scoring via GraphQL does NOT work.**

Tested `create_update_competitor_scores` with:
- Competitor CT=93 + competitor ID → **404**
- Match CT=91 + competitor ID → **404**
- Match CT=91 + match ID → **404**
- `forms_input` as JSON string (Django formset format) → **404**
- `forms_input` as raw object → **404**
- On test match 1889 competitor (in squad, approved) → **404**
- On completed match 1845 competitor (has real scores) → **404**

Also tested `create_scorecard` with match as stage → **404**

The 404 comes from the Django resolver, not HTTP. The mutations exist in the schema but
are designed for **stage/scorecard-based matches** (IPSC, etc.), not RESUL string-based matches
where scores are stored directly on the competitor (`s1`..`s6` fields).

**Confirmed working**: `update_custom_data(content_type: 93, id: "...", custom_data: "{...}")` — 
proves the `JSON!` type needs a string and the CT/ID lookup works fine.

#### Proxy Backend — IMPLEMENTED & WORKING (2026-02-06)

```
┌──────────────┐                         ┌─────────────┐
│  Mobile UI   │◀── /api/* endpoints ──▶│  Proxy       │
│  (React PWA) │    (localhost:3001)     │  (Express)   │
└──────────────┘                         └──────┬──────┘
                                                │
                              GraphQL (JWT)     │  Form POST (session)
                              for reads         │  for writes
                                                ▼
                                         ┌─────────────┐
                                         │  SSI Server  │
                                         │  (Django)    │
                                         └─────────────┘
```

**Proxy endpoints** (`scoring-proxy/server.js`):
- `POST /api/auth/login` — JWT + session login
- `GET /api/auth/status` — check auth state
- `GET /api/matches` — list my Nordic matches
- `GET /api/match/:id` — match with squads + competitors + scores
- `GET /api/competitor/:id` — single competitor scores
- `POST /api/competitor/:id/score` — **submit scores** (form POST to SSI)

**Key findings**:
- SSI login page: `/login/` — no CSRF token, fields: `username`, `password`, `keep`
- SSI scoring page: `/nordic/competitor/{id}/score-in-match/` — no CSRF token
- Django formset format: `form-TOTAL_FORMS=6`, `form-{i}-{zone}={count}`, `form-{i}-max_hits=5`
- Zone keys: `xxx`, `ten`, `nine`, `eight`, `seven`, `six`, `five`, `four`, `three`, `two`, `one`, `miss`
- Success = HTTP 302 redirect; then verify via GraphQL read-back

**Tested end-to-end**: wrote S4=5×seven on TurRes Bot (21883), total went 137→172 pts ✅

---

## 2. Project Structure

```
windsurf-project/
├── scoring-ui/          React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── api.js           API client + SSI data transformers
│   │   ├── App.jsx          Main app (login → match → squad → scoring)
│   │   └── components/
│   │       ├── LoginScreen.jsx
│   │       ├── MatchPicker.jsx
│   │       ├── SquadPicker.jsx
│   │       ├── ShooterPicker.jsx
│   │       ├── ScoringForm.jsx
│   │       └── ScoreZoneButton.jsx
│   └── vite.config.js      Dev proxy: /api/* → localhost:3001
│
├── scoring-proxy/       Express proxy backend
│   ├── server.js            API endpoints
│   └── lib/ssi-client.js   SSI GraphQL + form POST client
│
└── scripts-graphql/     PowerShell utilities for SSI GraphQL
```

---

## 3. Running Locally (Development)

### Prerequisites
- Node.js 18+
- SSI account with scoring permissions

### Start both servers

```bash
# Terminal 1: Start proxy backend
cd scoring-proxy
npm install
node server.js
# → http://localhost:3001

# Terminal 2: Start UI dev server
cd scoring-ui
npm install
npx vite
# → http://localhost:5173 (or 5174)
# Vite proxies /api/* to localhost:3001
```

Open the UI URL in a browser, login with your SSI credentials + API key.

---

## 4. Deploying for Colleague Testing

### Option A: Local Network (Simplest — range WiFi or shared network)

Run both servers on a laptop. Colleagues connect to the same network.

```bash
# Start proxy
cd scoring-proxy
node server.js
# → http://0.0.0.0:3001

# Build and serve UI (or use Vite with --host)
cd scoring-ui
npx vite --host
# → http://192.168.x.x:5173
```

Colleagues open `http://<your-laptop-ip>:5173` on their phones.

**Important**: The Vite dev proxy only works when accessing via the Vite dev server.
For a production build, the UI needs to know the proxy URL (see Option B).

### Option B: VPS / Cloud Server (Persistent)

Deploy both on a VPS (e.g. Hetzner ~5€/mo, DigitalOcean, etc.):

1. **Install Node.js 18+** on the server
2. **Clone the repo** and install dependencies
3. **Run the proxy** with a process manager:
   ```bash
   cd scoring-proxy
   npm install
   # Use pm2 or systemd to keep it running
   npx pm2 start server.js --name ssi-proxy
   ```
4. **Build the UI** and serve with nginx:
   ```bash
   cd scoring-ui
   npm install
   npm run build
   # Copy dist/ to nginx web root
   ```
5. **Configure nginx** to serve the UI and proxy `/api/*`:
   ```nginx
   server {
       listen 443 ssl;
       server_name scoring.yourclub.fi;

       root /var/www/scoring-ui/dist;
       index index.html;

       location /api/ {
           proxy_pass http://127.0.0.1:3001;
       }

       location / {
           try_files $uri /index.html;
       }
   }
   ```
6. **HTTPS**: Use Let's Encrypt / certbot for SSL

### Option C: Vercel / Render (Free tier, no server management)

The proxy backend needs to be adapted to serverless functions.
This is a future step — not yet implemented.

---

## 5. Current Status (2026-02-06)

### What works
- ✅ **Login**: JWT (GraphQL reads) + session cookies (form POST writes)
- ✅ **Match list**: Scans SSI match IDs, shows Nordic matches
- ✅ **Match detail**: Loads squads + competitors with existing scores
- ✅ **Score entry**: Pre-loads existing SSI scores, zone-based input
- ✅ **Score submission**: Form POST to SSI, verified via GraphQL read-back
- ✅ **No CSRF needed**: SSI login and scoring pages don't use CSRF tokens

### What's not yet done
- ❌ **PWA manifest**: Not yet added (needed for "Add to Home Screen")
- ❌ **localStorage persistence**: Scores lost on page reload
- ❌ **Offline support**: Requires internet connection
- ❌ **Match ID configuration**: Currently scans IDs 1880-1920 hardcoded
- ❌ **Error handling polish**: Some edge cases not handled gracefully
- ❌ **Signature support**: SSI scoring page has a signature field — not yet wired

### Known limitations
- **No bulk events query**: SSI GraphQL only has `event(content_type, id)` for single lookups. The proxy scans a range of IDs in parallel.
- **Proxy stores auth in memory**: Restarting the proxy loses the JWT/session. Users must re-login.
- **Single user**: The proxy stores one JWT + one session. Multiple simultaneous users would share the same SSI session.

---

## 6. Remaining Questions for SSI Developers

1. ~~Is there a GraphQL mutation for submitting scores?~~ **No** — RESUL string scoring has no GraphQL mutation. Form POST is required.
2. ~~Is there an API to list competitors/squads for a match?~~ **Yes** — GraphQL `event(content_type: 91, id: "...")` returns squads and competitors.
3. **Is the signature required for score submission?** Or can we submit without it?
4. **Is there a bulk events/matches query?** Currently we scan individual IDs.
5. **Is there a rate limit on the scoring endpoint?**

## 7. Next Steps

1. **Verify scores in SSI** — check that submitted scores appear correctly
2. **Add PWA manifest** — `vite-plugin-pwa` for mobile install
3. **Make match ID range configurable** — env var or UI setting
4. **Add localStorage persistence** — survive page reloads
5. **Deploy for colleague testing** — local network or VPS
6. **Polish error handling** — network errors, session expiry, validation
