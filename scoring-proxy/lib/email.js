import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@tapahtumakalenteri-ssi-integrator.onrender.com'

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
const REGISTER_URL = 'https://tapahtumakalenteri-ssi-integrator.onrender.com/#/register'
const MY_REGISTRATIONS_URL = 'https://shootnscoreit.com/my-registrations/'
const WAITLIST_ADMIN_URL = 'https://tapahtumakalenteri-ssi-integrator.onrender.com/#/induction-waitlist-admin'

/**
 * Send registration confirmation email to shooter.
 *
 * @param {string} to — shooter's email
 * @param {string} shooterName — shooter's display name
 * @param {string} cupName — CUP name (e.g. "TurRes Kupittaa CUP 08.02.2026")
 * @param {Array<{matchName: string, squadNumber: number, squadLabel: string}>} matchSquads
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendRegistrationConfirmation(to, shooterName, cupName, matchSquads) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — skipping confirmation email')
    return { success: false, error: 'Email not configured' }
  }

  const matchRows = matchSquads
    .map(ms => `      <tr>
        <td style="padding:6px 12px;border:1px solid #ddd;">${escapeHtml(ms.matchName)}</td>
        <td style="padding:6px 12px;border:1px solid #ddd;">Squad ${escapeHtml(ms.squadNumber)}${ms.squadLabel ? ` (${escapeHtml(ms.squadLabel)})` : ''}</td>
      </tr>`)
    .join('\n')

  const matchListText = matchSquads
    .map(ms => `  • ${ms.matchName} → Squad ${ms.squadNumber}${ms.squadLabel ? ` (${ms.squadLabel})` : ''}`)
    .join('\n')

  const html = `
<!DOCTYPE html>
<html lang="fi">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#1a73e8;">Ilmoittautuminen vahvistettu ✓</h2>
  <p>Hei ${escapeHtml(shooterName)},</p>
  <p>Ilmoittautumisesi on vahvistettu:</p>

  <h3 style="margin-bottom:4px;">${escapeHtml(cupName)}</h3>
  <table style="border-collapse:collapse;width:100%;margin:8px 0 16px 0;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:6px 12px;border:1px solid #ddd;text-align:left;">Osakilpailu</th>
        <th style="padding:6px 12px;border:1px solid #ddd;text-align:left;">Squad</th>
      </tr>
    </thead>
    <tbody>
${matchRows}
    </tbody>
  </table>

  <h3 style="margin-bottom:4px;">Ohjeet</h3>
  <p><strong>Squadin vaihto:</strong> Ilmoittaudu uudelleen osoitteessa<br>
    <a href="${REGISTER_URL}">${REGISTER_URL}</a><br>
    Valitse uusi squad — vanha korvataan automaattisesti.</p>

  <p><strong>Ilmoittautumisen peruminen:</strong> Kirjaudu SSI:hin ja poista ilmoittautumisesi osoitteessa<br>
    <a href="${MY_REGISTRATIONS_URL}">${MY_REGISTRATIONS_URL}</a><br>
    Poista sekä CUP- että osakilpailuilmoittautumiset.</p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">Tämä viesti on lähetetty automaattisesti. Älä vastaa tähän viestiin.</p>
</body>
</html>`

  const text = `Ilmoittautuminen vahvistettu

Hei ${shooterName},

Ilmoittautumisesi on vahvistettu:

${cupName}
${matchListText}

SQUADIN VAIHTO:
Ilmoittaudu uudelleen: ${REGISTER_URL}
Valitse uusi squad — vanha korvataan automaattisesti.

ILMOITTAUTUMISEN PERUMINEN:
Kirjaudu SSI:hin ja poista ilmoittautumisesi:
${MY_REGISTRATIONS_URL}
Poista sekä CUP- että osakilpailuilmoittautumiset.

---
Tämä viesti on lähetetty automaattisesti.`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Ilmoittautuminen: ${cupName}`,
      html,
      text,
    })

    if (result.error) {
      console.error('[email] Send failed:', result.error)
      return { success: false, error: result.error.message || 'Send failed' }
    }

    console.log(`[email] Confirmation sent to ${to} (id: ${result.data?.id})`)
    return { success: true }
  } catch (err) {
    console.error('[email] Send error:', err.message)
    return { success: false, error: err.message }
  }
}

export async function sendWaitlistRegistrationConfirmation(entry) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — cannot send wait list confirmation email')
    return { success: false, error: 'Email not configured' }
  }

  const isEnglish = entry.preferredLanguage === 'en'
  const subject = isEnglish
    ? 'Induction wait list confirmation'
    : 'Perehdytyksen jonotuslistan vahvistus'

  const greeting = isEnglish ? 'Hello' : 'Hei'
  const bodyIntro = isEnglish
    ? 'You have been added to the Kupittaa Reservilaisammunta induction wait list.'
    : 'Sinut on lisätty Kupittaan reserviläisammunnan perehdytyksen jonotuslistalle.'
  const equipmentText = entry.equipmentChoice === 'need-club-22'
    ? (isEnglish ? 'Needs club .22 pistol' : 'Tarvitsee seuran .22 pistoolin')
    : (isEnglish ? 'Brings own pistol' : 'Tulee omalla pistoolilla')

  const html = `
<!DOCTYPE html>
<html lang="${isEnglish ? 'en' : 'fi'}">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#1a73e8;">${escapeHtml(subject)}</h2>
  <p>${greeting} ${escapeHtml(entry.firstName)},</p>
  <p>${bodyIntro}</p>
  <ul>
    <li>${isEnglish ? 'Email' : 'Sähköposti'}: ${escapeHtml(entry.email)}</li>
    <li>${isEnglish ? 'Association' : 'Yhdistys'}: ${escapeHtml(entry.association)}</li>
    <li>${isEnglish ? 'Equipment' : 'Varustus'}: ${escapeHtml(equipmentText)}</li>
  </ul>
  <p>${isEnglish ? 'We will contact you when an induction group is planned.' : 'Otamme yhteyttä, kun perehdytysryhmä on suunnitteilla.'}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">${isEnglish ? 'Automatic message. Please do not reply.' : 'Automaattinen viesti. Älä vastaa tähän viestiin.'}</p>
  <p style="font-size:12px;color:#999;">Admin: <a href="${WAITLIST_ADMIN_URL}">${WAITLIST_ADMIN_URL}</a></p>
</body>
</html>`

  const text = `${subject}\n\n${greeting} ${entry.firstName},\n\n${bodyIntro}\n\n${isEnglish ? 'Email' : 'Sähköposti'}: ${entry.email}\n${isEnglish ? 'Association' : 'Yhdistys'}: ${entry.association}\n${isEnglish ? 'Equipment' : 'Varustus'}: ${equipmentText}\n\n${isEnglish ? 'We will contact you when an induction group is planned.' : 'Otamme yhteyttä, kun perehdytysryhmä on suunnitteilla.'}`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: entry.email,
      subject,
      html,
      text,
    })

    if (result.error) {
      console.error('[email] Wait list confirmation failed:', result.error)
      return { success: false, error: result.error.message || 'Send failed' }
    }

    console.log(`[email] Wait list confirmation sent to ${entry.email} (id: ${result.data?.id})`)
    return { success: true }
  } catch (err) {
    console.error('[email] Wait list send error:', err.message)
    return { success: false, error: err.message }
  }
}

export async function sendWaitlistStatusChangeNotification(entry, { status, groupLabel = null, plannedDate = null }) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — cannot send wait list status email')
    return { success: false, error: 'Email not configured' }
  }

  const isEnglish = entry.preferredLanguage === 'en'
  const subjects = {
    selected: isEnglish ? 'You have been selected for an induction group' : 'Sinut on valittu perehdytysryhmään',
    completed: isEnglish ? 'Induction marked completed' : 'Perehdytys merkitty suoritetuksi',
    withdrawn: isEnglish ? 'Wait list registration cancelled' : 'Jonotuslistan ilmoittautuminen peruttu',
  }
  const subject = subjects[status] || (isEnglish ? 'Wait list status updated' : 'Jonotuslistan tila päivitetty')

  const detailLines = []
  if (groupLabel) detailLines.push(`${isEnglish ? 'Group' : 'Ryhmä'}: ${groupLabel}`)
  if (plannedDate) detailLines.push(`${isEnglish ? 'Planned date' : 'Suunniteltu päivä'}: ${plannedDate}`)

  const html = `
<!DOCTYPE html>
<html lang="${isEnglish ? 'en' : 'fi'}">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#1a73e8;">${escapeHtml(subject)}</h2>
  <p>${isEnglish ? 'Hello' : 'Hei'} ${escapeHtml(entry.firstName)},</p>
  <p>${escapeHtml(subject)}</p>
  ${detailLines.length ? `<ul>${detailLines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">${isEnglish ? 'Automatic message. Please do not reply.' : 'Automaattinen viesti. Älä vastaa tähän viestiin.'}</p>
</body>
</html>`

  const text = `${subject}\n\n${isEnglish ? 'Hello' : 'Hei'} ${entry.firstName},\n\n${subject}${detailLines.length ? `\n\n${detailLines.join('\n')}` : ''}`

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: entry.email,
      subject,
      html,
      text,
    })

    if (result.error) {
      console.error('[email] Wait list status change failed:', result.error)
      return { success: false, error: result.error.message || 'Send failed' }
    }

    return { success: true }
  } catch (err) {
    console.error('[email] Wait list status change error:', err.message)
    return { success: false, error: err.message }
  }
}
