// ============================================================
// Platform Routes — Auth, Account Profile, MFA
// Mounted under /api/v1/platform by createPlatformRouter
// ============================================================

import { log } from '../../lib/logger.js'
import { AppError } from '../../lib/errors/AppError.js'
import { sendEmail } from '../../lib/email.js'
import { generateMfaSetup, verifyTotpCode, hashRecoveryCodes, verifyRecoveryCode } from '../../lib/services/mfa-service.js'
import {
  createAccountWithTenant,
  createAccount,
  authenticateAccount,
  createPasswordResetToken,
  resetPasswordWithToken,
  invalidateAccountSessions,
  autoAcceptPendingInvitations,
  getAccount,
  getAccountWithMfaSecrets,
  updateAccount,
  changePassword,
  listAccountTenants,
  countDisciplinesByTenant,
  createPlatformSession,
  deletePlatformSession,
  getPlatformSession,
  upgradeMfaSession,
} from '../../lib/db/platform-store.js'
import { PLATFORM_COOKIE, COOKIE_OPTIONS } from '../../middleware/platform-auth.js'
import { validateSignUp } from '../../lib/services/platform-validation.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LEN = 8
const MAX_PASSWORD_LEN = 128
const MAX_NAME_LEN = 100

export function mountAuthRoutes(router, {
  requirePlatformAuth,
  platformSignUpLimiter,
  platformLoginLimiter,
  platformPasswordResetLimiter,
  platformMutationLimiter,
}) {

  // ============================================================
  // POST /api/v1/platform/register — Sign up for a platform account
  // Creates account + first tenant (from organizationName)
  // ============================================================
  router.post('/register', platformSignUpLimiter, async (req, res, next) => {
    const errors = validateSignUp(req.body)
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors })
    }

    try {
      const { email, password, name, organizationName } = req.body

      // Create account + first tenant atomically — if tenant creation fails
      // the account is rolled back, preventing orphaned accounts.
      const { accountId, account, tenantId, tenant } = await createAccountWithTenant({
        email, password, name, organizationName,
      })
      log.info(`[platform] Account registered: ${email} (${accountId}), tenant: ${organizationName} (${tenantId})`)

      // Auto-accept any pending invitations for this email
      try {
        const joined = await autoAcceptPendingInvitations(accountId, account.email)
        if (joined.length > 0) {
          log.info(`[platform] Auto-accepted ${joined.length} pending invitation(s) for ${account.email} on sign-up`)
        }
      } catch { /* non-blocking — don't fail registration */ }

      // Create platform session
      const { sessionId } = await createPlatformSession(accountId)

      // Set session cookie
      res.cookie(PLATFORM_COOKIE, sessionId, COOKIE_OPTIONS)

      res.status(201).json({
        success: true,
        account: {
          id: account.id,
          email: account.email,
          name: account.name,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          subscription: tenant.subscription,
        },
      })
    } catch (err) {
      if (err.message.includes('already exists')) {
        return res.status(409).json({ error: err.message })
      }
      log.error('[platform] Registration failed:', err.message)
      return next(new AppError('Registration failed', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/login — Sign in to platform account
  // ============================================================
  router.post('/login', platformLoginLimiter, async (req, res, next) => {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    try {
      const result = await authenticateAccount(email, password)
      if (!result) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const { accountId, account } = result

      // Check if MFA is enabled — if so, return a challenge instead of session
      if (account.mfaEnabled) {
        // Create a temporary MFA challenge token (short-lived, stored in session store)
        const { sessionId: mfaChallengeId } = await createPlatformSession(accountId, { mfaPending: true })
        res.cookie(PLATFORM_COOKIE, mfaChallengeId, COOKIE_OPTIONS)
        log.info(`[platform] MFA challenge issued for: ${email}`)
        return res.json({
          success: true,
          mfaRequired: true,
        })
      }

      const { sessionId } = await createPlatformSession(accountId)

      res.cookie(PLATFORM_COOKIE, sessionId, COOKIE_OPTIONS)

      log.info(`[platform] Account logged in: ${email}`)

      // Auto-accept any pending invitations for this email
      try {
        const joined = await autoAcceptPendingInvitations(accountId, account.email)
        if (joined.length > 0) {
          log.info(`[platform] Auto-accepted ${joined.length} pending invitation(s) for ${account.email}`)
        }
      } catch { /* non-blocking — don't fail login */ }

      // Fetch tenants for response (includes any just-joined tenants)
      const tenants = await listAccountTenants(accountId)

      res.json({
        success: true,
        account: {
          id: account.id,
          email: account.email,
          name: account.name,
          mfaEnabled: account.mfaEnabled || false,
        },
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          subscription: t.subscription,
          createdAt: t.createdAt,
        })),
      })
    } catch (err) {
      log.error('[platform] Login failed:', err.message)
      return next(new AppError('Login failed', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/logout — Destroy platform session
  // ============================================================
  router.post('/logout', async (req, res) => {
    const sessionId = req.cookies?.[PLATFORM_COOKIE]
    if (sessionId) {
      await deletePlatformSession(sessionId)
    }
    res.clearCookie(PLATFORM_COOKIE, { path: '/' })
    res.json({ success: true })
  })

  // ============================================================
  // POST /api/v1/platform/forgot-password — Request password reset email
  // No auth required. Always returns success (no user enumeration).
  // ============================================================
  router.post('/forgot-password', platformLoginLimiter, async (req, res, next) => {
    const { email } = req.body
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' })
    }

    try {
      const result = await createPasswordResetToken(email)

      // Send email only if account exists (but always return success)
      if (result) {
        const origin = req.headers.origin || `https://${req.headers.host}`
        const resetUrl = `${origin}/#/platform/reset-password/${result.token}`

        await sendEmail({
          to: email.trim(),
          subject: 'Password Reset — SSI TurRes Tools',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <h2 style="color: #0284c7;">Password Reset</h2>
              <p>We received a request to reset the password for your account (<strong>${email.trim()}</strong>).</p>
              <p>Click the button below to set a new password:</p>
              <div style="margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
              </div>
              <p style="color: #666; font-size: 0.9em;">This link will expire in 1 hour and can only be used once.</p>
              <p style="color: #666; font-size: 0.9em;">If you did not request this, you can safely ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
              <p style="color: #999; font-size: 0.8em;">If the button doesn't work, copy and paste this URL into your browser:<br/>${resetUrl}</p>
            </div>
          `
        })
        log.info(`[platform] Password reset email sent to ${email.trim()}`)
      }

      // Always return success — no user enumeration
      res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' })
    } catch (err) {
      log.error('[platform] Forgot password failed:', err.message)
      return next(new AppError('Failed to process password reset request', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/reset-password — Reset password with token
  // No auth required.
  // ============================================================
  router.post('/reset-password', platformPasswordResetLimiter, async (req, res, next) => {
    const { token, newPassword } = req.body
    if (!token) {
      return res.status(400).json({ error: 'Reset token is required' })
    }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters` })
    }
    if (newPassword.length > MAX_PASSWORD_LEN) {
      return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LEN} characters` })
    }

    try {
      const result = await resetPasswordWithToken(token, newPassword)
      if (!result.success) {
        return res.status(400).json({ error: result.error })
      }

      // Invalidate all existing sessions for this account (force re-login)
      await invalidateAccountSessions(result.accountId)
      log.info(`[platform] Password reset completed for account ${result.accountId}`)

      res.json({ success: true, message: 'Password has been reset. Please sign in with your new password.' })
    } catch (err) {
      log.error('[platform] Reset password failed:', err.message)
      return next(new AppError('Failed to reset password', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // GET /api/v1/platform/status — Check platform session
  // ============================================================
  router.get('/status', async (req, res) => {
    const sessionId = req.cookies?.[PLATFORM_COOKIE]
    if (!sessionId) {
      return res.json({ authenticated: false })
    }

    const session = await getPlatformSession(sessionId)
    if (!session) {
      return res.json({ authenticated: false })
    }

    // MFA-pending sessions are not fully authenticated
    if (session.mfaPending) {
      return res.json({ authenticated: false, mfaPending: true })
    }

    const account = await getAccount(session.accountId)
    if (!account) {
      return res.json({ authenticated: false })
    }

    const tenants = await listAccountTenants(session.accountId)
    const disCounts = await countDisciplinesByTenant(tenants.map(t => t.id))

    res.json({
      authenticated: true,
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        mfaEnabled: account.mfaEnabled || false,
      },
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        subscription: t.subscription,
        disciplineCount: disCounts.get(t.id) || 0,
        createdAt: t.createdAt,
      })),
    })
  })

  // ============================================================
  // GET /api/v1/platform/me — Get current account profile
  // ============================================================
  router.get('/me', requirePlatformAuth(), async (req, res) => {
    const tenants = await listAccountTenants(req.account.id)
    const disCounts = await countDisciplinesByTenant(tenants.map(t => t.id))
    res.json({
      account: {
        id: req.account.id,
        email: req.account.email,
        name: req.account.name,
        createdAt: req.account.createdAt,
      },
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.name,
        subscription: t.subscription,
        disciplineCount: disCounts.get(t.id) || 0,
        createdAt: t.createdAt,
      })),
    })
  })

  // ============================================================
  // PATCH /api/v1/platform/account — Update account profile
  // ============================================================
  router.patch('/account', platformMutationLimiter, requirePlatformAuth(), async (req, res, next) => {
    const { name, email } = req.body
    const updates = {}

    if (name !== undefined) {
      if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' })
      }
      if (name.length > MAX_NAME_LEN) {
        return res.status(400).json({ error: `Name must be at most ${MAX_NAME_LEN} characters` })
      }
      updates.name = name.trim()
    }

    if (email !== undefined) {
      if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Valid email is required' })
      }
      updates.email = email
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    try {
      const updated = await updateAccount(req.account.id, updates)
      if (!updated) {
        return res.status(404).json({ error: 'Account not found' })
      }
      log.info(`[platform] Account updated: ${updated.email} (${updated.id})`)
      res.json({
        success: true,
        account: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          createdAt: updated.createdAt,
        },
      })
    } catch (err) {
      if (err.message.includes('already exists') || err.code === '23505') {
        return res.status(409).json({ error: 'Email is already in use by another account' })
      }
      log.error('[platform] Account update failed:', err.message)
      return next(new AppError('Failed to update account', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/account/change-password
  // ============================================================
  router.post('/account/change-password', platformMutationLimiter, requirePlatformAuth(), async (req, res, next) => {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' })
    }
    if (newPassword.length < MIN_PASSWORD_LEN) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LEN} characters` })
    }
    if (newPassword.length > MAX_PASSWORD_LEN) {
      return res.status(400).json({ error: `New password must be at most ${MAX_PASSWORD_LEN} characters` })
    }

    try {
      await changePassword(req.account.id, currentPassword, newPassword)
      log.info(`[platform] Password changed for account: ${req.account.email}`)
      res.json({ success: true })
    } catch (err) {
      if (err.message.includes('incorrect')) {
        return res.status(401).json({ error: 'Current password is incorrect' })
      }
      log.error('[platform] Password change failed:', err.message)
      return next(new AppError('Failed to change password', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/mfa/verify — Complete MFA challenge during login
  // Called after login returns mfaRequired: true
  // ============================================================
  router.post('/mfa/verify', async (req, res, next) => {
    const { code, recoveryCode } = req.body
    const sessionId = req.cookies?.[PLATFORM_COOKIE]

    if (!sessionId) {
      return res.status(401).json({ error: 'No active MFA challenge. Please log in again.' })
    }

    // Get session — must be mfaPending
    const session = await getPlatformSession(sessionId)
    if (!session || !session.mfaPending) {
      return res.status(401).json({ error: 'No active MFA challenge. Please log in again.' })
    }

    try {
      const account = await getAccountWithMfaSecrets(session.accountId)
      if (!account || !account.mfaEnabled) {
        return res.status(400).json({ error: 'MFA is not enabled on this account' })
      }

      let verified = false

      if (code) {
        // TOTP code verification
        verified = verifyTotpCode(account.mfaSecret, code)
      } else if (recoveryCode) {
        // Recovery code verification
        const result = await verifyRecoveryCode(account.mfaRecoveryCodes, recoveryCode)
        if (result.valid) {
          verified = true
          // Save remaining recovery codes
          await updateAccount(account.id, { mfaRecoveryCodes: result.remainingCodes })
          log.info(`[platform] MFA recovery code used by ${account.email} (${result.remainingCodes.length} remaining)`)
        }
      } else {
        return res.status(400).json({ error: 'Either code or recoveryCode is required' })
      }

      if (!verified) {
        return res.status(401).json({ error: 'Invalid verification code' })
      }

      // Upgrade the MFA-pending session to a full session
      const upgraded = await upgradeMfaSession(sessionId)
      if (!upgraded) {
        return res.status(401).json({ error: 'MFA session expired. Please log in again.' })
      }

      log.info(`[platform] MFA verified for ${account.email}`)

      // Auto-accept any pending invitations for this email
      try {
        const joined = await autoAcceptPendingInvitations(account.id, account.email)
        if (joined.length > 0) {
          log.info(`[platform] Auto-accepted ${joined.length} pending invitation(s) for ${account.email}`)
        }
      } catch { /* non-blocking */ }

      // Return full login response
      const tenants = await listAccountTenants(account.id)
      res.json({
        success: true,
        account: {
          id: account.id,
          email: account.email,
          name: account.name,
        },
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          subscription: t.subscription,
          createdAt: t.createdAt,
        })),
      })
    } catch (err) {
      log.error('[platform] MFA verify failed:', err.message)
      return next(new AppError('MFA verification failed', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/account/mfa/setup — Initiate MFA setup
  // Returns QR code and recovery codes (not yet enabled)
  // ============================================================
  router.post('/account/mfa/setup', platformMutationLimiter, requirePlatformAuth(), async (req, res, next) => {
    try {
      const account = await getAccount(req.account.id)
      if (account.mfaEnabled) {
        return res.status(400).json({ error: 'MFA is already enabled. Disable it first to reconfigure.' })
      }

      const { secret, qrCodeDataUrl, recoveryCodes } = await generateMfaSetup(account.email)

      // Store secret + hashed recovery codes in account (mfaEnabled stays false until confirm)
      const hashedCodes = await hashRecoveryCodes(recoveryCodes)
      await updateAccount(req.account.id, {
        mfaSecret: secret,
        mfaRecoveryCodes: hashedCodes,
      })

      res.json({
        success: true,
        qrCodeDataUrl,
        recoveryCodes, // Show only once — user must save these
      })
    } catch (err) {
      log.error('[platform] MFA setup failed:', err.message)
      return next(new AppError('Failed to initiate MFA setup', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/account/mfa/confirm — Confirm MFA setup
  // Verifies the TOTP code and enables MFA on the account
  // ============================================================
  router.post('/account/mfa/confirm', platformMutationLimiter, requirePlatformAuth(), async (req, res, next) => {
    const { code } = req.body
    if (!code || typeof code !== 'string' || code.length !== 6) {
      return res.status(400).json({ error: 'A 6-digit verification code is required' })
    }

    try {
      // Get account with MFA secrets to verify the code against the pending secret
      const account = await getAccountWithMfaSecrets(req.account.id)
      if (!account) {
        return res.status(404).json({ error: 'Account not found' })
      }
      if (account.mfaEnabled) {
        return res.status(400).json({ error: 'MFA is already enabled' })
      }
      if (!account.mfaSecret) {
        return res.status(400).json({ error: 'Call /account/mfa/setup first' })
      }

      const verified = verifyTotpCode(account.mfaSecret, code)
      if (!verified) {
        return res.status(401).json({ error: 'Invalid code. Scan the QR code with your authenticator app and enter the 6-digit code.' })
      }

      // Enable MFA
      await updateAccount(req.account.id, { mfaEnabled: true })
      log.info(`[platform] MFA enabled for ${account.email}`)

      res.json({ success: true, mfaEnabled: true })
    } catch (err) {
      log.error('[platform] MFA confirm failed:', err.message)
      return next(new AppError('Failed to confirm MFA setup', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // POST /api/v1/platform/account/mfa/disable — Disable MFA
  // Requires current password for security
  // ============================================================
  router.post('/account/mfa/disable', platformMutationLimiter, requirePlatformAuth(), async (req, res, next) => {
    const { password } = req.body
    if (!password) {
      return res.status(400).json({ error: 'Current password is required to disable MFA' })
    }

    try {
      // Verify password
      const authResult = await authenticateAccount(req.account.email, password)
      if (!authResult) {
        return res.status(401).json({ error: 'Incorrect password' })
      }

      // Clear MFA data
      await updateAccount(req.account.id, {
        mfaEnabled: false,
        mfaSecret: null,
        mfaRecoveryCodes: null,
      })

      log.info(`[platform] MFA disabled for ${req.account.email}`)
      res.json({ success: true, mfaEnabled: false })
    } catch (err) {
      log.error('[platform] MFA disable failed:', err.message)
      return next(new AppError('Failed to disable MFA', 500, 'INTERNAL_ERROR'))
    }
  })
}
