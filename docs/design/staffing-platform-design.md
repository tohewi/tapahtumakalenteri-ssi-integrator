# Event Staffing — Platform Design

**Status:** Draft — Updated with owner feedback 2026-03-01  
**Date:** 2026-03-01  
**Priority:** Next major feature — the core value proposition

---

## 1. Problem Statement

Shooting clubs need staff (instructors, range officers) for every competition event. Today this is managed via WhatsApp groups and verbal commitments. The result:
- Nobody knows staffing status until the last minute
- No-shows disrupt events
- The same volunteers burn out
- New members don't know how to help

## 2. User Stories

### As a Match Admin (event organizer):
- I want to **define how many staff** each event needs (e.g., "2 ROs, 1 safety officer")
- I want to **see at a glance** which upcoming events are staffed vs. understaffed
- I want to **notify instructors** when an event needs staff

### As an Instructor (volunteer):
- I want to **see upcoming events** that need my help
- I want to **sign up** for events with one click
- I want to **see my commitments** — what I've signed up for
- I want to **withdraw** if my plans change (with notice)
- I want to **get reminders** before events I'm committed to

### As a Tenant Owner:
- I want to **see staffing gaps** across all upcoming events
- I want to **see which instructors are most/least active**

---

## 3. Data Model

### 3.1 Staffing Configuration (per discipline/template)

Stored in the existing `match_templates.staffing_rules` JSONB column:

```json
{
  "roles": [
    { "key": "match_director", "label": "Match Director", "labelFi": "Kilpailunjohtaja", "min": 1, "max": 1,
      "qualification": "Must be a qualified SRA Range Officer" },
    { "key": "ro", "label": "Range Officer", "labelFi": "Ratatuomari", "min": 2, "max": 4 },
    { "key": "safety", "label": "Safety Officer", "labelFi": "Turvallisuusvastaava", "min": 1, "max": 1 },
    { "key": "scorer", "label": "Scorer", "labelFi": "Tuloskirjuri", "min": 1, "max": 2 },
    { "key": "equipment", "label": "Equipment", "labelFi": "Välinevastaava", "min": 0, "max": 1 }
  ],
  "signupOpensBeforeDays": 14,
  "signupClosesBeforeDays": 2,
  "reminderBeforeDays": [7, 1],
  "understaffedAlertBeforeDays": 3
}
```

**Note:** The `qualification` field is informative only — displayed to the user when signing up. No enforcement. Self-regulation.

**Design note:** Staffing roles are NOT the same as tenant member roles (owner, instructor, etc.). These are event-specific job assignments.

### 3.2 Event Staffing Needs (per scheduled event)

New table: `event_staffing_needs`

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT PK | `stn_` + 16 hex |
| `event_id` | TEXT FK | → scheduled_events |
| `role_key` | TEXT | e.g., 'ro', 'safety', 'scorer' |
| `role_label` | TEXT | Display name |
| `min_count` | INT | Minimum required |
| `max_count` | INT | Maximum allowed |
| `created_at` | TIMESTAMPTZ | |

Populated automatically from template's `staffing_rules` when event is created/imported. Can be overridden per event.

### 3.3 Staff Signups

New table: `staff_signups`

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT PK | `ssu_` + 16 hex |
| `event_id` | TEXT FK | → scheduled_events |
| `need_id` | TEXT FK | → event_staffing_needs |
| `account_id` | TEXT FK | → accounts (the instructor) |
| `status` | TEXT | 'confirmed', 'withdrawn', 'no_show' |
| `signed_up_at` | TIMESTAMPTZ | |
| `withdrawn_at` | TIMESTAMPTZ | null if still active |
| `notes` | TEXT | Optional message from instructor |

**Unique constraint:** One signup per account per need (can withdraw and re-signup).

---

## 4. API Endpoints

### For Instructors (any tenant member)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tenants/:id/staffing/upcoming` | Events needing staff (with my signup status) |
| POST | `/tenants/:id/staffing/signup` | Sign up for a role at an event |
| POST | `/tenants/:id/staffing/withdraw` | Withdraw from a commitment |
| GET | `/tenants/:id/staffing/my-assignments` | My upcoming commitments |

### For Admins (owner, tenant_admin, instructor_admin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tenants/:id/staffing/overview` | All events with staffing status |
| PUT | `/tenants/:id/events/:eid/staffing-needs` | Override staffing needs for an event |
| POST | `/tenants/:id/staffing/notify` | Send "we need staff" email to all instructors |

---

## 5. UI Design

### 5.1 Roster Page (for instructors)

**Three sections:**

1. **Events Needing Staff** — Cards showing:
   - Event name, date, discipline
   - Staffing status bar: "2/3 ROs, 0/1 Safety" (visual progress)
   - "Sign Up" button per unfilled role
   - Signup window status (open/closed/upcoming)

2. **My Assignments** — List of events I'm committed to:
   - Event name, date, my role
   - "Withdraw" button (with confirmation)
   - Days until event

3. **Past Events** — Collapsed section showing history

### 5.2 Dashboard Integration

The existing dashboard's "Staffing Gaps" metric becomes live:
- Count of events in next 30 days where `filled < min_count` for any role

### 5.3 Schedule Page Integration

Each event in the schedule list shows a staffing indicator:
- 🟢 Fully staffed
- 🟡 Partially staffed
- 🔴 Understaffed
- ⚪ No staffing needs defined

---

## 6. Email Notifications

Using existing Resend infrastructure (`lib/email.js`):

| Trigger | Recipients | Content |
|---------|-----------|---------|
| Event created with staffing needs | All instructors | "New event needs staff: [name] on [date]" |
| Signup confirmed | The instructor | "You're confirmed as [role] for [event]" |
| Withdrawal | Admins | "[Name] withdrew from [event] — [role] now needs [n] more" |
| Reminder (7 days before) | Assigned staff | "Reminder: you're [role] at [event] on [date]" |
| Reminder (1 day before) | Assigned staff | "Tomorrow: [event] — you're assigned as [role]" |
| Event understaffed (3 days before) | Admins + all instructors | "URGENT: [event] still needs [n] [role]" |

---

## 7. Implementation Plan

| Phase | Scope | Effort |
|-------|-------|--------|
| **7.1** | Data model (tables, store functions), staffing needs auto-populated from templates | 2-3h |
| **7.2** | API endpoints (signup, withdraw, upcoming, my-assignments, overview) | 3-4h |
| **7.3** | Roster UI (events needing staff, signup buttons, my assignments) | 3-4h |
| **7.4** | Dashboard + Schedule integration (staffing indicators) | 1-2h |
| **7.5** | Email notifications (signup confirmation, reminders, understaffed alerts) | 2-3h |
| **7.6** | Admin: override staffing needs per event, manual notify | 1-2h |

**Total estimated: 12-18 hours across 6 phases**

---

## 8. Design Decisions

- **Staffing roles ≠ tenant roles** — "Range Officer" is an event job, not a platform role. **Any tenant member** (not just those with `instructor` role) can sign up for event staffing roles. In practice, members with `instructor` role are the primary audience, but owners, admins, and match admins can also staff events.
- **Template-driven defaults** — Staffing needs (roles + counts) come from the template's `staffing_rules`, inherited by every event created from that template. Can be overridden per event. This applies across all disciplines and their templates.
- **Self-service first** — Members sign themselves up. Admins can also assign, but the primary flow is self-service. No approval workflow initially — signup = confirmed. Approval could be added as a template setting in the future.
- **Withdrawal policy** — Always allowed (people get sick, unexpected events happen). Withdrawal **triggers a notification** to all tenant members who are NOT already staffing that event, alerting them that a position needs to be filled.
- **Certification placeholder** — Templates can define recommended qualifications per role (e.g., "Match director must be a qualified SRA Range Officer") as informative text. No enforcement for now — rely on self-regulation. Formal qualification tracking is deferred.
- **SSI sync** — Use the SRA staffing engine model: staff assignments sync to SSI (register as officials). Applies to all disciplines.

---

## 9. Resolved Questions

1. **Who can staff events?** — ✅ Any tenant member, not just `instructor` role. All members can sign up for event staffing roles.
2. **SSI sync?** — ✅ Yes, use SRA staffing engine model. Staff registered as officials in SSI. Applies to all disciplines.
3. **Qualifications?** — ✅ Informative only (text on template role). No enforcement — self-regulation. Formal tracking deferred.
4. **Approval workflow?** — ✅ No approval initially. Signup = confirmed. Could be a template setting in the future.
5. **Withdrawal notifications?** — ✅ Withdrawal triggers notification to non-assigned members that a position needs filling.
6. **Understaffed alert?** — ✅ 3 days before event, alert sent to admins + all members if positions unfilled.

## 10. Remaining Open Questions

1. **Cross-tenant visibility** — Should members see events from other tenants? Currently no.
2. **Mobile notifications** — Email only for now. Push notifications (PWA) for time-sensitive alerts is a future consideration.
