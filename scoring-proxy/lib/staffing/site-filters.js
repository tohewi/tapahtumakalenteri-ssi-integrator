/**
 * Helpers for site-specific staffing event discovery.
 *
 * Keeps filtering logic centralized and unit-testable.
 */

const DEFAULT_SITE_KEY = 'sra-training'

/**
 * Normalize and validate site key.
 * Falls back to default key when input is empty or invalid.
 */
export function normalizeSiteKey(rawSiteKey, fallback = DEFAULT_SITE_KEY) {
  if (!rawSiteKey || typeof rawSiteKey !== 'string') return fallback

  const key = rawSiteKey.trim().toLowerCase()
  if (!key) return fallback

  return /^[a-z0-9-]+$/.test(key) ? key : fallback
}

/**
 * Resolve SSI search strings from filters.
 * Uses name_contains filters when present, otherwise falls back to config defaults.
 */
export function resolveSearchStrings(filters = [], fallbackSearchStrings = []) {
  const nameFilters = (filters || [])
    .filter(f => f?.type === 'name_contains' && typeof f.value === 'string')
    .map(f => f.value.trim())
    .filter(Boolean)

  if (nameFilters.length > 0) {
    return [...new Set(nameFilters)]
  }

  if (Array.isArray(fallbackSearchStrings) && fallbackSearchStrings.length > 0) {
    return [...new Set(fallbackSearchStrings.filter(Boolean))]
  }

  // Empty search is not ideal but still valid for PoC fallback.
  return ['']
}

/**
 * Global future-only behavior:
 * - no filters configured => true (keep current behavior)
 * - all filters futureOnly !== false => true
 * - any filter futureOnly === false => false
 */
export function isFutureOnlyEnabled(filters = []) {
  if (!Array.isArray(filters) || filters.length === 0) return true
  return filters.every(f => f?.futureOnly !== false)
}

/**
 * Parse supported date range formats:
 * - "YYYY-MM-DD:YYYY-MM-DD"
 * - JSON string/object: {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}
 */
export function parseDateRange(value) {
  if (!value) return null

  if (typeof value === 'object') {
    const start = value.start ? new Date(value.start) : null
    const end = value.end ? new Date(value.end) : null
    if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) return null
    return { start, end }
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed)
      return parseDateRange(parsed)
    } catch {
      return null
    }
  }

  const [startRaw, endRaw] = trimmed.split(':').map(v => v.trim())
  if (!startRaw && !endRaw) return null

  const start = startRaw ? new Date(startRaw) : null
  const end = endRaw ? new Date(endRaw) : null

  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
    return null
  }

  return { start, end }
}

function matchesSingleFilter(event, filter) {
  if (!filter || typeof filter !== 'object') return true

  const eventName = String(event?.name || '').toLowerCase()
  const eventId = String(event?.id || '')

  if (filter.type === 'name_contains') {
    const needle = String(filter.value || '').toLowerCase().trim()
    return needle ? eventName.includes(needle) : true
  }

  if (filter.type === 'cup_id') {
    return String(filter.value || '').trim() === eventId
  }

  if (filter.type === 'date_range') {
    const range = parseDateRange(filter.value)
    if (!range) return true

    const starts = new Date(event?.starts)
    if (Number.isNaN(starts.getTime())) return false

    if (range.start && starts < range.start) return false
    if (range.end && starts > range.end) return false
    return true
  }

  // Unknown filter types are ignored to keep backward compatibility.
  return true
}

/**
 * Filter list semantics: OR between filters.
 * (Any matching filter includes the event.)
 */
export function matchesEventFilters(event, filters = []) {
  if (!Array.isArray(filters) || filters.length === 0) return true
  return filters.some(filter => matchesSingleFilter(event, filter))
}

export { DEFAULT_SITE_KEY }
