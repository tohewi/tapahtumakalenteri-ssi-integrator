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
  
  if (isClientSafeError(err)) {
    response.error = err.message
    response.code = err.code || 'UNKNOWN_ERROR'
    
    // Add additional context for specific error types
    if (err instanceof ValidationError && err.field) {
      response.field = err.field
    }
    
    if (err instanceof SSIError && err.ssiStatusCode) {
      response.ssiStatusCode = err.ssiStatusCode
    }

    // Platform auth metadata — used by frontend to trigger session restore or MFA challenge
    if (err.platformSessionExpired) {
      response.platformSessionExpired = true
    }
    if (err.mfaRequired) {
      response.mfaRequired = true
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
  const logLevel = err instanceof AppError && err.isOperational ? 'warn' : 'error'
  
  log[logLevel]('API Error', {
    error: err.message,
    code: err.code,
    statusCode: err.statusCode,
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
  const statusCode = err.statusCode || 500
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
  isClientSafeError,
  formatErrorResponse
}
