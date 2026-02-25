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
} from '../lib/services/cup-manage.js'
import { log } from '../lib/logger.js'
import { AppError } from '../lib/errors/AppError.js'

function internalError(message) {
  return new AppError(message, 500, 'INTERNAL_ERROR')
}

export function createManagementRouter({ requireAuth, graphqlWithRefresh, adminGraphQL, getAdminSession }) {
  const router = express.Router()

  // ============================================================
  // GET /api/manage/cups — List cups available for management
  // Returns cups that haven't ended yet, regardless of registration status.
  // Uses admin GraphQL to query SSI events (same as registration endpoint
  // but with relaxed filtering: no registration status check, uses end date).
  // ============================================================
  router.get('/cups', requireAuth('manage'), async (req, res, next) => {
    try {
      const result = await adminGraphQL(`
        query {
          events(search: "Kupittaa CUP") {
            id name starts ends status get_content_type_key
            max_competitors
            registration
            ... on NordicSerieNode {
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

      const cups = filterManageableCups(result.events)

      res.json({ cups })
    } catch (err) {
      log.error('[manage] Failed to list cups:', err.message)
      return next(internalError('Hallintapalvelu ei ole käytettävissä.'))
    }
  })

  // ============================================================
  // GET /api/manage/cup/:id — Consolidated squadding overview
  // Requires manage auth
  // ============================================================
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
                  competitors {
                    id status
                    first_name last_name email
                  }
                  squads {
                    id number comment
                    ... on NordicSquadNode {
                      max_competitors
                      competitors {
                        id status
                        first_name last_name email
                      }
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

      // Build consolidated squadding overview (pure data transformation)
      const { matches, shooters, cupOnly, matchOnly, pendingShooters } = buildSquaddingOverview(cup)

      // Scrape paid/DNS status from CUP participants page (admin cookies)
      let cupParticipantStatuses = new Map()
      try {
        const adminSess = getAdminSession ? await getAdminSession() : null
        log.debug(`[manage] Admin session available: ${!!adminSess}, has cookies: ${!!adminSess?.cookies}`)
        if (adminSess?.cookies) {
          cupParticipantStatuses = await ssiGetCupParticipantStatuses(req.params.id, adminSess.cookies)
          log.debug(`[manage] Scraped paid/DNS status for ${cupParticipantStatuses.size} CUP participants`)
          let i = 0
          for (const [id, status] of cupParticipantStatuses) {
            if (i++ >= 3) break
            log.debug(`[manage]   participant ${id}: paid=${status.paid}, didNotShow=${status.didNotShow}`)
          }
        }
      } catch (err) {
        log.error(`[manage] Failed to scrape paid/DNS status: ${err.message}`)
      }

      // Attach paid/DNS status to shooters
      const { shootersWithStatus, cupOnlyWithStatus } = attachCupStatuses(
        shooters, cupOnly, cup.competitors, cupParticipantStatuses
      )

      res.json({
        cup: { id: cup.id, name: cup.name, starts: cup.starts },
        matches,
        shooters: shootersWithStatus,
        cupOnly: cupOnlyWithStatus,
        matchOnly,
        pendingShooters,
      })
    } catch (err) {
      log.error('[manage] Failed to fetch management data:', err.message)
      return next(internalError('Failed to fetch management data'))
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/assign-squad
  // Assign an unsquadded shooter to a squad in all component matches.
  // Body: { shooterName, squadNumber, email }
  // ============================================================
  router.post('/cup/:id/assign-squad', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, squadNumber, email } = req.body
    if (!shooterName || !squadNumber) {
      return res.status(400).json({ error: 'shooterName and squadNumber required' })
    }

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    try {
      // 1. Get cup component matches
      const cupData = await graphqlWithRefresh(req.ssiSession, `
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
      `, { id: req.params.id })

      if (!cupData.event) return res.status(404).json({ error: 'Cup not found' })

      const matchIds = getIncludedMatchIds(cupData.event).map(m => m.id)

      // Split name into first/last
      const nameParts = shooterName.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const results = []
      for (const matchId of matchIds) {
        // 2. Add shooter to match by name and email (email preferred for disambiguation)
        log.debug(`[manage] Adding "${shooterName}" (${email || 'no email'}) to match ${matchId}`)
        const addResult = await ssiSearchAndAddParticipant(91, matchId, email, cookies, { firstName, lastName })
        log.debug(`[manage] Add result: ${addResult.message}`)

        // 3. Find participant ID in the match
        const participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies, email)
        if (!participantId) {
          results.push({ matchId, success: false, message: 'Could not find participant after adding' })
          continue
        }

        // 4. Set squad
        const sqResult = await ssiSetParticipantSquad(participantId, squadNumber, cookies)
        results.push({ matchId, success: sqResult.success, message: sqResult.message || 'OK' })
      }

      const allOk = results.every(r => r.success)
      res.json({ success: allOk, results })
    } catch (err) {
      log.error('[manage] assign-squad error:', err.message)
      return next(internalError('Failed to assign squad'))
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/fix-squad
  // Fix inconsistent squad assignment across matches.
  // Body: { shooterName, targetSquad, email }
  // ============================================================
  router.post('/cup/:id/fix-squad', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, targetSquad, email } = req.body
    if (!shooterName || !targetSquad) {
      return res.status(400).json({ error: 'shooterName and targetSquad required' })
    }

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    try {
      // 1. Get cup component matches
      const cupData = await graphqlWithRefresh(req.ssiSession, `
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
      `, { id: req.params.id })

      if (!cupData.event) return res.status(404).json({ error: 'Cup not found' })

      const matchIds = getIncludedMatchIds(cupData.event).map(m => m.id)

      const nameParts = shooterName.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const results = []
      for (const matchId of matchIds) {
        // 2. Find participant in match
        let participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies, email)

        // 3. If not found, add them first using email for disambiguation
        if (!participantId) {
          log.debug(`[manage] "${shooterName}" (${email || 'no email'}) not in match ${matchId}, adding...`)
          await ssiSearchAndAddParticipant(91, matchId, email, cookies, { firstName, lastName })
          participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies, email)
        }

        if (!participantId) {
          results.push({ matchId, success: false, message: 'Could not find or add participant' })
          continue
        }

        // 4. Set squad
        const sqResult = await ssiSetParticipantSquad(participantId, targetSquad, cookies)
        results.push({ matchId, success: sqResult.success, message: sqResult.message || 'OK' })
      }

      const allOk = results.every(r => r.success)
      res.json({ success: allOk, results })
    } catch (err) {
      log.error('[manage] fix-squad error:', err.message)
      return next(internalError('Failed to fix squad assignment'))
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/add-to-cup
  // Add a match-only shooter to the CUP and approve.
  // Body: { shooterName, email }
  // ============================================================
  router.post('/cup/:id/add-to-cup', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, email } = req.body
    if (!shooterName) {
      return res.status(400).json({ error: 'shooterName required' })
    }

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    try {
      const cupId = req.params.id
      const nameParts = shooterName.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      // 1. Search-and-add to CUP (CT=136) using email for disambiguation
      log.debug(`[manage] Adding "${shooterName}" (${email || 'no email'}) to cup ${cupId}`)
      const addResult = await ssiSearchAndAddParticipant(136, cupId, email, cookies, { firstName, lastName })
      log.debug(`[manage] Cup add result: ${addResult.message}`)

      if (!addResult.success) {
        log.error(`[manage] Failed to add "${shooterName}" to cup: ${addResult.message}`)
        return res.status(400).json({ error: `Failed to add competitor: ${addResult.message}` })
      }

      // 2. Find and approve CUP participant
      const approveResult = await ssiFindAndApproveCupParticipant(cupId, shooterName, cookies, email)
      log.debug(`[manage] Cup approve result: ${approveResult.message}`)

      if (!approveResult.success) {
        log.error(`[manage] Failed to approve "${shooterName}" in cup: ${approveResult.message}`)
        return res.status(400).json({ error: `Failed to approve competitor: ${approveResult.message}` })
      }

      res.json({ success: true, message: approveResult.message })
    } catch (err) {
      log.error('[manage] add-to-cup error:', err.message)
      return next(internalError('Failed to add competitor to cup'))
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/approve-pending
  // Approve a pending shooter in CUP (and optionally in matches)
  // Body: { shooterName, email, cupParticipantId }
  // Note: This endpoint only approves in CUP. Shooters pending only in matches
  //       should be approved at the match level, not CUP level.
  // ============================================================
  router.post('/cup/:id/approve-pending', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, email, cupParticipantId } = req.body
    if (!shooterName) {
      return res.status(400).json({ error: 'shooterName required' })
    }

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    try {
      const cupId = req.params.id

      // Check if shooter is actually in the CUP
      if (!cupParticipantId) {
        const errorMsg = `Cannot approve "${shooterName}" in CUP: shooter is not pending in CUP (only in matches)`
        log.warn(`[manage] ${errorMsg}`)
        return res.status(400).json({ error: errorMsg })
      }

      // Approve CUP participant (with ID-based identification)
      log.debug(`[manage] Approving pending shooter "${shooterName}" (${email || 'no email'}) ID=${cupParticipantId} in cup ${cupId}`)
      const approveResult = await ssiFindAndApproveCupParticipant(cupId, shooterName, cookies, email, cupParticipantId)
      log.debug(`[manage] Cup approve result: ${approveResult.message}`)

      if (!approveResult.success) {
        log.error(`[manage] Failed to approve "${shooterName}" in cup: ${approveResult.message}`)
        return res.status(400).json({ error: `Failed to approve competitor: ${approveResult.message}` })
      }

      res.json({ success: true, message: approveResult.message })
    } catch (err) {
      log.error('[manage] approve-pending error:', err.message)
      return next(internalError('Failed to approve pending competitor'))
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/remove-pending
  // Remove/delete a pending shooter from both CUP and all Matches
  // Body: { shooterName, email, cupParticipantId, matchParticipants: [{matchId, participantId, matchName}] }
  // Deletes shooter from CUP (if present) and from all matches (if present).
  // This ensures shooters are removed from both Cup and Matches when they click "Poista".
  // ============================================================
  router.post('/cup/:id/remove-pending', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, email, cupParticipantId, matchParticipants = [] } = req.body
    if (!shooterName) {
      return res.status(400).json({ error: 'shooterName required' })
    }

    const cookies = req.ssiSession.ssiCookies
    if (!cookies) return res.status(401).json({ error: 'No SSI session cookies' })

    try {
      const cupId = req.params.id
      const results = []

      // Delete from CUP if present
      if (cupParticipantId) {
        log.debug(`[manage] Removing pending shooter "${shooterName}" (${email || 'no email'}) ID=${cupParticipantId} from cup ${cupId}`)
        const deleteResult = await ssiFindAndDeleteCupParticipant(cupId, shooterName, cookies, email, cupParticipantId)
        log.debug(`[manage] Cup delete result: ${deleteResult.message}`)

        if (!deleteResult.success) {
          log.error(`[manage] Failed to remove "${shooterName}" from cup: ${deleteResult.message}`)
          results.push({ location: 'CUP', success: false, error: deleteResult.message })
        } else {
          results.push({ location: 'CUP', success: true })
        }
      } else {
        log.debug(`[manage] Skipping CUP delete for "${shooterName}" (not in CUP)`)
      }

      // Delete from all matches if present
      if (matchParticipants && matchParticipants.length > 0) {
        log.debug(`[manage] Removing "${shooterName}" from ${matchParticipants.length} match(es)`)

        for (const mp of matchParticipants) {
          if (!mp.participantId) {
            log.warn(`[manage] Missing participantId for match ${mp.matchId}, skipping`)
            continue
          }

          try {
            const matchDeleteResult = await ssiDeleteMatchParticipant(mp.matchId, mp.participantId, shooterName, cookies)
            log.debug(`[manage] Match ${mp.matchName} delete result: ${matchDeleteResult.message}`)

            if (!matchDeleteResult.success) {
              log.error(`[manage] Failed to remove "${shooterName}" from match ${mp.matchName}: ${matchDeleteResult.message}`)
              results.push({ location: `Match: ${mp.matchName}`, success: false, error: matchDeleteResult.message })
            } else {
              results.push({ location: `Match: ${mp.matchName}`, success: true })
            }
          } catch (err) {
            log.error(`[manage] Error removing from match ${mp.matchName}:`, err.message)
            results.push({ location: `Match: ${mp.matchName}`, success: false, error: err.message })
          }
        }
      } else {
        log.debug(`[manage] Skipping match deletions for "${shooterName}" (not in any matches)`)
      }

      // Check if any deletion succeeded
      const anySuccess = results.some(r => r.success)
      const anyFailure = results.some(r => !r.success)

      if (!anySuccess) {
        // All deletions failed
        const errors = results.filter(r => !r.success).map(r => `${r.location}: ${r.error}`).join('; ')
        return res.status(400).json({ error: `Failed to remove shooter: ${errors}` })
      }

      if (anyFailure) {
        // Some succeeded, some failed
        const failures = results.filter(r => !r.success).map(r => `${r.location}: ${r.error}`).join('; ')
        return res.json({
          success: true,
          partial: true,
          message: `Partially removed (some failures: ${failures})`,
          results
        })
      }

      // All succeeded
      res.json({ success: true, message: 'Removed from all locations', results })
    } catch (err) {
      log.error('[manage] remove-pending error:', err.message)
      return next(internalError('Failed to remove pending competitor'))
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/set-dns
  // Set "Did Not Show" on a shooter at CUP level + all matches
  // Body: { shooterName, email, cupParticipantId }
  // Uses admin cookies for web scraping (SSI has no GraphQL write support)
  // ============================================================
  router.post('/cup/:id/set-dns', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, email, cupParticipantId } = req.body
    if (!shooterName) {
      return res.status(400).json({ error: 'shooterName required' })
    }

    try {
      const adminSess = getAdminSession ? await getAdminSession() : null
      const cookies = adminSess?.cookies
      if (!cookies) return next(internalError('Admin session not available'))

      const cupId = req.params.id
      const results = []

      // 1. Set DNS on CUP participant (ct=137)
      if (cupParticipantId) {
        log.debug(`[manage] Setting DNS on CUP participant ${cupParticipantId} ("${shooterName}")`)
        const cupResult = await ssiSetDidNotShow(137, cupParticipantId, cookies)
        results.push({ location: 'CUP', success: cupResult.success, message: cupResult.message })
      } else {
        log.debug(`[manage] No cupParticipantId for "${shooterName}", skipping CUP DNS`)
      }

      // 2. Set DNS on all match participants (ct=93)
      // Get cup component matches and find participant IDs
      const cupData = await graphqlWithRefresh(req.ssiSession, `
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
      `, { id: cupId })

      if (cupData.event) {
        const matchList = getIncludedMatchIds(cupData.event)

        for (const match of matchList) {
          const participantId = await ssiFindCompetitorInMatch(match.id, shooterName, cookies, email)
          if (participantId) {
            log.debug(`[manage] Setting DNS on match ${match.name} participant ${participantId}`)
            const matchResult = await ssiSetDidNotShow(93, participantId, cookies)
            results.push({ location: match.name, success: matchResult.success, message: matchResult.message })
          } else {
            log.debug(`[manage] "${shooterName}" not found in match ${match.name}`)
            results.push({ location: match.name, success: false, message: 'Participant not found' })
          }
        }
      }

      const allOk = results.every(r => r.success)
      res.json({ success: allOk || results.some(r => r.success), results })
    } catch (err) {
      log.error('[manage] set-dns error:', err.message)
      return next(internalError('Failed to set DNS status'))
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/undo-dns
  // Undo "Did Not Show" on a shooter at CUP level + all matches
  // Body: { shooterName, email, cupParticipantId }
  // ============================================================
  router.post('/cup/:id/undo-dns', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, email, cupParticipantId } = req.body
    if (!shooterName) {
      return res.status(400).json({ error: 'shooterName required' })
    }

    try {
      const adminSess = getAdminSession ? await getAdminSession() : null
      const cookies = adminSess?.cookies
      if (!cookies) return next(internalError('Admin session not available'))

      const cupId = req.params.id
      const results = []

      // 1. Undo DNS on CUP participant (ct=137)
      if (cupParticipantId) {
        log.debug(`[manage] Undoing DNS on CUP participant ${cupParticipantId} ("${shooterName}")`)
        const cupResult = await ssiUndoDidNotShow(137, cupParticipantId, cookies)
        results.push({ location: 'CUP', success: cupResult.success, message: cupResult.message })
      }

      // 2. Undo DNS on all match participants (ct=93)
      const cupData = await graphqlWithRefresh(req.ssiSession, `
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
      `, { id: cupId })

      if (cupData.event) {
        const matchList = getIncludedMatchIds(cupData.event)

        for (const match of matchList) {
          const participantId = await ssiFindCompetitorInMatch(match.id, shooterName, cookies, email)
          if (participantId) {
            log.debug(`[manage] Undoing DNS on match ${match.name} participant ${participantId}`)
            const matchResult = await ssiUndoDidNotShow(93, participantId, cookies)
            results.push({ location: match.name, success: matchResult.success, message: matchResult.message })
          } else {
            results.push({ location: match.name, success: false, message: 'Participant not found' })
          }
        }
      }

      const allOk = results.every(r => r.success)
      res.json({ success: allOk || results.some(r => r.success), results })
    } catch (err) {
      log.error('[manage] undo-dns error:', err.message)
      return next(internalError('Failed to undo DNS status'))
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/toggle-paid
  // Toggle paid status on a CUP participant (cup level only)
  // Body: { shooterName, cupParticipantId }
  // ============================================================
  router.post('/cup/:id/toggle-paid', requireAuth('manage'), async (req, res, next) => {
    const { shooterName, cupParticipantId } = req.body
    if (!shooterName || !cupParticipantId) {
      return res.status(400).json({ error: 'shooterName and cupParticipantId required' })
    }

    try {
      const adminSess = getAdminSession ? await getAdminSession() : null
      const cookies = adminSess?.cookies
      if (!cookies) return next(internalError('Admin session not available'))

      log.debug(`[manage] Toggling paid for CUP participant ${cupParticipantId} ("${shooterName}")`)
      const result = await ssiTogglePaid(137, cupParticipantId, cookies)
      log.debug(`[manage] Toggle paid result: ${result.message}`)

      res.json({ success: result.success, message: result.message })
    } catch (err) {
      log.error('[manage] toggle-paid error:', err.message)
      return next(internalError('Failed to toggle paid status'))
    }
  })

  return router
}
