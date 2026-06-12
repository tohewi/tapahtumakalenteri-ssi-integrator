import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../server.js'

describe('Health Endpoint', () => {
  it('GET /health returns 200 and status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.version).toBe('1.0.0')
    expect(res.body).toHaveProperty('enabled')
  })
})

describe('404 Handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/unknown-route')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Not found')
  })
})
