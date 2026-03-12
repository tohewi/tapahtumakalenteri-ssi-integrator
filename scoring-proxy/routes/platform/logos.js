// ============================================================
// Platform Routes — Tenant Logo (MP9 Branding)
//
// POST   /tenants/:id/logo  — Upload logo (base64 in JSON body)
// GET    /tenants/:id/logo  — Serve logo (public, cached)
// DELETE /tenants/:id/logo  — Remove logo
// ============================================================

import express from 'express'
import log from '../../lib/logger.js'
import { AppError } from '../../lib/errors/AppError.js'
import { asyncHandler } from '../../middleware/errorHandler.js'
import {
  uploadTenantLogo,
  getTenantLogo,
  deleteTenantLogo,
  LOGO_MAX_SIZE,
  LOGO_ALLOWED_TYPES,
} from '../../lib/db/platform-store.js'

export function mountLogoRoutes(router, deps) {
  const { requirePlatformAuth, requireTenantRole, platformMutationLimiter } = deps

  // Larger body limit for logo upload (4MB covers base64 overhead for a 2MB image)
  const logoBodyParser = express.json({ limit: '4mb' })

  // POST /api/v1/platform/tenants/:id/logo — Upload tenant logo
  // Accepts { image: "data:image/png;base64,..." } or { image: "<raw-base64>", contentType: "image/png" }
  router.post('/tenants/:id/logo', platformMutationLimiter, logoBodyParser, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), asyncHandler(async (req, res) => {
    const { image, contentType: explicitType } = req.body
    if (!image || typeof image !== 'string') {
      throw new AppError('Missing or invalid image field', 400, 'VALIDATION_ERROR')
    }

    // Parse data URL or raw base64
    let base64Data, contentType
    const dataUrlMatch = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)
    if (dataUrlMatch) {
      contentType = dataUrlMatch[1]
      base64Data = dataUrlMatch[2]
    } else if (explicitType && LOGO_ALLOWED_TYPES.includes(explicitType)) {
      contentType = explicitType
      base64Data = image
    } else {
      throw new AppError(
        `Invalid image format. Accepted types: ${LOGO_ALLOWED_TYPES.join(', ')}`,
        400, 'VALIDATION_ERROR'
      )
    }

    // Decode and validate size
    const imageBuffer = Buffer.from(base64Data, 'base64')
    if (imageBuffer.length > LOGO_MAX_SIZE) {
      throw new AppError(
        `Image too large (${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB). Maximum: ${LOGO_MAX_SIZE / 1024 / 1024}MB`,
        400, 'VALIDATION_ERROR'
      )
    }
    if (imageBuffer.length < 100) {
      throw new AppError('Image file appears to be empty or corrupted', 400, 'VALIDATION_ERROR')
    }

    const result = await uploadTenantLogo(req.params.id, imageBuffer, contentType)
    log.info(`[platform] Logo uploaded for tenant ${req.params.id} (${contentType}, ${result.fileSize} bytes) by ${req.account.email}`)

    res.json({
      success: true,
      logo: {
        contentType: result.contentType,
        fileSize: result.fileSize,
        uploadedAt: result.uploadedAt,
      },
    })
  }))

  // GET /api/v1/platform/tenants/:id/logo — Serve tenant logo (public, cacheable)
  // No auth required — logos are public assets for display in calendars, etc.
  router.get('/tenants/:id/logo', asyncHandler(async (req, res) => {
    const logo = await getTenantLogo(req.params.id)
    if (!logo) {
      return res.status(404).json({ error: 'No logo found' })
    }

    // ETag for conditional requests (based on upload timestamp)
    const etag = `"logo-${req.params.id}-${new Date(logo.uploadedAt).getTime()}"`
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end()
    }

    res.set({
      'Content-Type': logo.contentType,
      'Content-Length': logo.fileSize,
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'ETag': etag,
    })
    res.send(logo.imageData)
  }))

  // DELETE /api/v1/platform/tenants/:id/logo — Remove tenant logo
  router.delete('/tenants/:id/logo', platformMutationLimiter, requirePlatformAuth(), requireTenantRole('owner', 'tenant_admin'), asyncHandler(async (req, res) => {
    const deleted = await deleteTenantLogo(req.params.id)
    log.info(`[platform] Logo ${deleted ? 'deleted' : 'not found'} for tenant ${req.params.id} by ${req.account.email}`)
    res.json({ success: true, deleted })
  }))
}
