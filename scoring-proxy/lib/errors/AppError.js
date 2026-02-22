/**
 * Custom error classes for the application
 * Provides structured error handling with operational vs programming error distinction
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = null, isOperational = true) {
    super(message)
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
    
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    this.isOperational = isOperational
    
    // Custom properties for additional context
    this.timestamp = new Date().toISOString()
    this.path = null
    this.userId = null
    this.requestId = null
  }
}

/**
 * Operational errors - expected during normal operation
 * These are safe to show to users
 */
class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR')
    this.field = field
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR')
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'AUTHORIZATION_ERROR')
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND')
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT')
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED')
  }
}

class SSIError extends AppError {
  constructor(message, ssiStatusCode = null) {
    super(`SSI API error: ${message}`, 502, 'SSI_ERROR')
    this.ssiStatusCode = ssiStatusCode
  }
}

/**
 * Programming errors - unexpected bugs
 * These should not be exposed to users in production
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR', false)
  }
}

class ConfigurationError extends AppError {
  constructor(message = 'Configuration error') {
    super(message, 500, 'CONFIGURATION_ERROR', false)
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  SSIError,
  DatabaseError,
  ConfigurationError
}
