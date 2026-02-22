/**
 * API v1 Router
 * Current version of the API with all existing endpoints
 */

const express = require('express')
const router = express.Router()

// Import route modules (will be updated to use versioned paths)
const authRoutes = require('../auth-v7')
const scoringRoutes = require('../scoring')
const registrationRoutes = require('../registration')
const managementRoutes = require('../management')
const reportsRoutes = require('../reports')
const staffingRoutes = require('../staffing')

// Mount routes with /v1 prefix
router.use('/auth', authRoutes)
router.use('/scoring', scoringRoutes)
router.use('/register', registrationRoutes)
router.use('/manage', managementRoutes)
router.use('/reports', reportsRoutes)
router.use('/staffing', staffingRoutes)

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

module.exports = router
