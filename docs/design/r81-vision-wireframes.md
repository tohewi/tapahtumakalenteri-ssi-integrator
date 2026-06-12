# R8.1 Vision & Wireframes — Match Management Platform

> **Status:** Initial vision round — design phase  
> **Date:** June 2026  
> **Goal:** Transform "link collection" into event-centric match management platform

---

## 1. Current State vs. Vision

### Current (R7.x) — Link Collection
```
┌─────────────────────────────────────┐
│  SSI apurit                         │
│  TurRes SSI-työkalut                │
├─────────────────────────────────────┤
│  📊 Scoring                         │
│  📱 Tablet Scoring                  │
│  👤 Registration                    │
│  ⚙️ Management                      │
│  📈 Reports                         │
│  📋 Summary                         │
│  👥 Staffing                        │
└─────────────────────────────────────┘
```
**Problem:** 7 separate features, no context. Users must know which tool to use when.

### Vision (R8.1) — Event-Centric Hub
```
┌─────────────────────────────────────┐
│  🏠 Events         👤 Profile  ⚙️   │
├─────────────────────────────────────┤
│                                     │
│  UPCOMING EVENTS                    │
│  ┌─────────────────────────────┐   │
│  │ 🎯 Kupittaa CUP 15.6.2026   │   │
│  │    3 matches • 12 shooters  │   │
│  │    [Manage] [Score] [Staff]   │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ 🎯 SRA Training 22.6.2026   │   │
│  │    1 match • 8 shooters     │   │
│  │    [Manage] [Score] [Staff] │   │
│  └─────────────────────────────┘   │
│                                     │
│  [+ Create New Event]               │
│                                     │
└─────────────────────────────────────┘
```
**Solution:** Everything lives in event context. Natural workflow progression.

---

## 2. Information Architecture

### Navigation Hierarchy

```
Events (Home)
├── Upcoming Events (list view)
├── Past Events (archive)
└── Create Event (wizard)

Event Detail (/:eventId)
├── Overview (status, quick stats)
├── Personnel (MP3)
│   ├── Staff List
│   ├── Signup/Availability
│   └── Roles & Permissions
├── Registration (MP5)
│   ├── Participants
│   ├── Squad Assignment
│   └── Waitlist
├── Scoring (MP6)
│   ├── Live Scoring → Launch Tablet/Mobile
│   └── Results
├── Stages (MP4)
│   ├── Stage List
│   └── Stage Design
└── Reports (MP7)
    ├── Results Summary
    ├── Statistics
    └── Export
```

---

## 3. Wireframes — Mobile-First (375px)

### 3.1 Events List (Home)

```
┌─────────────────────────┐
│ ≡  Match Manager    👤  │  ← Header: hamburger, profile
├─────────────────────────┤
│                         │
│  UPCOMING          Past │  ← Tab switcher
│                         │
│ ┌─────────────────────┐ │
│ │ 🔴 TODAY            │ │
│ │                     │ │
│ │ Kupittaa CUP        │ │
│ │ 📍 Kupittaa         │ │
│ │ 🕐 09:00            │ │
│ │                     │ │
│ │ 3 matches  12/20    │ │
│ │ ⬜ ⬜ ⬜  registered │ │
│ │                     │ │
│ │ [Manage] [Score]    │ │
│ └─────────────────────┘ │
│                         │
│ ┌─────────────────────┐ │
│ │ 🟡 IN 3 DAYS        │ │
│ │                     │ │
│ │ SRA Training        │ │
│ │ 📍 Hirvihaara       │ │
│ │ 🕐 18:00            │ │
│ │                     │ │
│ │ 1 match  4/12       │ │
│ │ ⬜ registered       │ │
│ │                     │ │
│ │ [Manage] [Staff]    │ │
│ └─────────────────────┘ │
│                         │
│ ┌─────────────────────┐ │
│ │ ⚪ JUN 29           │ │
│ │ ...                 │ │
│ └─────────────────────┘ │
│                         │
│     ╋                   │  ← FAB: Create Event
│                         │
├─────────────────────────┤
│  🏠      📅      🔧     │  ← Bottom nav
│  Events  Calendar Tools │
└─────────────────────────┘
```

**Key Interactions:**
- Tap card → Event Detail
- Swipe card left → Quick actions (Score, Staff)
- FAB → Create Event wizard
- Bottom nav → Switch between Events | Calendar | Tools

---

### 3.2 Event Detail — Overview Tab

```
┌─────────────────────────┐
│ ←  Kupittaa CUP    ⋮   │
├─────────────────────────┤
│                         │
│     🔴 LIVE             │
│   Scoring in progress   │
│                         │
│ ┌─────────────────────┐ │
│ │ 📊 QUICK STATS      │ │
│ │                     │ │
│ │ 12 shooters    3/5  │ │
│ │ 45 scores      squads│ │
│ │ 2 DNFs         2 DNFs│ │
│ │                     │ │
│ │ [View Full Results] │ │
│ └─────────────────────┘ │
│                         │
│  Overview | Personnel   │  ← Tab nav
│  | Reg | Score | Report │
│                         │
│ NEXT UP                 │
│ ┌─────────────────────┐ │
│ │ 🎯 Stage 3          │ │
│ │ 15 min • Squad 3    │ │
│ │ 5 shooters waiting  │ │
│ │ [Start Scoring]     │ │
│ └─────────────────────┘ │
│                         │
│ MATCHES (3)             │
│ ┌─────────────────────┐ │
│ │ 🏆 25m Pistol       │ │
│ │    5 shooters ⬜⬜⬜⬜⬜│ │
│ │    [Results]        │ │
│ ├─────────────────────┤ │
│ │ 🏆 50m Rifle        │ │
│ │    4 shooters ⬜⬜⬜⬜ │ │
│ │    [Results]        │ │
│ ├─────────────────────┤ │
│ │ 🏆 100m Rifle       │ │
│ │    3 shooters ⬜⬜⬜ │ │
│ │    [Continue]       │ │
│ └─────────────────────┘ │
│                         │
└─────────────────────────┘
```

**Key Interactions:**
- Tap match → Match detail with squad view
- [Start Scoring] → Launch tablet/mobile scorer
- Status badges show event state: Setup → Registration Open → Live → Closed

---

### 3.3 Event Detail — Personnel Tab (MP3)

```
┌─────────────────────────┐
│ ←  Kupittaa CUP    ⋮   │
├─────────────────────────┤
│                         │
│  Overview | Personnel   │  ← Active tab underlined
│  | Reg | Score | Report │
│                         │
│ PERSONNEL              │
│ ┌─────────────────────┐ │
│ │ 👤 Match Director   │ │
│ │    Tommi W.         │ │
│ │    ✓ Confirmed      │ │
│ │    [✉️] [✗]         │ │
│ ├─────────────────────┤ │
│ │ 👤 Range Officer    │ │
│ │    (Vacant)         │ │
│ │    [Invite]         │ │
│ ├─────────────────────┤ │
│ │ 👤 Quarter Master   │ │
│ │    (Vacant)         │ │
│ │    [Invite]         │ │
│ └─────────────────────┘ │
│                         │
│ AVAILABLE STAFF         │
│ ┌─────────────────────┐ │
│ │ 👤 Juha K.          │ │
│ │    Available Jun 15 │ │
│ │    [+ Add to Event] │ │
│ └─────────────────────┘ │
│                         │
│ [+ Invite New Person]   │
│                         │
└─────────────────────────┘
```

**Key Interactions:**
- [Invite] → Email invite flow
- [+ Add to Event] → Quick assign from available pool
- Staff can mark availability before events

---

### 3.4 Event Detail — Registration Tab (MP5)

```
┌─────────────────────────┐
│ ←  Kupittaa CUP    ⋮   │
├─────────────────────────┤
│                         │
│  Overview | Personnel   │
│  | Reg | Score | Report │  ← Reg tab active
│                         │
│ REGISTRATION            │
│ ████████░░░░ 12/20     │  ← Capacity bar
│                         │
│ [+ Register Shooter]    │
│                         │
│ SQUADS (5)              │
│                         │
│ ┌─────────────────────┐ │
│ │ ⬜ Squad 1 (3)      │ │
│ │    • Matti M.       │ │
│ │    • Juha K. ⭐     │ │  ← Match Director
│ │    • Anna L.        │ │
│ │    [✏️] [➕]        │ │
│ ├─────────────────────┤ │
│ │ ⬜ Squad 2 (3)      │ │
│ │    • Pekka R.       │ │
│ │    • ...            │ │
│ │    [✏️] [➕]        │ │
│ ├─────────────────────┤ │
│ │ ⬜ Squad 3 (2)      │ │
│ │    (Waiting)        │ │
│ └─────────────────────┘ │
│                         │
│ WAITLIST (2)            │
│ ┌─────────────────────┐ │
│ │ • Kimmo S.          │ │
│ │   [Promote to Squad]│ │
│ └─────────────────────┘ │
│                         │
│ [Auto-Assign Squads]    │
│                         │
└─────────────────────────┘
```

**Key Interactions:**
- Tap squad → Expand/collapse shooter list
- Drag shooter between squads (drag-and-drop)
- [Auto-Assign] → Distribute evenly by skill/registration time
- Waitlist automatically fills cancellations

---

### 3.5 Scoring Launch (MP6)

```
┌─────────────────────────┐
│ ←  Kupittaa CUP    ⋮   │
├─────────────────────────┤
│                         │
│  Overview | Personnel   │
│  | Reg | Score | Report │
│                         │
│ SCORING                 │
│                         │
│ SELECT MATCH            │
│ ┌─────────────────────┐ │
│ │ 🏆 100m Rifle       │ │
│ │    ◀──────────▶     │ │  ← Horizontal pager
│ │    Squad 3 of 5     │ │
│ │                     │ │
│ │ Current: 3 shooters │ │
│ │ ⬜ Matti M.   95p   │ │
│ │ ⬜ Juha K.    92p   │ │
│ │ ⬜ Anna L.    -     │ │  ← Shooting now
│ └─────────────────────┘ │
│                         │
│ LAUNCH SCORING          │
│ ┌─────────────────────┐ │
│ │                     │ │
│ │  📱 Tablet Mode     │ │
│ │     10"+ screens    │ │
│ │                     │ │
│ │  [📲 Launch]        │ │
│ │                     │ │
│ ├─────────────────────┤ │
│ │                     │ │
│ │  📱 Mobile Mode     │ │
│ │     Phone/Tablet    │ │
│ │                     │ │
│ │  [📲 Launch]        │ │
│ │                     │ │
│ └─────────────────────┘ │
│                         │
│ [⬇️ Download Results]   │
│                         │
└─────────────────────────┘
```

**Key Interactions:**
- Swipe match card → Switch between matches
- [Launch] → Open scoring in new tab/window with device token auth
- Results sync in real-time (when online)

---

### 3.6 Create Event Wizard (MP2 + MP4)

**Step 1: Select Training Type**
```
┌─────────────────────────┐
│ ✕  Create Event    1/4  │
├─────────────────────────┤
│                         │
│ SELECT TRAINING TYPE    │
│                         │
│ ┌─────────────────────┐ │
│ │ 🎯 Kupittaa CUP     │ │  ← Pre-selected template
│ │    3 matches        │ │
│ │    • 25m Pistol     │ │
│ │    • 50m Rifle      │ │
│ │    • 100m Rifle     │ │
│ │    5 squads max     │ │
│ │    ☑️ Selected      │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ 🎯 SRA Training     │ │
│ │    1 match          │ │
│ │    • 100m Rifle     │ │
│ │    12 slots         │ │
│ │    ⭕ Select        │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ ➕ Custom Event...  │ │
│ └─────────────────────┘ │
│                         │
│     [  Next  → ]        │
│                         │
└─────────────────────────┘
```

**Step 2: Date & Location**
```
┌─────────────────────────┐
│ ←  Create Event    2/4  │
├─────────────────────────┤
│                         │
│ Kupittaa CUP            │
│                         │
│ 📅 DATE                 │
│ ┌─────────────────────┐ │
│ │ June 2026    [▲▼]   │ │
│ │                     │ │
│ │ Su Mo Tu We Th Fr Sa│ │
│ │    1  2  3  4  5  6 │ │
│ │  7  8  9 10 11 12 13│ │
│ │ 14 [15]16 17 18 19 20│ │  ← 15th selected
│ │ 21 22 23 24 25 26 27│ │
│ │ 28 29 30            │ │
│ └─────────────────────┘ │
│                         │
│ 🕐 TIME                 │
│ ┌─────────────────────┐ │
│ │ 09:00  ───[●]───    │ │
│ └─────────────────────┘ │
│                         │
│ 📍 LOCATION             │
│ ┌─────────────────────┐ │
│ │ Kupittaa            │ │
│ │ Rata 1-5            │ │
│ └─────────────────────┘ │
│                         │
│ [  ← Back  ] [ Next → ]│
│                         │
└─────────────────────────┘
```

**Step 3: Review Structure**
```
┌─────────────────────────┐
│ ←  Create Event    3/4  │
├─────────────────────────┤
│                         │
│ REVIEW MATCH STRUCTURE  │
│                         │
│ Kupittaa CUP            │
│ 📍 Kupittaa, 15.6.2026  │
│ 🕐 09:00                │
│                         │
│ MATCHES (3)             │
│ ┌─────────────────────┐ │
│ │ 1. 25m Pistol       │ │
│ │    50 shots, 5×6    │ │
│ │    [Edit]           │ │
│ ├─────────────────────┤ │
│ │ 2. 50m Rifle        │ │
│ │    40 shots, 5×6    │ │
│ │    [Edit]           │ │
│ ├─────────────────────┤ │
│ │ 3. 100m Rifle       │ │
│ │    40 shots, 5×6    │ │
│ │    [Edit]           │ │
│ └─────────────────────┘ │
│                         │
│ SQUADS: 5 max × 4 each  │
│                         │
│ [  ← Back  ] [ Next → ] │
│                         │
└─────────────────────────┘
```

**Step 4: Create & Publish**
```
┌─────────────────────────┐
│ ←  Create Event    4/4  │
├─────────────────────────┤
│                         │
│ READY TO CREATE         │
│                         │
│ This will:              │
│ • Create Cup in SSI     │
│ • Create 3 Matches      │
│ • Create 5 Squads       │
│ • Add to calendar       │
│ • Open registration     │
│                         │
│ [Save as Draft]         │  ← Don't publish yet
│                         │
│ [🚀 Create & Publish]    │  ← Go live
│                         │
└─────────────────────────┘
```

---

## 4. Desktop Layout (1280px)

### 4.1 Events Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🏠 Match Manager    Events    Calendar    Templates    Admin          👤   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────┐  ┌─────────────────────────────────────┐     │
│  │  THIS WEEK               │  │  UPCOMING EVENTS                    │     │
│  │                          │  │                                     │     │
│  │  Mon 15                  │  │  ┌─────────────────────────────┐   │     │
│  │  ┌────────────────────┐   │  │  │ 🔴 Kupittaa CUP             │   │     │
│  │  │ 🎯 CUP             │   │  │  │    Jun 15 • 09:00          │   │     │
│  │  │ Kupittaa CUP       │   │  │  │    12/20 registered        │   │     │
│  │  │ 09:00              │   │  │  │    [Manage] [Score] [Staff]│   │     │
│  │  │ [Manage] [Score]   │   │  │  └─────────────────────────────┘   │     │
│  │  └────────────────────┘   │  │                                     │     │
│  │                          │  │  ┌─────────────────────────────┐   │     │
│  │  Thu 18                  │  │  │ 🟡 SRA Training             │   │     │
│  │  ┌────────────────────┐   │  │  │    Jun 22 • 18:00          │   │     │
│  │  │ Training           │   │  │  │    4/12 registered         │   │     │
│  │  │ SRA Training       │   │  │  │    [Manage] [Staff]        │   │     │
│  │  │ 18:00              │   │  │  └─────────────────────────────┘   │     │
│  │  │ [Manage]           │   │  │                                     │     │
│  │  └────────────────────┘   │  │  ┌─────────────────────────────┐   │     │
│  │                          │  │  │ ⚪ Kupittaa CUP             │   │     │
│  │                          │  │  │    Jun 29 • 09:00          │   │     │
│  │                          │  │  │    [Manage]                  │   │     │
│  │                          │  │  │                             │   │     │
│  └──────────────────────────┘  │  └─────────────────────────────┘   │     │
│                                │                                     │     │
│                                │  [ + Create New Event ]             │     │
│                                │                                     │     │
│                                └─────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Event Detail — Full Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Kupittaa CUP          Overview | Personnel | Registration | Scoring | X  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐    │
│  │ EVENT INFO                  │  │ QUICK ACTIONS                       │    │
│  │                             │  │                                     │    │
│  │ 🔴 LIVE                     │  │ [🚀 Start Scoring]  [👥 Staff]      │    │
│  │                             │  │ [📊 Results]        [⚙️ Settings]   │    │
│  │ 📍 Kupittaa                 │  │                                     │    │
│  │ 🕐 Jun 15, 09:00-14:00     │  │ [✉️ Message All]  [📋 Check-in]   │    │
│  │                             │  └─────────────────────────────────────┘    │
│  │ 📊 Stats: 12 shooters      │                                             │    │
│  │     45 scores submitted    │  ┌─────────────────────────────────────┐    │
│  │     2 DNFs                 │  │ MATCHES                             │    │
│  │     3/5 squads active      │  │                                     │    │
│  │                            │  │ 25m Pistol    ████████░░ 8 scores   │    │
│  │ [Edit Details]             │  │ 50m Rifle     ██████░░░░ 6 scores   │    │
│  │                            │  │ 100m Rifle    █████████░ 12 scores  │    │
│  └─────────────────────────────┘  │                                     │    │
│                                   │ [+ Add Match] [Reorder]             │    │
│                                   └─────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ SQUADS                                                              │    │
│  │                                                                     │    │
│  │ Squad 1    ████░░░░░░  4/5 shooters    [Score] [Manage]              │    │
│  │ Squad 2    ███░░░░░░░  3/5 shooters    [Score] [Manage]              │    │
│  │ Squad 3    ██████████  5/5 shooters ✓  [Score] [Manage]              │    │
│  │ Squad 4    ░░░░░░░░░░  0/5 shooters    [Score] [Manage]              │    │
│  │ Squad 5    ░░░░░░░░░░  0/5 shooters    [Score] [Manage]              │    │
│  │                                                                     │    │
│  │ [Auto-Assign] [Manual Assign] [+ New Squad]                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. User Flows

### 5.1 New Event Creation

```
User taps [+ Create Event]
         ↓
┌────────────────┐
│ Select Type    │ ← Kupittaa CUP, SRA Training, or Custom
│ (Step 1)       │
└───────┬────────┘
        ↓
┌────────────────┐
│ Date/Location  │ ← Calendar picker, time, location
│ (Step 2)       │
└───────┬────────┘
        ↓
┌────────────────┐
│ Review Structure│ ← Matches, squads, settings
│ (Step 3)       │
└───────┬────────┘
        ↓
┌────────────────┐
│ Create/Publish │ ← Draft or Live
│ (Step 4)       │
└───────┬────────┘
        ↓
  ┌──────────┐    ┌──────────┐
  │  DRAFT   │    │  LIVE    │
  │  Return  │    │  Open    │
  │  to list │    │  Reg tab │
  └──────────┘    └──────────┘
```

### 5.2 Event Lifecycle

```
┌──────────┐
│  DRAFT   │ ← Created, not visible
└────┬─────┘
     │ [Publish]
     ↓
┌──────────┐
│  SETUP   │ ← Visible, reg closed
└────┬─────┘
     │ [Open Registration]
     ↓
┌──────────┐
│  OPEN    │ ← Registrations accepted
└────┬─────┘
     │ [First squad starts]
     ↓
┌──────────┐
│  LIVE    │ ← Scoring in progress
└────┬─────┘
     │ [All squads finished]
     ↓
┌──────────┐
│  CLOSED  │ ← Results finalized
└────┬─────┘
     │ [Export & Archive]
     ↓
┌──────────┐
│ ARCHIVED │ ← Read-only, reference
└──────────┘
```

### 5.3 Scoring Flow

```
Match Director at range
         ↓
┌─────────────────────────┐
│ Opens Event → Scoring tab│
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ Sees squad rotation     │
│ "Squad 3 shooting now"  │
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ Selects [Launch Tablet]   │
│ or [Launch Mobile]      │
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ Device opens /tablet     │
│ with squad pre-selected │
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ Scores entered          │
│ Auto-sync when online   │
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ Squad finishes          │
│ Next squad auto-advances│
└─────────────────────────┘
```

---

## 6. Design Principles (Applied)

| Principle | Implementation |
|-----------|---------------|
| **Event-centric** | Every screen shows "which event am I in?" header. All actions scoped to event. |
| **Progressive disclosure** | Home = simple list. Detail = tabbed complexity. Settings = advanced options hidden. |
| **Mobile-first** | Single-column layouts. Touch targets 44px+. Swipe gestures. |
| **Offline-capable** | Scoring app works offline. Event list cached. "Sync pending" indicators. |
| **Training type templates** | Pre-configured structures. Consistent naming. One-tap creation. |
| **Status visibility** | Color-coded badges (🔴 Live, 🟡 Soon, ⚪ Future). Progress bars everywhere. |

---

## 7. Technical Notes for Implementation

### URL Structure
```
/#/events                    → Events list (home)
/#/events/:eventId           → Event detail, Overview tab
/#/events/:eventId/personnel → Personnel tab
/#/events/:eventId/reg       → Registration tab
/#/events/:eventId/scoring   → Scoring tab (launch pad)
/#/events/:eventId/reports   → Reports tab
/#/events/new                → Create event wizard
/#/tablet                    → Tablet scorer (standalone)
/#/scoring                   → Mobile scorer (standalone)
```

### State Management
- Event list: Global cache, refresh on focus
- Event detail: Route-based, lazy load tabs
- Scoring session: Local state, background sync

### Responsive Breakpoints
- Mobile: < 640px (single column, bottom nav)
- Tablet: 640-1024px (two column, side nav)
- Desktop: > 1024px (full layout, top nav)

---

## 8. Next Steps for R8.1

1. **Design Review** — Validate wireframes with stakeholders
2. **Prototype** — Interactive Figma/Storybook for key flows
3. **API Design** — Match endpoints to UI needs
4. **Component Library** — Build shared components in `match-manager-ui/`
5. **Iterative Build** — MP1 (shell) → MP4 (events) → MP3 (personnel) → MP5 (reg) → MP6 (scoring) → MP7 (reports)

---

*Vision document for R8.1 Match Management Platform. Wireframes represent target UX, subject to refinement during implementation.*
