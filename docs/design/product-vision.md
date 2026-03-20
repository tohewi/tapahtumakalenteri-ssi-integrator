# Product Vision — SSI TurRes Tools

**Date:** 2026-03-01

---

## The Problem

Shooting clubs run on volunteers. Every competition event — whether a casual training cup or a formal IPSC match — needs range officers, safety officers, scorers, and equipment handlers. Today, this coordination happens through WhatsApp groups, email chains, and verbal promises at the range.

The result is predictable:
- **Nobody knows the staffing status** until the day before the event
- **No-shows** disrupt events — someone committed to be RO, doesn't show up, no backup
- **The same 5 people do everything** — burnout is the #1 reason experienced volunteers quit
- **New members don't know how to help** — they'd volunteer if someone asked, but nobody does
- **Multi-discipline complexity** lives in one person's head — when they're unavailable, events get cancelled

This isn't a Finnish problem. It's a global shooting sport problem. And it's not limited to staffing — clubs struggle with seasonal planning, registration management, communication, and compliance documentation. But staffing is the sharpest pain.

## The Vision

**SSI TurRes Tools is a club operations platform that turns volunteer chaos into organized, self-service staffing.**

The platform sits on top of ShootNScoreIt (SSI) — the dominant competition management system in the Nordic region — and adds what SSI lacks: the people layer. Who's available, who's committed, who needs to be reminded.

### Core Value Loop

```
Club defines events → Events need staff → Instructors see what's needed →
Instructors sign up → Everyone knows who's doing what → Event runs smoothly →
History shows who contributed → Recognition, not burnout
```

### What Makes This Different

SSI handles competition structure: cups, matches, squads, scores. SSI does this well, and we don't replace it — we automate it. We handle everything SSI doesn't:

| SSI Does | We Do |
|----------|-------|
| Match structure, squads, scoring | Event planning & templates |
| Competitor registration | Staff coordination & signup |
| Results & rankings | Notifications & reminders |
| — | Organization management (tenants, members, roles) |
| — | Multi-discipline scheduling |
| — | Staffing gap visibility |

## Target Users

### 1. Club Leadership (Tenant Owner / Admin)
- Plans the season calendar
- Defines what staff each event type needs
- Sees staffing gaps at a glance
- Invites members to the platform

### 2. Match Directors (Match Admin)
- Creates events from templates or imports from SSI
- Monitors staffing for their events
- Overrides staffing needs when necessary
- Triggers "we need help" notifications

### 3. Instructors / Range Officers (Instructor role)
- See upcoming events that need their help
- Sign up with one click
- Get reminders before their commitments
- Track their own volunteering history

### 4. Shooters (not platform users — SSI users)
- Continue to use SSI directly for registration and results
- Benefit from better-organized events (more reliable staffing = events run on time)

## Strategic Focus: Staffing First

Everything we've built so far — accounts, tenants, roles, disciplines, templates, scheduling, SSI import — is plumbing. Essential plumbing, but plumbing. The actual value that makes a club say "we need this" is:

> "I can see that Saturday's event needs 2 more range officers, and I can sign up right now."

### Phase 1: Make Staffing Work (current focus)
- Define staffing needs per event type (template-driven)
- Roster page: events needing staff, signup/withdraw, my assignments
- Email notifications: signup confirmation, reminders, understaffed alerts
- Dashboard: staffing gap metrics

### Phase 2: Make Staffing Smart
- Instructor profiles with qualifications/certifications
- SSI sync — auto-register staff as officials in SSI
- Withdrawal pattern tracking (reliability scoring)
- Suggested assignments based on availability and history

### Phase 3: Expand the Platform
- Calendar integration (WordPress Tapahtumakalenteri)
- Season planning view (annual calendar with all disciplines)
- Activity reporting for federation compliance
- Mobile-optimized instructor experience (PWA push notifications)

### Phase 4: Commercial Viability
- Subscription enforcement (trial → paid)
- Payment integration (Stripe)
- Multi-club events (cross-tenant staff sharing)
- GDPR compliance (data export, deletion workflows)

## What We Don't Do

- **We don't replace SSI** — SSI is the source of truth for competition data
- **We don't handle scoring** — the scoring app (#/scoring, #/tablet) is a separate tool that works with SSI directly
- **We don't manage finances** — payment collection for event fees stays with the club's existing process
- **We don't build a social network** — no chat, no forums, no feeds. Communication is purposeful: "your event is in 3 days"

## Success Metrics

For the staffing feature to be considered successful:

1. **Adoption** — At least one club uses the platform to staff real events
2. **Self-service** — >50% of signups are instructor-initiated (not admin-assigned)
3. **Visibility** — Match directors can see staffing status without asking anyone
4. **Reliability** — No-show rate decreases compared to WhatsApp-based coordination
5. **Engagement** — New members participate in staffing (not just the usual 5 people)

## Current State (March 2026)

| Layer | Status |
|-------|--------|
| **Platform foundation** | ✅ Accounts, tenants, RBAC, MFA, invitations, password reset |
| **Event management** | ✅ Templates, disciplines, scheduling, SSI import & execution |
| **SSI integration** | ✅ GraphQL + web scraping, event creation, structure import |
| **Scoring tools** | ✅ Mobile + tablet scoring, squad management, reports |
| **Registration** | ✅ Public self-registration with email confirmation |
| **Staffing** | 🔲 Design complete, implementation next |
| **Notifications** | 🔲 Infrastructure exists (Resend), logic not built |
| **Calendar integration** | 🔲 Placeholder |
| **Billing** | 🔲 Trial countdown exists, no payment integration |

The foundation is solid. The next step is to build the feature that makes clubs want to use it.
