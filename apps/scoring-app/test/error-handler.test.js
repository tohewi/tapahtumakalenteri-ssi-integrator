import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  errorHandler,
  asyncHandler,
  createError,
  enhanceError,
  isClientSafeError,
  formatErrorResponse
} from '../middleware/errorHandler.js'
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  SSIError,
  DatabaseError
} from '../lib/errors/AppError.js'

// Suppress logger output during tests
vi.mock('../lib/logger.js', () => ({
  log: Object.assign(vi.fn(), {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}))

describe('Error Handling Middleware', () => {
  let app

  beforeEach(() => {
    app = express()
    app.use(express.json())
  })

  describe('errorHandler', () => {
    it('returns 400 for ValidationError', async () => {
      app.get('/test', (req, res, next) => {
        next(new ValidationError('Invalid input', 'email'))
      })
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid input')
      expect(response.body.code).toBe('VALIDATION_ERROR')
      expect(response.body.field).toBe('email')
      expect(response.body).toHaveProperty('timestamp')
    })

    it('returns 404 for NotFoundError', async () => {
      app.get('/test', (req, res, next) => {
        next(new NotFoundError('Match'))
      })
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.status).toBe(404)
      expect(response.body.error).toBe('Match not found')
      expect(response.body.code).toBe('NOT_FOUND')
    })

    it('returns 401 for AuthenticationError', async () => {
      app.get('/test', (req, res, next) => {
        next(new AuthenticationError('Unauthorized access'))
      })
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.status).toBe(401)
      expect(response.body.error).toBe('Unauthorized access')
      expect(response.body.code).toBe('AUTHENTICATION_ERROR')
    })

    it('returns 403 for AuthorizationError', async () => {
      app.get('/test', (req, res, next) => {
        next(new AuthorizationError())
      })
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.status).toBe(403)
      expect(response.body.error).toBe('Access forbidden')
      expect(response.body.code).toBe('AUTHORIZATION_ERROR')
    })

    it('returns 502 for SSIError', async () => {
      app.get('/test', (req, res, next) => {
        next(new SSIError('timeout', 504))
      })
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.status).toBe(502)
      expect(response.body.error).toBe('SSI API error: timeout')
      expect(response.body.code).toBe('SSI_ERROR')
      expect(response.body.ssiStatusCode).toBe(504)
    })

    it('maps transient GraphQL upstream failures to 503 with a clean UI message', async () => {
      app.get('/test', (req, res, next) => {
        next(new Error('GraphQL HTTP 502: Bad Gateway'))
      })
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.status).toBe(503)
      expect(response.body.error).toBe('SSI service temporarily unavailable. Please retry.')
      expect(response.body.code).toBe('UPSTREAM_UNAVAILABLE')
    })

    it('hides generic error details from client', async () => {
      app.get('/test', (req, res, next) => {
        next(new Error('Unexpected internal bug'))
      })
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('Internal server error')
      expect(response.body.code).toBe('INTERNAL_ERROR')
      // Should NOT leak the actual error message
      expect(response.body.error).not.toBe('Unexpected internal bug')
    })

    it('adds requestId from x-request-id header for AppErrors', async () => {
      app.get('/test', (req, res, next) => {
        next(new ValidationError('Bad input'))
      })
      app.use(errorHandler)

      const response = await request(app)
        .get('/test')
        .set('X-Request-ID', 'req-abc-123')

      expect(response.body.requestId).toBe('req-abc-123')
    })

    it('does not expose stack trace in production', async () => {
      const origEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      app.get('/test', (req, res, next) => {
        next(new ValidationError('Bad'))
      })
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.body).not.toHaveProperty('stack')
      process.env.NODE_ENV = origEnv
    })

    it('passes through when no error', async () => {
      app.get('/test', (req, res, next) => {
        next()
      })
      app.use(errorHandler)
      // After errorHandler calls next(), Express returns 404 by default
      app.use((req, res) => res.status(200).json({ ok: true }))

      const response = await request(app).get('/test')
      expect(response.status).toBe(200)
    })
  })

  describe('asyncHandler', () => {
    it('catches async errors and passes to error middleware', async () => {
      app.get('/test', asyncHandler(async () => {
        throw new ValidationError('Async validation error')
      }))
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Async validation error')
      expect(response.body.code).toBe('VALIDATION_ERROR')
    })

    it('allows successful async responses', async () => {
      app.get('/test', asyncHandler(async (req, res) => {
        res.json({ success: true })
      }))

      const response = await request(app).get('/test')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ success: true })
    })

    it('catches rejected promises from async handlers', async () => {
      app.get('/test', asyncHandler(async () => {
        throw new SSIError('connection refused')
      }))
      app.use(errorHandler)

      const response = await request(app).get('/test')

      expect(response.status).toBe(502)
      expect(response.body.code).toBe('SSI_ERROR')
    })
  })

  describe('enhanceError', () => {
    it('adds request context to AppError', () => {
      const err = new ValidationError('test')
      const req = {
        path: '/api/v1/test',
        method: 'POST',
        headers: { 'x-request-id': 'req-999' },
        ssiSession: { userId: 'user-42' }
      }

      enhanceError(err, req)

      expect(err.path).toBe('/api/v1/test')
      expect(err.method).toBe('POST')
      expect(err.requestId).toBe('req-999')
      expect(err.userId).toBe('user-42')
    })

    it('does not modify non-AppError instances', () => {
      const err = new Error('generic')
      const req = {
        path: '/test',
        method: 'GET',
        headers: { 'x-request-id': 'req-1' }
      }

      enhanceError(err, req)

      expect(err.path).toBeUndefined()
      expect(err.requestId).toBeUndefined()
    })
  })

  describe('isClientSafeError', () => {
    it('returns true for operational AppErrors', () => {
      expect(isClientSafeError(new ValidationError('test'))).toBe(true)
      expect(isClientSafeError(new AuthenticationError())).toBe(true)
      expect(isClientSafeError(new NotFoundError('Cup'))).toBe(true)
      expect(isClientSafeError(new SSIError('timeout'))).toBe(true)
      expect(isClientSafeError(new ConflictError('duplicate'))).toBe(true)
    })

    it('returns false for non-operational errors', () => {
      expect(isClientSafeError(new DatabaseError())).toBe(false)
      expect(isClientSafeError(new Error('generic'))).toBe(false)
    })
  })

  describe('formatErrorResponse', () => {
    it('formats operational error with details', () => {
      const err = new ValidationError('Bad email', 'email')
      const response = formatErrorResponse(err)

      expect(response.error).toBe('Bad email')
      expect(response.code).toBe('VALIDATION_ERROR')
      expect(response.field).toBe('email')
      expect(response).toHaveProperty('timestamp')
    })

    it('hides details for generic errors', () => {
      const err = new Error('secret internal details')
      const response = formatErrorResponse(err)

      expect(response.error).toBe('Internal server error')
      expect(response.code).toBe('INTERNAL_ERROR')
    })

    it('formats upstream unavailable errors with a user-safe response', () => {
      const err = new Error('fetch failed')
      const response = formatErrorResponse(err)

      expect(response.error).toBe('SSI service temporarily unavailable. Please retry.')
      expect(response.code).toBe('UPSTREAM_UNAVAILABLE')
    })

    it('includes requestId when present on error', () => {
      const err = new ValidationError('test')
      err.requestId = 'req-123'
      const response = formatErrorResponse(err)

      expect(response.requestId).toBe('req-123')
    })

    it('includes ssiStatusCode for SSIError', () => {
      const err = new SSIError('gateway timeout', 504)
      const response = formatErrorResponse(err)

      expect(response.ssiStatusCode).toBe(504)
    })
  })

  describe('createError', () => {
    it('creates ValidationError with context', () => {
      const error = createError('validation', 'Invalid email', { extra: 'data' })

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.message).toBe('Invalid email')
      expect(error.statusCode).toBe(400)
      expect(error.extra).toBe('data')
    })

    it('creates NotFoundError', () => {
      const error = createError('notFound', 'Cup')

      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.message).toBe('Cup not found')
      expect(error.statusCode).toBe(404)
    })

    it('creates AuthenticationError', () => {
      const error = createError('authentication', 'Token expired')

      expect(error).toBeInstanceOf(AuthenticationError)
      expect(error.statusCode).toBe(401)
    })

    it('throws for unknown error type', () => {
      expect(() => {
        createError('unknown', 'Message')
      }).toThrow('Unknown error type: unknown')
    })
  })
})
