// ============================================================
// V7 Session Compatibility Layer
//
// Maps V7 dual-session structure to the legacy flat format
// so existing routes (scoring, management, staffing, reports)
// work without modification.
//
// Legacy routes expect: req.ssiSession.jwt, .refreshToken, .ssiCookies, .apiKey
// V7 sessions have:     req.ssiSession.userSSI.jwt, .adminSSI.jwt, etc.
// ============================================================

// Convert a V7 session to the flat legacy format that existing routes expect.
// The returned object acts as a view — mutations to jwt/refreshToken are
// written back to the V7 session's userSSI so token refresh persists.
export function toLegacySession(v7Session) {
  if (!v7Session?.userSSI) return null

  // Create a proxy-like object that maps legacy field accesses to V7 fields
  const legacy = {
    // Direct mappings for read
    get jwt() { return v7Session.userSSI.jwt },
    set jwt(val) { v7Session.userSSI.jwt = val },
    get refreshToken() { return v7Session.userSSI.refreshToken },
    set refreshToken(val) { v7Session.userSSI.refreshToken = val },
    get ssiCookies() { return v7Session.userSSI.cookies },
    get apiKey() { return v7Session.userSSI.apiKey },
    get scope() { return v7Session.scope },
    get createdAt() { return v7Session.createdAt },
    get lastUsed() { return v7Session.lastUsed },

    // V7-specific (available to routes that are V7-aware)
    get _v7() { return true },
    get _userSSI() { return v7Session.userSSI },
    get _adminSSI() { return v7Session.adminSSI },
    get _userId() { return v7Session.userId },
  }

  return legacy
}
