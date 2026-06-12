/**
 * Notifier — sends staffing notifications via email (Resend).
 * Reuses the existing Resend integration from lib/email.js (R4).
 *
 * See docs/design/sra-staffing-design.md Section 3.1 (notifications)
 */

import { Resend } from 'resend'
import { getNotificationTemplate } from './config-loader.js'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@tapahtumakalenteri-ssi-integrator.onrender.com'

/**
 * Interpolate template variables like {eventName}, {role}, {squad}.
 * @param {string} template
 * @param {object} vars
 * @returns {string}
 */
function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match
  })
}

/**
 * Send a staffing notification email.
 *
 * @param {string} templateKey — key from config notifications.templates
 * @param {string} to — recipient email
 * @param {object} vars — template variables (eventName, role, squad, etc.)
 * @param {string} lang — "fi" or "en" (default "fi")
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendStaffingNotification(templateKey, to, vars, lang = 'fi') {
  const template = getNotificationTemplate(templateKey, lang)
  if (!template) {
    console.warn(`[staffing-notify] Unknown template: ${templateKey}`)
    return { success: false, error: `Unknown template: ${templateKey}` }
  }

  if (!resend) {
    console.warn(`[staffing-notify] RESEND_API_KEY not configured — skipping ${templateKey} to ${to}`)
    return { success: false, error: 'Email not configured' }
  }

  const subject = interpolate(template.subject, vars)
  const bodyText = interpolate(template.body, vars)
  const html = `
<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#e65100;">${escapeHtml(subject)}</h2>
  <p>${escapeHtml(bodyText)}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">
    ${lang === 'fi'
      ? 'Tämä viesti on lähetetty automaattisesti. Älä vastaa tähän viestiin.'
      : 'This message was sent automatically. Do not reply to this message.'}
  </p>
</body>
</html>`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text: bodyText,
    })

    if (result.error) {
      console.error(`[staffing-notify] Send failed (${templateKey} → ${to}):`, result.error)
      return { success: false, error: result.error.message || 'Send failed' }
    }

    console.log(`[staffing-notify] ${templateKey} sent to ${to} (id: ${result.data?.id})`)
    return { success: true }
  } catch (err) {
    console.error(`[staffing-notify] Send error (${templateKey} → ${to}):`, err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Send notifications to all confirmed staff after finalization.
 *
 * @param {Array<object>} confirmedStaff — { email, userName, assignedRole }
 * @param {string} eventName
 * @param {string} lang
 * @returns {Promise<Array<{ userId: string, templateKey: string, success: boolean }>>}
 */
export async function notifyConfirmedStaff(confirmedStaff, eventName, lang = 'fi') {
  const results = []

  for (const staff of confirmedStaff) {
    const roleName = staff.assignedRole || 'staff'
    const vars = { eventName, role: roleName }

    // Send confirmation
    const confirmResult = await sendStaffingNotification('staffConfirmed', staff.email, vars, lang)
    results.push({ userId: staff.userId, templateKey: 'staffConfirmed', success: confirmResult.success })

    // If they got a special role, send role assignment notification
    if (staff.assignedRole && staff.assignedRole !== 'staff') {
      const roleResult = await sendStaffingNotification('roleAssigned', staff.email, vars, lang)
      results.push({ userId: staff.userId, templateKey: 'roleAssigned', success: roleResult.success })
    }
  }

  return results
}

/**
 * Notify overflow staff that they've been moved to shooter squads.
 *
 * @param {Array<{ email: string, userId: string, userName: string, assignedSquad: number }>} overflowStaff
 * @param {string} eventName
 * @param {string} lang
 * @returns {Promise<Array<{ userId: string, templateKey: string, success: boolean }>>}
 */
export async function notifyOverflowStaff(overflowStaff, eventName, lang = 'fi') {
  const results = []

  for (const staff of overflowStaff) {
    const vars = { eventName, squad: staff.assignedSquad }
    const result = await sendStaffingNotification('staffMovedToShooterSquad', staff.email, vars, lang)
    results.push({ userId: staff.userId, templateKey: 'staffMovedToShooterSquad', success: result.success })
  }

  return results
}

/**
 * Notify admin about unfilled required roles.
 *
 * @param {Array<string>} missingRoles — role keys that couldn't be filled
 * @param {string} adminEmail
 * @param {string} eventName
 * @param {string} lang
 */
export async function notifyMissingRoles(missingRoles, adminEmail, eventName, lang = 'fi') {
  for (const roleKey of missingRoles) {
    await sendStaffingNotification('missingRole', adminEmail, { eventName, role: roleKey }, lang)
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
