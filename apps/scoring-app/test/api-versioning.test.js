import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import apiV1Router from '../routes/v1/index.js'

describe('API Versioning', () => {
  let app

  beforeEach(() => {
    app = express()
    app.use('/api/v1', apiV1Router)
  })

  describe('v1 endpoints', () => {
    it('returns API version information', async () => {
      const response = await request(app).get('/api/v1/')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
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

    it('handles 404 for unknown v1 endpoints', async () => {
      const response = await request(app).get('/api/v1/unknown')

      expect(response.status).toBe(404)
    })
  })

  describe('version isolation', () => {
    it('does not respond to non-versioned paths', async () => {
      const response = await request(app).get('/api/')

      expect(response.status).toBe(404)
    })

    it('does not respond to other versions', async () => {
      const response = await request(app).get('/api/v2/')

      expect(response.status).toBe(404)
    })
  })
})
