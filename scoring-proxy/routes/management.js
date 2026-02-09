import express from 'express'
import { ssiSearchAndAddParticipant, ssiFindCompetitorInMatch, ssiSetParticipantSquad, ssiFindAndApproveCupParticipant } from '../lib/ssi-client.js'

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
              competitors { id status shooter { first_name last_name email } }
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
            name: `${c.first_name} ${c.last_name}`.trim()
          }))

        return {
          id: m.id,
          name: m.name,
          componentNumber: cm.number,
          squads,
          allParticipants,
        }
      })

      // Collect all shooters across all matches
      // Track: which matches they're IN (as participant) and which squad (if any)
      // Use (firstName, lastName, email) triplet as key for unique identification
      const shooterMap = new Map() // key → { firstName, lastName, email, name, matches: { matchId: squadNumber|null } }
      const makeShooterKey = (firstName, lastName, email) => `${firstName}|||${lastName}|||${email}`

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
                name: shooter.name,
                matches: {}
              })
            }
            shooterMap.get(key).matches[match.id] = squad.number
          }
        }
      }

      // CUP-level participants (approved) - store as keys for comparison
      // Note: CUP competitors have nested shooter object, match competitors have fields directly
      const cupParticipants = (cup.competitors || [])
        .filter(c => c.status === 'a')
        .map(c => ({
          firstName: c.shooter?.first_name || '',
          lastName: c.shooter?.last_name || '',
          email: c.shooter?.email || '',
        }))
        .filter(p => p.firstName || p.lastName) // filter out completely empty entries

      if (!IS_PROD) {
        console.log(`[manage] CUP participants: ${cupParticipants.length}, Match participants: ${shooterMap.size}`)
      }

      // Find CUP participants not in any match
      // Strict matching by (firstName, lastName, email) triplet
      const cupOnly = []
      const cupKeySet = new Set(cupParticipants.map(p => makeShooterKey(p.firstName, p.lastName, p.email)))

      for (const cupP of cupParticipants) {
        const cupKey = makeShooterKey(cupP.firstName, cupP.lastName, cupP.email)

        // Defensive check: warn if email is missing (should never happen per SSI requirements)
        if (!cupP.email) {
          console.warn(`[manage] WARNING: CUP participant missing email: ${cupP.firstName} ${cupP.lastName}`)
        }

        if (!shooterMap.has(cupKey)) {
          cupOnly.push({
            firstName: cupP.firstName,
            lastName: cupP.lastName,
            email: cupP.email,
            name: `${cupP.firstName} ${cupP.lastName}`.trim()
          })
        }
      }

      // Find match participants not in CUP
      // Strict matching by (firstName, lastName, email) triplet
      const matchOnly = []
      for (const [key, shooter] of shooterMap) {
        // Defensive check: warn if email is missing (should never happen per SSI requirements)
        if (!shooter.email) {
          console.warn(`[manage] WARNING: Match participant missing email: ${shooter.firstName} ${shooter.lastName}`)
        }

        if (!cupKeySet.has(key)) {
          matchOnly.push({
            firstName: shooter.firstName,
            lastName: shooter.lastName,
            email: shooter.email,
            name: shooter.name
          })
        }
      }

      res.json({
        cup: { id: cup.id, name: cup.name, starts: cup.starts },
        matches,
        shooters: [...shooterMap.values()],
        cupOnly,
        matchOnly,
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
        const participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies)
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
        let participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies)

        // 3. If not found, add them first using email for disambiguation
        if (!participantId) {
          if (!IS_PROD) console.log(`[manage] "${shooterName}" (${email || 'no email'}) not in match ${matchId}, adding...`)
          await ssiSearchAndAddParticipant(91, matchId, email, cookies, { firstName, lastName })
          participantId = await ssiFindCompetitorInMatch(matchId, shooterName, cookies)
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
      const approveResult = await ssiFindAndApproveCupParticipant(cupId, shooterName, cookies)
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

  return router
}
