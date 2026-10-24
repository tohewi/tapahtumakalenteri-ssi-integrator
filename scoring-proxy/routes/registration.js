import express from 'express'
import { ssiLogin } from '../lib/ssi-core/graphql.js'
import {
  ssiSearchAndAddParticipant,
  ssiFindAndApproveCupParticipant,
  ssiFindCompetitorInMatch,
  ssiSetParticipantSquad,
} from '../lib/ssi-core/participants.js'
import { sendRegistrationConfirmation } from '../lib/email.js'
import { log } from '../lib/logger.js'
import { AppError } from '../lib/errors/AppError.js'
import { getSession, sessionConfig, auditMutation } from '../lib/session/index.js'
import {
  UUID_RE,
  validateRegistrationInput,
  createCaptchaChallenge,
  formatOpenCupsList,
  buildCupDetailPayload,
} from '../lib/services/registration-service.js'

function internalError(message) {
  return new AppError(message, 500, 'INTERNAL_ERROR')
}

export function createRegistrationRouter({
  captchaChallenges,
  CAPTCHA_TTL,
  captchaLimiter,
  registerBodyLimit,
  registerReadLimiter,
  registerLimiter,
  getAdminSession,
  adminGraphQL,
  IS_PROD,
}) {
  const router = express.Router()

  router.get('/captcha', captchaLimiter, (_req, res) => {
    res.json(createCaptchaChallenge(captchaChallenges))
  })

  router.post('/verify-captcha', registerBodyLimit, captchaLimiter, (req, res) => {
    const { captchaId, captchaAnswer } = req.body || {}

    if (typeof captchaId !== 'string' || !UUID_RE.test(captchaId)) {
      return res.status(400).json({ error: 'Virheelliset tiedot.' })
    }
    if (captchaAnswer == null || !Number.isInteger(Number(captchaAnswer)) || Math.abs(Number(captchaAnswer)) > 999) {
      return res.status(400).json({ error: 'Virheelliset tiedot.' })
    }

    const challenge = captchaChallenges.get(captchaId)
    if (!challenge) {
      return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
    }
    if (Date.now() - challenge.created > CAPTCHA_TTL) {
      captchaChallenges.delete(captchaId)
      return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
    }
    if (Number(captchaAnswer) !== challenge.answer) {
      return res.status(400).json({ error: 'Väärä vastaus. Tarkista ja yritä uudelleen.' })
    }

    challenge.verified = true
    res.json({ ok: true })
  })

  router.get('/cups', registerReadLimiter, async (_req, res, next) => {
    try {
      const result = await adminGraphQL(`
        query {
          events(search: "Kupittaa CUP") {
            id name starts status get_content_type_key
            max_competitors
            registration
            ... on NordicSerieNode {
              competitors { id status }
              registration_starts
              registration_closes
              component_matches {
                number included
                match {
                  squads {
                    ... on NordicSquadNode {
                      competitors { id status }
                    }
                  }
                }
              }
            }
          }
        }
      `)

      res.json({ cups: formatOpenCupsList(result.events) })
    } catch (err) {
      log.error('[register] Failed to list cups:', err.message)
      return next(internalError('Ilmoittautumispalvelu ei ole käytettävissä.'))
    }
  })

  router.get('/cup/:id', registerReadLimiter, async (req, res, next) => {
    if (!/^\d{1,10}$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Virheellinen Cup-tunniste.' })
    }

    try {
      const result = await adminGraphQL(`
        query CupDetail($id: String!) {
          event(content_type: 136, id: $id) {
            id name starts status
            max_competitors
            ... on NordicSerieNode {
              competitors { id status }
              component_matches {
                number included
                match {
                  id name starts status
                  squads {
                    id number comment
                    ... on NordicSquadNode {
                      max_competitors
                      competitors { id status }
                    }
                  }
                }
              }
            }
          }
        }
      `, { id: req.params.id })

      if (!result.event) {
        return res.status(404).json({ error: 'Cup not found' })
      }

      const payload = buildCupDetailPayload(result.event)
      if (!payload) {
        return res.status(404).json({ error: 'No matches in cup' })
      }

      res.json(payload)
    } catch (err) {
      log.error('[register] Failed to get cup:', err.message)
      return next(internalError('Ilmoittautumispalvelu ei ole käytettävissä.'))
    }
  })

  router.post('/submit', registerBodyLimit, registerLimiter, async (req, res, next) => {
    const { cupId, squadNumber, email, password, captchaId, captchaAnswer } = req.body || {}

    const validationErrors = validateRegistrationInput({ cupId, squadNumber, email, captchaId, captchaAnswer })
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Virheelliset tiedot.' })
    }

    const challenge = captchaChallenges.get(captchaId)
    if (!challenge) {
      return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
    }
    captchaChallenges.delete(captchaId)
    if (Date.now() - challenge.created > CAPTCHA_TTL) {
      return res.status(400).json({ error: 'Varmistus vanhentunut. Päivitä sivu ja yritä uudelleen.' })
    }
    if (Number(captchaAnswer) !== challenge.answer) {
      return res.status(400).json({ error: 'Väärä vastaus. Yritä uudelleen.' })
    }

    // AUTH10 / R76-AUTH10: Verify authenticated SSI passthrough identity when session cookie,
    // password, or FEATURE_REGISTRATION_AUTH_REQUIRED is active.
    const requireRegAuth = String(process.env.FEATURE_REGISTRATION_AUTH_REQUIRED || '').toLowerCase() === 'true'
    const sessionId = req.cookies?.[sessionConfig.session.cookieName]
    const activeSession = sessionId ? await getSession(sessionId) : null
    const sessionMatchesEmail = activeSession?.userId && activeSession.userId.toLowerCase() === email.trim().toLowerCase()

    if (!sessionMatchesEmail) {
      if (typeof password === 'string' && password.length > 0) {
        try {
          await ssiLogin(email.trim(), password)
        } catch {
          return res.status(401).json({ error: 'SSI-kirjautuminen epäonnistui. Tarkista sähköposti ja salasana.' })
        }
      } else if (requireRegAuth) {
        return res.status(401).json({ error: 'SSI-tunnistautuminen vaaditaan ilmoittautumiseen.' })
      }
    }

    try {
      const admin = await getAdminSession()

      const cupData = await adminGraphQL(`
        query CupDetail($id: String!) {
          event(content_type: 136, id: $id) {
            id name
            ... on NordicSerieNode {
              component_matches {
                number included
                match {
                  id name
                  squads {
                    id number comment
                    ... on NordicSquadNode {
                      max_competitors
                      competitors { id status }
                    }
                  }
                }
              }
            }
          }
        }
      `, { id: cupId })

      if (!cupData.event) {
        return res.status(404).json({ error: 'Cupia ei löydy.' })
      }

      const componentMatches = (cupData.event.component_matches || [])
        .filter(cm => cm.included && cm.match)
        .sort((a, b) => a.number - b.number)

      if (componentMatches.length === 0) {
        return res.status(400).json({ error: 'Cupissa ei ole osakilpailuja.' })
      }

      log.debug(`[register] Adding ${email} to cup ${cupId}`)
      const addResult = await ssiSearchAndAddParticipant(136, cupId, email, admin.cookies)

      const isReRegistration = addResult.success && addResult.message === 'Already registered'

      if (!addResult.success) {
        if (addResult.message === 'user_not_found') {
          return res.status(404).json({
            error: 'user_not_found',
            message: 'Sähköpostiosoitetta ei löydy SSI-järjestelmästä. Rekisteröidy ensin SSI:hin.',
            registerUrl: 'https://shootnscoreit.com/signup/?next=/dashboard/',
          })
        }
        return res.status(400).json({ error: addResult.message })
      }

      const shooterName = addResult.shooterName || email.split('@')[0].replace(/[+._-]/g, ' ')
      log.debug(`[register] ${isReRegistration ? 'Re-registration' : 'New registration'} (${addResult.message}), shooter: "${shooterName}"`)

      res.setHeader('Content-Type', 'application/x-ndjson')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Accel-Buffering', 'no')
      const sendProgress = (data) => res.write(JSON.stringify(data) + '\n')

      const totalMatches = componentMatches.length
      sendProgress({ type: 'progress', step: 'approve', current: 0, total: totalMatches, message: 'Cup-hyväksyntä...' })

      log.debug('[register] Approving CUP participant...')
      const approveResult = await ssiFindAndApproveCupParticipant(cupId, shooterName, admin.cookies, email)
      log.debug(`[register] Approve result: ${approveResult.message}`)
      if (!approveResult.success) {
        sendProgress({ type: 'result', success: false, message: `Ilmoittautuminen onnistui mutta hyväksyntä epäonnistui: ${approveResult.message}` })
        return res.end()
      }

      const squadResults = []
      for (let i = 0; i < componentMatches.length; i++) {
        const cm = componentMatches[i]
        const matchId = cm.match.id
        sendProgress({ type: 'progress', step: 'match', current: i + 1, total: totalMatches, message: `Osakilpailu ${i + 1}/${totalMatches}...` })

        log.debug(`[register] Adding ${email} to match ${matchId}`)
        const matchAddResult = await ssiSearchAndAddParticipant(91, matchId, email, admin.cookies)
        log.debug(`[register] Match ${matchId} add result: ${matchAddResult.message}`)

        const participantId = await ssiFindCompetitorInMatch(matchId, shooterName, admin.cookies, email)
        if (!participantId) {
          log.debug(`[register] Competitor not found in match ${matchId}`)
          squadResults.push({ matchId, matchName: cm.match.name, success: false, message: 'Competitor not found in match' })
          continue
        }

        log.debug(`[register] Assigning squad ${squadNumber} to participant ${participantId} in match ${matchId}`)
        const editResult = await ssiSetParticipantSquad(participantId, squadNumber, admin.cookies)

        const matchSquads = cm.match.squads || []
        const assignedSquad = matchSquads.find(s => s.number === squadNumber)
        const squadLabel = assignedSquad?.comment || ''

        squadResults.push({ matchId, matchName: cm.match.name, squadLabel, ...editResult })
      }

      const allSuccess = squadResults.every(r => r.success)
      const squadded = squadResults.filter(r => r.success).length
      const total = squadResults.length

      auditMutation({
        endpoint: '/api/v1/register/submit',
        operation: isReRegistration ? 'reregister_cup' : 'register_cup',
        initiatingUserId: email.trim(),
        executionIdentityUserId: process.env.SSI_ADMIN_EMAIL || 'admin-service-account',
        targetEntity: { cupId, squadNumber },
        result: allSuccess ? 'success' : 'failure',
      })

      sendProgress({
        type: 'result',
        success: allSuccess,
        isReRegistration,
        message: allSuccess
          ? (isReRegistration ? 'Squad päivitetty!' : 'Ilmoittautuminen ja squadiin asettelu onnistui!')
          : `${isReRegistration ? 'Squad-päivitys' : 'Ilmoittautuminen'} onnistui osittain. Squadiin asettelu: ${squadded}/${total} osakilpailua.`,
        ...(IS_PROD ? {} : { details: squadResults }),
      })

      if (allSuccess || squadded > 0) {
        const matchSquads = squadResults
          .filter(r => r.success)
          .map(r => ({ matchName: r.matchName, squadNumber, squadLabel: r.squadLabel || '' }))

        sendRegistrationConfirmation(email, shooterName, cupData.event.name, matchSquads)
          .then(result => {
            if (!result.success) log.warn(`[register] Confirmation email failed: ${result.error}`)
          })
          .catch(err => log.error(`[register] Email error: ${err.message}`))
      }

      res.end()
    } catch (err) {
      log.error('[register] Registration failed:', err.message)
      return next(internalError('Ilmoittautuminen epäonnistui. Yritä myöhemmin uudelleen.'))
    }
  })

  return router
}
