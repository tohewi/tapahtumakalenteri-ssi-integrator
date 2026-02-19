import express from 'express'
import { ssiGetEventStaff } from '../lib/ssi-client.js'
import { log } from '../lib/logger.js'

export function createReportsRouter({ requireAuth, graphqlWithRefresh }) {
  const router = express.Router()
  // ============================================================
  // POST /api/report/summary — Summary report for selected matches
  // Body: { matches: [{ id, contentType }, ...] }
  // Returns per-match: name, date, shooterCount, squadCount, shootersPerSquad, staff, staffCount
  // ============================================================
  router.post('/summary', requireAuth('reporting'), async (req, res) => {
    let matchList = req.body.matches
    if (!matchList && Array.isArray(req.body.matchIds)) {
      matchList = req.body.matchIds.map(id => ({ id, contentType: 91 }))
    }
    if (!Array.isArray(matchList) || matchList.length === 0) {
      return res.status(400).json({ error: 'matches array required' })
    }
    if (matchList.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 matches per report' })
    }

    try {
      const rows = []

      for (const { id: matchId, contentType } of matchList) {
        const ct = contentType || 91
        const result = await graphqlWithRefresh(req.ssiSession, `
          query SummaryMatch($ct: Int!, $id: String!) {
            event(content_type: $ct, id: $id) {
              id
              name
              starts
              squads {
                id
                number
                comment
                ... on NordicSquadNode {
                  competitors { id status first_name last_name }
                }
                ... on IpscSquadNode {
                  competitors { id status first_name last_name }
                }
                ... on PpcSquadNode {
                  competitors { id status first_name last_name }
                }
                ... on CmpSquadNode {
                  competitors { id status first_name last_name }
                }
                ... on PrecisionSquadNode {
                  competitors { id status first_name last_name }
                }
                ... on GenericSquadNode {
                  competitors { id status first_name last_name }
                }
              }
            }
          }
        `, { ct, id: String(matchId) })

        if (!result.event) continue

        const match = result.event
        const matchDate = match.starts ? match.starts.split('T')[0] : ''

        // Scrape staff page to get admin names
        let staffNames = new Set()
        try {
          if (req.ssiSession.ssiCookies) {
            const staffList = await ssiGetEventStaff(ct, matchId, req.ssiSession.ssiCookies)
            for (const s of staffList) {
              staffNames.add(s.name.toLowerCase())
            }
          }
        } catch (staffErr) {
          log.debug(`[summary] Could not fetch staff for event ${ct}/${matchId}: ${staffErr.message}`)
        }

        // Build per-squad details with shooter count and admin count
        const allShooterNames = new Set()
        const allAdminNames = new Set()
        const squadDetails = (match.squads || []).map(sq => {
          const approved = (sq.competitors || []).filter(c => c.status === 'a')
          let adminCount = 0
          const names = []
          const adminNames = []
          for (const c of approved) {
            const name = `${c.first_name} ${c.last_name}`.trim()
            names.push(name)
            allShooterNames.add(name.toLowerCase())
            if (staffNames.has(name.toLowerCase())) {
              adminCount++
              adminNames.push(name)
              allAdminNames.add(name.toLowerCase())
            }
          }
          return {
            label: sq.comment || `Squad ${sq.number}`,
            description: sq.comment || '',
            shooters: approved.length,
            admins: adminCount,
            names,
            adminNames,
          }
        }).filter(sq => sq.shooters > 0)

        rows.push({
          match: match.name,
          date: matchDate,
          squadCount: squadDetails.length,
          squads: squadDetails,
          uniqueShooters: allShooterNames.size,
          uniqueAdmins: allAdminNames.size,
        })
      }

      res.json({ rows })
    } catch (err) {
      console.error('Failed to generate summary report:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ============================================================
  // POST /api/report/matches — Generate report for selected matches
  // Body: { matches: [{ id, contentType }, ...] }
  // Returns approved shooters per squad per match with admin role
  // ============================================================
  router.post('/matches', requireAuth('reporting'), async (req, res) => {
    // Support both old format { matchIds } and new { matches }
    let matchList = req.body.matches
    if (!matchList && Array.isArray(req.body.matchIds)) {
      matchList = req.body.matchIds.map(id => ({ id, contentType: 91 }))
    }
    if (!Array.isArray(matchList) || matchList.length === 0) {
      return res.status(400).json({ error: 'matches array required' })
    }
    if (matchList.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 matches per report' })
    }

    try {
      const rows = []

      for (const { id: matchId, contentType } of matchList) {
        const ct = contentType || 91
        const result = await graphqlWithRefresh(req.ssiSession, `
          query ReportMatch($ct: Int!, $id: String!) {
            event(content_type: $ct, id: $id) {
              id
              name
              starts
              squads {
                id
                number
                comment
                ... on NordicSquadNode {
                  competitors { id first_name last_name status }
                }
                ... on IpscSquadNode {
                  competitors { id first_name last_name status }
                }
                ... on PpcSquadNode {
                  competitors { id first_name last_name status }
                }
                ... on CmpSquadNode {
                  competitors { id first_name last_name status }
                }
                ... on PrecisionSquadNode {
                  competitors { id first_name last_name status }
                }
                ... on GenericSquadNode {
                  competitors { id first_name last_name status }
                }
              }
            }
          }
        `, { ct, id: String(matchId) })

        if (!result.event) continue

        const match = result.event
        const matchDate = match.starts ? match.starts.split('T')[0] : ''

        // Scrape staff page to get staff names for this event
        let staffNames = new Set()
        try {
          if (req.ssiSession.ssiCookies) {
            const staff = await ssiGetEventStaff(ct, matchId, req.ssiSession.ssiCookies)
            for (const s of staff) {
              staffNames.add(s.name.toLowerCase())
            }
          }
        } catch (staffErr) {
          log.debug(`[report] Could not fetch staff for event ${ct}/${matchId}: ${staffErr.message}`)
        }

        for (const squad of (match.squads || [])) {
          const squadLabel = squad.comment || `Squad ${squad.number}`
          const approved = (squad.competitors || []).filter(c => c.status === 'a')

          for (const comp of approved) {
            const compName = `${comp.first_name} ${comp.last_name}`.trim()
            const isStaff = staffNames.has(compName.toLowerCase())
            rows.push({
              match: match.name,
              date: matchDate,
              squad: squadLabel,
              name: compName,
              isAdmin: isStaff ? 'Y' : 'N',
            })
          }
        }
      }

      res.json({ rows })
    } catch (err) {
      console.error('Failed to generate report:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
