// ============================================================
// Platform Routes — Tenant Invitations (protected + public)
// Mounted under /api/v1/platform by createPlatformRouter
// ============================================================

import { log } from '../../lib/logger.js'
import { AppError } from '../../lib/errors/AppError.js'
import { sendEmail } from '../../lib/email.js'
import {
  createTenantInvitation,
  getInvitationByToken,
  acceptTenantInvitation,
  listPendingInvitations,
  revokeTenantInvitation,
  getTenant,
  getPlatformSession,
  getAccount,
  createPlatformSession,
  authenticateAccount,
  createAccount,
  TENANT_ROLES,
  validateRoleAssignment,
} from '../../lib/db/platform-store.js'
import { PLATFORM_COOKIE, COOKIE_OPTIONS } from '../../middleware/platform-auth.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function mountInvitationRoutes(router, { requirePlatformAuth, requireTenantRole, platformMutationLimiter }) {

  // GET /api/v1/platform/tenants/:tenantId/invitations
  router.get('/tenants/:tenantId/invitations', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res) => {
    const invites = await listPendingInvitations(req.params.tenantId)
    res.json({ invitations: invites })
  })

  // POST /api/v1/platform/tenants/:tenantId/invitations
  router.post('/tenants/:tenantId/invitations', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
    const { email, roles } = req.body
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' })
    }
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: 'roles array is required (at least one role)' })
    }

    // Validate role names
    const invalidRoles = roles.filter(r => !TENANT_ROLES.includes(r))
    if (invalidRoles.length > 0) {
      return res.status(400).json({ error: `Invalid roles: ${invalidRoles.join(', ')}` })
    }

    // Enforce role assignment matrix — actor can only assign roles they're allowed to
    const { allowed, disallowed } = validateRoleAssignment(req.membership.roles, roles)
    if (!allowed) {
      return res.status(403).json({ error: `You cannot assign these roles: ${disallowed.join(', ')}. Your permissions do not allow it.` })
    }

    try {
      const { invitation, token } = await createTenantInvitation({
        tenantId: req.params.tenantId,
        email,
        roles,
        invitedBy: req.account.id,
      })

      // Send the email
      const origin = req.headers.origin || `https://${req.headers.host}`
      const inviteUrl = `${origin}/#/platform/invite/${token}`
      const tenant = await getTenant(req.params.tenantId)

      await sendEmail({
        to: email,
        subject: `Invitation to join ${tenant.name} on SSI TurRes Tools`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #0284c7;">You've been invited!</h2>
            <p><strong>${req.account.name}</strong> has invited you to join <strong>${tenant.name}</strong> on the SSI TurRes Tools platform.</p>
            <p>Click the link below to accept the invitation and set up your account:</p>
            <div style="margin: 30px 0;">
              <a href="${inviteUrl}" style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
            </div>
            <p style="color: #666; font-size: 0.9em;">This link will expire in 7 days.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="color: #999; font-size: 0.8em;">If the button doesn't work, copy and paste this URL into your browser:<br/>${inviteUrl}</p>
          </div>
        `
      })

      log.info(`[platform] Invitation created for ${email} by ${req.account.email} for tenant ${req.params.tenantId}`)
      res.status(201).json({ success: true, invitation: { ...invitation, token } })
    } catch (err) {
      log.error('[platform] Create invitation failed:', err.message)
      return next(new AppError('Failed to create invitation', 500, 'INTERNAL_ERROR'))
    }
  })

  // DELETE /api/v1/platform/tenants/:tenantId/invitations/:id
  router.delete('/tenants/:tenantId/invitations/:id', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
    try {
      const revoked = await revokeTenantInvitation(req.params.tenantId, req.params.id)
      if (!revoked) {
        return res.status(404).json({ error: 'Pending invitation not found' })
      }
      res.json({ success: true })
    } catch (err) {
      log.error('[platform] Revoke invitation failed:', err.message)
      return next(new AppError('Failed to revoke invitation', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // Public Invitation Endpoints (No auth required)
  // ============================================================

  // GET /api/v1/platform/invitations/:token
  router.get('/invitations/:token', async (req, res) => {
    const invite = await getInvitationByToken(req.params.token)
    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found, already used, or expired' })
    }
    res.json({ invitation: invite })
  })

  // POST /api/v1/platform/invitations/:token/accept
  // Requires user to be logged in to platform OR creates account inline if password/name provided
  router.post('/invitations/:token/accept', platformMutationLimiter, async (req, res, next) => {
    try {
      const invite = await getInvitationByToken(req.params.token)
      if (!invite) {
        return res.status(404).json({ error: 'Invitation not found, already used, or expired' })
      }

      let accountId
      let accountEmail
      let sessionId = req.cookies?.[PLATFORM_COOKIE]

      // Check if user is already logged in
      if (sessionId) {
        const session = await getPlatformSession(sessionId)
        if (session) {
          const account = await getAccount(session.accountId)
          if (account) {
            accountId = account.id
            accountEmail = account.email
          }
        }
      }

      // If not logged in, they must provide registration or login details
      if (!accountId) {
        const { password, name } = req.body
        if (!password) {
          return res.status(401).json({ error: 'Not authenticated and no password provided for registration/login' })
        }

        // Try to authenticate existing account with this email
        const authResult = await authenticateAccount(invite.email, password)
        if (authResult) {
          accountId = authResult.accountId
          accountEmail = authResult.account.email
        } else if (name) {
          // No existing auth — try to create a new account
          try {
            const created = await createAccount({ email: invite.email, password, name })
            accountId = created.accountId
            accountEmail = created.account.email
            log.info(`[platform] Inline account created via invitation: ${accountEmail}`)
          } catch (createErr) {
            if (createErr.message.includes('already exists')) {
              // Account exists but password was wrong
              return res.status(401).json({ error: 'An account with this email already exists. Please enter the correct password, or sign in first.' })
            }
            throw createErr
          }
        } else {
          return res.status(401).json({ error: 'Invalid password for existing account' })
        }

        // Create session
        if (accountId) {
          const newSession = await createPlatformSession(accountId)
          res.cookie(PLATFORM_COOKIE, newSession.sessionId, COOKIE_OPTIONS)
        }
      }

      // We have an authenticated account. Process acceptance.
      if (accountEmail.toLowerCase() !== invite.email.toLowerCase()) {
         return res.status(403).json({ error: `Invitation is for ${invite.email}, but you are logged in as ${accountEmail}.` })
      }

      const acceptedTenantId = await acceptTenantInvitation(req.params.token, accountId, accountEmail)

      log.info(`[platform] Account ${accountEmail} accepted invitation to tenant ${acceptedTenantId}`)
      res.json({ success: true, tenantId: acceptedTenantId })

    } catch (err) {
      if (err.message.includes('expired') || err.message.includes('not found')) {
        return res.status(400).json({ error: err.message })
      }
      log.error('[platform] Accept invitation failed:', err.message)
      return next(new AppError('Failed to accept invitation', 500, 'INTERNAL_ERROR'))
    }
  })
}
