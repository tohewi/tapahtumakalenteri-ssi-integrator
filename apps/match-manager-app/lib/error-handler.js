// ============================================================
// Match Manager — Error Handling
// ============================================================

import { log } from '@ssi-tools/core/logger'

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Main error handling middleware
 */
export function errorHandler(err, req, res, next) {
  // Log the error
  const statusCode = err.statusCode || err.status || 500
  const isClientError = statusCode >= 400 && statusCode < 500

  if (isClientError) {
    log.warn('[match-manager] Client error', {
      error: err.message,
      code: err.code,
      statusCode,
      path: req.path,
      method: req.method,
    })
  } else {
    log.error('[match-manager] Server error', {
      error: err.message,
      code: err.code,
      statusCode,
      path: req.path,
      method: req.method,
      stack: err.stack,
    })
  }

  // Send response
  const response = {
    error: isClientError ? err.message : 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
  }

  // Add request ID for tracing if available
  if (req.id || req.requestId) {
    response.requestId = req.id || req.requestId
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack
  }

  res.status(statusCode).json(response)
}
