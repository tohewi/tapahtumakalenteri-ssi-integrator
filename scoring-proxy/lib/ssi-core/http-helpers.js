// ============================================================
// SSI Core — HTTP Helpers Domain
// Re-exports from client.js for domain-specific imports.
// ============================================================

export { ssiFetchPage } from './client.js'

// Note: parseCookies and formatCookies are internal (not exported from client.js).
// They will be exported here once the actual code is moved from client.js
// to the domain modules (Phase 2 of RFR1).
