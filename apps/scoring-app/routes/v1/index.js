/**
 * API v1 Router
 * Current version of the API with all existing endpoints
 */

import express from 'express'
const router = express.Router()

// Note: This router is not used directly. The routes are mounted in server.js.
// This file exists for API versioning documentation and future use.

// API version info endpoint
router.get('/', (req, res) => {
  res.json({
    version: '1.0.0',
    name: 'SSI Tools API',
    description: 'API for SSI competition management',
    endpoints: {
      auth: '/auth',
      scoring: '/scoring',
      register: '/register',
      manage: '/manage',
      reports: '/reports',
      staffing: '/staffing'
    },
    documentation: 'https://github.com/tohewi/tapahtumakalenteri-ssi-integrator',
    versioning: {
      current: 'v1',
      supported: ['v1'],
      deprecated: []
    }
  })
})

export default router
