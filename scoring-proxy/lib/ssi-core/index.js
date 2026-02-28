// ============================================================
// SSI Core Library - Barrel Export
//
// Domain modules re-export from client.js for now.
// Route files should import from the specific domain module
// (e.g., import { ssiGraphQL } from '../lib/ssi-core/graphql.js')
// rather than from this barrel or from the compat shim.
// ============================================================

// Constants
export * from './constants.js'

// Domain modules
export * from './graphql.js'
export * from './scoring.js'
export * from './participants.js'
export * from './management.js'
export * from './http-helpers.js'
// NOTE: seed-import.js is NOT re-exported here.
// Import directly: import { ... } from '../lib/ssi-core/seed-import.js'
