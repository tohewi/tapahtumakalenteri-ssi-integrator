import express from 'express'
import crypto from 'node:crypto'
import { ssiGraphQL, ssiRefreshJWT, ssiLogin } from '../lib/ssi-core/graphql.js'
import {
  ssiSearchAndAddParticipant,
  ssiFindAndApproveCupParticipant,
  ssiFindCompetitorInMatch,
  ssiSetParticipantSquad,
} from '../lib/ssi-core/participants.js'
import { sendRegistrationConfirmation } from '../lib/email.js'
import { log } from '../lib/logger.js'
import { AppError } from '../lib/errors/AppError.js'

function internalError(message) {
  return new AppError(message, 500, 'INTERNAL_ERROR')
}

function isApprovedStatus(status) {
  const normalized = String(status || '').toLowerCase()
  return normalized === 'a' || normalized === 'approved'
}

function countApprovedCupCompetitors(competitors = []) {
  const approvedIds = new Set()
  for (const competitor of competitors || []) {
    if (isApprovedStatus(competitor?.status) && competitor?.id != null) {
      approvedIds.add(String(competitor.id))
    }
  }
  return approvedIds.size
}

function countApprovedSquadCompetitors(componentMatches = []) {
  const firstMatch = (componentMatches || []).find(cm => cm.included && cm.match)
  const approvedIds = new Set()

  if (firstMatch?.match?.squads) {
    for (const squad of firstMatch.match.squads) {
      for (const competitor of (squad.competitors || [])) {
        if (isApprovedStatus(competitor?.status) && competitor?.id != null) {
          approvedIds.add(String(competitor.id))
        }
      }
    }
  }

  return approvedIds.size
}

function countRegisteredCupCompetitors(cupEvent) {
  const fromCup = countApprovedCupCompetitors(cupEvent?.competitors)
  if (fromCup > 0) return fromCup
  return countApprovedSquadCompetitors(cupEvent?.component_matches)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL_LEN = 254

function validateRegistrationInput({ cupId, squadNumber, email, captchaId, captchaAnswer }) {
  const errors = []

  // cupId: must be a string of digits (SSI event ID)
  if (typeof cupId !== 'string' && typeof cupId !== 'number') errors.push('cupId: required')
  else if (!/^\d{1,10}$/.test(String(cupId))) errors.push('cupId: invalid format')

  // squadNumber: small positive integer (1-99)
  if (squadNumber == null) errors.push('squadNumber: required')
  else if (!Number.isInteger(Number(squadNumber)) || Number(squadNumber) < 1 || Number(squadNumber) > 99) errors.push('squadNumber: invalid')

  // email: valid format, max 254 chars
  if (typeof email !== 'string') errors.push('email: required')
  else if (email.length > MAX_EMAIL_LEN) errors.push('email: too long')
  else if (!EMAIL_RE.test(email)) errors.push('email: invalid format')

  // captchaId: UUID
  if (typeof captchaId !== 'string') errors.push('captchaId: required')
  else if (!UUID_RE.test(captchaId)) errors.push('captchaId: invalid format')

  // captchaAnswer: small integer (-999 to 999)
  if (captchaAnswer == null) errors.push('captchaAnswer: required')
  else if (!Number.isInteger(Number(captchaAnswer)) || Math.abs(Number(captchaAnswer)) > 999) errors.push('captchaAnswer: invalid')

  return errors
}

export function createRegistrationRouter({
  captchaChallenges,
  CAPTCHA_TTL,
  captchaLimiter,
  registerBodyLimit,
  registerReadLimiter,
  registerLimiter,
  createOrGetAdminSession,
  getAdminSession,
  setAdminSession,
  clearAdminSession,
  adminGraphQL,
  IS_PROD,
}) {
  const router = express.Router()

  // ============================================================
  // GET /api/register/captcha — Generate math challenge
  // ============================================================
  router.get('/captcha', captchaLimiter, (req, res) => {
    const a = Math.floor(Math.random() * 20) + 1
    const b = Math.floor(Math.random() * 20) + 1
    const id = crypto.randomUUID()
    captchaChallenges.set(id, { answer: a + b, created: Date.now() })
    res.json({ id, question: `${a} + ${b} = ?` })
  })

  // ============================================================
  // POST /api/register/verify-captcha — Verify captcha answer early
  // Returns cups list on success (combines verify + cup fetch in one call)
  // Does NOT consume the captcha — it's still needed for final submit
  // ============================================================
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

    // Mark as verified (for audit), but don't delete — still needed at submit time
    challenge.verified = true
    res.json({ ok: true })
  })

  // ============================================================
  // GET /api/register/cups — List open cups (public, no auth)
  // Searches for "Kupittaa CUP", returns future cups with
  // registration open and capacity info
  // ============================================================
  router.get('/cups', registerReadLimiter, async (req, res, next) => {
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

      const now = new Date()
      const cups = (result.events || [])
        .filter(e => e.get_content_type_key === 136)
        .filter(e => new Date(e.starts) > now) // future only
        .filter(e => e.status === 'on')         // active only
        .map(c => {
          const registered = countRegisteredCupCompetitors(c)
          const maxCompetitors = c.max_competitors || 25
          const full = registered >= maxCompetitors
          const regStarts = c.registration_starts ? new Date(c.registration_starts) : null
          const regCloses = c.registration_closes ? new Date(c.registration_closes) : null
          // registrationOpen = mode allows it AND within time window AND not full
          const registrationOpen = (c.registration === 'op' || c.registration === 'aa')
            && (!regStarts || now >= regStarts)
            && (!regCloses || now <= regCloses)
            && !full
          return {
            id: c.id,
            name: c.name,
            starts: c.starts,
            maxCompetitors,
            registered,
            full,
            registrationOpen,
          }
        })
        .sort((a, b) => new Date(a.starts) - new Date(b.starts))

      res.json({ cups })
    } catch (err) {
      log.error('[register] Failed to list cups:', err.message)
      return next(internalError('Ilmoittautumispalvelu ei ole käytettävissä.'))
    }
  })

  // ============================================================
  // GET /api/register/cup/:id — Cup squads with capacity (public)
  // Returns squad info aggregated across all matches in the cup
  // ============================================================
  router.get('/cup/:id', registerReadLimiter, async (req, res, next) => {
    // Validate cup ID format (RSEC3)
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

      const cup = result.event
      const componentMatches = (cup.component_matches || [])
        .filter(cm => cm.included && cm.match)
        .sort((a, b) => a.number - b.number)

      // Aggregate squads across matches: use first match's squads as reference
      // Capacity = minimum available across all matches for that squad position
      const firstMatch = componentMatches[0]?.match
      if (!firstMatch) {
        return res.status(404).json({ error: 'No matches in cup' })
      }

      const squads = (firstMatch.squads || []).map((sq, idx) => {
        // Count active competitors across all matches for this squad position
        const counts = componentMatches.map(cm => {
          const matchSquad = cm.match.squads?.[idx]
          if (!matchSquad) return { current: 0, max: 0 }
          const active = (matchSquad.competitors || []).filter(c => c.status === 'a').length
          return { current: active, max: matchSquad.max_competitors || 0 }
        })

        // Use max of current counts and min of max across matches
        const maxCurrent = Math.max(...counts.map(c => c.current))
        const minMax = Math.min(...counts.map(c => c.max))

        return {
          number: sq.number,
          name: sq.comment || `Squad ${sq.number}`,
          current: maxCurrent,
          max: minMax,
          full: maxCurrent >= minMax,
        }
      })

      const registered = countRegisteredCupCompetitors(cup)

      res.json({
        id: cup.id,
        name: cup.name,
        starts: cup.starts,
        status: cup.status,
        maxCompetitors: cup.max_competitors || 25,
        registered,
        squads,
      })
    } catch (err) {
      log.error('[register] Failed to get cup:', err.message)
      return next(internalError('Ilmoittautumispalvelu ei ole käytettävissä.'))
    }
  })

  // ============================================================
  // POST /api/register/submit — Register shooter to cup + squad
  // Body: { cupId, squadNumber, email, captchaId, captchaAnswer }
  // ============================================================
  router.post('/submit', registerBodyLimit, registerLimiter, async (req, res, next) => {
    const { cupId, squadNumber, email, captchaId, captchaAnswer } = req.body || {}

    // Strict schema validation (RSEC3)
    const validationErrors = validateRegistrationInput({ cupId, squadNumber, email, captchaId, captchaAnswer })
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Virheelliset tiedot.' })
    }

    // Validate captcha
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

    try {
      const admin = await getAdminSession()

      // 1. Get cup details to find match IDs and squad IDs
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

      // 2. Add participant to Cup via web scraping
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

      // 3. Get the shooter's name from the registration confirmation form
      //    _handleRegisterResponse extracts it from the shooter select element.
      //    Fallback to email prefix if not available.
      const shooterName = addResult.shooterName || email.split('@')[0].replace(/[+._-]/g, ' ')
      log.debug(`[register] ${isReRegistration ? 'Re-registration' : 'New registration'} (${addResult.message}), shooter: "${shooterName}"`)

      // 4. Approve the CUP participant (default state is Pending)
      //    Switch to streaming (NDJSON) so the frontend can show progress
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

      // 5. For each component match: register user, then find + approve + assign squad
      //    SSI does not auto-propagate CUP participants to matches when approved after pending.
      //    We must add the user to each match individually via participant-search-and-add (ct=91).
      const squadResults = []
      for (let i = 0; i < componentMatches.length; i++) {
        const cm = componentMatches[i]
        const matchId = cm.match.id
        sendProgress({ type: 'progress', step: 'match', current: i + 1, total: totalMatches, message: `Osakilpailu ${i + 1}/${totalMatches}...` })

        log.debug(`[register] Adding ${email} to match ${matchId}`)

        // 5a. Register to match (search-and-add with contentType=91)
        const matchAddResult = await ssiSearchAndAddParticipant(91, matchId, email, admin.cookies)
        log.debug(`[register] Match ${matchId} add result: ${matchAddResult.message}`)

        // 5b. Find competitor in the match
        const participantId = await ssiFindCompetitorInMatch(matchId, shooterName, admin.cookies, email)
        if (!participantId) {
          log.debug(`[register] Competitor not found in match ${matchId}`)
          squadResults.push({ matchId, matchName: cm.match.name, success: false, message: 'Competitor not found in match' })
          continue
        }

        // 5c. Assign squad + set status to approved via edit form
        log.debug(`[register] Assigning squad ${squadNumber} to participant ${participantId} in match ${matchId}`)
        const editResult = await ssiSetParticipantSquad(participantId, squadNumber, admin.cookies)

        // Find squad label (comment) for the email
        const matchSquads = cm.match.squads || []
        const assignedSquad = matchSquads.find(s => s.number === squadNumber)
        const squadLabel = assignedSquad?.comment || ''

        squadResults.push({ matchId, matchName: cm.match.name, squadLabel, ...editResult })
      }

      const allSuccess = squadResults.every(r => r.success)
      const squadded = squadResults.filter(r => r.success).length
      const total = squadResults.length

      // RSEC8: Never expose internal IDs, URLs, or debug details in production
      sendProgress({
        type: 'result',
        success: allSuccess,
        isReRegistration,
        message: allSuccess
          ? (isReRegistration ? 'Squad päivitetty!' : 'Ilmoittautuminen ja squadiin asettelu onnistui!')
          : `${isReRegistration ? 'Squad-päivitys' : 'Ilmoittautuminen'} onnistui osittain. Squadiin asettelu: ${squadded}/${total} osakilpailua.`,
        ...(IS_PROD ? {} : { details: squadResults }),
      })

      // 6. Send confirmation email (non-blocking — don't fail registration if email fails)
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
