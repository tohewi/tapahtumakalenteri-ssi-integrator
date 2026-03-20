# Staffing SSI Sync — User Acceptance Testing (UAT) Plan

## Document Information
- **Feature:** Platform Staffing ↔ SSI Bidirectional Sync (R80)
- **Status:** Draft
- **Created:** 2026-03-02
- **Version:** 1.0

## Test Environment
- **URL:** `https://turres-ssi-tools-pr-138.onrender.com/#/platform`
- **SSI:** `https://shootnscoreit.com` (logged in as TurRes Bot admin)
- **Branch:** `release/r80-match-manager-base`

## Prerequisites
- Platform account (e.g. `tohewi@gmail.com`) logged in
- Tenant with staffing-enabled templates (SSI Official Code + Mgmt Role configured per role)
- Two test events already created in SSI and imported to the platform:
  - **SRA Match** — e.g. "TEST TR-SRAO 03.03.2026" (generic_sra_match template)
  - **Kupittaa Cup** — e.g. "Kupittaa Cup 18.03.2026" (kupittaa_cup template)
- TurRes Bot admin session active on the server (SSI_ADMIN_EMAIL configured)

## Roles Under Test

| Role Key         | Label           | SSI Official Code | SSI Mgmt Role | Template        |
|------------------|-----------------|-------------------|---------------|-----------------|
| match_director   | Match Director  | MD                | 1 (Admin)     | Both            |
| ro               | Range Officer   | RO                | 1 (Admin)     | SRA             |
| safety           | Safety Officer  | RM                | 1 (Admin)     | SRA             |
| scorer           | Scorer          | (none)            | 1 (Admin)     | SRA             |
| quarter_master   | Quarter Master  | QM                | 1 (Admin)     | Kupittaa Cup    |

---

## Test Scenarios

### TC-1: Sign Up via Platform UI → Verify in SSI

**Objective:** When a user signs up for a staffing role in the Platform UI, the assignment must appear in SSI.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Platform → Roster tab | See upcoming events with staffing needs |
| 2 | On **SRA Match**, click **Sign Up** for "Range Officer" | UI shows "Signed up" with your name under Range Officer |
| 3 | Open SSI → Navigate to the SRA match management group | Your name appears in the Members list with role "admin" and Official Code "RO" |
| 4 | If Trainer Squad is configured, check SSI Participants page | Your account is registered in the configured Trainer Squad |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-2: Sign Up via Platform UI → Verify in SSI (Kupittaa Cup)

**Objective:** Same as TC-1 but for a Kupittaa Cup event.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On **Kupittaa Cup**, click **Sign Up** for "Match Director" | UI shows "Signed up" with your name |
| 2 | Open SSI → Navigate to the Kupittaa Cup management group | Your name appears with role "admin" and Official Code "MD" |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-3: Withdraw via Platform UI → Removed from SSI

**Objective:** When a user withdraws from a role in the Platform UI, the assignment must be removed from SSI.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On **SRA Match**, click **Withdraw** from "Range Officer" | UI removes your name from the role, shows slot as available |
| 2 | Open SSI → Navigate to the SRA match management group | Your name is **no longer** in the Members list |
| 3 | If Trainer Squad was configured, check SSI Participants page | Your account is **no longer** in the Trainer Squad |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-4: Withdraw via Platform UI → Removed from SSI (Kupittaa Cup)

**Objective:** Same as TC-3 but for Kupittaa Cup.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On **Kupittaa Cup**, click **Withdraw** from "Match Director" | UI removes your name |
| 2 | Open SSI → Navigate to the Kupittaa Cup management group | Your name is **no longer** in the Members list |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-5: Assign Role Directly in SSI → Visible in Platform UI

**Objective:** When an admin adds a person to the SSI management group directly, that person must appear in the Platform Roster UI.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSI → SRA match management group → "Search & Add User" | Add a test user (e.g. "Turres Ku Tuloskone 1") with role "admin" and Official Code "QM" |
| 2 | Open Platform → Roster → SRA Match | The user "Turres Ku Tuloskone 1" appears as a virtual signup under the role that maps to QM (Quarter Master), with note "Added from SSI" |
| 3 | Verify the user shows up in the staffing count (e.g. 1/1 filled) | Count reflects the SSI-sourced assignment |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-6: Assign Role Directly in SSI → Visible in Platform UI (Kupittaa Cup)

**Objective:** Same as TC-5 but for Kupittaa Cup.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSI → Kupittaa Cup management group → Add a user with Official Code "MD" | User added as Match Director |
| 2 | Open Platform → Roster → Kupittaa Cup | User appears under "Match Director" with note "Added from SSI" |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-7: Remove Role Directly in SSI → Removed from Platform UI

**Objective:** When an admin removes a person from the SSI management group directly, that person must disappear from the Platform Roster UI.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure a user is signed up for a role (either via Platform or SSI) and visible in the Roster | User shows as confirmed |
| 2 | Open SSI → SRA match management group → Remove that user | User is no longer in SSI Members list |
| 3 | Reload Platform → Roster → SRA Match | The user is **no longer** shown under that role. If they were a DB signup, they are auto-withdrawn. |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-8: Remove Role Directly in SSI → Removed from Platform UI (Kupittaa Cup)

**Objective:** Same as TC-7 but for Kupittaa Cup.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure a user is in the Kupittaa Cup management group in SSI and visible in Platform Roster | User shows as confirmed |
| 2 | Open SSI → Remove that user from the Kupittaa Cup management group | User removed from SSI |
| 3 | Reload Platform → Roster → Kupittaa Cup | User is **no longer** shown under that role |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-9: Re-signup After Withdrawal

**Objective:** A user who withdrew can sign up again for the same role.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sign up for "Range Officer" on the SRA Match | Success — name appears |
| 2 | Withdraw from "Range Officer" | Name removed |
| 3 | Sign up again for "Range Officer" | Success — name appears again, no error |
| 4 | Verify in SSI | User is back in the management group with correct role |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-10: Dashboard Roster View Reflects SSI State

**Objective:** The Dashboard "Roster" tab (which calls `/staffing/upcoming`) must also reflect the true SSI state, not just the DB.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add a user directly in SSI to the SRA match management group | User added |
| 2 | Open Platform Dashboard → Roster tab | The user appears under the correct role for the SRA Match event |
| 3 | Remove the user directly in SSI | User removed |
| 4 | Reload Platform Dashboard → Roster tab | The user is no longer shown |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

## Edge Cases

### TC-11: No SSI Event Linked

**Objective:** Events without an SSI reference should not attempt SSI sync and should work purely from DB.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a scheduled event without SSI import (manual event) | Event created |
| 2 | Sign up for a role | Success — DB only, no SSI calls |
| 3 | Withdraw | Success — DB only |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

### TC-12: SSI Admin Session Unavailable

**Objective:** If the admin SSI session is not available (e.g. credentials not set), signup/withdraw should still work in DB but SSI sync should gracefully fail.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | (Simulated) SSI admin session is unavailable | — |
| 2 | Sign up for a role | DB signup succeeds, SSI sync logged as skipped/failed, no user-facing error |
| 3 | Roster page loads | DB state shown (no SSI verification), no crash |

**Result:** ☐ Pass ☐ Fail  
**Notes:**

---

## Summary Checklist

| # | Test Case | SRA | Cup | Status |
|---|-----------|-----|-----|--------|
| 1 | Sign up → visible in SSI | ☐ | ☐ | |
| 2 | Withdraw → removed from SSI | ☐ | ☐ | |
| 3 | Add in SSI → visible in UI | ☐ | ☐ | |
| 4 | Remove in SSI → gone from UI | ☐ | ☐ | |
| 5 | Re-signup after withdrawal | ☐ | — | |
| 6 | Dashboard reflects SSI state | ☐ | — | |
| 7 | No SSI event (DB only) | ☐ | — | |
| 8 | Admin session unavailable | ☐ | — | |

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Tester | | | |
| Developer | | | |
