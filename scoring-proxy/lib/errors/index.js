/**
 * Re-export shim for @ssi-tools/core/errors
 * 
 * NOTE: This file will be removed once all imports are migrated.
 * New code should import from: import { AppError } from '@ssi-tools/core/errors'
 */

export { AppError, NotFoundError, ValidationError, AuthError, ConflictError, SSIError, UpstreamError, RateLimitError, ServerError } from '../../../packages/ssi-core/lib/errors/AppError.js'
