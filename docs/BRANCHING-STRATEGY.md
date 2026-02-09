# Branching Strategy and Release Process

This document describes the branching strategy, release process, and branch protection rules for the tapahtumakalenteri-ssi-integrator project.

## Branching Strategy: GitHub Flow

We use **GitHub Flow**, a simple and effective branching strategy suitable for continuous deployment:

```
main (production) ─┬─ feature/new-feature ──┐
                   │                         │
                   ├─ fix/bug-fix ──────────┤
                   │                         │
                   └─────────────────────────┘
                            (PR merge)
```

### Key Principles

1. **`main` branch is always deployable** - Every commit on `main` represents production-ready code
2. **Feature branches** - All new work happens in feature branches
3. **Pull Requests** - All changes must go through PR review before merging to `main`
4. **Continuous Deployment** - Merging to `main` automatically deploys to production

## Branch Naming Convention

Use descriptive branch names with prefixes:

- `feature/` - New features (e.g., `feature/add-export-button`)
- `fix/` - Bug fixes (e.g., `fix/login-timeout`)
- `refactor/` - Code refactoring (e.g., `refactor/split-routes`)
- `docs/` - Documentation updates (e.g., `docs/update-readme`)
- `test/` - Test additions/improvements (e.g., `test/add-scoring-tests`)

## Workflow

### 1. Create a Feature Branch

```bash
# Start from main
git checkout main
git pull origin main

# Create and switch to feature branch
git checkout -b feature/my-new-feature
```

### 2. Develop and Commit

```bash
# Make changes
git add .
git commit -m "Add new feature"

# Push to remote
git push origin feature/my-new-feature
```

### 3. Create Pull Request

1. Go to GitHub repository
2. Click "Pull requests" → "New pull request"
3. Select your feature branch
4. Fill in PR template with:
   - Clear description of changes
   - Testing performed
   - Any deployment notes
5. Request review from team members
6. **Automatic preview environment** - GitHub Actions creates a preview deployment
   - Check PR comments for preview URL
   - Share preview link with reviewers
   - See [PR Preview Deployments](./PR-PREVIEW-DEPLOYMENTS.md) for details

### 4. Code Review

- At least one approval required before merge
- Address review feedback
- Push additional commits as needed
- CI must pass (tests, linting, security audit)
- **Test in preview environment** - Use the preview URL to validate changes
- Preview environment updates automatically with each commit

### 5. Merge to Main

Once approved and CI passes:

```bash
# Use "Squash and merge" or "Create a merge commit" on GitHub
# Delete feature branch after merge
# Preview environment is automatically deleted
```

### 6. Automatic Deployment

- Merging to `main` triggers automatic deployment to production via Render
- Preview environment is automatically cleaned up
- Monitor deployment in Render dashboard
- Verify production functionality after deployment

## Branch Protection Rules

The `main` branch should be protected with the following rules:

### Required Settings

1. **Require pull request before merging**
   - ✅ Require approvals: 1
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require review from Code Owners (if CODEOWNERS file exists)

2. **Require status checks before merging**
   - ✅ Require branches to be up to date before merging
   - ✅ Status checks that must pass:
     - `test-audit-build` (CI workflow)

3. **Require conversation resolution before merging**
   - ✅ All conversations must be resolved

4. **Do not allow bypassing the above settings**
   - ✅ Include administrators

5. **Restrictions** (Optional, for larger teams)
   - Restrict who can push to matching branches
   - Specify people/teams who can merge

### Configuring Branch Protection

1. Go to repository Settings → Branches
2. Click "Add branch protection rule"
3. Branch name pattern: `main`
4. Configure settings as listed above
5. Click "Create" or "Save changes"

## Release Process

### Production Releases

With GitHub Flow, every merge to `main` is a production release:

1. **Create Release Notes** (Optional but recommended)
   ```bash
   # Tag the release
   git tag -a v1.2.0 -m "Release version 1.2.0"
   git push origin v1.2.0
   ```

2. **GitHub Release** (Optional)
   - Go to "Releases" → "Draft a new release"
   - Choose the tag (e.g., `v1.2.0`)
   - Add release notes:
     - New features
     - Bug fixes
     - Breaking changes (if any)
     - Contributors
   - Publish release

### Hotfix Process

For urgent production fixes:

```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b fix/critical-bug

# Make fix and test thoroughly
git add .
git commit -m "Fix critical bug"
git push origin fix/critical-bug

# Create PR with "urgent" label
# Get expedited review
# Merge and deploy immediately
```

## Rollback Procedure

If a deployment causes issues:

### Option 1: Revert Commit

```bash
# Identify problematic commit
git log --oneline

# Create revert PR
git checkout main
git pull origin main
git revert <commit-hash>
git push origin main

# This triggers automatic re-deployment
```

### Option 2: Manual Render Rollback

1. Go to Render dashboard
2. Select the service
3. Click "Manual Deploy" → "Deploy previous version"
4. Fix issue in a new branch and merge when ready

## CI/CD Pipeline

Our CI/CD pipeline includes two workflows:

### 1. Main CI/CD Workflow (`ci-deploy.yml`)

Runs on:
- **Every pull request** - Runs tests, audits, and builds
- **Every push to main** - Runs tests + deploys to production

**Pipeline Stages:**
1. **Install** - Install dependencies for UI and proxy
2. **Test** - Run unit tests for both components
3. **Audit** - Security vulnerability scan
4. **Build** - Build production assets
5. **Deploy** - Trigger Render deployment (main branch only)

### 2. Preview Environment Workflow (`pr-preview.yml`)

Runs on:
- **PR opened/reopened** - Creates preview service on Render
- **PR updated (new commits)** - Triggers preview deployment
- **PR closed/merged** - Deletes preview service

**Preview Features:**
- Unique preview URL per PR (format: `ssi-scoring-pr-{NUMBER}`)
- Automatic deployment on every commit
- Posted as PR comment with preview link
- Automatic cleanup when PR closes

See [PR Preview Deployments](./PR-PREVIEW-DEPLOYMENTS.md) for complete details.

### Pipeline Requirements

All stages must pass for PR to be mergeable:
- ✅ UI tests pass
- ✅ Proxy tests pass
- ✅ No high-severity vulnerabilities
- ✅ Build succeeds
- ✅ Preview environment created (informational)

## Best Practices

1. **Keep branches short-lived** - Merge within 1-3 days to avoid conflicts
2. **Small, focused PRs** - Easier to review and less risky to deploy
3. **Write descriptive commit messages** - Follow conventional commits if possible
4. **Test locally first** - Run tests and linting before pushing
5. **Use preview environments** - Test changes in the PR preview before merging
6. **Update documentation** - Keep docs in sync with code changes
7. **Monitor production** - Check logs and metrics after deployment
8. **Communicate** - Announce significant deploys to the team
9. **Share preview links** - Include preview URL in PR description for reviewers

## FAQ

### Q: Can I commit directly to main?

**A:** No. All changes must go through pull requests. This ensures:
- Code review
- Automated testing
- Preview environment validation
- Documentation
- Quality control

### Q: How do I access the preview environment for my PR?

**A:**
1. Open your pull request on GitHub
2. Check the PR comments for a comment from github-actions bot
3. Click the preview URL in the comment
4. Wait 30-60 seconds if the service is spinning up
5. Test your changes in the preview environment

### Q: What if CI fails on my PR?

**A:** 
1. Check the CI logs to identify the issue
2. Fix the issue in your branch
3. Push the fix
4. CI will run automatically
5. Preview environment will automatically redeploy

### Q: How do I keep my branch up to date with main?

**A:**
```bash
git checkout main
git pull origin main
git checkout feature/my-branch
git merge main  # or git rebase main
git push origin feature/my-branch
```

### Q: Can I merge my own PR?

**A:** Only if you have at least one approval and CI passes. Self-merging is allowed but discouraged for significant changes.

## Related Documentation

- [Contributing Guidelines](../CONTRIBUTING.md) - How to contribute to the project
- [Development Setup](../README.md) - Getting started with development
- [CI/CD Configuration](../.github/workflows/ci-deploy.yml) - Pipeline details

---

**Last Updated:** 2026-02-08  
**Version:** 1.0
