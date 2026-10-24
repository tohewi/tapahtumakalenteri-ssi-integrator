import express from 'express'
import {
  ssiSearchAndAddParticipant,
  ssiFindCompetitorInMatch,
  ssiSetParticipantSquad,
  ssiFindAndApproveCupParticipant,
  ssiFindAndDeleteCupParticipant,
  ssiDeleteMatchParticipant,
  ssiSetDidNotShow,
  ssiUndoDidNotShow,
  ssiTogglePaid,
  ssiGetCupParticipantStatuses,
} from '../lib/ssi-core/participants.js'
import {
  buildSquaddingOverview,
  attachCupStatuses,
  getIncludedMatchIds,
  filterManageableCups,
  getManageWindowBounds,
} from '../lib/services/cup-manage.js'
import { log } from '../lib/logger.js'
import { AppError } from '../lib/errors/AppError.js'

function internalError(message) {
  return new AppError(message, 500, 'INTERNAL_ERROR')
}

function splitShooterName(shooterName = '') {
  const nameParts = String(shooterName).trim().split(/\s+/)
  return {
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' ') || '',
  }
}

const MANAGE_CUPS_LIST_QUERY = `
  query ManageCups($search: String!, $startsAfter: String!, $startsBefore: String!) {
    events(search: $search, starts_after: $startsAfter, starts_before: $startsBefore) {
      id name starts ends status get_content_type_key
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
`

const MANAGE_CUP_COUNT_QUERY = `
  query ManageCupCount($id: String!) {
    event(content_type: 136, id: $id) {
      id
      ... on NordicSerieNode {
        competitors { id status }
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
`

const MANAGE_CUP_MATCHES_QUERY = `
  query ManageCup($id: String!) {
    event(content_type: 136, id: $id) {
      id
      ... on NordicSerieNode {
        component_matches {
          number included
          match { id name }
        }
      }
    }
  }
`

export function createManagementRouter({
  requireAuth,
  graphqlWithRefresh,
  adminGraphQL,
  getAdminSession,
  paidToggleEnabled = false,
}) {
  const router = express.Router()

  router.get('/cups', requireAuth('manage'), async (_req, res, next) => {
    try {
      const now = new Date()
      const { windowStart, windowEndExclusive } = getManageWindowBounds(now)

      const result = await adminGraphQL(MANAGE_CUPS_LIST_QUERY, {
        search: 'Kupittaa CUP',
        startsAfter: windowStart.toISOString(),
        startsBefore: windowEndExclusive.toISOString(),
      })

      const listEvents = result.events || []
      const manageableEvents = filterManageableCups(listEvents, now)

      const detailResults = await Promise.all(manageableEvents.map(async (cup) => {
        try {
          const detail = await adminGraphQL(MANAGE_CUP_COUNT_QUERY, { id: String(cup.id) })
          return {
            id: String(cup.id),
            competitors: detail?.event?.competitors,
            component_matches: detail?.event?.component_matches,
          }
        } catch (err) {
          log.warn(`[manage] Failed to fetch detail count data for cup ${cup.id}: ${err.message}`)
          return { id: String(cup.id) }
        }
      }))

      const detailById = new Map(detailResults.map(r => [String(r.id), r]))
      const enrichedEvents = listEvents.map((event) => {
        const detail = detailById.get(String(event.id))
        if (!detail) return event
        return {
          ...event,
          competitors: detail.competitors ?? event.competitors,
          component_matches: detail.component_matches ?? event.component_matches,
        }
      })

      res.json({ cups: filterManageableCups(enrichedEvents, now) })
    } catch (err) {
      log.error('[manage] Failed to list cups:', err.message)
      return next(internalError('Hallintapalvelu ei ole käytettävissä.'))
    }
  })

  router.get('/cup/:id', requireAuth('manage'), async (req, res, next) => {
    try {
      const result = await graphqlWithRefresh(req.ssiSession, `
        query ManageCup($id: String!) {
          event(content_type: 136, id: $id) {
            id name starts status
            ... on NordicSerieNode {
              competitors { id status email shooter { first_name last_name email } }
              component_matches {
                number included
                match {
                  id name
                  competitors { id status first_name last_name email }
                  squads {
                    id number comment
                    ... on NordicSquadNode {
                      max_competitors
                      competitors { id status first_name last_name email }
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
      const { matches, shooters, cupOnly, matchOnly, pendingShooters } = buildSquaddingOverview(cup)

      let cupParticipantStatuses = new Map()
      try {
        const adminSess = getAdminSession ? await getAdminSession() : null
        if (adminSess?.cookies) {
          cupParticipantStatuses = await ssiGetCupParticipantStatuses(req.params.id, adminSess.cookies)
        }
      } catch (err) {
        log.error(`[manage] Failed to scrape paid/DNS status: ${err.message}`)
      }

      const { shootersWithStatus, cupOnlyWithStatus } = attachCupStatuses(
        shooters, cupOnly, cup.competitors, cupParticipantStatuses
      )

      const applyPaidVisibility = (list = []) => {
        if (paidToggleEnabled) return list
        return list.map(s => (s && typeof s === 'object' ? { ...s, paid: false } : s))
      }

      res.json({
        cup: { id: cup.id, name: cup.name, starts: cup.starts },
        matches,
        shooters: applyPaidVisibility(shootersWithStatus),
        cupOnly: applyPaidVisibility(cupOnlyWithStatus),
        matchOnly: applyPaidVisibility(matchOnly),
        pendingShooters: applyPaidVisibility(pendingShooters),
        features: { paidToggleEnabled },
      })
    } catch (err) {
      log.error('[manage] Failed to fetch management data:', err.message)
      return next(internalError('Failed to fetch management data'))
    }
  })

  router.post('/cup/:id/assign-squad', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, squadNumber, email } = req.body
    if (!shooterName || !squadNumber) {
      return res.status(400).json({ error: 'shooterName and squadNumber required' })
    }

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    const user = req.ssiSession.userId || 'unknown'
    log.info(`[manage] assign-squad: user=${user} cup=${req.params.id} shooter="${shooterName}" email=${email || 'none'} → squad ${squadNumber}`)

    try {
      const cupData = await graphqlWithRefresh(req.ssiSession, MANAGE_CUP_MATCHES_QUERY, { id: req.params.id })
      if (!cupData.event) return res.status(404).json({ error: 'Cup not found' })

      const matchIds = getIncludedMatchIds(cupData.event).map(m => m.id)
      const { firstName, lastName } = splitShooterName(shooterName)

      const results = []
      for (const matchId of matchIds) {
        await ssiSearchAndAddParticipant(91, matchId, email, cookies, { firstName, lastName })
        const participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies, email)
        if (!participantId) {
          results.push({ matchId, success: false, message: 'Could not find participant after adding' })
          continue
        }

        const sqResult = await ssiSetParticipantSquad(participantId, squadNumber, cookies)
        results.push({ matchId, success: sqResult.success, message: sqResult.message || 'OK' })
      }

      const allOk = results.every(r => r.success)
      res.json({ success: allOk, results })
    } catch (err) {
      log.error(`[manage] assign-squad: FAILED user=${user} shooter="${shooterName}" → squad ${squadNumber}: ${err.message}`)
      return next(internalError('Failed to assign squad'))
    }
  })

  router.post('/cup/:id/fix-squad', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, targetSquad, email, matchId: singleMatchId } = req.body
    if (!shooterName || !targetSquad) {
      return res.status(400).json({ error: 'shooterName and targetSquad required' })
    }

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    const user = req.ssiSession.userId || 'unknown'
    log.info(`[manage] fix-squad: user=${user} cup=${req.params.id} shooter="${shooterName}" email=${email || 'none'} → squad ${targetSquad}`)

    try {
      const cupData = await graphqlWithRefresh(req.ssiSession, `
        query ManageCup($id: String!) {
          event(content_type: 136, id: $id) {
            id
            ... on NordicSerieNode {
              component_matches {
                number included
                match {
                  id name
                  ... on NordicMatchNode {
                    squads {
                      number max_competitors
                      competitors { id status first_name last_name email }
                    }
                  }
                }
              }
            }
          }
        }
      `, { id: req.params.id })

      if (!cupData.event) return res.status(404).json({ error: 'Cup not found' })

      const includedMatches = (cupData.event.component_matches || [])
        .filter(cm => cm.included && cm.match)
        .map(cm => cm.match)
      const targetMatches = singleMatchId
        ? includedMatches.filter(m => String(m.id) === String(singleMatchId))
        : includedMatches

      if (singleMatchId && targetMatches.length === 0) {
        return res.status(400).json({ error: 'Match not found in cup' })
      }

      for (const m of targetMatches) {
        const sq = (m.squads || []).find(s => Number(s.number) === Number(targetSquad))
        if (sq && sq.max_competitors > 0) {
          const activeCompetitors = (sq.competitors || []).filter(c => !c.status || c.status === 'a')
          const alreadyInSquad = activeCompetitors.some(c =>
            (email && c.email && c.email.toLowerCase() === email.toLowerCase()) ||
            `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase() === shooterName.trim().toLowerCase()
          )
          if (!alreadyInSquad && activeCompetitors.length >= sq.max_competitors) {
            return res.status(400).json({ error: `Target squad ${targetSquad} is full (${activeCompetitors.length}/${sq.max_competitors})` })
          }
        }
      }

      const matchIds = targetMatches.map(m => m.id)
      const { firstName, lastName } = splitShooterName(shooterName)

      const results = []
      for (const matchId of matchIds) {
        let participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies, email)
        if (!participantId) {
          await ssiSearchAndAddParticipant(91, matchId, email, cookies, { firstName, lastName })
          participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies, email)
        }
        if (!participantId) {
          results.push({ matchId, success: false, message: 'Could not find or add participant' })
          continue
        }

        const sqResult = await ssiSetParticipantSquad(participantId, targetSquad, cookies)
        results.push({ matchId, success: sqResult.success, message: sqResult.message || 'OK' })
      }

      const allOk = results.every(r => r.success)
      res.json({ success: allOk, results })
    } catch (err) {
      log.error(`[manage] fix-squad: FAILED user=${user} shooter="${shooterName}" → squad ${targetSquad}: ${err.message}`)
      return next(internalError('Failed to fix squad assignment'))
    }
  })

  router.post('/cup/:id/add-to-cup', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, email } = req.body
    if (!shooterName) return res.status(400).json({ error: 'shooterName required' })

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    try {
      const cupId = req.params.id
      const { firstName, lastName } = splitShooterName(shooterName)

      const addResult = await ssiSearchAndAddParticipant(136, cupId, email, cookies, { firstName, lastName })
      if (!addResult.success) {
        return res.status(400).json({ error: `Failed to add competitor: ${addResult.message}` })
      }

      const approveResult = await ssiFindAndApproveCupParticipant(cupId, shooterName, cookies, email)
      if (!approveResult.success) {
        return res.status(400).json({ error: `Failed to approve competitor: ${approveResult.message}` })
      }

      res.json({ success: true, message: approveResult.message })
    } catch (err) {
      log.error('[manage] add-to-cup error:', err.message)
      return next(internalError('Failed to add competitor to cup'))
    }
  })

  router.post('/cup/:id/approve-pending', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, email, cupParticipantId } = req.body
    if (!shooterName) return res.status(400).json({ error: 'shooterName required' })

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    try {
      if (!cupParticipantId) {
        const errorMsg = `Cannot approve "${shooterName}" in CUP: shooter is not pending in CUP (only in matches)`
        return res.status(400).json({ error: errorMsg })
      }

      const approveResult = await ssiFindAndApproveCupParticipant(req.params.id, shooterName, cookies, email, cupParticipantId)
      if (!approveResult.success) {
        return res.status(400).json({ error: `Failed to approve competitor: ${approveResult.message}` })
      }

      res.json({ success: true, message: approveResult.message })
    } catch (err) {
      log.error('[manage] approve-pending error:', err.message)
      return next(internalError('Failed to approve pending competitor'))
    }
  })

  router.post('/cup/:id/remove-pending', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, email, cupParticipantId, matchParticipants = [] } = req.body
    if (!shooterName) return res.status(400).json({ error: 'shooterName required' })

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    try {
      const cupId = req.params.id
      const results = []

      if (cupParticipantId) {
        const deleteResult = await ssiFindAndDeleteCupParticipant(cupId, shooterName, cookies, email, cupParticipantId)
        results.push(deleteResult.success
          ? { location: 'CUP', success: true }
          : { location: 'CUP', success: false, error: deleteResult.message })
      }

      for (const mp of (matchParticipants || [])) {
        if (!mp.participantId) continue
        try {
          const matchDeleteResult = await ssiDeleteMatchParticipant(mp.matchId, mp.participantId, shooterName, cookies)
          results.push(matchDeleteResult.success
            ? { location: `Match: ${mp.matchName}`, success: true }
            : { location: `Match: ${mp.matchName}`, success: false, error: matchDeleteResult.message })
        } catch (err) {
          results.push({ location: `Match: ${mp.matchName}`, success: false, error: err.message })
        }
      }

      const anySuccess = results.some(r => r.success)
      const anyFailure = results.some(r => !r.success)

      if (!anySuccess) {
        const errors = results.filter(r => !r.success).map(r => `${r.location}: ${r.error}`).join('; ')
        return res.status(400).json({ error: `Failed to remove shooter: ${errors}` })
      }

      if (anyFailure) {
        const failures = results.filter(r => !r.success).map(r => `${r.location}: ${r.error}`).join('; ')
        return res.json({
          success: true,
          partial: true,
          message: `Partially removed (some failures: ${failures})`,
          results,
        })
      }

      res.json({ success: true, message: 'Removed from all locations', results })
    } catch (err) {
      log.error('[manage] remove-pending error:', err.message)
      return next(internalError('Failed to remove pending competitor'))
    }
  })

  async function applyDnsAction(req, res, next, dnsFn, errorLabel) {
    const { shooterName, email, cupParticipantId } = req.body
    if (!shooterName) return res.status(400).json({ error: 'shooterName required' })

    try {
      const adminSess = getAdminSession ? await getAdminSession() : null
      const cookies = adminSess?.cookies
      if (!cookies) return next(internalError('Admin session not available'))

      const results = []
      if (cupParticipantId) {
        const cupResult = await dnsFn(137, cupParticipantId, cookies)
        results.push({ location: 'CUP', success: cupResult.success, message: cupResult.message })
      }

      const cupData = await graphqlWithRefresh(req.ssiSession, MANAGE_CUP_MATCHES_QUERY, { id: req.params.id })
      if (cupData.event) {
        for (const match of getIncludedMatchIds(cupData.event)) {
          const participantId = await ssiFindCompetitorInMatch(match.id, shooterName, cookies, email)
          if (participantId) {
            const matchResult = await dnsFn(93, participantId, cookies)
            results.push({ location: match.name, success: matchResult.success, message: matchResult.message })
          } else {
            results.push({ location: match.name, success: false, message: 'Participant not found' })
          }
        }
      }

      res.json({ success: results.every(r => r.success) || results.some(r => r.success), results })
    } catch (err) {
      log.error(`[manage] ${errorLabel} error:`, err.message)
      return next(internalError(`Failed to ${errorLabel} DNS status`))
    }
  }

  router.post('/cup/:id/set-dns', requireAuth('manage'), (req, res, next) =>
    applyDnsAction(req, res, next, ssiSetDidNotShow, 'set')
  )

  router.post('/cup/:id/undo-dns', requireAuth('manage'), (req, res, next) =>
    applyDnsAction(req, res, next, ssiUndoDidNotShow, 'undo')
  )

  router.post('/cup/:id/toggle-paid', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, cupParticipantId } = req.body
    if (!shooterName || !cupParticipantId) {
      return res.status(400).json({ error: 'shooterName and cupParticipantId required' })
    }
    if (!paidToggleEnabled) {
      return res.status(403).json({ error: 'Paid toggle feature is disabled' })
    }

    try {
      const adminSess = getAdminSession ? await getAdminSession() : null
      const cookies = adminSess?.cookies
      if (!cookies) return next(internalError('Admin session not available'))

      const result = await ssiTogglePaid(137, cupParticipantId, cookies)
      res.json({ success: result.success, message: result.message })
    } catch (err) {
      log.error('[manage] toggle-paid error:', err.message)
      return next(internalError('Failed to toggle paid status'))
    }
  })

  return router
}
