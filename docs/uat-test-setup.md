# UAT Test Setup Guide

## Overview

This project uses [Playwright](https://playwright.dev/) for User Acceptance Testing (UAT) against live (preview or production) deployments. All tests live under `e2e/`.

## Test scenarios

| # | File | What it tests |
|---|------|---------------|
| 1 | `01-sign-in.spec.js` | Sign in with existing owner account; error on wrong password |
| 2 | `02-create-account.spec.js` | Register a new account that auto-joins an existing tenant |
| 3 | `03-invite-instructor.spec.js` | Owner invites a user with Instructor role via the Members UI |
| 4 | `04-accept-invitation.spec.js` | Invitee accepts invitation and creates account (no email needed) |

## Email bypass strategy

**No real mailbox is required.** When an invitation is created via the API the server returns the invitation token in the JSON response:

```http
POST /api/v1/platform/tenants/:id/invitations
→ 201 { "success": true, "invitation": { "token": "abc123…", … } }
```

Tests extract this token and navigate directly to `/#/platform/invite/{token}`. If `RESEND_API_KEY` is not configured the server silently skips email sending — this is the recommended setup for UAT environments.

## Required secrets / environment variables

| Variable | Where to set | Purpose |
|----------|-------------|---------|
| `PLATFORM_TEST_EMAIL` | GitHub repository secret | E-mail of a pre-seeded owner account |
| `PLATFORM_TEST_PASSWORD` | GitHub repository secret | Password of the owner account |

For local runs you can export these in your shell:

```bash
export PLATFORM_EMAIL=owner@example.com
export PLATFORM_PASSWORD=MyPassword123!
export BASE_URL=https://turres-ssi-tools-pr-42.onrender.com
```

## Seeding the owner account in preview environments

Preview environments start with an empty database. Before UAT can run you need at least one owner account.

**Option A — seed once, reuse across PRs (recommended)**

Use the same `PLATFORM_TEST_EMAIL` / `PLATFORM_TEST_PASSWORD` credentials for every PR. On first deployment of a preview environment, run the seed script:

```bash
node test-harness/seed-uat-account.mjs \
  --base-url https://turres-ssi-tools-pr-42.onrender.com \
  --email $PLATFORM_TEST_EMAIL \
  --password $PLATFORM_TEST_PASSWORD \
  --org "UAT Test Organisation"
```

> The seed script registers the account and creates a tenant. If the account already exists it exits cleanly.

**Option B — include seed step in UAT workflow (CI-only)**

Add a setup step to `.github/workflows/uat.yml` that calls `POST /api/v1/platform/register` with the test credentials before running Playwright. This works but means the UAT workflow must tolerate a 409 (already exists) response on repeated runs.

## Running locally

```bash
# 1. Install dependencies (first time only)
cd e2e
npm install
npx playwright install chromium

# 2. Export env vars
export BASE_URL=http://localhost:3001
export PLATFORM_EMAIL=owner@example.com
export PLATFORM_PASSWORD=MyPassword123!

# 3. Run tests
npm test                   # headless
npm run test:headed        # visible browser
npm run test:ui            # Playwright UI mode (interactive)
```

## Workflow automation

The `uat.yml` workflow triggers automatically after `pr-preview.yml` completes successfully. It:

1. Waits up to 2 minutes for the preview environment to wake up
2. Runs all Playwright tests
3. Uploads a full HTML test report as a GitHub Actions artifact (retained 7 days)
4. Posts a pass/fail summary as a PR comment

To trigger it manually (e.g. against a specific URL):

1. Go to **Actions → UAT Tests (Playwright) → Run workflow**
2. Enter the target URL and PR number

## CI / CD integration notes

- Tests run in `workers: 1` (serial) to avoid race conditions on shared test data
- Tests clean up created members/invitations in `finally` blocks
- Each test generates unique email addresses with `testEmail()` helper to avoid cross-run conflicts
- Tests retry once on CI to handle transient preview-environment wakeup delays
