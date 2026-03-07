// ============================================================
// Platform Routes — Main Router (thin orchestrator)
//
// Delegates to domain-specific sub-routers:
//   - auth.js       — register, login, logout, MFA, account profile
//   - tenants.js    — tenant CRUD
//   - disciplines.js — discipline CRUD + SSI registry
//   - templates.js  — match template CRUD + SSI seed import
//   - events.js     — scheduled events CRUD + SSI execute/search/import
//   - members.js    — tenant member management
//   - invitations.js — tenant invitations (protected + public)
//   - staffing.js   — event staffing roster + SSI sync
// ============================================================

import express from 'express'
import { requirePlatformAuth, requireTenantRole } from '../middleware/platform-auth.js'
import { mountAuthRoutes } from './platform/auth.js'
import { mountTenantRoutes } from './platform/tenants.js'
import { mountDisciplineRoutes } from './platform/disciplines.js'
import { mountTemplateRoutes } from './platform/templates.js'
import { mountEventRoutes } from './platform/events.js'
import { mountMemberRoutes } from './platform/members.js'
import { mountInvitationRoutes } from './platform/invitations.js'
import { mountStaffingRoutes } from './platform/staffing.js'

// ---- Router factory ----

export function createPlatformRouter({
  platformSignUpLimiter,
  platformLoginLimiter,
  platformPasswordResetLimiter,
  platformMutationLimiter,
  platformSsiLimiter,
  getAdminSession
}) {
  const router = express.Router()

  // Build a shared deps object passed to all mount functions
  const deps = {
    requirePlatformAuth,
    requireTenantRole,
    platformSignUpLimiter,
    platformLoginLimiter,
    platformPasswordResetLimiter,
    platformMutationLimiter,
    platformSsiLimiter,
    getAdminSession,
  }

  mountAuthRoutes(router, deps)
  mountTenantRoutes(router, deps)
  mountDisciplineRoutes(router, deps)
  mountTemplateRoutes(router, deps)
  mountEventRoutes(router, deps)
  mountMemberRoutes(router, deps)
  mountInvitationRoutes(router, deps)
  mountStaffingRoutes(router, deps)

  return router
}