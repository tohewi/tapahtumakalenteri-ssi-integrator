# AI Agent Development Guidelines

**Purpose:** Optimize token consumption and efficiency when using AI coding assistants (GitHub Copilot, ChatGPT, etc.) for development tasks in this repository.

**Last Updated:** 2026-02-08

---

## Repository Overview for AI Agents

This is a **shooting competition management system** with two main components:
1. **Web application** (scoring-ui + scoring-proxy) for scoring and registration
2. **Admin tools** (scripts/) for creating competitions

**Key terminology:**
- **Cup:** A shooting competition event (e.g., "Kupittaa Cup 2026-02-08")
- **Match:** A specific discipline within a cup (Tarkkuus, Pika, Kuvio)
- **Squad:** A group of competitors assigned to shoot at the same time
- **SSI:** ShootNScoreIt, the external competition management system we integrate with

---

## Token Optimization Principles

### 1. **Minimize Context Window**

AI agents load files into their context window. Smaller context = fewer tokens = faster responses.

**✅ Good practices:**
```
# Specific file + specific task
"In scoring-proxy/lib/ssi-client.js, add retry logic to the graphql() method"

# Specific line range
"In server.js lines 200-250, refactor the login endpoint"
```

**❌ Bad practices:**
```
# Too broad - loads entire repo
"Add retry logic to API calls"

# Vague location - loads multiple files
"Fix the authentication"
```

### 2. **Use Descriptive Names**

Self-documenting code reduces the need for agents to search for context.

**✅ Good:**
```javascript
function createKupittaaCupWithMatches(cupDate, venueConfig) {
  const cup = await createCup(cupDate);
  const matches = await createMatchesForCup(cup.id, ['tarkkuus', 'pika', 'kuvio']);
  return { cup, matches };
}
```

**❌ Bad:**
```javascript
function proc(d, c) {
  const x = await crt(d);
  const m = await crtM(x.i, ['t', 'p', 'k']);
  return { x, m };
}
```

### 3. **Keep Files Small and Focused**

**Target:** 100-200 lines per file  
**Maximum:** 300 lines per file  
**Current issue:** `scoring-proxy/server.js` is 900 lines (split recommended)

**Benefits:**
- Agent loads only relevant code
- Easier to reason about
- Reduced token consumption

### 4. **Single Responsibility Principle**

Each module should do one thing well.

**✅ Current good examples:**
```
scoring-proxy/lib/email.js        # Only email operations
scoring-ui/src/crypto.js          # Only encryption
```

**❌ Current issues:**
```
scoring-proxy/server.js           # Does everything: routing, auth, scoring, email, etc.
```

### 5. **Explicit Over Implicit**

Make dependencies and behavior explicit.

**✅ Good:**
```javascript
import { SCORE_ZONES } from './constants.js';

function validateScore(score) {
  if (!SCORE_ZONES.includes(score)) {
    throw new Error(`Invalid score: ${score}. Must be one of: ${SCORE_ZONES.join(', ')}`);
  }
}
```

**❌ Bad:**
```javascript
// Agent must search the codebase to find valid values
function validateScore(score) {
  if (!isValid(score)) {
    throw new Error('Invalid score');
  }
}
```

---

## Repository Structure Guide

### Current Structure (as of 2026-02-08)

```
├── scoring-ui/              # React frontend
│   ├── src/
│   │   ├── App.jsx          # Main app (500 lines) - STATE MACHINE
│   │   ├── api.js           # Scoring API client
│   │   ├── register-api.js  # Registration API client
│   │   ├── crypto.js        # Encryption utilities
│   │   └── components/      # UI components
│   │       ├── LoginScreen.jsx
│   │       ├── ScoringForm.jsx
│   │       ├── RegisterPage.jsx
│   │       └── (others)
│   └── package.json
│
├── scoring-proxy/           # Express backend
│   ├── server.js            # All endpoints (900 lines) - MONOLITHIC
│   ├── lib/
│   │   ├── ssi-client.js    # SSI GraphQL + web scraping
│   │   └── email.js         # Email via Resend API
│   └── package.json
│
├── scripts/                 # PowerShell admin tools (web scraping)
│   └── New-KupittaaCup.ps1  # Legacy cup creation
│
├── scripts-graphql/         # PowerShell admin tools (GraphQL)
│   ├── New-KupittaaCup.ps1  # Modern cup creation
│   └── lib/                 # GraphQL utilities
│
└── config/
    └── kupittaa-cup-config.yml  # Cup templates and defaults
```

### Planned Structure (after refactoring)

See `docs/refactoring-plan.md` for complete details. Summary:

```
├── packages/
│   ├── ssi-sdk/             # Shared SSI operations (NEW)
│   ├── scoring-service/     # Scoring logic (EXTRACTED)
│   ├── registration-service/ # Registration logic (EXTRACTED)
│   └── cup-management-service/ # Cup creation (UNIFIED)
│
└── apps/
    └── scoring-ui/          # Frontend (REFACTORED)
```

---

## Common Development Tasks

### Task 1: Add New API Endpoint

**Current process (before refactoring):**

1. **Locate:** Find relevant section in `scoring-proxy/server.js`
2. **Add endpoint:**
   ```javascript
   app.get('/api/new-endpoint', async (req, res) => {
     // Implementation
   });
   ```
3. **Update UI:** Add API call in `scoring-ui/src/api.js`

**Agent-optimized prompt:**
```
In scoring-proxy/server.js, add a new GET endpoint at /api/matches/:id/results 
that returns match results from SSI. Use the existing ssiClient.graphql() pattern 
for consistency. Then update scoring-ui/src/api.js to add a getMatchResults() 
function that calls this endpoint.
```

**Tokens consumed:** ~3,500 (loads entire server.js)

**After refactoring:**

**Agent-optimized prompt:**
```
In packages/scoring-service/src/routes/matches.js, add GET /results endpoint 
that queries match results using ssi-sdk. Then update apps/scoring-ui/src/services/scoring-api.js 
to add getMatchResults() function.
```

**Tokens consumed:** ~800 (loads only matches.js + scoring-api.js)

### Task 2: Update Score Validation Rules

**Current process:**

1. **Update UI:** Modify `SCORE_ZONES` in `scoring-ui/src/App.jsx`
2. **Update proxy:** Modify `ZONES` in `scoring-proxy/server.js`
3. **Risk:** Easy to miss one location → inconsistency

**Agent-optimized prompt (current):**
```
Update SCORE_ZONES in scoring-ui/src/App.jsx and ZONES in scoring-proxy/server.js 
to add a new score zone 'D' (disqualification) with 0 points.
```

**Tokens consumed:** ~4,000 (loads both large files)

**After refactoring:**

**Agent-optimized prompt:**
```
In packages/ssi-sdk/src/constants.js, add 'D' to SCORE_ZONES with 0 points.
```

**Tokens consumed:** ~200 (loads only constants.js)

### Task 3: Fix Email Template

**Current process:**

1. **Locate:** Find email template in `scoring-proxy/lib/email.js`
2. **Modify:** Update HTML/text template
3. **Context needed:** Must understand registration flow in `server.js`

**Agent-optimized prompt (current):**
```
Update the registration confirmation email template in scoring-proxy/lib/email.js 
to include the squad start time.
```

**Tokens consumed:** ~3,200 (loads server.js for context + email.js)

**After refactoring:**

**Agent-optimized prompt:**
```
In packages/registration-service/src/email/templates/confirmation.js, 
add squad start time to the email template.
```

**Tokens consumed:** ~150 (loads only template file)

### Task 4: Create New Cup Creation Script

**Current process:**

1. **Choose approach:** scripts/ (web scraping) or scripts-graphql/ (GraphQL)
2. **Copy existing script:** Duplicate ~400 lines
3. **Modify:** Change cup configuration
4. **Risk:** Duplication, divergence from original

**Agent-optimized prompt (current):**
```
Create a new script scripts-graphql/New-SpecialCup.ps1 based on 
New-KupittaaCup.ps1 that creates a cup with 5 matches instead of 3.
```

**Tokens consumed:** ~5,000 (loads existing script as reference)

**After refactoring:**

**Agent-optimized prompt:**
```
In packages/cup-management-service/src/commands/create-cup.js, 
add support for a 'special' cup type with 5 matches by updating the 
CUP_TEMPLATES constant.
```

**Tokens consumed:** ~600 (loads only command file)

---

## Agent Instruction Templates

### For Feature Development

```
Context: [Component/service name]
Task: [Specific feature to add]
Files: [Exact file paths if known]
Constraints: [Any limitations or requirements]
Testing: [How to verify the change]

Example:
Context: scoring-service
Task: Add validation to prevent negative scores
Files: packages/scoring-service/src/validation/score-validator.js
Constraints: Must use SCORE_ZONES from ssi-sdk
Testing: Run npm test in scoring-service package
```

### For Bug Fixes

```
Bug: [Description of the issue]
Location: [File and approximate line number]
Expected: [What should happen]
Actual: [What currently happens]
Context: [Any relevant background]

Example:
Bug: Registration email not sent when squad is full
Location: scoring-proxy/lib/email.js, sendRegistrationConfirmation function
Expected: Email sent with waitlist information
Actual: Email not sent at all
Context: Squad capacity check happens before email send
```

### For Refactoring

```
Current: [Current implementation description]
Target: [Desired implementation]
Scope: [Which files/modules are affected]
Strategy: [How to approach the refactoring]
Validation: [How to ensure nothing breaks]

Example:
Current: Score zones hardcoded in App.jsx and server.js
Target: Single source of truth in ssi-sdk/constants.js
Scope: scoring-ui/src/App.jsx, scoring-proxy/server.js
Strategy: 1) Create constants.js 2) Update UI to import 3) Update proxy to import
Validation: Run full test suite, verify scoring still works
```

---

## Code Review Checklist for AI-Generated Code

When reviewing code from AI agents, check:

### ✅ Token Efficiency

- [ ] New files are under 300 lines
- [ ] No duplicated constants or logic
- [ ] Clear module boundaries
- [ ] Descriptive function/variable names
- [ ] Self-documenting code (minimal comments needed)

### ✅ Correctness

- [ ] Follows existing patterns in codebase
- [ ] Error handling is comprehensive
- [ ] Edge cases are considered
- [ ] Tests are included (or updated)
- [ ] No security vulnerabilities

### ✅ Integration

- [ ] Uses shared libraries (ssi-sdk) when available
- [ ] Follows API contracts between services
- [ ] Environment variables are properly configured
- [ ] Dependencies are correctly declared

### ✅ Documentation

- [ ] Function/class JSDoc comments (if complex)
- [ ] README updated (if behavior changed)
- [ ] API documentation updated (if endpoints changed)

---

## Anti-Patterns to Avoid

### 1. **God Object / God Class**

**❌ Don't:**
```javascript
// scoring-proxy/server.js (900 lines)
class Server {
  setupRoutes() { /* 200 lines */ }
  handleAuth() { /* 100 lines */ }
  handleScoring() { /* 200 lines */ }
  handleRegistration() { /* 150 lines */ }
  handleReporting() { /* 150 lines */ }
  // ... etc
}
```

**✅ Do:**
```javascript
// scoring-service/src/index.js
import authRoutes from './routes/auth.js';
import scoringRoutes from './routes/scoring.js';

app.use('/auth', authRoutes);      // routes/auth.js (100 lines)
app.use('/scoring', scoringRoutes); // routes/scoring.js (120 lines)
```

### 2. **Magic Numbers / Magic Strings**

**❌ Don't:**
```javascript
if (score === 'X' || score === '10') {
  points = 10;
} else if (score === '9') {
  points = 9;
}
// ... etc (repeated across multiple files)
```

**✅ Do:**
```javascript
import { ZONE_POINTS } from '@ssi-integrator/ssi-sdk';

const points = ZONE_POINTS[score];
```

### 3. **Implicit Dependencies**

**❌ Don't:**
```javascript
// Relies on global state or side effects
function submitScore(competitorId, score) {
  // Uses global ssiClient (where is it defined?)
  return ssiClient.submit(competitorId, score);
}
```

**✅ Do:**
```javascript
function submitScore(ssiClient, competitorId, score) {
  return ssiClient.submit(competitorId, score);
}

// Or use dependency injection
class ScoringService {
  constructor(ssiClient) {
    this.ssiClient = ssiClient;
  }

  submitScore(competitorId, score) {
    return this.ssiClient.submit(competitorId, score);
  }
}
```

### 4. **Mixed Concerns**

**❌ Don't:**
```javascript
// Route handler with business logic, validation, and data access
app.post('/api/register', async (req, res) => {
  // Validation (30 lines)
  if (!req.body.email) { /* ... */ }
  if (!req.body.name) { /* ... */ }
  
  // Business logic (50 lines)
  const squad = await findAvailableSquad(/* ... */);
  const participant = await createParticipant(/* ... */);
  
  // Email sending (20 lines)
  await sendEmail(/* ... */);
  
  res.json(result);
});
```

**✅ Do:**
```javascript
// Route handler delegates to service
app.post('/api/register', async (req, res) => {
  const result = await registrationService.register(req.body);
  res.json(result);
});

// Service orchestrates business logic
class RegistrationService {
  async register(data) {
    this.validator.validate(data);
    const squad = await this.squadFinder.findAvailable(data);
    const participant = await this.participantCreator.create(data);
    await this.emailService.sendConfirmation(participant, squad);
    return { participant, squad };
  }
}
```

---

## Testing Guidelines for AI Agents

### Test Structure

Each service should have its own test suite:

```
packages/scoring-service/
├── src/
│   └── (source files)
└── tests/
    ├── unit/           # Test individual functions
    ├── integration/    # Test API endpoints
    └── fixtures/       # Mock data
```

### Agent Prompt for Test Creation

```
Create unit tests for [function/module name] in [service name].

Requirements:
- Use existing test framework (Vitest)
- Follow AAA pattern (Arrange, Act, Assert)
- Test happy path and error cases
- Mock external dependencies (SSI API, email)
- Aim for 80%+ coverage

Example test file structure:
describe('[Function name]', () => {
  describe('when [scenario]', () => {
    it('should [expected behavior]', () => {
      // Test implementation
    });
  });
});
```

### Test Naming Convention

```javascript
// ✅ Good: Descriptive, scenario-based
describe('ScoringService.submitScore', () => {
  describe('when competitor ID is valid', () => {
    it('should submit score to SSI and return confirmation', async () => {
      // ...
    });
  });

  describe('when competitor ID is invalid', () => {
    it('should throw InvalidCompetitorError', async () => {
      // ...
    });
  });
});

// ❌ Bad: Vague, non-descriptive
describe('submitScore', () => {
  it('works', () => {
    // ...
  });

  it('fails', () => {
    // ...
  });
});
```

---

## Performance Considerations

### Token Budget per Task

Estimate token consumption before starting:

| Task Type | Current | After Refactoring | Savings |
|-----------|---------|-------------------|---------|
| Add endpoint | 3,500 tokens | 800 tokens | 77% |
| Update constants | 4,000 tokens | 200 tokens | 95% |
| Fix bug | 3,000 tokens | 600 tokens | 80% |
| Add feature | 5,000 tokens | 1,200 tokens | 76% |

**Rule of thumb:** If your prompt requires loading more than 3 files or more than 500 lines, consider splitting the task.

### File Size Guidelines

| Size | Action |
|------|--------|
| < 100 lines | ✅ Ideal |
| 100-200 lines | ✅ Good |
| 200-300 lines | ⚠️ Consider splitting |
| 300-500 lines | 🔴 Should split |
| 500+ lines | 🔴 Must split |

### Caching Context

AI agents cache context between requests. Optimize by:

1. **Batch related changes:** Multiple edits to same file in one session
2. **Consistent naming:** Agent learns patterns faster
3. **Follow conventions:** Less explanation needed

---

## Migration Guide

As the codebase is refactored (see `docs/refactoring-plan.md`), update your prompts:

### Phase 1: Shared SDK (Current)

**Old location:**
```
scoring-ui/src/App.jsx (SCORE_ZONES constant)
```

**New location:**
```
packages/ssi-sdk/src/constants.js (SCORE_ZONES export)
```

**Agent prompt update:**
```diff
- "Update SCORE_ZONES in scoring-ui/src/App.jsx"
+ "Update SCORE_ZONES in packages/ssi-sdk/src/constants.js"
```

### Phase 2: Microservices (Future)

**Old location:**
```
scoring-proxy/server.js (lines 200-400, scoring endpoints)
```

**New location:**
```
packages/scoring-service/src/routes/scoring.js
```

**Agent prompt update:**
```diff
- "In server.js, update the POST /api/competitor/:id/score endpoint"
+ "In packages/scoring-service/src/routes/scoring.js, update POST /score endpoint"
```

---

## Debugging with AI Agents

### Effective Bug Reports

When asking AI to debug:

```
Issue: [One-line summary]
Location: [File:line or component]
Reproduction: [Steps to reproduce]
Expected: [What should happen]
Actual: [What happens instead]
Logs: [Relevant log output]
Context: [Any recent changes or related issues]

Example:
Issue: Registration confirmation email not sent
Location: scoring-proxy/lib/email.js:42
Reproduction: 
  1. Submit registration via /api/register/submit
  2. Check email inbox
Expected: Confirmation email with squad info
Actual: No email received, no error logged
Logs:
  POST /api/register/submit 200 1234ms
  "Registration successful" (but no email log)
Context: Email worked yesterday, Resend API key unchanged
```

### Logs to Include

When debugging with AI agents, provide:

1. **Server logs:** Error messages, stack traces
2. **Request/response:** API calls that failed
3. **Environment:** Node version, OS, relevant config
4. **Recent changes:** Git commits since last working version

---

## Best Practices Summary

### DO ✅

- Use specific file paths in prompts
- Keep files under 300 lines
- Use descriptive names for everything
- Create single-purpose modules
- Write self-documenting code
- Test in isolation
- Follow existing patterns
- Use shared libraries (ssi-sdk)

### DON'T ❌

- Make vague prompts ("fix the app")
- Create 500+ line files
- Use abbreviations or cryptic names
- Mix concerns in one file
- Duplicate code/constants
- Skip tests
- Reinvent existing utilities
- Hardcode configuration

---

## Future Enhancements

As the codebase matures, consider:

1. **API documentation:** OpenAPI/Swagger for agent reference
2. **Type definitions:** TypeScript for better inference
3. **Code generation:** Templates for common patterns
4. **Automated refactoring:** Scripts to split large files
5. **Metrics:** Track token consumption per task

---

## Resources

- [Main refactoring plan](refactoring-plan.md)
- [User guide](user-guide.md)
- [Architecture documentation](scoring-architecture.md)
- [API reference](ssi-admin-operations.md)

---

**Document Metadata:**
- Author: GitHub Copilot
- Version: 1.0
- Last Updated: 2026-02-08
- Review Status: Awaiting Approval
