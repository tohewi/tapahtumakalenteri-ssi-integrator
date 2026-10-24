---
name: prd
description: "Generate a Product Requirements Document (PRD) with atomic user stories for Ralph execution. Triggers on: create a prd, write prd for, plan this feature, spec out."
argument-hint: "<feature description>"
allowed-tools:
  - read
  - grep
  - glob
  - edit
triggers:
  - user
  - model
---

# PRD Generator (Ralph Workflow)

Create detailed Product Requirements Documents with atomic, single-iteration user stories suitable for autonomous execution via `/ralph` and `/ralph-loop`.

---

## Workflow

1. Receive a feature description or requirement topic from the user.
2. Explore relevant files in `docs/requirements/`, `scoring-proxy/`, and `scoring-ui/` to understand existing context.
3. Ask 2-4 essential clarifying questions (using `ask_user_question` or lettered options) if scope, target user, or acceptance criteria are ambiguous.
4. Generate a structured PRD based on the answers and save it to `tasks/prd-[feature-name].md` (or `docs/requirements/release-[X.Y]-[feature].md` if specified).

**Important:** Do NOT start implementing runtime code during this step. Only produce the PRD.

---

## PRD Structure

### 1. Introduction / Overview
Brief description of the feature, the problem it solves, and the requirement prefix (e.g., `R76`, `R100`).

### 2. Goals
Specific, measurable objectives (bullet list).

### 3. User Stories (Atomic & Dependency-Ordered)
Each story **must** be small enough to complete and verify in **one** Ralph loop iteration:
- **ID & Title:** `### US-001: [Title]`
- **Description:** `As a [user], I want [feature] so that [benefit].`
- **Acceptance Criteria:** Verifiable checklist of what "done" means:
  - Specific behavioral/code criterion
  - Unit/integration tests added or updated
  - `scoring-proxy` tests pass (`npm test`)
  - `scoring-ui` lint, build, and tests pass (`npm run lint && npm run build && npm test`)
  - **[UI stories only]** Verify in browser preview if applicable

### 4. Functional Requirements
Numbered list of explicit, unambiguous requirements (`FR-1`, `FR-2`, ...).

### 5. Non-Goals (Out of Scope)
What this feature will NOT include (e.g., do not mix with the separate `tohewi/match-manager` platform repository).

### 6. Technical Considerations
- Module boundary rules (`routes` -> `lib/services` -> `lib/ssi-core` domain modules)
- ~500-line file size limit
- Bilingual (`fi`/`en`) translations in `scoring-ui/src/i18n.js`
