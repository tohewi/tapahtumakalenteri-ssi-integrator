// ============================================================
// Platform Routes — Match Template CRUD + SSI Seed Import + SSI Schema
// Mounted under /api/v1/platform by createPlatformRouter
// ============================================================

import { log } from '../../lib/logger.js'
import { AppError } from '../../lib/errors/AppError.js'
import {
  createMatchTemplate,
  getMatchTemplate,
  listTenantTemplates,
  listDisciplineTemplates,
  updateMatchTemplate,
  deleteMatchTemplate,
  getDiscipline,
  getTenantWithCredentials,
  createAuditLog,
  TENANT_ROLES,
} from '../../lib/db/platform-store.js'
import { ssiFetchEventStructure } from '../../lib/ssi-core/seed-import.js'
import { ssiGraphQL } from '../../lib/ssi-core/graphql.js'
import { getSsiDisciplineByProperties, getSsiDisciplineByUrl } from '../../lib/ssi-core/discipline-registry.js'

export function mountTemplateRoutes(router, { requirePlatformAuth, requireTenantRole, platformMutationLimiter }) {

  // GET /api/v1/platform/tenants/:tenantId/templates
  // Any member can read templates
  router.get('/tenants/:tenantId/templates', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res, next) => {
    try {
      const { disciplineId } = req.query
      const templates = disciplineId
        ? await listDisciplineTemplates(disciplineId)
        : await listTenantTemplates(req.params.tenantId)
      res.json({ templates })
    } catch (err) {
      log.error('[platform] GET templates failed:', err.message)
      return next(new AppError('Failed to fetch templates', 500, 'INTERNAL_ERROR'))
    }
  })

  // POST /api/v1/platform/tenants/:tenantId/templates
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/templates', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const { name, disciplineId, ssiSeedEventId, ssiSeedSnapshot, overrides, calendarTemplate, staffingRules } = req.body
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Template name is required (min 2 characters)' })
    }
    if (!disciplineId) {
      return res.status(400).json({ error: 'disciplineId is required' })
    }

    // Verify discipline belongs to this tenant
    const discipline = await getDiscipline(disciplineId)
    if (!discipline || discipline.tenantId !== req.params.tenantId) {
      return res.status(400).json({ error: 'Discipline not found in this tenant' })
    }

    try {
      const { templateId, template } = await createMatchTemplate({
        tenantId: req.params.tenantId,
        disciplineId, name, ssiSeedEventId, ssiSeedSnapshot,
        overrides, calendarTemplate, staffingRules,
      })
      log.info(`[platform] Template created: ${name} (${templateId}) for discipline ${disciplineId}`)
      res.status(201).json({ success: true, template })
    } catch (err) {
      log.error('[platform] Template creation failed:', err.message)
      return next(new AppError('Failed to create template', 500, 'INTERNAL_ERROR'))
    }
  })

  // GET /api/v1/platform/tenants/:tenantId/templates/:id
  // Any member can read
  router.get('/tenants/:tenantId/templates/:id', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res, next) => {
    try {
      const template = await getMatchTemplate(req.params.id)
      if (!template || template.tenantId !== req.params.tenantId) {
        return res.status(404).json({ error: 'Template not found' })
      }
      res.json({ template })
    } catch (err) {
      log.error('[platform] GET template failed:', err.message)
      return next(new AppError('Failed to fetch template', 500, 'INTERNAL_ERROR'))
    }
  })

  // PATCH /api/v1/platform/tenants/:tenantId/templates/:id
  // Requires: owner, tenant_admin, or match_admin
  router.patch('/tenants/:tenantId/templates/:id', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const template = await getMatchTemplate(req.params.id)
    if (!template || template.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Template not found' })
    }

    const allowedFields = ['name', 'ssiSeedEventId', 'ssiSeedSnapshot', 'overrides', 'calendarTemplate', 'staffingRules', 'postEventWorkflows']
    const updates = {}
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field]
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    try {
      const updated = await updateMatchTemplate(req.params.id, updates)
      res.json({ success: true, template: updated })
    } catch (err) {
      log.error('[platform] Template update failed:', err.message)
      return next(new AppError('Failed to update template', 500, 'INTERNAL_ERROR'))
    }
  })

  // DELETE /api/v1/platform/tenants/:tenantId/templates/:id
  // Requires: owner, tenant_admin, or match_admin
  router.delete('/tenants/:tenantId/templates/:id', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    try {
      const template = await getMatchTemplate(req.params.id)
      if (!template || template.tenantId !== req.params.tenantId) {
        return res.status(404).json({ error: 'Template not found' })
      }

      const deleted = await deleteMatchTemplate(req.params.id)
      if (!deleted) {
        return res.status(404).json({ error: 'Template not found' })
      }

      // SEC-H4: Audit log
      await createAuditLog({
        tenantId: req.params.tenantId,
        accountId: req.account.id,
        action: 'delete_template',
        targetType: 'template',
        targetId: req.params.id,
        metadata: { name: template.name },
        ipAddress: req.ip
      })

      log.info(`[platform] Template deleted: ${req.params.id} from tenant ${req.params.tenantId}`)
      res.json({ success: true })
    } catch (err) {
      log.error('[platform] Template delete failed:', err.message)
      return next(new AppError('Failed to delete template', 500, 'INTERNAL_ERROR'))
    }
  })

  // POST /api/v1/platform/tenants/:tenantId/templates/:id/import-seed
  // Fetches SSI event structure from the template's ssiSeedEventId URL.
  // Requires tenant SSI credentials.
  // Requires: owner, tenant_admin, or match_admin
  router.post('/tenants/:tenantId/templates/:id/import-seed', requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin', 'match_admin'), async (req, res, next) => {
    const template = await getMatchTemplate(req.params.id)
    if (!template || template.tenantId !== req.params.tenantId) {
      return res.status(404).json({ error: 'Template not found' })
    }

    if (!template.ssiSeedEventId) {
      return res.status(400).json({ error: 'Template has no SSI event URL configured' })
    }

    // Fetch full credentials for SSI operation (req.tenant has masked credentials)
    const tenantFull = await getTenantWithCredentials(req.params.tenantId)
    if (!tenantFull?.ssiCredentials?.email || !tenantFull?.ssiCredentials?.password) {
      return res.status(400).json({ error: 'Tenant SSI credentials must be configured before importing seed events' })
    }

    try {
      const snapshot = await ssiFetchEventStructure({
        ssiEventUrl: template.ssiSeedEventId,
        credentials: {
          email: tenantFull.ssiCredentials.email,
          password: tenantFull.ssiCredentials.password,
          apiKey: tenantFull.ssiCredentials.apiKey || null,
        },
      })

      // Store snapshot in the template
      const updated = await updateMatchTemplate(req.params.id, {
        ssiSeedSnapshot: snapshot,
      })

      // SSI-R4: Validate template SSI type against discipline SSI type
      let validationWarning = null
      const discipline = await getDiscipline(template.disciplineId)
      if (discipline && discipline.ssiCreateUrl) {
        const detectedType = getSsiDisciplineByProperties(snapshot.rule, snapshot.isCup, snapshot.eventTypeName)
        const expectedType = getSsiDisciplineByUrl(discipline.ssiCreateUrl)

        if (detectedType && expectedType && detectedType.id !== expectedType.id) {
          validationWarning = `Type mismatch: The imported event appears to be a ${detectedType.displayName}, but this template belongs to a discipline configured for ${expectedType.displayName}.`
          log.warn(`[platform] SSI-R4 Validation Warning for template ${template.id}: ${validationWarning}`)
        }
      }

      log.info(`[platform] Seed imported for template ${req.params.id}: "${snapshot.name}" (${snapshot.isCup ? snapshot.matchCount + ' matches' : 'single match'})`)
      res.json({ success: true, template: updated, snapshot, warning: validationWarning })
    } catch (err) {
      log.error(`[platform] Seed import failed for template ${req.params.id}:`, err.message)
      if (err.message.includes('authentication failed') || err.message.includes('credentials')) {
        return res.status(401).json({ error: 'SSI authentication failed — check tenant SSI credentials' })
      }
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: `SSI event not found at ${template.ssiSeedEventId}` })
      }
      return next(new AppError('Failed to import seed event', 500, 'INTERNAL_ERROR'))
    }
  })

  // GET /api/v1/platform/tenants/:tenantId/ssi-schema
  // Introspects SSI GraphQL schema to discover available fields on key types.
  // Used for debugging and GQL7 (GraphQL viability testing).
  router.get('/tenants/:tenantId/ssi-schema', requirePlatformAuth(), requireTenantRole(...TENANT_ROLES), async (req, res, next) => {
    const tenantFull = await getTenantWithCredentials(req.params.tenantId)
    if (!tenantFull?.ssiCredentials?.email || !tenantFull?.ssiCredentials?.password) {
      return res.status(400).json({ error: 'Tenant SSI credentials required' })
    }

    try {
      // Authenticate
      const authResult = await ssiGraphQL(null, `
        mutation Auth($email: String!, $password: String!) {
          token_auth(email: $email, password: $password) {
            token { token }
          }
        }
      `, { email: tenantFull.ssiCredentials.email, password: tenantFull.ssiCredentials.password })

      const jwt = authResult.token_auth?.token?.token
      if (!jwt) return res.status(401).json({ error: 'SSI auth failed' })

      // Introspect key types
      const typesToIntrospect = [
        'EventInterface', 'NordicSerieNode', 'ComponentMatchInterface',
        'NordicComponentMatchNode', 'SquadInterface', 'NordicSquadNode',
        'PrecisionSerieNode', 'IpscSerieNode',
      ]

      const INTROSPECT_QUERY = `
        query IntrospectType($typeName: String!) {
          __type(name: $typeName) {
            name
            kind
            fields { name type { name kind ofType { name kind } } }
          }
        }
      `

      const results = {}
      for (const typeName of typesToIntrospect) {
        const r = await ssiGraphQL({ jwt }, INTROSPECT_QUERY, { typeName })
        if (r.__type) results[typeName] = r.__type
      }

      res.json({ schema: results })
    } catch (err) {
      log.error('[platform] SSI schema introspection failed:', err.message)
      return next(new AppError('SSI schema introspection failed', 500, 'INTERNAL_ERROR'))
    }
  })
}
