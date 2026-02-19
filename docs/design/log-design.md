# Log Design

## Purpose

This document defines how logging verbosity is controlled in the scoring proxy.

## Log Level Source of Truth

Logging level is controlled **only** by `LOG_LEVEL`.

`NODE_ENV` is not used to enable/disable debug logging.

Supported levels (least to most verbose):

- `error`
- `warn`
- `info`
- `debug`
- `verbose`

## Default Behavior

Runtime behavior in `scoring-proxy/lib/logger.js`:

- If `LOG_LEVEL` is missing: default to `debug`
- If `LOG_LEVEL` is invalid: fallback to `info`

Environment defaults:

- **Production (Render):** `LOG_LEVEL=info` (set in `render.yaml`)
- **Development (local):** default effective level is `debug` when `LOG_LEVEL` is not set

## Operational Examples

- Local troubleshooting:

  ```bash
  LOG_LEVEL=debug node server.js
  ```

- Reduce verbosity in local/dev run:

  ```bash
  LOG_LEVEL=info node server.js
  ```

- Temporary production troubleshooting:
  1. Set `LOG_LEVEL=debug`
  2. Reproduce issue
  3. Restore `LOG_LEVEL=info`

## Notes

- Existing code still has some direct `console.*` usage. Prefer routing new logging through `lib/logger.js` for consistent level handling.
