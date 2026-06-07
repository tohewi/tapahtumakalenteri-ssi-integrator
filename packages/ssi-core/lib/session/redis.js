// ============================================================
// Redis Client Wrapper
// Connects to Redis when REDIS_URL is set, falls back to
// an in-memory Map for local development without Redis.
// ============================================================

import { createClient } from 'redis'
import { sessionConfig } from './config.js'

let client = null
let fallbackStore = null

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

  async ttl(key) {
    this._expireIfNeeded(key)
    if (!this.data.has(key)) return -2 // key does not exist
    const expiry = this.ttls.get(key)
    if (!expiry) return -1 // key exists but no TTL
    return Math.max(0, Math.ceil((expiry - Date.now()) / 1000))
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
    client = createClient({
      url,
      socket: {
        connectTimeout: sessionConfig.redis.connectTimeout,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('[session] Redis reconnection failed after 10 retries')
            return new Error('Redis reconnection failed')
          }
          return Math.min(retries * 100, 3000)
        },
      },
    })

    client.on('error', (err) => {
      console.error('[session] Redis error:', err.message)
    })

    client.on('connect', () => {
      console.log('[session] Redis connected')
    })

    client.on('reconnecting', () => {
      console.log('[session] Redis reconnecting...')
    })

    await client.connect()
    await client.ping()
    console.log('[session] Redis ready')
    return client
  } catch (err) {
    console.error('[session] Redis connection failed, falling back to in-memory store:', err.message)
    fallbackStore = new MemoryStore()
    client = fallbackStore
    return client
  }
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
