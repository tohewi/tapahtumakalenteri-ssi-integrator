# Docs PR Policy

This repository supports a lightweight automation path for documentation-only pull requests.

## Goal

Allow low-risk documentation changes to move faster while keeping runtime code changes under normal manual review.

## Label

Use this label on a pull request when it is safe for GitHub to enable auto-merge after required checks pass:

```text
auto-merge-docs
```

## What counts as docs-only

The workflow accepts changes only under these paths/patterns:

```text
docs/**
.github/ISSUE_TEMPLATE/**
.github/PULL_REQUEST_TEMPLATE
README.md
AGENTS.md
*.md
```

If any runtime, workflow, package, deployment, UI, backend, or test file changes, the docs-only gate fails and the PR must follow normal manual review.

## Required GitHub repository setting

GitHub auto-merge must be enabled in repository settings:

```text
Settings -> General -> Pull Requests -> Allow auto-merge
```

Branch protection should still require normal status checks. For runtime code PRs, keep manual approval required.

## Recommended operating model

| PR type | Suggested flow |
|---|---|
| Documentation-only | Add `auto-merge-docs` label after quick review. GitHub merges when checks pass. |
| Runtime code | Require manual review and approval. Auto-merge can be enabled only after approval if desired. |
| Security-sensitive docs | Treat as runtime code and review manually. |

## Notes

This policy does not bypass branch protection. It only asks GitHub to enable auto-merge for labeled documentation-only PRs. If required checks or approvals are configured, GitHub still enforces them.
