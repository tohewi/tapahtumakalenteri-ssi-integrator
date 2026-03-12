# MP3 Gap Analysis: Match Personnel Management

**Date:** 2026-03-12  
**Author:** Cascade (automated analysis)  
**Scope:** Compare R9.0 (Event Staffing) implementation against MP3's original scope

---

## 1. Background

MP3 originally envisioned extending the SRA Training staffing MVP into a **general-purpose match personnel system**. Release 9.0 implemented significant staffing capabilities. This analysis evaluates coverage across five dimensions from the MP3 requirement.

## 2. Dimension-by-Dimension Analysis

### 2.1 Staffing Needs, Signups & Withdrawals — ✅ Fully Covered

**R9.0 implements:**
- `event_staffing_needs` table: per-event role needs with `role_key`, `role_label`, `min_count`, `max_count`
- `staff_signups` table: member signups with status tracking (`confirmed`, `withdrawn`)
- Auto-population of staffing needs from template `staffing_rules` on event creation
- Backfill endpoint for existing events without staffing needs (`POST /staffing/backfill`)
- Signup validation: checks capacity limits, prevents duplicate signups, prevents multi-role conflicts
- Withdrawal with status update and timestamp
- Email notifications: signup confirmation, withdrawal alerts to admins, understaffed warnings

**Verdict:** Complete. No gaps.

### 2.2 Per-Discipline Role Definitions — ✅ Covered (Flexible by Design)

**MP3 concern:** "Currently only SRA-style roles exist."

**R9.0 implements:**
- Roles are defined per **template** via `staffingRules.roles[]`, not hardcoded per discipline
- Each role has: `key`, `label`, `min`, `max`, `ssiOfficialCode`, `ssiMgmtRole`
- Template editor UI allows adding/removing/editing arbitrary roles
- SSI sync maps roles to SSI official codes (RO, MD, QM, RM, etc.) and management group permissions

**Analysis:** The system is *discipline-agnostic*. Any discipline template can define its own role set. An SRA match might define `ro`, `md`, `safety`, while an IPSC match could define `cro`, `so`, `rm`. The role keys and labels are freeform text — there's no dependency on SRA-specific roles.

**Example:** A Nordic precision template could define:
```json
{
  "roles": [
    { "key": "tavallinen", "label": "Kilpailuvalvoja", "min": 2, "max": 4 },
    { "key": "tulospalvelu", "label": "Tulospalvelu", "min": 1, "max": 2 }
  ]
}
```

**Verdict:** No gap. The flexible template-level role system covers arbitrary discipline needs. A pre-built role library per discipline would be a convenience improvement but not a functional gap.

### 2.3 Personnel Availability Management — ⬚ Not Implemented

**MP3 concern:** "Not yet implemented."

**What's missing:**
- Members cannot declare availability windows (e.g., "available every Saturday in March")
- No calendar view of member availability across events
- No conflict detection (e.g., "this person is already committed to another event on this date")
- No preference system (e.g., "prefers RO role", "available mornings only")

**Assessment:** This is the **only significant gap**. However, its practical impact is low for the current user base (single tenant, <20 active members). The existing self-service signup model (members browse upcoming events and sign up) works well for small organizations. Availability management becomes valuable at scale (50+ members, multiple events per week).

**Recommendation:** Defer to a future release. If needed, create a backlog requirement:
> **STAFF-1: Personnel Availability & Preferences** — Members can declare recurring availability windows and role preferences. Admins see an availability matrix when planning events. Conflict detection warns when a member is double-booked.

### 2.4 Personnel Assignment Visibility in Match Context — ✅ Covered

**MP3 concern:** "Partially done via SchedulePage staffing indicators."

**R9.0 implements:**
- **SchedulePage:** Red/green staffing indicators per event showing fill status
- **EventCalendar:** Staffing status visible in event popovers
- **DashboardView:** "Staffing Gaps" summary card listing understaffed events with specific missing roles
- **RosterView:** Full roster view with event cards, role progress bars, one-click signup, personal commitments tab
- **Leaderboard:** Volunteer activity ranking with period filtering (all/12m/6m/3m)
- **SSI Sync:** Virtual signups from SSI officials injected into roster display (SSI is source of truth)

**Verdict:** Complete. Staffing is visible across all relevant views.

### 2.5 Email Notifications & Automation — ✅ Covered

**R9.0 implements:**
- `sendStaffingSignupConfirmation()` — member receives confirmation after signup
- `sendStaffingWithdrawalNotice()` — admins notified when member withdraws
- `sendUnderstaffedAlert()` — admins alerted about events needing volunteers
- SSI sync on signup: registers to trainer squad + management group + official codes
- SSI sync on withdrawal: removes from trainer squad + management group
- Post-event workflows (PEW-1..4): automated completion, stats, email reports

**Verdict:** Complete. No gaps.

## 3. Summary Table

| Dimension | MP3 Scope | R9.0 Coverage | Gap? |
|-----------|-----------|---------------|------|
| Staffing needs, signups, withdrawals | Core staffing CRUD | Full implementation with validation, notifications | ✅ No |
| Per-discipline role definitions | Flexible roles per discipline | Template-level freeform roles (discipline-agnostic) | ✅ No |
| Personnel availability management | Availability windows, preferences | Not implemented | ⬚ Yes (low priority) |
| Assignment visibility in match context | Visible in schedule, dashboard | Visible in 4 views + SSI sync | ✅ No |
| Notifications & SSI integration | Email alerts, SSI sync | Full email suite + bidirectional SSI sync | ✅ No |

## 4. Conclusion

**MP3 is substantially subsumed by R9.0.** Four of five dimensions are fully covered. The only gap — personnel availability management — is a convenience feature with low practical impact for the current user base.

**Recommendation:** Mark MP3 as **✅ Implemented (subsumed by R9.0)** with a note that availability management (STAFF-1) is deferred to a future release as a low-priority enhancement.

## 5. New Backlog Item (Optional)

If availability management becomes needed:

| ID | Requirement | Priority |
|----|-------------|----------|
| STAFF-1 | **Personnel Availability & Preferences**: Members declare recurring availability windows and role preferences. Admins see availability matrix for event planning. Conflict detection for double-bookings. | Low |
