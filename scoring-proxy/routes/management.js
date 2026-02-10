import express from 'express'
import { ssiSearchAndAddParticipant, ssiFindCompetitorInMatch, ssiSetParticipantSquad, ssiFindAndApproveCupParticipant, ssiFindAndDeleteCupParticipant, ssiDeleteMatchParticipant } from '../lib/ssi-client.js'

const router = express.Router()

export function createManagementRouter({ requireAuth, graphqlWithRefresh, IS_PROD }) {
  // ============================================================
  // GET /api/manage/cup/:id — Consolidated squadding overview
  // Requires manage auth
  // ============================================================
  router.get('/cup/:id', requireAuth('manage'), async (req, res) => {
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
      const componentMatches = (cup.component_matches || [])
        .filter(cm => cm.included && cm.match)
        .sort((a, b) => a.number - b.number)

      // Build match info with squads, match-level competitors, and squad-level competitors
      const matches = componentMatches.map(cm => {
        const m = cm.match
        const squads = (m.squads || []).map(sq => ({
          number: sq.number,
          name: sq.comment || `Squad ${sq.number}`,
          max: sq.max_competitors || 0,
          shooters: (sq.competitors || [])
            .filter(c => c.status === 'a')
            .map(c => ({
              id: c.id,
              firstName: c.first_name || '',
              lastName: c.last_name || '',
              email: c.email || '',
              hasEmailError: !c.email, // Flag for missing email
              name: `${c.first_name} ${c.last_name}`.trim()
            })),
        }))

        // All approved match-level participants (includes both squadded and unsquadded)
        const allParticipants = (m.competitors || [])
          .filter(c => c.status === 'a')
          .map(c => ({
            id: c.id,
            firstName: c.first_name || '',
            lastName: c.last_name || '',
            email: c.email || '',
            hasEmailError: !c.email, // Flag for missing email
            name: `${c.first_name} ${c.last_name}`.trim()
          }))

        // Pending match-level participants
        const pendingParticipants = (m.competitors || [])
          .filter(c => c.status === 'p')
          .map(c => ({
            id: c.id,
            firstName: c.first_name || '',
            lastName: c.last_name || '',
            email: c.email || '',
            hasEmailError: !c.email,
            name: `${c.first_name} ${c.last_name}`.trim(),
            status: 'p'
          }))

        return {
          id: m.id,
          name: m.name,
          componentNumber: cm.number,
          squads,
          allParticipants,
          pendingParticipants,
        }
      })

      // Collect all shooters across all matches
      // Track: which matches they're IN (as participant) and which squad (if any)
      // Use (firstName, lastName, email) triplet as key for unique identification
      // Note: shooters with missing email get a unique error key to prevent false matches
      const shooterMap = new Map() // key → { firstName, lastName, email, hasEmailError, name, matches: { matchId: squadNumber|null } }
      const makeShooterKey = (firstName, lastName, email) => {
        // If email is missing, create a unique error key to prevent false matches
        if (!email) {
          return `${firstName}|||${lastName}|||ERROR_NO_EMAIL_${Math.random()}`
        }
        return `${firstName}|||${lastName}|||${email}`
      }

      // First: add all match-level participants (squadNumber = null means unsquadded)
      for (const match of matches) {
        for (const participant of match.allParticipants) {
          const key = makeShooterKey(participant.firstName, participant.lastName, participant.email)
          if (!IS_PROD && participant.email) {
            console.log(`[manage] Match participant: ${participant.firstName} ${participant.lastName} (${participant.email}) -> key: ${key}`)
          }
          if (!shooterMap.has(key)) {
            shooterMap.set(key, {
              firstName: participant.firstName,
              lastName: participant.lastName,
              email: participant.email,
              hasEmailError: participant.hasEmailError,
              name: participant.name,
              matches: {}
            })
          }
          // Mark as in-match but unsquadded (null)
          shooterMap.get(key).matches[match.id] = null
        }
      }

      // Then: overlay squad assignments (overwrite null with squad number)
      for (const match of matches) {
        for (const squad of match.squads) {
          for (const shooter of squad.shooters) {
            const key = makeShooterKey(shooter.firstName, shooter.lastName, shooter.email)
            if (!shooterMap.has(key)) {
              shooterMap.set(key, {
                firstName: shooter.firstName,
                lastName: shooter.lastName,
                email: shooter.email,
                hasEmailError: shooter.hasEmailError,
                name: shooter.name,
                matches: {}
              })
            }
            shooterMap.get(key).matches[match.id] = squad.number
          }
        }
      }

      // CUP-level participants (approved) - store as keys for comparison
      // Note: CUP competitors can have email at competitor level OR nested in shooter object
      const cupParticipants = (cup.competitors || [])
        .filter(c => c.status === 'a')
        .map(c => {
          // Try email from competitor level first, then from shooter
          const email = c.email || c.shooter?.email || ''
          const firstName = c.shooter?.first_name || ''
          const lastName = c.shooter?.last_name || ''

          // Debug logging
          if (!IS_PROD) {
            console.log(`[manage] CUP competitor raw:`, {
              competitorEmail: c.email,
              shooterEmail: c.shooter?.email,
              resolvedEmail: email,
              firstName,
              lastName,
              emailType: typeof email,
              emailLength: email?.length,
              hasEmail: !!email
            })
          }

          return {
            firstName,
            lastName,
            email,
            hasEmailError: !email, // Flag for missing email
          }
        })
        .filter(p => p.firstName || p.lastName) // filter out completely empty entries

      // CUP-level participants (pending) - track separately
      const cupPending = (cup.competitors || [])
        .filter(c => c.status === 'p')
        .map(c => {
          const email = c.email || c.shooter?.email || ''
          const firstName = c.shooter?.first_name || ''
          const lastName = c.shooter?.last_name || ''
          return {
            id: c.id,
            firstName,
            lastName,
            email,
            hasEmailError: !email,
            name: `${firstName} ${lastName}`.trim(),
            status: 'p',
            location: 'cup'
          }
        })
        .filter(p => p.firstName || p.lastName)

      if (!IS_PROD) {
        console.log(`[manage] CUP participants: ${cupParticipants.length}, CUP pending: ${cupPending.length}, Match participants: ${shooterMap.size}`)
      }

      // Find CUP participants not in any match
      // Strict matching by (firstName, lastName, email) triplet
      // Exclude pending shooters from this comparison
      const cupOnly = []
      const cupKeySet = new Set(cupParticipants.map(p => makeShooterKey(p.firstName, p.lastName, p.email)))
      const pendingKeySet = new Set()

      // First, collect all pending shooter keys from CUP
      for (const p of cupPending) {
        const key = makeShooterKey(p.firstName, p.lastName, p.email)
        pendingKeySet.add(key)
      }

      // Also collect pending shooter keys from matches
      for (const match of matches) {
        for (const p of match.pendingParticipants) {
          const key = makeShooterKey(p.firstName, p.lastName, p.email)
          pendingKeySet.add(key)
        }
      }

      for (const cupP of cupParticipants) {
        const cupKey = makeShooterKey(cupP.firstName, cupP.lastName, cupP.email)

        // Defensive check: warn if email is missing (should never happen per SSI requirements)
        if (!cupP.email) {
          console.warn(`[manage] WARNING: CUP participant missing email: ${cupP.firstName} ${cupP.lastName}`)
        }

        // Only add to cupOnly if not in matches AND not pending
        if (!shooterMap.has(cupKey) && !pendingKeySet.has(cupKey)) {
          cupOnly.push({
            firstName: cupP.firstName,
            lastName: cupP.lastName,
            email: cupP.email,
            hasEmailError: cupP.hasEmailError,
            name: `${cupP.firstName} ${cupP.lastName}`.trim()
          })
        }
      }

      // Find match participants not in CUP
      // Strict matching by (firstName, lastName, email) triplet
      // Exclude pending shooters from this comparison
      const matchOnly = []
      for (const [key, shooter] of shooterMap) {
        // Defensive check: warn if email is missing (should never happen per SSI requirements)
        if (!shooter.email) {
          console.warn(`[manage] WARNING: Match participant missing email: ${shooter.firstName} ${shooter.lastName}`)
        }

        // Only add to matchOnly if not in CUP AND not pending
        if (!cupKeySet.has(key) && !pendingKeySet.has(key)) {
          matchOnly.push({
            firstName: shooter.firstName,
            lastName: shooter.lastName,
            email: shooter.email,
            hasEmailError: shooter.hasEmailError,
            name: shooter.name
          })
        }
      }

      // Consolidate pending shooters from CUP and matches
      // Group by shooter (email triplet) and track where they're pending
      const pendingMap = new Map()

      // Add CUP pending shooters
      for (const p of cupPending) {
        const key = makeShooterKey(p.firstName, p.lastName, p.email)
        if (!pendingMap.has(key)) {
          pendingMap.set(key, {
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            hasEmailError: p.hasEmailError,
            name: p.name,
            inCup: true,
            cupParticipantId: p.id, // Include CUP participant ID for email-based identification
            inMatches: []
          })
        }
      }

      // Add match pending shooters
      for (const match of matches) {
        for (const p of match.pendingParticipants) {
          const key = makeShooterKey(p.firstName, p.lastName, p.email)
          if (!pendingMap.has(key)) {
            pendingMap.set(key, {
              firstName: p.firstName,
              lastName: p.lastName,
              email: p.email,
              hasEmailError: p.hasEmailError,
              name: p.name,
              inCup: false,
              inMatches: []
            })
          }
          pendingMap.get(key).inMatches.push({
            matchId: match.id,
            matchName: match.name,
            componentNumber: match.componentNumber,
            participantId: p.id // Include participant ID for deletion
          })
        }
      }

      // IMPORTANT: Also check if CUP pending shooters are approved in matches
      // This handles the case where shooter is pending in CUP but already approved in matches
      // When clicking "poista", we need to delete from all matches regardless of their status
      for (const [key, pending] of pendingMap.entries()) {
        if (pending.inCup) {
          // This shooter is pending in CUP - check all matches for their participation
          for (const match of matches) {
            // Check if they're in allParticipants (approved, but not yet in inMatches)
            for (const p of match.allParticipants) {
              const matchKey = makeShooterKey(p.firstName, p.lastName, p.email)
              if (matchKey === key) {
                // Found the same shooter in this match - add if not already tracked
                const alreadyTracked = pending.inMatches.some(m => m.matchId === match.id)
                if (!alreadyTracked) {
                  pending.inMatches.push({
                    matchId: match.id,
                    matchName: match.name,
                    componentNumber: match.componentNumber,
                    participantId: p.id // Include participant ID for deletion
                  })
                }
                break
              }
            }
          }
        }
      }

      const pendingShooters = [...pendingMap.values()]

      res.json({
        cup: { id: cup.id, name: cup.name, starts: cup.starts },
        matches,
        shooters: [...shooterMap.values()],
        cupOnly,
        matchOnly,
        pendingShooters,
      })
    } catch (err) {
      console.error('Failed to fetch management data:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/assign-squad
  // Assign an unsquadded shooter to a squad in all component matches.
  // Body: { shooterName, squadNumber, email }
  // ============================================================
  router.post('/cup/:id/assign-squad', requireAuth('manage'), async (req, res) => {
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

      const matchIds = (cupData.event.component_matches || [])
        .filter(cm => cm.included && cm.match)
        .map(cm => cm.match.id)

      // Split name into first/last
      const nameParts = shooterName.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const results = []
      for (const matchId of matchIds) {
        // 2. Add shooter to match by name and email (email preferred for disambiguation)
        if (!IS_PROD) console.log(`[manage] Adding "${shooterName}" (${email || 'no email'}) to match ${matchId}`)
        const addResult = await ssiSearchAndAddParticipant(91, matchId, email, cookies, { firstName, lastName })
        if (!IS_PROD) console.log(`[manage] Add result: ${addResult.message}`)

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
      console.error('[manage] assign-squad error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/fix-squad
  // Fix inconsistent squad assignment across matches.
  // Body: { shooterName, targetSquad, email }
  // ============================================================
  router.post('/cup/:id/fix-squad', requireAuth('manage'), async (req, res) => {
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

      const matchIds = (cupData.event.component_matches || [])
        .filter(cm => cm.included && cm.match)
        .map(cm => cm.match.id)

      const nameParts = shooterName.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const results = []
      for (const matchId of matchIds) {
        // 2. Find participant in match
        let participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies, email)

        // 3. If not found, add them first using email for disambiguation
        if (!participantId) {
          if (!IS_PROD) console.log(`[manage] "${shooterName}" (${email || 'no email'}) not in match ${matchId}, adding...`)
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
      console.error('[manage] fix-squad error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/add-to-cup
  // Add a match-only shooter to the CUP and approve.
  // Body: { shooterName, email }
  // ============================================================
  router.post('/cup/:id/add-to-cup', requireAuth('manage'), async (req, res) => {
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
      if (!IS_PROD) console.log(`[manage] Adding "${shooterName}" (${email || 'no email'}) to cup ${cupId}`)
      const addResult = await ssiSearchAndAddParticipant(136, cupId, email, cookies, { firstName, lastName })
      if (!IS_PROD) console.log(`[manage] Cup add result: ${addResult.message}`)

      if (!addResult.success) {
        console.error(`[manage] Failed to add "${shooterName}" to cup: ${addResult.message}`)
        return res.status(400).json({ error: `Failed to add competitor: ${addResult.message}` })
      }

      // 2. Find and approve CUP participant
      const approveResult = await ssiFindAndApproveCupParticipant(cupId, shooterName, cookies, email)
      if (!IS_PROD) console.log(`[manage] Cup approve result: ${approveResult.message}`)

      if (!approveResult.success) {
        console.error(`[manage] Failed to approve "${shooterName}" in cup: ${approveResult.message}`)
        return res.status(400).json({ error: `Failed to approve competitor: ${approveResult.message}` })
      }

      res.json({ success: true, message: approveResult.message })
    } catch (err) {
      console.error('[manage] add-to-cup error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/approve-pending
  // Approve a pending shooter in CUP (and optionally in matches)
  // Body: { shooterName, email, cupParticipantId }
  // Note: This endpoint only approves in CUP. Shooters pending only in matches
  //       should be approved at the match level, not CUP level.
  // ============================================================
  router.post('/cup/:id/approve-pending', requireAuth('manage'), async (req, res) => {
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
        console.warn(`[manage] ${errorMsg}`)
        return res.status(400).json({ error: errorMsg })
      }

      // Approve CUP participant (with ID-based identification)
      if (!IS_PROD) console.log(`[manage] Approving pending shooter "${shooterName}" (${email || 'no email'}) ID=${cupParticipantId} in cup ${cupId}`)
      const approveResult = await ssiFindAndApproveCupParticipant(cupId, shooterName, cookies, email, cupParticipantId)
      if (!IS_PROD) console.log(`[manage] Cup approve result: ${approveResult.message}`)

      if (!approveResult.success) {
        console.error(`[manage] Failed to approve "${shooterName}" in cup: ${approveResult.message}`)
        return res.status(400).json({ error: `Failed to approve competitor: ${approveResult.message}` })
      }

      res.json({ success: true, message: approveResult.message })
    } catch (err) {
      console.error('[manage] approve-pending error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /api/manage/cup/:id/remove-pending
  // Remove/delete a pending shooter from both CUP and all Matches
  // Body: { shooterName, email, cupParticipantId, matchParticipants: [{matchId, participantId, matchName}] }
  // Deletes shooter from CUP (if present) and from all matches (if present).
  // This ensures shooters are removed from both Cup and Matches when they click "Poista".
  // ============================================================
  router.post('/cup/:id/remove-pending', requireAuth('manage'), async (req, res) => {
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
        if (!IS_PROD) console.log(`[manage] Removing pending shooter "${shooterName}" (${email || 'no email'}) ID=${cupParticipantId} from cup ${cupId}`)
        const deleteResult = await ssiFindAndDeleteCupParticipant(cupId, shooterName, cookies, email, cupParticipantId)
        if (!IS_PROD) console.log(`[manage] Cup delete result: ${deleteResult.message}`)

        if (!deleteResult.success) {
          console.error(`[manage] Failed to remove "${shooterName}" from cup: ${deleteResult.message}`)
          results.push({ location: 'CUP', success: false, error: deleteResult.message })
        } else {
          results.push({ location: 'CUP', success: true })
        }
      } else {
        if (!IS_PROD) console.log(`[manage] Skipping CUP delete for "${shooterName}" (not in CUP)`)
      }

      // Delete from all matches if present
      if (matchParticipants && matchParticipants.length > 0) {
        if (!IS_PROD) console.log(`[manage] Removing "${shooterName}" from ${matchParticipants.length} match(es)`)

        for (const mp of matchParticipants) {
          if (!mp.participantId) {
            console.warn(`[manage] Missing participantId for match ${mp.matchId}, skipping`)
            continue
          }

          try {
            const matchDeleteResult = await ssiDeleteMatchParticipant(mp.matchId, mp.participantId, shooterName, cookies)
            if (!IS_PROD) console.log(`[manage] Match ${mp.matchName} delete result: ${matchDeleteResult.message}`)

            if (!matchDeleteResult.success) {
              console.error(`[manage] Failed to remove "${shooterName}" from match ${mp.matchName}: ${matchDeleteResult.message}`)
              results.push({ location: `Match: ${mp.matchName}`, success: false, error: matchDeleteResult.message })
            } else {
              results.push({ location: `Match: ${mp.matchName}`, success: true })
            }
          } catch (err) {
            console.error(`[manage] Error removing from match ${mp.matchName}:`, err.message)
            results.push({ location: `Match: ${mp.matchName}`, success: false, error: err.message })
          }
        }
      } else {
        if (!IS_PROD) console.log(`[manage] Skipping match deletions for "${shooterName}" (not in any matches)`)
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
      console.error('[manage] remove-pending error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
