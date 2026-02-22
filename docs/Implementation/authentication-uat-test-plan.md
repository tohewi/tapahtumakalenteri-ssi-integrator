# Authentication UAT Test Plan

## Scope

This UAT plan validates authentication behavior across protected domains:

- Scoring (mobile + tablet)
- Manage
- Report/Summary

Focus areas:

- explicit login only (no auto-login)
- mount-time auth bootstrap + restoring gate behavior
- session timeout handling
- scope isolation between domains
- state restoration after re-login

## Preconditions

- Test user has access to required SSI domains.
- Application deployed and reachable.
- Browser localStorage/cookies can be cleared between cases.

## Test Use Cases

| ID | Use case | Steps | Expected result |
|---|---|---|---|
| AUTH-UAT-01 | Fresh login (happy path) | 1) Open protected route (e.g. `#/scoring`) 2) Enter valid credentials 3) Click Login | Login succeeds and feature home view opens. |
| AUTH-UAT-02 | Reload with valid session | 1) Login to scoring and navigate to deep state (cup/match/squad/scoring) 2) Press browser reload | App shows brief restoring/loading state (not login flash) and returns to prior state. |
| AUTH-UAT-03 | Reload without session | 1) Clear cookies/session or wait for expiry 2) Reload protected route | App lands on login after bootstrap check. |
| AUTH-UAT-04 | No auto-login with remember-me | 1) Enable remember me and login 2) Logout 3) Reload | Login form may be pre-filled, but user is not auto-authenticated until Login is clicked. |
| AUTH-UAT-05 | Session expiry during usage | 1) Login and open protected view 2) Wait until TTL expires 3) Trigger API action | User gets session-expired message, is returned to login, and can re-login. |
| AUTH-UAT-06 | Restore after re-login | 1) From AUTH-UAT-05 click Login again | Previous navigation/data context is restored according to domain behavior. |
| AUTH-UAT-07 | Scope mismatch isolation | 1) Login to one domain scope (e.g. scoring) 2) Navigate to another protected domain (e.g. manage) and trigger API | Scope mismatch handled (access blocked), user asked to login for target domain scope. |
| AUTH-UAT-08 | Logout persistence check | 1) Login 2) Logout 3) Reload | User remains on login; protected content is not shown. |

## Execution Notes

- Run AUTH-UAT-01..08 for both mobile and tablet scoring.
- Record pass/fail with timestamp and environment URL.
- Capture screenshot/video for any login flash, wrong redirect, or missing restoration.
