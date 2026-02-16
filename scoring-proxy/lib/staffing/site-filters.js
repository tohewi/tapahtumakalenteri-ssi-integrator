/**
 * Helpers for site-specific staffing event discovery.
 *
 * Keeps filtering logic centralized and unit-testable.
 */

const DEFAULT_SITE_KEY = 'sra-training'
const SUPPORTED_EVENT_TYPES = new Set(['match', 'cup', 'league'])

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

function normalizeEventType(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return SUPPORTED_EVENT_TYPES.has(normalized) ? normalized : null
}

function parseEventTypes(value) {
  if (Array.isArray(value)) {
    return [...new Set(value
      .map(normalizeEventType)
      .filter(Boolean))]
  }

  if (typeof value === 'string') {
    return [...new Set(value
      .split(',')
      .map(normalizeEventType)
      .filter(Boolean))]
  }

  return []
}

/**
 * Resolve event types (match/cup/league) from filters.
 * Uses explicit event_type/event_kind filters when present,
 * otherwise falls back to site config defaults.
 */
export function resolveEventTypes(filters = [], fallbackEventTypes = []) {
  const explicitTypes = (filters || [])
    .filter(f => f?.type === 'event_type' || f?.type === 'event_kind')
    .flatMap(f => parseEventTypes(f.value))

  if (explicitTypes.length > 0) {
    return [...new Set(explicitTypes)]
  }

  return parseEventTypes(fallbackEventTypes)
}

function resolveEventType(event, contentTypeMap = {}) {
  const explicitType = normalizeEventType(event?.eventType || event?.event_type || event?.kind)
  if (explicitType) return explicitType

  const rawContentType = event?.get_content_type_key ?? event?.contentType ?? event?.content_type
  const contentType = Number.parseInt(rawContentType, 10)
  if (!Number.isFinite(contentType)) return null

  const matchContentType = Number.parseInt(contentTypeMap.match, 10)
  const cupContentType = Number.parseInt(contentTypeMap.cup, 10)
  const leagueContentType = Number.parseInt(contentTypeMap.league, 10)

  if (Number.isFinite(cupContentType) && contentType === cupContentType) return 'cup'
  if (Number.isFinite(leagueContentType) && contentType === leagueContentType) return 'league'
  if (Number.isFinite(matchContentType) && contentType === matchContentType) return 'match'

  return null
}

/**
 * Match event against allowed event types.
 */
export function matchesEventType(event, allowedEventTypes = [], options = {}) {
  if (!Array.isArray(allowedEventTypes) || allowedEventTypes.length === 0) return true

  const normalizedAllowed = [...new Set(allowedEventTypes
    .map(normalizeEventType)
    .filter(Boolean))]

  if (normalizedAllowed.length === 0) return true

  const eventType = resolveEventType(event, options.contentTypeMap || {})
  if (!eventType) return false

  return normalizedAllowed.includes(eventType)
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
