// ============================================================
// Feature Flags — V7.0 Gradual Rollout
//
// Controls whether requests use V7 auth (Redis-backed dual
// session) or legacy auth (in-memory Map). Allows gradual
// rollout by percentage and per-user opt-in.
// ============================================================

import crypto from 'node:crypto'

// Check if V7 auth should be used for this request
export function shouldUseV7Auth(req) {
  // Master kill switch — if explicitly disabled
  if (process.env.ENABLE_V7_AUTH === 'false') return false

  // Master enable — if explicitly enabled for all
  if (process.env.ENABLE_V7_AUTH === 'true') return true

  // Gradual rollout by percentage (0–100)
  const rollout = parseInt(process.env.V7_AUTH_ROLLOUT_PERCENTAGE, 10) || 0
  if (rollout === 0) return false
  if (rollout >= 100) return true

  // Hash-based consistent assignment: same user always gets same result
  const userId = req.body?.email || req.cookies?.ssi_session || req.ip
  if (!userId) return false

  const hash = crypto.createHash('md5').update(userId).digest('hex')
  const numeric = parseInt(hash.substring(0, 8), 16)
  return (numeric % 100) < rollout
}

// Check if V7 auth is enabled at all (for startup logging)
export function isV7AuthEnabled() {
  return process.env.ENABLE_V7_AUTH === 'true' ||
    (parseInt(process.env.V7_AUTH_ROLLOUT_PERCENTAGE, 10) || 0) > 0
}
