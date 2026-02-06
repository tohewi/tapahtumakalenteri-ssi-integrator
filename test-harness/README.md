# SSI Test Harness

Test user management and UAT infrastructure for the SSI Scoring application.

**Last updated**: 2026-02-06

---

## Quick Reference

| Script | Purpose | Prerequisites |
|---|---|---|
| `New-TestUsers.ps1` | Create 3 SSI test accounts | `config/test-users.yml` |
| `Remove-TestUsers.ps1` | Check status / disable test accounts | `config/test-users.yml` |
| `Find-MatchRegistrationForm.ps1` | Discover match enrollment URLs | Admin login + match ID |

## Setup

### 1. Create config file

```powershell
cp config/test-users.yml.template config/test-users.yml
# Edit test-users.yml with actual admin password and API key
```

### 2. Create test accounts

```powershell
cd test-harness
.\New-TestUsers.ps1
```

### 3. Verify email accounts

SSI sends verification emails to each address. Since we use `+` aliases (e.g., `tohewi+ssitest1@live.com`), all emails arrive in the admin inbox (`tohewi@live.com`). Click the verification link in each email.

### 4. Discover match registration

Before enrolling users to matches, discover the correct URL pattern:

```powershell
.\Find-MatchRegistrationForm.ps1 -MatchId <MATCH_ID>
```

Review the output and `debug-*.html` files to identify form fields and URLs.

## Test User Profiles

| ID | Name | Email | Squad | Role |
|---|---|---|---|---|
| `test1` | Testi Ampuja1 | `tohewi+ssitest1@live.com` | 1 (Oma ase 1) | Standard competitor |
| `test2` | Testi Ampuja2 | `tohewi+ssitest2@live.com` | 2 (Oma ase 2) | Standard competitor |
| `test3` | Testi Lainaaja | `tohewi+ssitest3@live.com` | 3 (Laina-ase) | Borrowed weapon |

### Squad Mapping (per Kupittaa Cup spec)

| Squad # | Name | Max shooters | Test user |
|---|---|---|---|
| 1 | Oma ase 1 | 9 | test1 |
| 2 | Oma ase 2 | 9 | test2 |
| 3 | Laina-ase | 7 | test3 |

## Architecture

All write operations use **web scraping** (form POST). SSI GraphQL write mutations are broken (see `docs/ssi-graphql-findings.md`). Read operations use GraphQL where available.

### Technology

- **PowerShell 7+** with `PowerShell-Yaml` module
- Web scraping via `Invoke-WebRequest` (same pattern as `scripts/Connect-SSI.ps1`)
- Credentials stored in `config/test-users.yml` (gitignored)

### Folder Structure

```
test-harness/
├── README.md                          # This file
├── config/
│   ├── test-users.yml.template        # Config template (committed)
│   └── test-users.yml                 # Actual credentials (gitignored)
├── lib/
│   └── SSI-TestHelpers.psm1           # Shared web scraping functions
├── New-TestUsers.ps1                  # Create test accounts
├── Remove-TestUsers.ps1               # Status check / disable accounts
└── Find-MatchRegistrationForm.ps1     # Discover enrollment URLs
```

## Implementation Status

### Phase 1 — User Management ✅

- [x] Config template with 3 test user profiles
- [x] `New-TestUsers.ps1` — register accounts via web scraping
- [x] `Remove-TestUsers.ps1` — check status, soft-disable
- [x] `SSI-TestHelpers.psm1` — login, register, profile update
- [x] Idempotent: skips existing accounts

### Phase 2 — Match Enrollment ⬚ Pending

- [ ] Discover match registration URL pattern (`Find-MatchRegistrationForm.ps1`)
- [ ] `Register-ToMatch` function in helpers module
- [ ] `Squad-TestUsers.ps1` — assign each user to their designated squad
- [ ] Needs: run discovery script against a live TEST match

### Phase 3 — UAT Tests ⬚ Pending

- [ ] Pester test: login as test user via scoring proxy
- [ ] Pester test: verify test user appears in squad
- [ ] Pester test: submit scores as test user
- [ ] Pester test: read-back scores via GraphQL
- [ ] Integration with scoring-ui (Playwright or similar)

## Credential Security

- `test-users.yml` is **gitignored** — never committed
- Passwords are stored in plaintext in the YAML file (local machine only)
- Email aliases (`+tag`) route all SSI emails to the admin inbox
- `Remove-TestUsers.ps1 -Disable` changes passwords to random values for cleanup
- Full account deletion requires SSI support (no public API)

## For Agents

### Before using test users

1. Check if `config/test-users.yml` exists — if not, copy from template
2. Run `.\New-TestUsers.ps1` — creates accounts if they don't exist
3. Check output for "needs_verification" — admin must click email verification links

### To enroll test users to a match

1. Run `.\Find-MatchRegistrationForm.ps1 -MatchId <ID>` to discover the URL pattern
2. Review `debug-*.html` output files for form fields
3. Update `Register-ToMatch` in `lib/SSI-TestHelpers.psm1` with discovered pattern
4. This step is a **manual discovery** — SSI's enrollment URLs are not yet mapped

### Known limitations

- SSI GraphQL write mutations are broken (see `docs/ssi-graphql-findings.md`)
- Account deletion is not available via API — only soft-disable (password change)
- Email verification is required and must be done manually
- Match enrollment URL pattern is not yet discovered (Phase 2)
