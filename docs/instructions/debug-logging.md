# Debug Logging

This document explains how to enable and use debug logging in the SSI Scoring application.

## Overview

The application includes extensive debug logging that helps diagnose issues with SSI API integration, authentication, and data processing. Log verbosity is controlled by the `LOG_LEVEL` environment variable.

`NODE_ENV` is **not** used to decide whether debug logs are emitted.

## Log Level Model

Supported levels:

- `error`
- `warn`
- `info`
- `debug`
- `verbose`

Default behavior:

- If `LOG_LEVEL` is unset, runtime default is `debug`
- If `LOG_LEVEL` is invalid, runtime fallback is `info`
- Production deployment default is `info` via Render environment configuration (`render.yaml`)

## Enabling Debug Logging

### Local Development

Debug logging is enabled by default locally (runtime default `LOG_LEVEL=debug` when not explicitly set).

To run the server in development mode:

```bash
cd scoring-proxy
node server.js
```

Or explicitly set `LOG_LEVEL`:

```bash
LOG_LEVEL=debug node server.js
```

### Production Environment (Render)

To enable debug logging in production:

1. Go to your Render Dashboard
2. Navigate to the `ssi-scoring` service
3. Go to **Environment** tab
4. Add or modify the environment variable:
   - Key: `LOG_LEVEL`
   - Value: `debug`
5. Click **Save Changes**
6. The service will redeploy with debug logging enabled

⚠️ **Warning**: Debug logging in production will log sensitive operation details to the console. Only enable it temporarily for troubleshooting, and disable it after you're done.

## Log Output Locations

### Local Development
- Logs appear in the terminal where you ran `node server.js`

### Render Production
- Go to **Logs** tab in the Render Dashboard for the `ssi-scoring` service
- Filter by log level or search for specific keywords

## Debug Log Categories

The application uses prefixed log messages to indicate different subsystems:

| Prefix | Description | Example |
|--------|-------------|---------|
| `[manage]` | Management operations (add competitors, assign squads) | `[manage] Adding "Jari Salo" to cup 12345` |
| `[search-and-add]` | SSI search-and-add participant flow | `[search-and-add] POST search name=Jari Salo` |
| `[cup-approve]` | Cup participant approval flow | `[cup-approve] Found: Jari Salo → participant 67890` |
| `[squad-edit]` | Squad assignment operations | `[squad-edit] GET /event/participant/93/12345/edit/` |
| `[auth]` | Authentication and session management | `[auth] Login successful for user@example.com` |

## Common Debug Scenarios

### Troubleshooting "Add to Cup" Failures

When adding a competitor to the Cup fails, you'll see logs like:

```
[manage] Adding "Jari Salo" to cup 12345
[search-and-add] POST search name=Jari Salo to https://ssi.url/...
[search-and-add] Search response: 200
[search-and-add] "no results" — user not found
[manage] Cup add result: user_not_found
[manage] Failed to add "Jari Salo" to cup: user_not_found
```

This indicates the user was not found in SSI's database.

### Successful Add to Cup Flow

A successful operation looks like:

```
[manage] Adding "Jari Salo" to cup 12345
[search-and-add] POST search name=Jari Salo
[search-and-add] Found register link: https://ssi.url/.../register/
[search-and-add] Register GET → 302 redirect
[manage] Cup add result: Participant added
[cup-approve] GET https://ssi.url/.../participants/ (looking for "Jari Salo")
[cup-approve] Found: Jari Salo → participant 67890
[cup-approve] Current status: "Pending"
[cup-approve] GET toggle-status: https://ssi.url/.../toggle-status/...
[cup-approve] New status: "Approved"
[manage] Cup approve result: Approved
```

## Disabling Debug Logging

To disable debug logging:

1. Set `LOG_LEVEL=info` (or stricter, e.g. `warn`)
2. Restart the server

In Render:
1. Set `LOG_LEVEL` environment variable to `info`
2. Redeploy the service

## Log Retention

- **Local development**: Logs are not persisted; they only appear in the terminal
- **Render production**: Logs are retained for 7 days for Starter plan, longer for paid plans

## Best Practices

1. **Only enable debug logging when troubleshooting** - it adds overhead and may expose sensitive information
2. **Monitor log volume** - debug logging can significantly increase log output
3. **Use log search** - in Render Dashboard, use the search box to filter logs by keywords like `[manage]`, error messages, or user names
4. **Temporary debugging** - restore production log level (`LOG_LEVEL=info`) after troubleshooting

## Related Documentation

- [Log Design](../design/log-design.md) - Log level policy and environment defaults
- [Session Handling](./session-handling.md) - Understanding authentication flows
- [Management API](./management-api.md) - API endpoints for Cup and Squad management (if exists)
