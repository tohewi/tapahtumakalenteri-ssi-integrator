// ============================================================
// Redis Client Wrapper
// Connects to Redis when REDIS_URL is set, falls back to
// an in-memory Map for local development without Redis.
//
// Auth modes:
//   Entra ID (production): REDIS_URL has no password (rediss://host:6380)
//                          Uses ManagedIdentityCredential + token refresh.
//   Access key (local dev): REDIS_URL includes password credentials.
// ============================================================

import { createClient } from 'redis'
import { ManagedIdentityCredential } from '@azure/identity'
import { sessionConfig } from './config.js'

let client = null
let fallbackStore = null
let tokenRefreshTimer = null

const REDIS_ENTRA_SCOPE = 'https://redis.azure.com/.default'

// In-memory fallback that implements the subset of Redis commands we use
class MemoryStore {
  constructor() {
    this.data = new Map()
    this.ttls = new Map()
    this.connected = true
  }

  async get(key) {
    this._expireIfNeeded(key)
    const val = this.data.get(key)
    return val !== undefined ? val : null
  }

  async set(key, value, options) {
    this.data.set(key, value)
    if (options?.EX) {
      this.ttls.set(key, Date.now() + options.EX * 1000)
    } else if (options?.PX) {
      this.ttls.set(key, Date.now() + options.PX)
    }
    return 'OK'
  }

  async del(key) {
    const existed = this.data.has(key)
    this.data.delete(key)
    this.ttls.delete(key)
    return existed ? 1 : 0
  }

  async expire(key, seconds) {
    if (!this.data.has(key)) return 0
    this.ttls.set(key, Date.now() + seconds * 1000)
    return 1
  }

  async keys(pattern) {
    this._expireAll()
    const prefix = pattern.replace('*', '')
    return [...this.data.keys()].filter(k => k.startsWith(prefix))
  }

  async ping() {
    return 'PONG'
  }

  async quit() {
    this.data.clear()
    this.ttls.clear()
    this.connected = false
  }

  get isOpen() {
    return this.connected
  }

  _expireIfNeeded(key) {
    const ttl = this.ttls.get(key)
    if (ttl && Date.now() > ttl) {
      this.data.delete(key)
      this.ttls.delete(key)
    }
  }

  _expireAll() {
    const now = Date.now()
    for (const [key, ttl] of this.ttls) {
      if (now > ttl) {
        this.data.delete(key)
        this.ttls.delete(key)
      }
    }
  }
}

// Initialize Redis client or fallback
export async function initRedis() {
  const url = sessionConfig.redis.url

  if (!url) {
    console.log('[session] No REDIS_URL configured — using in-memory session store')
    fallbackStore = new MemoryStore()
    client = fallbackStore
    return client
  }

  try {
    const parsed = new URL(url)
    const isEntraId = !parsed.password && !parsed.username

    if (isEntraId) {
      client = await _connectWithEntraId(parsed.hostname, parsed.port || '6380')
    } else {
      client = await _connectWithPassword(url)
    }

    console.log('[session] Redis ready')
    return client
  } catch (err) {
    console.error('[session] Redis connection failed, falling back to in-memory store:', err.message)
    fallbackStore = new MemoryStore()
    client = fallbackStore
    return client
  }
}

// Connect using Azure Managed Identity (Entra ID) token auth.
// Username = UAMI principal ID; password = short-lived access token refreshed before expiry.
async function _connectWithEntraId(hostname, port) {
  const principalId = process.env.REDIS_PRINCIPAL_ID
  const clientId    = process.env.AZURE_CLIENT_ID
  if (!principalId || !clientId) {
    throw new Error('REDIS_PRINCIPAL_ID and AZURE_CLIENT_ID required for Entra ID Redis auth')
  }

  const credential = new ManagedIdentityCredential({ clientId })
  let tokenResponse = await credential.getToken(REDIS_ENTRA_SCOPE)

  const c = createClient({
    socket: {
      host: hostname,
      port: parseInt(port, 10),
      tls: true,
      connectTimeout: sessionConfig.redis.connectTimeout,
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error('Redis reconnection failed')
        return Math.min(retries * 100, 3000)
      },
    },
    username: principalId,
    password: tokenResponse.token,
  })

  c.on('error',       (err) => console.error('[session] Redis error:', err.message))
  c.on('connect',     ()    => console.log('[session] Redis connected (Entra ID)'))
  c.on('reconnecting',()    => console.log('[session] Redis reconnecting...'))

  // Refresh token 5 minutes before expiry so sessions never lose connectivity.
  function scheduleRefresh() {
    const msUntilExpiry = tokenResponse.expiresOnTimestamp - Date.now()
    const delay = Math.max(msUntilExpiry - 5 * 60 * 1000, 60_000) // ≥1 min
    tokenRefreshTimer = setTimeout(async () => {
      try {
        tokenResponse = await credential.getToken(REDIS_ENTRA_SCOPE, { forceRefresh: true })
        await c.sendCommand(['AUTH', principalId, tokenResponse.token])
        console.log('[session] Redis Entra ID token refreshed')
        scheduleRefresh()
      } catch (err) {
        console.error('[session] Redis token refresh failed:', err.message)
        scheduleRefresh() // retry on next cycle
      }
    }, delay)
  }

  await c.connect()
  await c.ping()
  scheduleRefresh()
  return c
}

// Connect using access-key password embedded in REDIS_URL (local dev).
async function _connectWithPassword(url) {
  const c = createClient({
    url,
    socket: {
      connectTimeout: sessionConfig.redis.connectTimeout,
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error('Redis reconnection failed')
        return Math.min(retries * 100, 3000)
      },
    },
  })
  c.on('error',       (err) => console.error('[session] Redis error:', err.message))
  c.on('connect',     ()    => console.log('[session] Redis connected'))
  c.on('reconnecting',()    => console.log('[session] Redis reconnecting...'))
  await c.connect()
  await c.ping()
  return c
}

// Get the active Redis client (or fallback)
export function getRedisClient() {
  if (!client) {
    throw new Error('Redis not initialized. Call initRedis() first.')
  }
  return client
}

// Check if using real Redis or fallback
export function isUsingRedis() {
  return client !== null && !(client instanceof MemoryStore)
}

// Graceful shutdown
export async function closeRedis() {
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer)
    tokenRefreshTimer = null
  }
  if (client) {
    try {
      await client.quit()
    } catch {
      // Ignore errors on shutdown
    }
    client = null
    fallbackStore = null
  }
}

// For testing: inject a custom client
export function _setClient(customClient) {
  client = customClient
}
