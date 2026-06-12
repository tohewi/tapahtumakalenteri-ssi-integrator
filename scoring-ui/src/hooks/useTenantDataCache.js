// ============================================================
// Tenant Data Cache (PRF-1)
//
// Stale-while-revalidate (SWR) cache for tenant-scoped API data.
// Returns cached data instantly on mount, then refreshes in background.
//
// Usage:
//   const { data, loading, refresh } = useCachedFetch('events', tenantId, () => listEvents(tenantId))
//
// Prefetch on tenant selection:
//   import { prefetchTenantData } from './useTenantDataCache.js'
//   prefetchTenantData(tenantId)  // fires API calls in background
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { listEvents, listTemplates, getUpcomingStaffingApi, getMyStaffingAssignmentsApi } from '../platform-api.js'

// Module-level cache: { "events:ten_xxx": { data, timestamp } }
const cache = new Map()
const STALE_MS = 30 * 1000 // 30 seconds — data older than this gets background-refreshed

/**
 * Hook: fetch data with SWR caching.
 * Returns cached data instantly if available, then refreshes in background.
 *
 * @param {string} key - Cache key prefix (e.g., 'events')
 * @param {string} tenantId - Tenant ID for cache scoping
 * @param {function} fetcher - Async function that returns data
 * @returns {{ data: any, loading: boolean, error: string|null, refresh: function }}
 */
export function useCachedFetch(key, tenantId, fetcher) {
  const cacheKey = `${key}:${tenantId}`
  const cached = cache.get(cacheKey)

  const [data, setData] = useState(cached?.data ?? null)
  const [loading, setLoading] = useState(!cached?.data)
  const [error, setError] = useState(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current()
      cache.set(cacheKey, { data: result, timestamp: Date.now() })
      setData(result)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [cacheKey])

  useEffect(() => {
    if (!tenantId) return

    const entry = cache.get(cacheKey)
    if (entry?.data) {
      // Serve stale data immediately
      setData(entry.data)
      setLoading(false)

      // Background refresh if stale
      if (Date.now() - entry.timestamp > STALE_MS) {
        refresh()
      }
    } else {
      // No cache — fetch fresh
      setLoading(true)
      refresh()
    }
  }, [cacheKey, tenantId, refresh])

  return { data, loading, error, refresh }
}

/**
 * Prefetch common tenant data on tenant selection.
 * Called from PlatformApp when user selects/switches a tenant.
 * Fires API calls in background and populates the cache.
 */
export function prefetchTenantData(tenantId) {
  if (!tenantId) return

  const prefetch = async (key, fetcher) => {
    try {
      const result = await fetcher()
      cache.set(`${key}:${tenantId}`, { data: result, timestamp: Date.now() })
    } catch { /* ignore prefetch failures */ }
  }

  // Fire all prefetches in parallel — don't await
  prefetch('events', () => listEvents(tenantId))
  prefetch('templates', () => listTemplates(tenantId))
  prefetch('upcomingStaffing', () => getUpcomingStaffingApi(tenantId).catch(() => []))
  prefetch('myAssignments', () => getMyStaffingAssignmentsApi(tenantId).catch(() => []))
}

/**
 * Invalidate cache for a tenant (e.g., after create/delete/update).
 */
export function invalidateTenantCache(tenantId, key) {
  if (key) {
    cache.delete(`${key}:${tenantId}`)
  } else {
    // Invalidate all keys for this tenant
    for (const k of cache.keys()) {
      if (k.endsWith(`:${tenantId}`)) cache.delete(k)
    }
  }
}
