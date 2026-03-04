import { getPool, upsertSsiDiscoveredDisciplines } from '../db/platform-store.js'
import { ssiGraphQL } from '../ssi-core/graphql.js'
import log from '../logger.js'

let syncInterval = null
const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 1 week
// const SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 mins for testing

/**
 * Discovers discipline types from SSI via GraphQL Introspection.
 * SSI uses GraphQL interfaces (ComponentMatchInterface, EventInterface)
 * for different event types. We extract all possible implementations,
 * clean them up, and store them in our global registry.
 */
export async function syncSsiDisciplines(adminEmail, adminPassword) {
  log.info('[ssi-sync] Starting SSI discipline background sync...')
  if (!adminEmail || !adminPassword) {
    log.warn('[ssi-sync] No SSI admin credentials provided for sync. Skipping.')
    return
  }

  try {
    // 1. Authenticate with SSI
    const auth = await ssiGraphQL(null, `
      mutation Auth($email: String!, $password: String!) {
        token_auth(email: $email, password: $password) {
          token { token }
        }
      }
    `, { email: adminEmail, password: adminPassword })

    const jwt = auth?.token_auth?.token?.token
    if (!jwt) {
      log.error('[ssi-sync] Failed to authenticate with SSI for background sync')
      return
    }

    const discovered = []

    // 2. Discover Cup Match Types (ComponentMatchInterface)
    const cupRes = await ssiGraphQL(jwt, `
      query {
        __type(name: "ComponentMatchInterface") {
          possibleTypes { name }
        }
      }
    `)
    const cupTypes = cupRes?.__type?.possibleTypes || []
    
    for (const t of cupTypes) {
      // e.g. "SraComponentMatchNode" -> rule "sra"
      const match = t.name.match(/^([A-Z][a-z0-9]+)ComponentMatchNode$/)
      if (match) {
        const ruleCode = match[1].toLowerCase()
        discovered.push({
          id: `${ruleCode}_cup_match`,
          displayName: `${match[1]} Cup Match`,
          ssiCreateUrl: `/series/${ruleCode}/create-cup/`, // Generic guess
          isCup: true,
          ruleCode: ruleCode,
          description: `Automatically discovered cup match for ${match[1]}`
        })
      }
    }

    // 3. Discover Standalone Match Types (EventInterface)
    const eventRes = await ssiGraphQL(jwt, `
      query {
        __type(name: "EventInterface") {
          possibleTypes { name }
        }
      }
    `)
    const eventTypes = eventRes?.__type?.possibleTypes || []
    
    for (const t of eventTypes) {
      // e.g. "SraMatchNode" -> rule "sra"
      const match = t.name.match(/^([A-Z][a-z0-9]+)MatchNode$/)
      if (match) {
        const ruleCode = match[1].toLowerCase()
        discovered.push({
          id: `${ruleCode}_match`,
          displayName: `${match[1]} Match`,
          ssiCreateUrl: `/${ruleCode}/create-match/`, // Generic guess
          isCup: false,
          ruleCode: ruleCode,
          description: `Automatically discovered standalone match for ${match[1]}`
        })
      }
    }

    // 4. Save to DB
    if (discovered.length > 0) {
      await upsertSsiDiscoveredDisciplines(discovered)
      log.info(`[ssi-sync] Successfully discovered and saved ${discovered.length} SSI discipline types.`)
    } else {
      log.warn('[ssi-sync] Introspection returned no valid match types.')
    }

  } catch (err) {
    log.error(`[ssi-sync] Error during SSI discipline sync: ${err.message}`)
  }
}

/**
 * Starts the periodic background sync job.
 */
export function startSsiDisciplineSync(adminEmail, adminPassword) {
  if (syncInterval) clearInterval(syncInterval)
  
  // Run immediately on startup (non-blocking)
  setTimeout(() => syncSsiDisciplines(adminEmail, adminPassword), 10000) // Wait 10s for DB to initialize
  
  // Then run periodically
  syncInterval = setInterval(() => syncSsiDisciplines(adminEmail, adminPassword), SYNC_INTERVAL_MS)
  log.info('[ssi-sync] Background sync scheduled to run every 7 days.')
}
