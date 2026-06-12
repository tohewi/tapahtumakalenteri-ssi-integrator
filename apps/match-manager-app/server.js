// ============================================================
// Match Manager App — R8.x Platform Backend
//
// Event-centric match management for multi-tenant deployment.
// Scaffold for R8.1 features (MP1-MP7).
// ============================================================

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { log } from '@ssi-tools/core/logger'
import { requireAuthV7 } from '@ssi-tools/core/auth'
import { errorHandler, asyncHandler } from './lib/error-handler.js'

const app = express()
const PORT = process.env.PORT || 3002
const IS_PROD = process.env.NODE_ENV === 'production'
const MATCH_MANAGER_ENABLED = process.env.MATCH_MANAGER_ENABLED === 'true'

// Trust proxy (Render)
if (process.env.RENDER === 'true') {
  app.set('trust proxy', 1)
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    }
  } : false
}))
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(limiter)

// ============================================================
// Health endpoint (for Render/Load balancer)
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    enabled: MATCH_MANAGER_ENABLED
  })
})

// ============================================================
// API Routes (R8.1: MP1-MP7)
// ============================================================

// TODO: MP1 - Event Management
// app.use('/api/v1/events', requireAuthV7(), eventsRouter)

// TODO: MP2 - Personnel Management
// app.use('/api/v1/personnel', requireAuthV7(), personnelRouter)

// TODO: MP3 - Squad Management
// app.use('/api/v1/squads', requireAuthV7(), squadsRouter)

// TODO: MP4 - Stage Management
// app.use('/api/v1/stages', requireAuthV7(), stagesRouter)

// TODO: MP5 - Multi-tenancy
// app.use('/api/v1/tenants', requireAuthV7(['admin']), tenantsRouter)

// TODO: MP6 - Event Templates
// app.use('/api/v1/templates', requireAuthV7(), templatesRouter)

// TODO: MP7 - Public Registration API
// app.use('/api/v1/public', publicRouter)

// ============================================================
// 404 handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path })
})

// ============================================================
// Error handler
// ============================================================
app.use(errorHandler)

// ============================================================
// Start server (if enabled)
// ============================================================
if (MATCH_MANAGER_ENABLED) {
  app.listen(PORT, () => {
    log.info(`[match-manager] Server running on port ${PORT}`)
  })
} else {
  log.info('[match-manager] Starting in standby mode (MATCH_MANAGER_ENABLED=false)')
  // Keep process alive for Render health checks
  setInterval(() => {
    log.verbose('[match-manager] Standby heartbeat')
  }, 60000)
}

export default app
