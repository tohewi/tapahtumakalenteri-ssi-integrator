---
name: ralph-loop
description: "Run the autonomous Ralph agent loop repeatedly over prd.json until all user stories pass quality checks. Triggers on: run ralph, ralph loop, execute prd.json."
argument-hint: "[max_iterations (default: 10)]"
allowed-tools:
  - read
  - edit
  - grep
  - glob
  - exec
triggers:
  - user
  - model
---

# Ralph Autonomous Agent Loop

Based on [snarktank/ralph](https://github.com/snarktank/ralph) and adapted for **TurRes SSI Tools**.

Executes user stories from `prd.json` iteratively—one atomic story per loop iteration—verifying tests, lint, and build, committing clean state, and persisting memory via git commits, `prd.json`, `progress.txt`, and `AGENTS.md`.

---

## Execution Protocol

For each iteration (up to `max_iterations`, default `10`):

### Step 1: Read State & Patterns
1. Read `prd.json` at the repository root. (If `prd.json` does not exist yet and the user specified a requirement or doc section, run `/ralph` first to generate `prd.json` and `progress.txt`.)
2. Read `progress.txt` (pay special attention to the `## Codebase Patterns` section at the top).
3. Check the current git branch. If not on `prd.json`'s `branchName`, check it out or create it from `main`.

### Step 2: Select Next Story
1. Pick the **highest priority** user story in `prd.json` where `passes: false`.
2. If all stories have `passes: true`, output `<promise>COMPLETE</promise>` and stop.
3. Track the current story in `todo_write`.

### Step 3: Implement Single Story
1. Implement **only** that single user story.
2. Enforce project architecture rules (`AGENTS.md`):
   - Keep files under ~500 lines.
   - Routes (`scoring-proxy/routes/*.js`) are thin dispatchers; business logic belongs in `scoring-proxy/lib/services/*.js`.
   - Domain modules (`scoring-proxy/lib/ssi-core/*.js`) import only `http-helpers.js`.
   - Use structured logger `log` (`scoring-proxy/lib/logger.js`), never `console.log`/`console.warn`/`console.error` in routes or middleware.
3. Write or update unit/integration tests covering the story's acceptance criteria.

### Step 4: Run Quality Gates
Run the required verification checks for the affected packages:
- **Backend (`scoring-proxy`)**:
  ```bash
  npm test
  ```
- **Frontend (`scoring-ui`)**:
  ```bash
  npm run lint && npm run build && npm test -- --maxWorkers=1 --pool=threads
  ```
Do **not** proceed to commit until all quality gates pass with zero errors.

### Step 5: Persist Memory (`AGENTS.md`, `prd.json`, `progress.txt`)
1. **Update `AGENTS.md` and `.github/copilot-instructions.md` in sync**:
   - If you discovered a genuinely reusable codebase pattern, gotcha, or structural change, update **both** `AGENTS.md` and `.github/copilot-instructions.md`.
2. **Update `prd.json`**:
   - Set `passes: true` (and optional `notes`) for the completed story.
   - If the story completes a requirement in `docs/requirements/requirements.md` or `docs/requirements/release-7.6.md`, mark it `✅ Implemented`.
3. **Append to `progress.txt`** (never overwrite; always append):
   ```markdown
   ## [YYYY-MM-DD HH:mm] - [Story ID] ([Requirement ID])
   - What was implemented
   - Files changed
   - **Learnings for future iterations:**
     - Patterns discovered
     - Gotchas encountered
   ---
   ```
   If a pattern is broadly reusable across the repo, also add a bullet to `## Codebase Patterns` at the top of `progress.txt`.

### Step 6: Commit Iteration
Stage and commit all changes for this story using the project's commit format:
```
<RequirementPrefix> feat: [Story ID] - [Story Title]
```
Include `Generated with [Devin](https://devin.ai)` and `Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>`.

### Step 7: Loop Continuation or Stop Condition
- Re-check `prd.json`:
  - If all stories have `passes: true`, output `<promise>COMPLETE</promise>` and provide the final summary and token usage table.
  - Otherwise, immediately start the next loop iteration on the next `passes: false` story until `max_iterations` is reached.
