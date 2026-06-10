// ============================================================
// Event Builder Registry
//
// Maps disciplines/rules to their specific event creation builders.
// This allows migrating disciplines from web scraping to GraphQL
// one by one, without risking regressions in other disciplines.
// ============================================================

import { buildSraStandaloneMatch } from './sra-graphql-builder.js'
import { buildNordicCupWithMatches } from './nordic-cup-graphql-builder.js'
import { buildLegacyWebScrapingEvent } from './legacy-web-builder.js'
import { log } from '../../logger.js'

/**
 * Registry of event builders.
 * 
 * Each builder must implement:
 * async build({ snapshot, overrides, schedule, credentials, discipline, progress, createUrl, isCup })
 * 
 * And return:
 * { eventIds: { typeId, eventId }, eventUrl: string, cookies: object }
 */
const BUILDERS = [
  {
    name: 'SRA GraphQL (Standalone)',
    match: (snapshot, isCup, discipline) => {
      const isSRA = snapshot.rule === 'sr' || discipline?.sportCode === 'sr' || discipline?.sport === 'SRA'
      return !isCup && isSRA
    },
    build: buildSraStandaloneMatch
  },
  {
    name: 'Nordic Cup GraphQL (RESUL)',
    match: (snapshot, isCup, discipline) => {
      const isNordic = snapshot.rule === 'rl' || discipline?.sportCode === 'rl'
      return isCup && isNordic
    },
    build: buildNordicCupWithMatches
  }
]

/**
 * Select the appropriate builder for the event and execute it.
 */
export async function createEventWithBuilder(params) {
  const { snapshot, isCup, discipline } = params
  
  // Find the first matching builder
  const builderDef = BUILDERS.find(b => b.match(snapshot, isCup, discipline))
  
  if (builderDef) {
    log.info(`[event-creation] Selected builder: ${builderDef.name}`)
    try {
      return await builderDef.build(params)
    } catch (err) {
      log.error(`[event-creation] Builder ${builderDef.name} failed: ${err.message}`)
      // If a specialized builder fails, we let it throw rather than falling back,
      // so we can properly diagnose the failure.
      throw err
    }
  }
  
  // Fallback to legacy web scraping
  log.info(`[event-creation] No specialized builder found. Falling back to Legacy Web Scraping builder.`)
  return await buildLegacyWebScrapingEvent(params)
}
