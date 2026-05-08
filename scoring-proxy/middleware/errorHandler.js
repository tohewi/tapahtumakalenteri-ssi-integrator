/**
 * Centralized error handling middleware for Express
 * Provides consistent error responses and logging
 */

import { log } from '../lib/logger.js'
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  SSIError
} from '../lib/errors/AppError.js'

const UPSTREAM_UNAVAILABLE_CODE = 'UPSTREAM_UNAVAILABLE'
const UPSTREAM_UNAVAILABLE_MESSAGE = 'SSI service temporarily unavailable. Please retry.'

/**
 * Detects transient upstream SSI/GraphQL failures.
 */
function isUpstreamUnavailableError(err) {
  if (!err) return false
  if (err.code === UPSTREAM_UNAVAILABLE_CODE || err.isUpstreamTransient === true) return true

  const message = String(err.message || '')
  return (
    /GraphQL HTTP (502|503|504):/i.test(message)
    || message.toLowerCase().includes('fetch failed')
  )
}

/**
 * Enhances error with request context
 */
function enhanceError(err, req) {
  // Add request context if not already present
  if (err instanceof AppError) {
    err.path = req.path
    err.method = req.method
    err.requestId = req.headers['x-request-id'] || 'unknown'
    err.userId = req.ssiSession?.userId || req.user?.id || null
  }
  
  return err
}

/**
 * Determines if error should be exposed to client
 */
function isClientSafeError(err) {
  // Custom AppErrors with isOperational = true are safe
  if (err instanceof AppError && err.isOperational) {
    return true
  }
  
  // Specific known error types are safe
  if (err instanceof ValidationError ||
      err instanceof AuthenticationError ||
      err instanceof AuthorizationError ||
      err instanceof NotFoundError ||
      err instanceof ConflictError ||
      err instanceof RateLimitError ||
      err instanceof SSIError) {
    return true
  }
  
  // In development, expose all errors
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  
  return false
}

/**
 * Formats error response for client
 */
function formatErrorResponse(err) {
  const response = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  }

  if (isUpstreamUnavailableError(err)) {
    response.error = UPSTREAM_UNAVAILABLE_MESSAGE
    response.code = UPSTREAM_UNAVAILABLE_CODE
  }
  
  if (!isUpstreamUnavailableError(err) && isClientSafeError(err)) {
    response.error = err.message
    response.code = err.code || 'UNKNOWN_ERROR'
    
    // Add additional context for specific error types
    if (err instanceof ValidationError && err.field) {
      response.field = err.field
    }
    
    if (err instanceof SSIError && err.ssiStatusCode) {
      response.ssiStatusCode = err.ssiStatusCode
    }
  }
  
  // Add request ID for tracing
  if (err.requestId) {
    response.requestId = err.requestId
  }
  
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack
  }
  
  return response
}

/**
 * Main error handling middleware
 */
function errorHandler(err, req, res, next) {
  // Ensure we have an error object
  if (!err) {
    return next()
  }
  
  // Enhance error with request context
  err = enhanceError(err, req)
  
  // Log the error
  const isUpstreamUnavailable = isUpstreamUnavailableError(err)
  const logLevel = (err instanceof AppError && err.isOperational) || isUpstreamUnavailable ? 'warn' : 'error'
  
  log[logLevel]('API Error', {
    error: err.message,
    code: err.code,
    statusCode: err.statusCode,
    upstreamStatus: err.upstreamStatus,
    upstreamStatusText: err.upstreamStatusText,
    upstreamHeaders: err.upstreamHeaders,
    upstreamBodySnippet: err.upstreamBodySnippet,
    attempts: err.attempts,
    isUpstreamTransient: err.isUpstreamTransient,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: err.userId,
    requestId: err.requestId,
    isOperational: err.isOperational
  })
  
  // Send response
  const statusCode = isUpstreamUnavailable ? 503 : (err.statusCode || 500)
  const response = formatErrorResponse(err)
  
  res.status(statusCode).json(response)
}

/**
 * Async error wrapper for route handlers
 * Converts thrown errors into proper error responses
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Creates operational errors with context
 */
function createError(type, message, context = {}) {
  const ErrorClass = {
    validation: ValidationError,
    authentication: AuthenticationError,
    authorization: AuthorizationError,
    notFound: NotFoundError,
    conflict: ConflictError,
    rateLimit: RateLimitError,
    ssi: SSIError
  }[type]
  
  if (!ErrorClass) {
    throw new Error(`Unknown error type: ${type}`)
  }
  
  const error = new ErrorClass(message)
  
  // Add context
  Object.assign(error, context)
  
  return error
}

export {
  errorHandler,
  asyncHandler,
  createError,
  enhanceError,
  isUpstreamUnavailableError,
  isClientSafeError,
  formatErrorResponse
}
