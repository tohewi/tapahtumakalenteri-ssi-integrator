---
description: Ralph Loop — structured task execution workflow for Cascade sessions
---

# Ralph Loop Workflow

Structured workflow for picking up tasks, implementing them, and tracking progress across sessions. Based on the Ralph Loop technique adapted for Cascade/Windsurf.

## At Session Start

1. Read `progress.md` in the project root to understand current state, recent work, and active context.
2. Read the PRD: `docs/requirements/requirements.md` — scan the "What's Next" section in `progress.md` for priority guidance.
3. If the user has a specific task, skip to **Task Execution**. Otherwise, propose the highest-value next task from the PRD.

## Task Execution (one task at a time)

4. Create or update the todo list with a concise plan for the single task. Mark the first step `in_progress`.
5. Implement the task:
   - Follow existing code patterns and `AGENTS.md` guidelines.
   - Keep changes small and focused — one logical unit per commit.
   - Run tests after each change: `npx vitest run` (backend), `npx vitest run` in scoring-ui (frontend).
6. Commit with a descriptive message that references the requirement number.
// turbo
7. Push to origin: `git push origin <branch-name>`
8. Mark the task complete in the todo list.
9. If there's a next task and the user wants to continue, go to step 4.

## Code Review (periodic, at least once per session)

After significant pushes (new features, architecture changes, or before merge):
1. **Request review**: Use GitHub Copilot code review on the PR, or ask the user to trigger one.
2. **Fetch results**: Use `read_url_content` on `https://api.github.com/repos/{owner}/{repo}/pulls/{pr}/comments?per_page=100` to get review comments.
3. **Triage**: Categorize findings into:
   - **Red (bugs)**: Runtime errors, crashes, wrong imports — fix immediately
   - **Yellow (quality)**: Dead code, missing guards, stale docs — fix before merge
   - **Green (already fixed)**: Issues addressed in later commits — note as resolved
   - **Grey (low priority)**: Style, nice-to-haves — track in backlog
4. **Fix red items** in the current session. Track yellow items in the todo list.
5. **Commit fixes** referencing the review (e.g., "fix: Address Copilot review findings").

## At Session End

10. **Clean up leftover processes.** Test runs and dev servers often leave orphan node processes. Kill them:
    ```powershell
    Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | Stop-Process -Force -ErrorAction SilentlyContinue
    ```
    This is safe — it only kills node processes, not the IDE or other tools.
11. **Update AGENTS.md** if the session revealed new patterns, gotchas, or hidden dependencies.
    This is how the codebase compounds knowledge rather than rotting. Examples:
    - Discovered that SSI GraphQL ignores multi-value fields → must use web form POST
    - Found that Render PUT /env-vars is destructive (replaces all, not merges)
    - Learned that `NODE_TLS_REJECT_UNAUTHORIZED=0` is set globally in scoring-proxy
    Only add genuinely useful learnings, not noise. Keep both `AGENTS.md` and `.github/copilot-instructions.md` in sync.
12. Update `progress.md`:
    - Update the "Last updated" line with today's date.
    - Update the branch/commit reference.
    - Update the test count if changed.
    - Move completed work from "Current Session Work" to a dated entry.
    - Update "What's Next" if priorities shifted.
13. Commit `progress.md` (and AGENTS.md if changed): `git add progress.md AGENTS.md .github/copilot-instructions.md && git commit -m "progress: update session notes"`
// turbo
14. Push: `git push origin <branch-name>`
15. Provide a token usage summary table (per AGENTS.md).

## Task Sizing

Right-sized tasks (fit in one context cycle):
- Add a database column and migration
- Fix a single bug with a test
- Add a UI component to an existing page
- Implement one API endpoint with validation
- Write tests for an existing module

Too big (break these down first):
- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"
- Any task touching >5 files across both frontend and backend

If a task doesn't fit in a single context window, quality suffers. That's not a model problem — it's a delegation problem.

## Key Principles

- **One task per cycle.** Don't start a second task until the first is committed and tested.
- **Fresh context each session.** `progress.md` is your memory between sessions — read it first, update it last.
- **Small steps.** Prefer multiple small commits over one large one. Context rot is real.
- **Feedback loops.** Always run tests before committing. Never push red tests.
- **Risky first.** When choosing between tasks, prefer integration/risky work over easy wins.
- **PRD is the authority.** `requirements.md` defines what "done" looks like. `progress.md` tracks where we are.
- **Compound knowledge.** Update AGENTS.md with patterns and gotchas discovered during work. Every future session benefits.
