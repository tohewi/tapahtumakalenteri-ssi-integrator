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
              competitors { id status email shooter { first_name last_name email } }
              component_matches {
                number included
                match {
                  id name
                  competitors {
                    id status email
                    first_name last_name
                  }
                  squads {
                    id number comment
                    ... on NordicSquadNode {
                      max_competitors
                      competitors {
                        id status email
                        first_name last_name
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
              name: `${c.first_name} ${c.last_name}`.trim(),
              email: c.email || null,
              firstName: c.first_name,
              lastName: c.last_name
            })),
        }))

        // All approved match-level participants (includes both squadded and unsquadded)
        const allParticipants = (m.competitors || [])
          .filter(c => c.status === 'a')
          .map(c => ({ 
            id: c.id, 
            name: `${c.first_name} ${c.last_name}`.trim(),
            email: c.email || null,
            firstName: c.first_name,
            lastName: c.last_name
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
      // Use email as primary key; if email is missing, use a unique key with name
      const shooterMap = new Map() // email → { email, firstName, lastName, name, matches: { matchId: squadNumber|null } }

      // Helper to get unique key for a shooter (email is primary, fallback to generated unique key)
      const getShooterKey = (participant) => {
        if (participant.email && participant.email.trim()) {
          return participant.email.trim().toLowerCase()
        }
        // Generate unique key for missing email to prevent false matches
        return `NO_EMAIL_${participant.firstName}_${participant.lastName}_${Math.random().toString(36).substr(2, 9)}`
      }

      // First: add all match-level participants (squadNumber = null means unsquadded)
      for (const match of matches) {
        for (const participant of match.allParticipants) {
          const key = getShooterKey(participant)
          if (!shooterMap.has(key)) {
            shooterMap.set(key, { 
              email: participant.email || null,
              firstName: participant.firstName,
              lastName: participant.lastName,
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
            const key = getShooterKey(shooter)
            if (!shooterMap.has(key)) {
              shooterMap.set(key, { 
                email: shooter.email || null,
                firstName: shooter.firstName,
                lastName: shooter.lastName,
                name: shooter.name, 
                matches: {} 
              })
            }
            shooterMap.get(key).matches[match.id] = squad.number
          }
        }
      }

      // CUP-level participants (approved) - now using email-based map
      const cupParticipantsMap = new Map() // email → { email, firstName, lastName, name }
      for (const c of (cup.competitors || [])) {
        if (c.status === 'a') {
          const firstName = c.shooter?.first_name || ''
          const lastName = c.shooter?.last_name || ''
          const name = `${firstName} ${lastName}`.trim()
          if (name.length === 0) continue
          
          // Email can be at competitor level OR shooter level (check both)
          const email = c.email || c.shooter?.email || null
          
          if (email && email.trim()) {
            const key = email.trim().toLowerCase()
            cupParticipantsMap.set(key, { email, firstName, lastName, name })
          } else {
            // If no email, create unique key to avoid false matches
            const uniqueKey = `NO_EMAIL_CUP_${firstName}_${lastName}_${Math.random().toString(36).substr(2, 9)}`
            cupParticipantsMap.set(uniqueKey, { email: null, firstName, lastName, name })
          }
        }
      }

      // Find CUP participants not in ANY match (not even as unsquadded participant)
      const matchParticipantKeys = new Set(shooterMap.keys())
      const cupOnly = []
      for (const [cupKey, cupData] of cupParticipantsMap.entries()) {
        if (!matchParticipantKeys.has(cupKey)) {
          cupOnly.push(cupData)
        }
      }

      // Find match participants not in CUP
      const cupParticipantKeys = new Set(cupParticipantsMap.keys())
      const matchOnly = []
      for (const [matchKey, matchData] of shooterMap.entries()) {
        if (!cupParticipantKeys.has(matchKey)) {
          matchOnly.push(matchData)
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
  // Body: { shooterName, shooterEmail, squadNumber }
  // ============================================================
  router.post('/cup/:id/assign-squad', requireAuth('manage'), async (req, res) => {
    const { shooterName, shooterEmail, squadNumber } = req.body
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

      // Split name into first/last for SSI search
      const nameParts = shooterName.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const results = []
      for (const matchId of matchIds) {
        // 2. Add shooter to match (prefer email if available)
        if (!IS_PROD) console.log(`[manage] Adding "${shooterName}" <${shooterEmail || 'no email'}> to match ${matchId}`)
        const addResult = await ssiSearchAndAddParticipant(91, matchId, shooterEmail, cookies, { firstName, lastName })
        if (!IS_PROD) console.log(`[manage] Add result: ${addResult.message}`)

        // 3. Find participant ID in the match
        const participantId = await ssiFindCompetitorInMatch(matchId, shooterName, shooterEmail, cookies)
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
  // Body: { shooterName, shooterEmail, targetSquad }
  // ============================================================
  router.post('/cup/:id/fix-squad', requireAuth('manage'), async (req, res) => {
    const { shooterName, shooterEmail, targetSquad } = req.body
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
        let participantId = await ssiFindCompetitorInMatch(matchId, shooterName, shooterEmail, cookies)

        // 3. If not found, add them first (prefer email if available)
        if (!participantId) {
          if (!IS_PROD) console.log(`[manage] "${shooterName}" <${shooterEmail || 'no email'}> not in match ${matchId}, adding...`)
          await ssiSearchAndAddParticipant(91, matchId, shooterEmail, cookies, { firstName, lastName })
          participantId = await ssiFindCompetitorInMatch(matchId, shooterName, shooterEmail, cookies)
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
  // Body: { shooterName, shooterEmail }
  // ============================================================
  router.post('/cup/:id/add-to-cup', requireAuth('manage'), async (req, res) => {
    const { shooterName, shooterEmail } = req.body
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

      // 1. Search-and-add to CUP (CT=136) - prefer email if available
      if (!IS_PROD) console.log(`[manage] Adding "${shooterName}" <${shooterEmail || 'no email'}> to cup ${cupId}`)
      const addResult = await ssiSearchAndAddParticipant(136, cupId, shooterEmail, cookies, { firstName, lastName })
      if (!IS_PROD) console.log(`[manage] Cup add result: ${addResult.message}`)

      if (!addResult.success) {
        console.error(`[manage] Failed to add "${shooterName}" to cup: ${addResult.message}`)
        return res.status(400).json({ error: `Failed to add competitor: ${addResult.message}` })
      }

      // 2. Find and approve CUP participant
      const approveResult = await ssiFindAndApproveCupParticipant(cupId, shooterName, shooterEmail, cookies)
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
