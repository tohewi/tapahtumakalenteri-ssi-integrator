# Product Roadmap — Version History & Feature Map

**Date:** 2026-03-01

---

## Release Timeline

```mermaid
gantt
    title SSI TurRes Tools — Release Timeline
    dateFormat YYYY-MM
    axisFormat %b %Y

    section Scoring Tools
    R1.0 SSI Cup Automation (PS)     :done, r10, 2025-06, 2025-08
    R2.0 WordPress Integration       :done, r20, 2025-08, 2025-09
    R3.0 Scoring App                 :done, r30, 2025-09, 2025-11
    R4.0 Registration Frontend       :done, r40, 2025-11, 2025-12
    R5.0 SRA Staffing (legacy)       :done, r50, 2025-12, 2026-01
    R8.0 Tablet Scoring              :done, r80t, 2026-01, 2026-02

    section Architecture
    R7.0 Auth & Sessions (V7)        :done, r70, 2026-01, 2026-01
    R7.4 Refactoring                 :done, r74, 2026-02, 2026-02
    R7.5 Architecture V2             :done, r75, 2026-02, 2026-02

    section Match Management Platform
    R8.0 Platform Auth & Tenancy     :done, r80p, 2026-02, 2026-02
    R8.1 Event Management            :done, r81, 2026-02, 2026-02
    R8.2 Authorization & Workflows   :active, r82, 2026-02, 2026-03
    R9.0 Event Staffing              :r90, 2026-03, 2026-04
    R9.1 Notifications               :r91, 2026-04, 2026-04
    R9.2 Calendar Integration        :r92, 2026-04, 2026-05
    R10.0 Billing & Compliance       :r100, 2026-05, 2026-06
```

## Feature Architecture — Two Products

```mermaid
graph TB
    subgraph "Product 1: Scoring & Registration Tools"
        direction TB
        SC[Mobile Scoring<br/>#/scoring]
        TB[Tablet Scoring<br/>#/tablet]
        RG[Self-Registration<br/>#/register]
        MG[Cup Management<br/>#/manage]
        ST_OLD[SRA Staffing<br/>#/staffing]
        RP[Reports<br/>#/report]

        SC --> SSI_AUTH[SSI Authentication<br/>V7 Sessions]
        TB --> SSI_AUTH
        MG --> SSI_AUTH
        RG --> SSI_ADMIN[SSI Admin Session]
        ST_OLD --> SSI_ADMIN
        RP --> SSI_AUTH
    end

    subgraph "Product 2: Match Management Platform"
        direction TB
        PL[Platform Auth<br/>Accounts, MFA, Invitations]
        TN[Tenancy<br/>Organizations, RBAC]
        DS[Disciplines & Templates<br/>Event Blueprints]
        EV[Event Scheduling<br/>SSI Import & Execution]
        SF[Event Staffing<br/>Signup, Roster, Notifications]
        CL[Calendar Integration<br/>WordPress Publishing]
        BL[Billing<br/>Subscriptions, Payments]

        PL --> TN
        TN --> DS
        DS --> EV
        EV --> SF
        EV --> CL
        TN --> BL
    end

    SSI_AUTH --> SSI[(SSI<br/>ShootNScoreIt)]
    SSI_ADMIN --> SSI
    EV --> SSI

    style SC fill:#4ade80,stroke:#166534
    style TB fill:#4ade80,stroke:#166534
    style RG fill:#4ade80,stroke:#166534
    style MG fill:#4ade80,stroke:#166534
    style RP fill:#4ade80,stroke:#166534
    style ST_OLD fill:#fbbf24,stroke:#92400e
    style PL fill:#4ade80,stroke:#166534
    style TN fill:#4ade80,stroke:#166534
    style DS fill:#4ade80,stroke:#166534
    style EV fill:#4ade80,stroke:#166534
    style SF fill:#93c5fd,stroke:#1e40af
    style CL fill:#d4d4d4,stroke:#525252
    style BL fill:#d4d4d4,stroke:#525252

    classDef done fill:#4ade80,stroke:#166534
    classDef active fill:#93c5fd,stroke:#1e40af
    classDef planned fill:#d4d4d4,stroke:#525252
```

**Legend:** 🟢 Done | 🔵 In Progress | ⚪ Planned | 🟡 Legacy (to be migrated)

## Version Feature Map

```mermaid
mindmap
  root((SSI TurRes Tools))
    Scoring Tools
      R1.0 Cup Automation
        PowerShell scripts
        SSI cup/match/squad creation
      R2.0 WordPress
        Calendar integration
        Batch creation
      R3.0 Scoring App
        Mobile scoring UI
        Score entry & submit
        PWA installable
      R4.0 Registration
        Public self-registration
        Email confirmations
        Capacity management
      R5.0 SRA Staffing
        Instructor signup
        SSI squad sync
        Config-file driven
      R8.0 Tablet Scoring
        3-column layout
        Long-press delete
        Session continuity
    Architecture
      R7.0 V7 Auth
        Redis sessions
        Dual-session model
        JWT refresh
      R7.4 Refactoring
        Domain modules
        Service extraction
        File size guidelines
      R7.5 Architecture V2
        Centralized errors
        API versioning
        Module boundaries
    Match Management Platform
      R8.0 Platform Auth
        Accounts & tenants
        RBAC 6 roles
        MFA TOTP
        Email invitations
        Password reset
      R8.1 Event Management
        Disciplines
        Match templates
        Event scheduling
        SSI import
        SSI execution
      R8.2 Authorization
        Role assignment matrix
        Discipline mapping
      R9.0 Staffing ⭐
        Event staffing needs
        Self-service signup
        Roster page
        Withdrawal notifications
        Understaffed alerts
      R9.1 Notifications
        Email reminders
        7-day and 1-day
        Urgent 3-day alerts
      R10.0 Commercial
        Billing / Stripe
        GDPR compliance
        Data export
```

## Product Separation Decision

The scoring and registration tools (#/scoring, #/tablet, #/register, #/manage, #/staffing) are **discipline-specific tools** — they work directly with SSI using SSI credentials and are designed for on-range use.

The Match Management Platform (#/platform) is a **multi-tenant organization tool** — it manages people, events, and staffing across disciplines.

### Recommendation: Keep in same deployment, separate UI routes

| Aspect | Scoring Tools | Match Management Platform |
|--------|--------------|--------------------------|
| **Users** | Scorers at the range | Club admins, instructors |
| **Auth** | SSI credentials (email+password+apiKey) | Platform accounts (email+password+MFA) |
| **Data** | SSI is source of truth | PostgreSQL + SSI references |
| **Context** | During competition | Before/after competition |
| **Routes** | #/scoring, #/tablet, #/register, #/manage | #/platform/* |

They share:
- Same Express server (single Render service)
- Same SSI integration layer (ssi-core/)
- Same Redis instance

But they are **logically separate products** with different auth systems, different users, and different lifecycle. The current architecture already reflects this — separate route files, separate API clients, separate UI component trees.

The SRA staffing feature (#/staffing) is the bridge — it's a legacy single-site staffing tool that should be **migrated into the platform's staffing feature** (Roster page). After migration, #/staffing can be deprecated.
