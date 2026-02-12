/**
 * Staffing Cron Job — triggered by Render Cron every hour.
 * Finds events past registration close and finalizes them.
 *
 * See docs/design/sra-staffing-design.md Section 12
 */

import { getEventsDueForFinalization, finalizeEvent } from './engine.js'

const STAFFING_API_URL = process.env.STAFFING_API_URL
const CRON_SECRET = process.env.STAFFING_CRON_SECRET

async function run() {
  console.log(`[staffing-cron] Running at ${new Date().toISOString()}`)

  // If API URL is configured, call the API endpoint (production mode)
  if (STAFFING_API_URL && CRON_SECRET) {
    try {
      const resp = await fetch(`${STAFFING_API_URL}/api/staffing/finalize-due`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': CRON_SECRET,
        },
      })
      const data = await resp.json()
      console.log(`[staffing-cron] API response:`, data)
    } catch (err) {
      console.error(`[staffing-cron] API call failed:`, err.message)
    }
    return
  }

  // Fallback: run finalization directly (local / test mode)
  const dueEvents = getEventsDueForFinalization()
  console.log(`[staffing-cron] Found ${dueEvents.length} event(s) due for finalization`)

  for (const event of dueEvents) {
    try {
      const result = await finalizeEvent(event.eventId)
      console.log(`[staffing-cron] Finalized ${event.eventId} (${event.eventName}):`, result)
    } catch (err) {
      console.error(`[staffing-cron] Failed to finalize ${event.eventId}:`, err.message)
    }
  }

  console.log(`[staffing-cron] Done`)
}

run().catch(err => {
  console.error('[staffing-cron] Fatal error:', err)
  process.exit(1)
})
