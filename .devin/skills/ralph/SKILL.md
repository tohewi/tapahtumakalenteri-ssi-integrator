---
name: ralph
description: "Convert a markdown PRD or docs/requirements section into prd.json for the Ralph autonomous agent loop. Triggers on: convert this prd, turn into ralph format, create prd.json."
argument-hint: "[path/to/prd.md or requirement section]"
allowed-tools:
  - read
  - grep
  - glob
  - edit
triggers:
  - user
  - model
---

# Ralph PRD Converter (`prd.json` Generator)

Converts a markdown PRD (`tasks/prd-*.md`) or a section of `docs/requirements/*.md` into `prd.json` and initializes `progress.txt` for autonomous execution via `/ralph-loop`.

---

## Output Format (`prd.json`)

Write `prd.json` at the repository root:

```json
{
  "project": "TurRes SSI Tools",
  "requirementPrefix": "R76",
  "branchName": "R76-feature-[kebab-case-name]",
  "description": "[Feature description from PRD]",
  "userStories": [
    {
      "id": "US-001",
      "requirementId": "R76-TD1",
      "title": "[Short atomic story title]",
      "description": "As a [user/developer], I want [feature] so that [benefit]",
      "acceptanceCriteria": [
        "Specific verifiable criterion 1",
        "Specific verifiable criterion 2",
        "scoring-proxy tests pass (npm test)",
        "scoring-ui lint, build, and tests pass (npm run lint && npm run build && npm test)"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

---

## Conversion Rules

1. **Archive Previous Run First**:
   - If `prd.json` already exists at the repo root with a different `branchName` and `progress.txt` has content beyond its header, copy both to `archive/ralph-runs/YYYY-MM-DD-[old-branch]/` and reset `progress.txt` with a fresh `# Ralph Progress Log` + `## Codebase Patterns` header.
2. **One Atomic Change Per Story**:
   - Each story must be completable in a single iteration without exceeding the ~500-line file guideline.
   - Split large tasks (e.g., "Decompose `client.js`" -> separate stories for `http-helpers.js`, `graphql.js`, `scoring.js`, `participants.js`, `management.js`).
3. **Strict Dependency Order**:
   - Priority `1..N` must order stories so earlier stories never depend on later ones:
     1. Core/domain helpers & models (`scoring-proxy/lib/ssi-core/`, `lib/services/`)
     2. Backend routes & unit tests (`scoring-proxy/routes/`, `scoring-proxy/test/`)
     3. Frontend API client, i18n, and UI components (`scoring-ui/src/`)
     4. Documentation & requirements status sync (`docs/requirements/`, `docs/RELEASE-NOTES.md`)
4. **Branch Naming Convention**:
   - Follow `AGENTS.md`: `<ReqNumber>-<feature|hotfix>-<kebab-name>` (e.g., `R76-feature-ssi-core-split`).
5. **Initialize `progress.txt`**:
   - Ensure `progress.txt` exists at the repository root with a `## Codebase Patterns` section at the top.
