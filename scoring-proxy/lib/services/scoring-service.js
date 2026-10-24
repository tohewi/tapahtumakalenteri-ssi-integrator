// ============================================================
// Scoring Service — Pure Business Logic for Scoring Routes
// ============================================================

import { ssiGetScoringPage, ssiSubmitScore } from '../ssi-core/scoring.js'
import { log } from '../logger.js'

export const ZONES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']
export const ZONE_KEYS = ['xxx', 'ten', 'nine', 'eight', 'seven', 'six', 'five', 'four', 'three', 'two', 'one', 'miss']

export function isDebugModeEnabled(debugValue) {
  const normalized = String(debugValue || '').toLowerCase().trim()
  return normalized === 'true' || normalized === '1'
}

export function getTodayStart(now = new Date()) {
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  return todayStart
}

export function startsOnOrAfterDate(starts, dateStart) {
  const startsAt = starts ? new Date(starts) : null
  if (!startsAt || Number.isNaN(startsAt.getTime())) return false

  const startsDate = new Date(startsAt)
  startsDate.setHours(0, 0, 0, 0)
  return startsDate >= dateStart
}

export function sortByProximityToNow(nowMs = Date.now()) {
  return (a, b) => {
    const timeA = new Date(a.starts).getTime()
    const timeB = new Date(b.starts).getTime()
    const distDiff = Math.abs(timeA - nowMs) - Math.abs(timeB - nowMs)
    return distDiff !== 0 ? distDiff : timeA - timeB
  }
}

export function isUnsupportedStatusFilterError(err) {
  const message = String(err?.message || '')
  return message.includes('Unknown argument') && message.includes('status')
}

export function buildScoreFormData({ scores, csrfToken, warning, dqReason, comment }) {
  const numStrings = Object.keys(scores).length || 6
  const formData = new URLSearchParams()
  formData.append('csrfmiddlewaretoken', csrfToken)
  formData.append('form-TOTAL_FORMS', String(numStrings))
  formData.append('form-INITIAL_FORMS', String(numStrings))
  formData.append('form-MIN_NUM_FORMS', '0')
  formData.append('form-MAX_NUM_FORMS', '1')

  for (let i = 0; i < numStrings; i++) {
    const series = scores[i] || {}
    for (let z = 0; z < ZONES.length; z++) {
      const val = series[ZONES[z]] || 0
      formData.append(`form-${i}-${ZONE_KEYS[z]}`, String(val))
    }
    formData.append(`form-${i}-max_hits`, '5')
  }

  formData.append('warning', warning ? 'on' : '')
  formData.append('dq_reason', dqReason || 'no')
  formData.append('score_comment', comment || '')
  formData.append('asynchronous', 'False')
  formData.append('custom_data', '{}')
  return formData
}

export function buildMatchSearchWindows(now = new Date()) {
  const windows = []
  const futureEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
  windows.push({ after: now.toISOString().split('T')[0], before: futureEnd.toISOString().split('T')[0] })
  for (let i = 0; i < 10; i++) {
    const end = new Date(now)
    end.setMonth(end.getMonth() - i * 6)
    const start = new Date(now)
    start.setMonth(start.getMonth() - (i + 1) * 6)
    windows.push({
      after: start.toISOString().split('T')[0],
      before: end.toISOString().split('T')[0],
    })
  }
  return windows
}

export function mergeAndFormatEvents(results) {
  const seen = new Set()
  const allEvents = []
  for (const result of results) {
    for (const e of (result.events || [])) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        allEvents.push(e)
      }
    }
  }

  const matches = allEvents.map(e => {
    const item = {
      id: e.id,
      name: e.name,
      starts: e.starts,
      status: e.status,
      rule: e.rule || null,
      contentType: e.get_content_type_key,
    }
    if (e.get_content_type_key === 136 && e.component_matches) {
      item.componentMatches = (e.component_matches || [])
        .filter(cm => cm.included && cm.match)
        .map(cm => ({
          id: cm.match.id,
          name: cm.match.name,
          starts: cm.match.starts,
          status: cm.match.status,
          rule: cm.match.rule || null,
        }))
    }
    return item
  })

  matches.sort((a, b) => new Date(b.starts) - new Date(a.starts))
  return matches
}

export async function submitCompetitorScore({ competitorId, scores, warning, dqReason, comment, session, graphqlWithRefresh }) {
  const { csrfToken } = await ssiGetScoringPage(competitorId, session.ssiCookies)
  const formData = buildScoreFormData({ scores, csrfToken, warning, dqReason, comment })
  const result = await ssiSubmitScore(competitorId, formData, session.ssiCookies, csrfToken)

  if (session.jwt) {
    const updated = await graphqlWithRefresh(session, `
      query Verify($id: String!) {
        competitor(content_type: 93, id: $id) {
          id first_name last_name
          ... on NordicCompetitorNode {
            s1 s2 s3 s4 s5 s6
            s1_points s2_points s3_points s4_points s5_points s6_points
            tot_hits tot_inner_hits tot_precision_points
          }
        }
      }
    `, { id: competitorId })

    return {
      success: result.success,
      message: result.message,
      competitor: updated.competitor,
    }
  }

  return result
}
