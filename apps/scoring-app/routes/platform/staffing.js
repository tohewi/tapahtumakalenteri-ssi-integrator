// ============================================================
// Platform Routes — Event Staffing (Roster)
// Mounted under /api/v1/platform by createPlatformRouter
// ============================================================

import { log } from '../../lib/logger.js'
import { AppError } from '../../lib/errors/AppError.js'
import { ssiGraphQL } from '../../lib/ssi-core/graphql.js'
import { sendStaffingSignupConfirmation, sendStaffingWithdrawalNotice } from '../../lib/email.js'
import { query } from '../../lib/db/postgres.js'
import { ssiRegisterToTrainerSquad, ssiDeleteMatchParticipant, ssiSetParticipantSquad, ssiFindParticipantInEvent } from '../../lib/ssi-core/participants.js'
import { ssiGetMatchGroupId, ssiAddToMatchManagement, ssiRemoveFromMatchManagement, ssiGetMatchOfficials } from '../../lib/ssi-core/management.js'
import {
  getUpcomingStaffingNeeds,
  getMyStaffingAssignments,
  getEventStaffing,
  updateEventStaffingNeeds,
  signupForEventStaffing,
  withdrawFromEventStaffing,
  getStaffingLeaderboard,
  backfillStaffingNeeds,
  getMatchTemplate,
  getScheduledEvent,
  updateStaffSignupSsiIds,
  getAccountSsiShooterId,
  listTenantMembers,
  TENANT_ROLES,
} from '../../lib/db/platform-store.js'

/**
 * Extract the SSI event ID and content type from ssiReferences.
 * For non-cup events: uses ssiEventId + contentTypeKey.
 * For cups: uses cupId + cupTypeId.
 * @returns {{ ssiEventId: string|null, contentType: number }}
 */
function extractSsiTarget(ssiRefs) {
  if (!ssiRefs) return { ssiEventId: null, contentType: 91 }

  // Non-cup: direct event (e.g. SRA match with ssiEventId + contentTypeKey)
  if (ssiRefs.ssiEventId) {
    return { ssiEventId: ssiRefs.ssiEventId, contentType: ssiRefs.contentTypeKey || 91 }
  }

  // Cup: use cupId + cupTypeId (cups have their own staff page at content type 136)
  if (ssiRefs.cupId) {
    return { ssiEventId: ssiRefs.cupId, contentType: parseInt(ssiRefs.cupTypeId) || 136 }
  }

  return { ssiEventId: null, contentType: 91 }
}

export function mountStaffingRoutes(router, { requirePlatformAuth, requireTenantRole, platformMutationLimiter, getAdminSession }) {

  const ALL_ROLES = ['owner', 'tenant_admin', 'discipline_admin', 'instructor_admin', 'match_admin', 'instructor']

  /**
   * GET /tenants/:id/staffing/upcoming
   * Get upcoming events that need staff.
   * Access: Any tenant member
   */
  router.get('/tenants/:id/staffing/upcoming', requirePlatformAuth(), requireTenantRole(...ALL_ROLES), async (req, res, next) => {
    try {
      const tenantId = req.params.id
      const data = await getUpcomingStaffingNeeds(tenantId)

      // SSI Sync: inject virtual signups from SSI officials for events that have SSI references.
      // This ensures the Roster reflects assignments made directly in SSI (SSI is master).
      try {
        const adminSess = getAdminSession ? await getAdminSession() : null
        const cookies = adminSess?.cookies
        if (cookies) {
          const defaultSsiMapping = { ro: 'RO', md: 'MD', qm: 'QM', safety: 'RM', match_director: 'MD' }

          for (const entry of data) {
            const { ssiEventId, contentType } = extractSsiTarget(entry.event?.ssiReferences)
            if (!ssiEventId) continue

            const rules = entry.event?.templateStaffingRules || {}

            let officials
            try {
              officials = await ssiGetMatchOfficials(contentType, ssiEventId, cookies)
            } catch (ssiErr) {
              log.warn(`[platform] SSI officials fetch failed for event ${entry.event.id}: ${ssiErr.message}`)
              continue
            }

            for (const need of entry.needs || []) {
              const roleCfg = (rules.roles || []).find(r => r.key === need.roleKey) || {}
              const ssiOfficialCode = roleCfg.ssiOfficialCode || defaultSsiMapping[need.roleKey]

              // Find all SSI officials matching this role
              const matchedOfficials = officials.filter(o =>
                ssiOfficialCode ? o.officials.includes(ssiOfficialCode) : false
              )

              for (const ssiOfficial of matchedOfficials) {
                const alreadyInDb = need.signups.some(
                  s => s.accountName?.toLowerCase() === ssiOfficial.name.toLowerCase()
                )
                if (!alreadyInDb) {
                  need.signups.push({
                    id: `virtual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    accountId: null,
                    accountName: ssiOfficial.name,
                    accountEmail: null,
                    status: 'confirmed',
                    notes: 'Added from SSI'
                  })
                }
              }
            }

            // Recompute isUnderstaffed after virtual signup injection
            entry.isUnderstaffed = entry.needs.some(n => n.signups.length < n.minCount)
          }
        }
      } catch (syncErr) {
        log.warn(`[platform] SSI sync inject failed for upcoming staffing: ${syncErr.message}`)
        // Non-fatal: return DB data as-is
      }

      res.json(data)
    } catch (err) {
      log.error(`[platform] GET /tenants/${req.params.id}/staffing/upcoming failed:`, err.message)
      return next(new AppError('Failed to fetch upcoming staffing needs', 500, 'INTERNAL_ERROR'))
    }
  })

  /**
   * GET /tenants/:id/staffing/my-assignments
   * Get my own staffing commitments.
   * Access: Any tenant member
   */
  router.get('/tenants/:id/staffing/my-assignments', requirePlatformAuth(), requireTenantRole(...ALL_ROLES), async (req, res, next) => {
    try {
      const tenantId = req.params.id
      const accountId = req.account.id
      const data = await getMyStaffingAssignments(tenantId, accountId)
      res.json(data)
    } catch (err) {
      log.error(`[platform] GET /tenants/${req.params.id}/staffing/my-assignments failed:`, err.message)
      return next(new AppError('Failed to fetch your staffing assignments', 500, 'INTERNAL_ERROR'))
    }
  })

  /**
   * GET /tenants/:id/staffing/leaderboard
   * Get volunteer activity leaderboard — aggregates confirmed signups per member.
   * Supports ?period=all|12m|6m|3m query param.
   * Access: Any tenant member
   */
  router.get('/tenants/:id/staffing/leaderboard', requirePlatformAuth(), requireTenantRole(...ALL_ROLES), async (req, res, next) => {
    try {
      const tenantId = req.params.id
      const period = req.query.period || 'all'
      const data = await getStaffingLeaderboard(tenantId, { period })
      res.json(data)
    } catch (err) {
      log.error(`[platform] GET /tenants/${req.params.id}/staffing/leaderboard failed:`, err.message)
      return next(new AppError('Failed to fetch staffing leaderboard', 500, 'INTERNAL_ERROR'))
    }
  })

  /**
   * POST /tenants/:id/staffing/backfill
   * Backfill staffing needs for existing events that have templates with staffing_rules
   * but no event_staffing_needs rows. Purely local DB — no SSI writes.
   * Access: owner, tenant_admin
   */
  router.post('/tenants/:id/staffing/backfill', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
    try {
      const tenantId = req.params.id
      const { defaultTemplateId } = req.body || {}

      if (defaultTemplateId) {
        // SEC-H2: Validate defaultTemplateId belongs to this tenant
        const template = await getMatchTemplate(defaultTemplateId)
        if (!template || template.tenantId !== tenantId) {
          return res.status(403).json({ error: 'Template not found or does not belong to your organization' })
        }
      }

      const result = await backfillStaffingNeeds(tenantId, { defaultTemplateId })
      log.info(`[platform] Staffing backfill for tenant ${tenantId}: ${result.backfilledCount} events backfilled, ${result.skippedCount} skipped, ${result.errors.length} errors`)
      res.json(result)
    } catch (err) {
      log.error(`[platform] POST /tenants/${req.params.id}/staffing/backfill failed:`, err.message)
      return next(new AppError('Failed to backfill staffing needs', 500, 'INTERNAL_ERROR'))
    }
  })

  /**
   * GET /tenants/:id/events/:eventId/staffing
   * Get staffing details for a specific event (needs + signups).
   * Access: Any tenant member
   */
  router.get('/tenants/:id/events/:eventId/staffing', requirePlatformAuth(), requireTenantRole(...ALL_ROLES), async (req, res, next) => {
    try {
      const { id: tenantId, eventId } = req.params
      let data = await getEventStaffing(tenantId, eventId)
      if (!data) return res.status(404).json({ error: 'Event not found' })

      // SSI Sync: Verify actual staff assignments from SSI and mark DB signups as invalid if missing
      try {
        const { ssiEventId, contentType } = extractSsiTarget(data.event?.ssiReferences)
        if (ssiEventId) {
          const rules = data.event?.templateStaffingRules || {}
          const staffSquadName = rules.staffSquadName

          const adminSess = getAdminSession ? await getAdminSession() : null
          const cookies = adminSess?.cookies

          if (cookies) {
            // Fetch officials (Management Group)
            const officials = await ssiGetMatchOfficials(contentType, ssiEventId, cookies)

            // Map emails using GraphQL for trainer squad members
            let squadEmails = new Set()
            let squadMembers = []
            if (staffSquadName) {
              const sqData = await ssiGraphQL(adminSess, `
                query GetSquads($ct: Int!, $id: String!) {
                  event(content_type: $ct, id: $id) {
                    squads {
                      number
                      comment
                      ... on NordicSquadNode    { competitors { id status shooter { email first_name last_name } } }
                      ... on IpscSquadNode      { competitors { id status shooter { email first_name last_name } } }
                      ... on PpcSquadNode       { competitors { id status shooter { email first_name last_name } } }
                      ... on CmpSquadNode       { competitors { id status shooter { email first_name last_name } } }
                      ... on PrecisionSquadNode { competitors { id status shooter { email first_name last_name } } }
                      ... on GenericSquadNode   { competitors { id status shooter { email first_name last_name } } }
                    }
                  }
                }
              `, { ct: contentType, id: ssiEventId })

              const staffSquad = (sqData.event?.squads || []).find(s =>
                s.comment === staffSquadName || `Squad ${s.number}` === staffSquadName
              )
              if (staffSquad) {
                (staffSquad.competitors || []).forEach(c => {
                  if (c.status === 'a' && c.shooter?.email) {
                    const email = c.shooter.email.toLowerCase()
                    squadEmails.add(email)
                    squadMembers.push({
                      email,
                      name: `${c.shooter.first_name || ''} ${c.shooter.last_name || ''}`.trim()
                    })
                  }
                })
              }
            }

            // Sync verification logic
            let hasChanges = false
            const defaultSsiMapping = { ro: 'RO', md: 'MD', qm: 'QM', safety: 'RM', match_director: 'MD' }

            // 1. Check existing DB signups against SSI. If they aren't in SSI, withdraw them.
            for (const need of data.needs || []) {
              const roleCfg = (rules.roles || []).find(r => r.key === need.roleKey) || {}
              const ssiOfficialCode = roleCfg.ssiOfficialCode || defaultSsiMapping[need.roleKey]
              const ssiMgmtRole = roleCfg.ssiMgmtRole || '1' // default all roles to admin

              for (const signup of need.signups || []) {
                if (signup.status !== 'confirmed') continue

                const email = signup.accountEmail?.toLowerCase()
                const accountName = signup.accountName?.toLowerCase()
                if (!email) continue

                let isMissing = false

                // 1a. Check Trainer Squad
                if (staffSquadName && !squadEmails.has(email)) {
                  log.debug(`[platform] SSI sync: User ${email} is missing from squad ${staffSquadName} for event ${eventId}`)
                  isMissing = true
                }

                // 1b. Check Management Group
                if (ssiMgmtRole) {
                  // The officials endpoint returns names, not emails
                  const ssiOfficial = officials.find(o => o.name.toLowerCase() === accountName)
                  if (!ssiOfficial) {
                    log.debug(`[platform] SSI sync: User ${accountName} is missing from management group for event ${eventId}`)
                    isMissing = true
                  } else if (ssiOfficialCode && !ssiOfficial.officials.includes(ssiOfficialCode)) {
                    log.debug(`[platform] SSI sync: User ${accountName} is missing official code ${ssiOfficialCode} for event ${eventId}`)
                    isMissing = true
                  }
                }

                if (isMissing) {
                  // Mark as withdrawn in DB
                  log.info(`[platform] SSI sync: Auto-withdrawing ${email} from role ${need.roleKey} in event ${eventId} (not found in SSI)`)
                  await withdrawFromEventStaffing(tenantId, eventId, signup.id, signup.accountId, 'Auto-withdrawn by SSI sync')
                  hasChanges = true
                }
              }
            }

            // 2. Map people from SSI to virtual signups if they are missing in DB
            for (const need of data.needs || []) {
              const roleCfg = (rules.roles || []).find(r => r.key === need.roleKey) || {}
              const ssiOfficialCode = roleCfg.ssiOfficialCode || defaultSsiMapping[need.roleKey]
              const ssiMgmtRole = roleCfg.ssiMgmtRole || '1'

              if (!ssiMgmtRole) continue // Cannot map SSI people to roles without management role config

              // Find all officials in SSI that match this role
              const matchedOfficials = officials.filter(o =>
                (ssiOfficialCode ? o.officials.includes(ssiOfficialCode) : true)
              )

              for (const ssiOfficial of matchedOfficials) {
                // Check if they are already signed up in DB
                const isSignedUp = need.signups.some(s => s.status === 'confirmed' && s.accountName?.toLowerCase() === ssiOfficial.name.toLowerCase())

                if (!isSignedUp) {
                  log.debug(`[platform] SSI sync: User ${ssiOfficial.name} found in SSI but not in DB for role ${need.roleKey}. Injecting virtual signup.`)

                  // Inject virtual signup for display
                  need.signups.push({
                    id: `virtual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    accountId: null, // Virtual signups don't map to a platform account
                    accountName: ssiOfficial.name,
                    accountEmail: null,
                    status: 'confirmed',
                    notes: 'Added from SSI'
                  })
                  hasChanges = true
                }
              }
            }
          }
        }
      } catch (syncErr) {
        log.error(`[platform] SSI sync verify error on load:`, syncErr.message)
      }

      res.json(data)
    } catch (err) {
      log.error(`[platform] GET /tenants/${req.params.id}/events/${req.params.eventId}/staffing failed:`, err.message)
      return next(new AppError('Failed to fetch event staffing details', 500, 'INTERNAL_ERROR'))
    }
  })

  /**
   * PUT /tenants/:id/events/:eventId/staffing-needs
   * Set or update the staffing needs for an event.
   * Access: match_admin or higher
   */
  router.put('/tenants/:id/events/:eventId/staffing-needs', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    try {
      const { id: tenantId, eventId } = req.params
      const { needs } = req.body

      if (!Array.isArray(needs)) {
        return res.status(400).json({ error: 'needs must be an array' })
      }

      await updateEventStaffingNeeds(tenantId, eventId, needs)

      const data = await getEventStaffing(tenantId, eventId)
      res.json(data)
    } catch (err) {
      log.error(`[platform] PUT staffing-needs failed:`, err.message)
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message })
      }
      return next(new AppError('Failed to update event staffing needs', 500, 'INTERNAL_ERROR'))
    }
  })

  /**
   * POST /tenants/:id/events/:eventId/staffing/signup
   * Sign up for a staffing role.
   * Access: Any tenant member
   */
  router.post('/tenants/:id/events/:eventId/staffing/signup', requirePlatformAuth(), requireTenantRole(...ALL_ROLES), async (req, res, next) => {
    try {
      const { id: tenantId, eventId } = req.params
      const { needId, notes } = req.body
      const accountId = req.account.id

      if (!needId) return res.status(400).json({ error: 'needId is required' })

      const signup = await signupForEventStaffing(tenantId, eventId, needId, accountId, notes)

      // Phase 7.5 Trigger signup confirmation email
      try {
        // sendStaffingSignupConfirmation is imported at top of file
        const event = await getScheduledEvent(eventId)
        const dateStr = new Date(event.eventDate).toLocaleDateString('fi-FI')
        await sendStaffingSignupConfirmation(req.account.email, req.account.name, event.eventName, dateStr, signup.roleLabel)
      } catch (emailErr) {
        log.warn('[platform] Failed to send staffing confirmation email:', emailErr.message)
      }

      // Phase 8 SSI Sync (Trainer Squad + Mgmt Group + Official Codes)
      const ssiResults = { trainerSquad: null, management: null }
      try {
        const evtStaffing = await getEventStaffing(tenantId, eventId)
        const { ssiEventId, contentType } = extractSsiTarget(evtStaffing?.event?.ssiReferences)
        if (evtStaffing && ssiEventId) {
          const rules = evtStaffing.event?.templateStaffingRules || {}
          const staffSquadName = rules.staffSquadName
          const needDef = (evtStaffing.needs || []).find(n => n.id === needId) || {}

          // Role config from template rules, with default SSI mapping based on role key
          const roleCfg = (rules.roles || []).find(r => r.key === needDef.roleKey) || {}
          const defaultSsiMapping = { ro: 'RO', md: 'MD', qm: 'QM', safety: 'RM', match_director: 'MD' }
          const ssiOfficialCode = roleCfg.ssiOfficialCode || defaultSsiMapping[needDef.roleKey]
          // Default all roles to mgmt role '1' (admin) for SSI management group
          const ssiMgmtRole = roleCfg.ssiMgmtRole || '1'

          // Use the admin session to perform the SSI operations since the regular user might not have rights
          const adminSess = getAdminSession ? await getAdminSession() : null
          const cookies = adminSess?.cookies

          if (cookies) {
            // 1. Add to SSI Trainer Squad (GraphQL-based identification)
            // See docs/design/shooter-identification-design.md
            if (staffSquadName) {
              try {
                const squadNum = parseInt(staffSquadName.match(/\d+/)?.[0])

                // Helper: query all squad competitors with shooter.id via GraphQL
                async function querySquadCompetitors() {
                  const sqData = await ssiGraphQL(adminSess, `
                    query GetSquads($ct: Int!, $id: String!) {
                      event(content_type: $ct, id: $id) {
                        squads {
                          number
                          comment
                          ... on NordicSquadNode    { competitors { id status shooter { id email } } }
                          ... on IpscSquadNode      { competitors { id status shooter { id email } } }
                          ... on PpcSquadNode       { competitors { id status shooter { id email } } }
                          ... on CmpSquadNode       { competitors { id status shooter { id email } } }
                          ... on PrecisionSquadNode { competitors { id status shooter { id email } } }
                          ... on GenericSquadNode   { competitors { id status shooter { id email } } }
                        }
                      }
                    }
                  `, { ct: contentType, id: ssiEventId })
                  return sqData.event?.squads || []
                }

                // Helper: find our user across all squads by email, cached shooter.id,
                // or exact full-name match (bootstrap fallback only — see MG-ID1/MG-ID2).
                function findUserInSquads(squads, email, cachedShooterId, accountName) {
                  // Pass 1: email match (most reliable, works for Nordic)
                  for (const sq of squads) {
                    for (const c of (sq.competitors || [])) {
                      if (c.shooter?.email && c.shooter.email.toLowerCase() === email.toLowerCase()) {
                        return { competitorId: c.id, shooterId: c.shooter.id, squadNumber: sq.number, status: c.status, matchedBy: 'email' }
                      }
                    }
                  }
                  // Pass 2: cached shooter.id from previous signup
                  if (cachedShooterId) {
                    for (const sq of squads) {
                      for (const c of (sq.competitors || [])) {
                        if (c.shooter?.id === cachedShooterId) {
                          return { competitorId: c.id, shooterId: c.shooter.id, squadNumber: sq.number, status: c.status, matchedBy: 'shooterId' }
                        }
                      }
                    }
                  }
                  // Pass 3: exact full-name match (bootstrap fallback for first signup when
                  // email is null and no cached shooter.id). Uses exact equality, not partial.
                  // Once shooter.id is cached from this match, future operations use Pass 2.
                  if (accountName) {
                    const nameLower = accountName.toLowerCase()
                    for (const sq of squads) {
                      for (const c of (sq.competitors || [])) {
                        const competitorName = `${c.shooter?.first_name || ''} ${c.shooter?.last_name || ''}`.trim().toLowerCase()
                        if (competitorName && competitorName === nameLower) {
                          log.warn(`[platform] Bootstrap: matched by exact name "${accountName}" (no email/shooterId available) — caching shooter.id for future ops`)
                          return { competitorId: c.id, shooterId: c.shooter.id, squadNumber: sq.number, status: c.status, matchedBy: 'name-bootstrap' }
                        }
                      }
                    }
                  }
                  return null
                }

                // Snapshot BEFORE registration (for before/after diff on new registrations)
                const squadsBefore = await querySquadCompetitors()
                const trainerBefore = squadsBefore.find(s => s.comment === staffSquadName || `Squad ${s.number}` === staffSquadName)
                const competitorIdsBefore = new Set((trainerBefore?.competitors || []).map(c => c.id))

                // Attempt registration
                const squadResult = await ssiRegisterToTrainerSquad(contentType, ssiEventId, req.account.email, staffSquadName, cookies)
                log.info(`[platform] SSI trainer squad: ${req.account.email} → ${squadResult.message}`)
                ssiResults.trainerSquad = { success: true, message: squadResult.message }

                // Post-registration: identify and cache SSI IDs
                if (squadResult.message?.includes('Already registered')) {
                  // User is already in the event — find them via GraphQL (no name matching!)
                  const cachedShooterId = await getAccountSsiShooterId(eventId, req.account.id)

                  const squadsNow = await querySquadCompetitors()
                  const found = findUserInSquads(squadsNow, req.account.email, cachedShooterId, req.account.name)

                  if (found) {
                    log.info(`[platform] GraphQL identified participant: competitor=${found.competitorId} shooter=${found.shooterId} squad=${found.squadNumber}`)

                    // Move to trainer squad if not already there
                    if (found.squadNumber !== squadNum && squadNum) {
                      // Need the participant CT for the edit form — derive from event content type
                      // CT 22 (SRA match) → participant CT 23; CT 91 (Nordic match) → participant CT 93
                      const participantCT = contentType === 22 ? 23 : contentType === 91 ? 93 : 23
                      log.info(`[platform] Moving participant ${found.competitorId} from squad ${found.squadNumber} → ${staffSquadName} (CT=${participantCT})`)
                      const moveResult = await ssiSetParticipantSquad(found.competitorId, squadNum, cookies, 'a', participantCT)
                      log.info(`[platform] Squad move result: HTTP ${moveResult.httpStatus}`)
                      ssiResults.trainerSquad = { success: moveResult?.success ?? true, message: `Moved to ${staffSquadName}` }
                    } else {
                      log.info(`[platform] User already in trainer squad ${staffSquadName} — no move needed`)
                    }

                    // Cache SSI IDs for future operations
                    try {
                      await updateStaffSignupSsiIds(signup.id, { ssiShooterId: found.shooterId, ssiParticipantId: found.competitorId })
                    } catch (cacheErr) {
                      log.warn(`[platform] Failed to cache SSI IDs: ${cacheErr.message}`)
                    }
                  } else {
                    // Last resort: user is "Already registered" but not found in ANY squad via GraphQL.
                    // This happens when a previous withdrawal deleted the participant (status 'd') —
                    // they're linked to the event but have no active squad membership.
                    // Use ssiFindParticipantInEvent (web scraping) which finds ALL participants including declined.
                    log.warn(`[platform] GraphQL found no squad match for ${req.account.email} — falling back to participants page scraping`)
                    try {
                      const displayName = req.account.name || req.account.email
                      const found = await ssiFindParticipantInEvent(contentType, ssiEventId, displayName, cookies)
                      if (found && squadNum) {
                        const participantCT = found.participantCT || (contentType === 22 ? 23 : contentType === 91 ? 93 : 23)
                        log.info(`[platform] Scraping fallback: participant=${found.participantId} CT=${participantCT} → moving to ${staffSquadName} with status=a`)
                        const moveResult = await ssiSetParticipantSquad(found.participantId, squadNum, cookies, 'a', participantCT)
                        log.info(`[platform] Scraping fallback move result: HTTP ${moveResult.httpStatus}`)
                        ssiResults.trainerSquad = { success: moveResult?.success ?? true, message: `Moved to ${staffSquadName} (scraping fallback)` }

                        // Query squad again to cache the shooter.id now that we moved them
                        try {
                          const squadsAfterMove = await querySquadCompetitors()
                          const movedUser = findUserInSquads(squadsAfterMove, req.account.email, null, req.account.name)
                          if (movedUser?.shooterId) {
                            await updateStaffSignupSsiIds(signup.id, { ssiShooterId: movedUser.shooterId, ssiParticipantId: movedUser.competitorId })
                            log.info(`[platform] Cached shooter.id from scraping fallback: ${movedUser.shooterId}`)
                          }
                        } catch (cacheErr) {
                          log.warn(`[platform] Failed to cache SSI IDs after scraping fallback: ${cacheErr.message}`)
                        }
                      } else {
                        log.warn(`[platform] Scraping fallback: participant not found for ${displayName} in event ${ssiEventId}`)
                      }
                    } catch (scrapingErr) {
                      log.error(`[platform] Scraping fallback failed: ${scrapingErr.message}`)
                    }
                  }
                } else if (squadResult.success) {
                  // New registration succeeded — use before/after diff to identify the new competitor
                  try {
                    const squadsAfter = await querySquadCompetitors()
                    const trainerAfter = squadsAfter.find(s => s.comment === staffSquadName || `Squad ${s.number}` === staffSquadName)
                    const newCompetitors = (trainerAfter?.competitors || []).filter(c => !competitorIdsBefore.has(c.id))

                    if (newCompetitors.length === 1) {
                      const nc = newCompetitors[0]
                      log.info(`[platform] New competitor identified via diff: id=${nc.id} shooter=${nc.shooter?.id}`)
                      await updateStaffSignupSsiIds(signup.id, { ssiShooterId: nc.shooter?.id, ssiParticipantId: nc.id })
                    } else {
                      log.info(`[platform] Before/after diff: ${newCompetitors.length} new competitors (expected 1)`)
                    }
                  } catch (diffErr) {
                    log.warn(`[platform] Before/after diff failed: ${diffErr.message}`)
                  }
                }
              } catch (e) {
                log.error(`[platform] SSI trainer squad failed for ${req.account.email}: ${e.message}`)
                ssiResults.trainerSquad = { success: false, message: e.message }
              }
            }

            // 2. Add to SSI Management Group
            if (ssiMgmtRole) {
              try {
                const groupId = await ssiGetMatchGroupId(contentType, ssiEventId, cookies)
                const officialCodes = ssiOfficialCode ? [ssiOfficialCode] : []
                const mgmtResult = await ssiAddToMatchManagement(groupId, contentType, ssiEventId, req.account.email, ssiMgmtRole, officialCodes, cookies)
                log.debug(`[platform] SSI management: ${req.account.email} (${ssiMgmtRole}) → ${mgmtResult.message}`)
                ssiResults.management = { success: true, message: mgmtResult.message }
              } catch (e) {
                log.error(`[platform] SSI management add failed for ${req.account.email}: ${e.message}`)
                ssiResults.management = { success: false, message: e.message }
              }
            }
          }
        }
      } catch (syncErr) {
        log.error(`[platform] SSI sync error during signup:`, syncErr.message)
      }

      res.json({ success: true, signup, ssi: ssiResults })
    } catch (err) {
      log.error(`[platform] POST staffing signup failed:`, err.message)
      if (err.message.includes('fully staffed') || err.message.includes('not found')) {
        return res.status(400).json({ error: err.message })
      }
      return next(new AppError('Failed to sign up for event', 500, 'INTERNAL_ERROR'))
    }
  })

  /**
   * POST /tenants/:id/events/:eventId/staffing/withdraw
   * Withdraw from a staffing commitment.
   * Access: Any tenant member
   */
  router.post('/tenants/:id/events/:eventId/staffing/withdraw', requirePlatformAuth(), requireTenantRole(...ALL_ROLES), async (req, res, next) => {
    try {
      const { id: tenantId, eventId } = req.params
      const { signupId } = req.body
      const accountId = req.account.id

      if (!signupId) return res.status(400).json({ error: 'signupId is required' })

      const signup = await withdrawFromEventStaffing(tenantId, eventId, signupId, accountId)

      // Phase 7.5 Trigger withdrawal notification to admins
      try {
        // sendStaffingWithdrawalNotice and listTenantMembers are imported at top of file
        // (listTenantMembers is already in the platform-store import block above)

        // Find tenant admins to notify
        const members = await listTenantMembers(tenantId)
        const admins = members.filter(m => m.roles.includes('owner') || m.roles.includes('tenant_admin'))
        const event = await getScheduledEvent(eventId)
        const dateStr = new Date(event.eventDate).toLocaleDateString('fi-FI')

        for (const admin of admins) {
          await sendStaffingWithdrawalNotice(admin.accountEmail, req.account.name, event.eventName, dateStr, signup.roleLabel)
        }
      } catch (emailErr) {
        log.warn('[platform] Failed to send staffing withdrawal email:', emailErr.message)
      }

      // Phase 8 SSI Sync (Remove from Trainer Squad + Mgmt Group)
      const ssiResults = { trainerSquad: null, management: null }
      try {
        const evtStaffing = await getEventStaffing(tenantId, eventId)
        const { ssiEventId, contentType } = extractSsiTarget(evtStaffing?.event?.ssiReferences)
        if (evtStaffing && ssiEventId) {

          const adminSess = getAdminSession ? await getAdminSession() : null
          const cookies = adminSess?.cookies

          if (cookies) {
            // 1. Remove from SSI Management Group
            try {
              const groupId = await ssiGetMatchGroupId(contentType, ssiEventId, cookies)
              const removeResult = await ssiRemoveFromMatchManagement(groupId, contentType, ssiEventId, req.account.email, cookies)
              log.debug(`[platform] SSI management remove: ${req.account.email} → ${removeResult.message}`)
              ssiResults.management = { success: true, message: removeResult.message, usedFallback: removeResult.usedFallback }
            } catch (e) {
              log.error(`[platform] SSI management remove failed for ${req.account.email}: ${e.message}`)
              if (!e.message.includes('not found') && !e.message.includes('may already be removed')) {
                ssiResults.management = { success: false, message: e.message }
              } else {
                ssiResults.management = { success: true, message: 'Already removed or not found' }
              }
            }

            // 2. Remove from Trainer Squad (scrape participants)
            // It only removes from the event entirely. If they are also a regular competitor,
            // the user will need to re-register.
            try {
              // Try cached participant ID first (safe, no name matching)
              // query is imported at top of file
              const signupRes = await query(`SELECT ssi_participant_id FROM staff_signups WHERE id = $1`, [req.params.signupId])
              const cachedParticipantId = signupRes.rows[0]?.ssi_participant_id

              let participantIdToDelete = cachedParticipantId
              let participantCT = contentType === 22 ? 23 : contentType === 91 ? 93 : 23
              const displayName = req.account.name || req.account.email

              if (participantIdToDelete) {
                log.info(`[platform] Withdrawal: using cached participant ID ${participantIdToDelete}`)
              } else {
                // Fallback to name matching if no cached ID (legacy signups)
                log.warn(`[platform] Withdrawal: no cached participant ID for ${req.account.email}, falling back to name search`)
                const found = await ssiFindParticipantInEvent(contentType, ssiEventId, displayName, cookies)
                if (found) {
                  participantIdToDelete = found.participantId
                  participantCT = found.participantCT
                }
              }

              if (participantIdToDelete) {
                const deleteResult = await ssiDeleteMatchParticipant(ssiEventId, participantIdToDelete, displayName, cookies, participantCT)
                log.info(`[platform] SSI trainer squad remove: ${req.account.email} (ID ${participantIdToDelete}) → ${deleteResult.message}`)
                ssiResults.trainerSquad = { success: true, message: deleteResult.message }
              } else {
                ssiResults.trainerSquad = { success: true, message: 'Not found on participants page' }
              }
            } catch (e) {
              log.error(`[platform] SSI trainer squad remove failed: ${e.message}`)
              ssiResults.trainerSquad = { success: false, message: e.message }
            }
          }
        }
      } catch (syncErr) {
        log.error(`[platform] SSI sync error during withdrawal:`, syncErr.message)
      }

      res.json({ success: true, signup, ssi: ssiResults })
    } catch (err) {
      log.error(`[platform] POST staffing withdraw failed:`, err.message)
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message })
      }
      return next(new AppError('Failed to withdraw from event', 500, 'INTERNAL_ERROR'))
    }
  })

  // ============================================================
  // SSI Management inspection endpoints for E2E tests and admin debugging.
  // Secured by requirePlatformAuth + requireTenantRole (owner, tenant_admin).
  // ============================================================
  {
    /**
     * POST /tenants/:id/events/:eventId/test/ssi-management
     * Directly add or remove a user from SSI management group.
     * Body: { action: 'add'|'remove', email, role?, officialCodes? }
     */
    router.post('/tenants/:id/events/:eventId/test/ssi-management', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
      try {
        const { id: tenantId, eventId } = req.params
        const { action, email, role, officialCodes } = req.body

        if (!action || !email) return res.status(400).json({ error: 'action and email are required' })

        const evtStaffing = await getEventStaffing(tenantId, eventId)
        const { ssiEventId, contentType } = extractSsiTarget(evtStaffing?.event?.ssiReferences)
        if (!ssiEventId) {
          return res.status(400).json({ error: 'Event has no SSI reference' })
        }

        const adminSess = getAdminSession ? await getAdminSession() : null
        const cookies = adminSess?.cookies
        if (!cookies) return res.status(503).json({ error: 'No admin session available' })

        const groupId = await ssiGetMatchGroupId(contentType, ssiEventId, cookies)

        if (action === 'add') {
          const result = await ssiAddToMatchManagement(groupId, contentType, ssiEventId, email, role || '1', officialCodes || [], cookies)
          return res.json({ success: true, result })
        } else if (action === 'remove') {
          const result = await ssiRemoveFromMatchManagement(groupId, contentType, ssiEventId, email, cookies)
          return res.json({ success: true, result })
        } else {
          return res.status(400).json({ error: 'action must be "add" or "remove"' })
        }
      } catch (err) {
        log.error(`[platform] TEST ssi-management failed:`, err.message)
        return res.status(500).json({ error: err.message })
      }
    })

    /**
     * GET /tenants/:id/events/:eventId/test/ssi-officials
     * Read the current SSI management group members for an event.
     */
    router.get('/tenants/:id/events/:eventId/test/ssi-officials', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
      try {
        const { id: tenantId, eventId } = req.params
        const evtStaffing = await getEventStaffing(tenantId, eventId)
        const { ssiEventId, contentType } = extractSsiTarget(evtStaffing?.event?.ssiReferences)
        if (!ssiEventId) {
          return res.status(400).json({ error: 'Event has no SSI reference' })
        }

        const adminSess = getAdminSession ? await getAdminSession() : null
        const cookies = adminSess?.cookies
        if (!cookies) return res.status(503).json({ error: 'No admin session available' })

        const officials = await ssiGetMatchOfficials(contentType, ssiEventId, cookies)
        return res.json({ officials })
      } catch (err) {
        log.error(`[platform] TEST ssi-officials failed:`, err.message)
        return res.status(500).json({ error: err.message })
      }
    })

    /**
     * GET /tenants/:id/events/:eventId/test/ssi-squads
     * Read squad data for an event via GraphQL.
     */
    router.get('/tenants/:id/events/:eventId/test/ssi-squads', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), async (req, res, next) => {
      try {
        const { id: tenantId, eventId } = req.params
        const evtStaffing = await getEventStaffing(tenantId, eventId)
        const { ssiEventId, contentType } = extractSsiTarget(evtStaffing?.event?.ssiReferences)
        if (!ssiEventId) {
          return res.status(400).json({ error: 'Event has no SSI reference' })
        }

        const adminSess = getAdminSession ? await getAdminSession() : null
        const cookies = adminSess?.cookies
        if (!cookies) return res.status(503).json({ error: 'No admin session available' })

        const sqData = await ssiGraphQL(adminSess, `
          query GetSquads($ct: Int!, $id: String!) {
            event(content_type: $ct, id: $id) {
              squads {
                __typename
                number
                comment
                ... on NordicSquadNode    { competitors { id status shooter { id email first_name last_name } } }
                ... on IpscSquadNode      { competitors { id status shooter { id email first_name last_name } } }
                ... on PpcSquadNode       { competitors { id status shooter { id email first_name last_name } } }
                ... on CmpSquadNode       { competitors { id status shooter { id email first_name last_name } } }
                ... on PrecisionSquadNode { competitors { id status shooter { id email first_name last_name } } }
                ... on GenericSquadNode   { competitors { id status shooter { id email first_name last_name } } }
              }
            }
          }
        `, { ct: contentType, id: ssiEventId })

        // Log raw squad types and competitor counts for debugging
        const rawSquads = sqData.event?.squads || []
        log.info(`[platform] TEST ssi-squads: CT=${contentType} eventId=${ssiEventId} squads=${rawSquads.map(s => `${s.__typename}#${s.number}(${(s.competitors||[]).length})`).join(', ')}`)
        // Log trainer squad competitor details to diagnose email matching
        const staffSquadNameForLog = evtStaffing.event?.templateStaffingRules?.staffSquadName
        if (staffSquadNameForLog) {
          const trainerSq = rawSquads.find(s => s.comment === staffSquadNameForLog || `Squad ${s.number}` === staffSquadNameForLog)
          if (trainerSq) {
            log.info(`[platform] TEST trainer squad competitors: ${JSON.stringify((trainerSq.competitors || []).map(c => ({ id: c.id, status: c.status, shooterId: c.shooter?.id, email: c.shooter?.email, name: c.shooter?.first_name })))}`)
          }
        }

        const squads = (sqData.event?.squads || []).map(sq => ({
          number: sq.number,
          comment: sq.comment,
          label: sq.comment || `Squad ${sq.number}`,
          competitors: (sq.competitors || []).map(c => ({
            id: c.id,
            status: c.status,
            shooterId: c.shooter?.id || null,
            email: c.shooter?.email || null,
            name: `${c.shooter?.first_name || ''} ${c.shooter?.last_name || ''}`.trim(),
          }))
        }))

        // Also query { me } to get the admin SSI user ID for correlation
        let meData = null
        try {
          meData = await ssiGraphQL(adminSess, `{ me { id email first_name last_name } }`)
        } catch (e) { /* me query optional */ }

        return res.json({
          squads,
          staffSquadName: evtStaffing.event?.templateStaffingRules?.staffSquadName || null,
          ssiMe: meData?.me || null,
        })
      } catch (err) {
        log.error(`[platform] TEST ssi-squads failed:`, err.message)
        return res.status(500).json({ error: err.message })
      }
    })
  }
}
