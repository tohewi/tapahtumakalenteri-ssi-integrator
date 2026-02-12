// ============================================================
// Session Configuration
// Centralized configuration for V7.0 session management
// ============================================================

const IS_PROD = process.env.NODE_ENV === 'production'

export const sessionConfig = {
  // Redis connection
  redis: {
    url: process.env.REDIS_URL || null,
    prefix: process.env.REDIS_PREFIX || 'ssi_sessions:',
    connectTimeout: 5000,
    maxRetriesPerRequest: 3,
  },

  // Session settings
  session: {
    secret: (() => {
      if (IS_PROD && !process.env.SESSION_SECRET) {
        throw new Error('SESSION_SECRET environment variable is required in production')
      }
      return process.env.SESSION_SECRET || 'dev-secret-change-in-production'
    })(),
    ttl: parseInt(process.env.SESSION_TTL, 10) || 8 * 60 * 60 * 1000, // 8 hours
    cookieName: 'ssi_session',
    cookiePath: '/api',
    secure: IS_PROD,
    sameSite: 'lax',
  },

  // SSI token refresh settings
  tokenRefresh: {
    // Refresh user SSI token when it expires within this window
    userRefreshWindow: 10 * 60 * 1000, // 10 minutes
    // Refresh admin SSI token when it expires within this window
    adminRefreshWindow: 10 * 60 * 1000, // 10 minutes
  },

  // Admin SSI credentials (loaded from environment)
  admin: {
    email: process.env.SSI_ADMIN_EMAIL || null,
    password: process.env.SSI_ADMIN_PASSWORD || null,
    apiKey: process.env.SSI_ADMIN_API_KEY || null,
  },

  // Scope-specific TTL overrides (in ms)
  scopeTTL: {
    staffing: 5 * 60 * 1000, // 5 minutes for staffing
  },
}

// Derive TTL for a given scope
export function getSessionTTLForScope(scope) {
  return sessionConfig.scopeTTL[scope] || sessionConfig.session.ttl
}
