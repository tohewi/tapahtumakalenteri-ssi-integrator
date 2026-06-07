// ============================================================
// Match Manager App — R8.x Platform Backend
//
// Event-centric match management for multi-tenant deployment.
// This is a minimal scaffold for Loop 9. Full implementation
// of R8.1 features (MP1-MP7) comes in subsequent loops.
// ============================================================

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { log } from '@ssi-tools/core/logger'

const app = express()
const PORT = process.env.PORT || 3002
const IS_PROD = process.env.NODE_ENV === 'production'

// Trust proxy (Render)
if (process.env.RENDER === 'true') {
  app.set('trust proxy', 1)
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    }
  }
}))
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(limiter)

// ============================================================
// Health endpoint (for Render/Load balancer)
// ============================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() })
})

// ============================================================
// API routes will be added here in future loops
// ============================================================
// app.use('/api/v1/events', eventsRouter)
// app.use('/api/v1/personnel', personnelRouter)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path })
})

// Error handler
app.use((err, req, res, next) => {
  log.error('[match-manager] Error:', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
app.listen(PORT, () => {
  log.info(`[match-manager] Server running on port ${PORT}`)
})

export default app
