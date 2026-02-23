/**
 * Scoring service - Business logic for scoring operations
 * Pure functions without Express dependencies
 */

import { ssiGetScoringPage, ssiSubmitScore } from '../ssi-core/scoring.js'
import { log } from '../logger.js'
import { ValidationError, NotFoundError, SSIError } from '../errors/AppError.js'

/**
 * Search for cups by name
 * @param {string} search - Search term (minimum 2 characters)
 * @param {Object} session - SSI session with JWT token
 * @param {Function} graphqlWithRefresh - GraphQL client function
 * @returns {Promise<Array>} Array of cups sorted by date proximity
 */
async function searchCups(search, session, graphqlWithRefresh) {
  if (!search || search.length < 2) {
    return []
  }

  try {
    const result = await graphqlWithRefresh(session, `
      query SearchCups($search: String!) {
        events(search: $search) {
          id name starts status get_content_type_key
        }
      }
    `, { search })

    // Filter to cups (CT=136) only
    const cups = (result.events || [])
      .filter(e => e.get_content_type_key === 136)
      .map(c => ({
        id: c.id,
        name: c.name,
        starts: c.starts,
        status: c.status,
      }))

    // Sort by date: closest to today first (ascending by absolute distance)
    const now = Date.now()
    cups.sort((a, b) => {
      const da = Math.abs(new Date(a.starts).getTime() - now)
      const db = Math.abs(new Date(b.starts).getTime() - now)
      return da - db
    })

    return cups
  } catch (err) {
    log.error('Failed to search cups:', err.message)
    throw new SSIError('Failed to search cups')
  }
}

/**
 * Get cup details with component matches
 * @param {string} cupId - Cup ID
 * @param {Object} session - SSI session with JWT token
 * @param {Function} graphqlWithRefresh - GraphQL client function
 * @returns {Promise<Object>} Cup details with matches
 */
async function getCupDetails(cupId, session, graphqlWithRefresh) {
  try {
    const result = await graphqlWithRefresh(session, `
      query CupDetail($id: String!) {
        event(content_type: 136, id: $id) {
          id name starts status
          ... on NordicSerieNode {
            component_matches {
              number included
              match {
                id name starts status
                uses_strings number_of_strings number_of_rounds_per_string
              }
            }
          }
        }
      }
    `, { id: cupId })

    if (!result.event) {
      throw new NotFoundError('Cup')
    }

    // Extract actual match data from component_matches wrapper
    const matches = (result.event.component_matches || [])
      .filter(cm => cm.included && cm.match)
      .map(cm => ({ ...cm.match, componentNumber: cm.number }))
      .sort((a, b) => (a.componentNumber || 0) - (b.componentNumber || 0))

    return {
      id: result.event.id,
      name: result.event.name,
      starts: result.event.starts,
      status: result.event.status,
      matches,
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw err
    }
    log.error('Failed to fetch cup:', err.message)
    throw new SSIError('Failed to fetch cup details')
  }
}

/**
 * Get match details with squads and competitors
 * @param {string} matchId - Match ID
 * @param {Object} session - SSI session with JWT token
 * @param {Function} graphqlWithRefresh - GraphQL client function
 * @returns {Promise<Object>} Match details with squads
 */
async function getMatchDetails(matchId, session, graphqlWithRefresh) {
  try {
    const result = await graphqlWithRefresh(session, `
      query MatchDetail($id: String!) {
        event(content_type: 91, id: $id) {
          id name starts status
          ... on MatchNode {
            uses_strings number_of_strings number_of_rounds_per_string
            squads {
              id name max_competitors
              competitors {
                id first_name last_name email
                status
                squad_number
                strings {
                  number
                  shots {
                    index value
                  }
                }
              }
            }
          }
        }
      }
    `, { id: matchId })

    if (!result.event) {
      throw new NotFoundError('Match')
    }

    return result.event
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw err
    }
    log.error('Failed to fetch match:', err.message)
    throw new SSIError('Failed to fetch match details')
  }
}

/**
 * Get competitor details with scores
 * @param {string} competitorId - Competitor ID
 * @param {Object} session - SSI session with JWT token
 * @param {Function} graphqlWithRefresh - GraphQL client function
 * @returns {Promise<Object>} Competitor details with scores
 */
async function getCompetitorDetails(competitorId, session, graphqlWithRefresh) {
  try {
    const result = await graphqlWithRefresh(session, `
      query CompetitorDetail($id: String!) {
        competitor(id: $id) {
          id first_name last_name email
          status squad_number
          match {
            id name status
            uses_strings number_of_strings number_of_rounds_per_string
          }
          squad {
            id name max_competitors
          }
          strings {
            number
            shots {
              index value
            }
          }
        }
      }
    `, { id: competitorId })

    if (!result.competitor) {
      throw new NotFoundError('Competitor')
    }

    return result.competitor
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw err
    }
    log.error('Failed to fetch competitor:', err.message)
    throw new SSIError('Failed to fetch competitor details')
  }
}

/**
 * Validate score data before submission
 * @param {Object} scores - Score data to validate
 * @param {Object} matchConfig - Match configuration (strings, rounds)
 * @returns {void}
 * @throws {ValidationError} If scores are invalid
 */
function validateScores(scores, matchConfig) {
  if (!scores || typeof scores !== 'object') {
    throw new ValidationError('Invalid scores data')
  }

  const { uses_strings, number_of_strings, number_of_rounds_per_string } = matchConfig
  
  // Validate each string
  if (uses_strings) {
    for (let stringNum = 1; stringNum <= number_of_strings; stringNum++) {
      const stringKey = `string${stringNum}`
      const stringScores = scores[stringKey]
      
      if (!stringScores || typeof stringScores !== 'object') {
        throw new ValidationError(`Invalid scores for string ${stringNum}`)
      }
      
      // Validate each zone
      const zones = ['xxx', 'ten', 'nine', 'eight', 'seven', 'six', 'five', 'four', 'three', 'two', 'one', 'miss']
      let totalShots = 0
      
      for (const zone of zones) {
        const count = parseInt(stringScores[zone]) || 0
        if (count < 0) {
          throw new ValidationError(`Invalid score count for zone ${zone} in string ${stringNum}`)
        }
        totalShots += count
      }
      
      // Check max shots per string
      const maxShots = number_of_rounds_per_string || 5
      if (totalShots > maxShots) {
        throw new ValidationError(`Too many shots in string ${stringNum} (max ${maxShots})`)
      }
    }
  }
}

/**
 * Submit scores for a competitor
 * @param {string} competitorId - Competitor ID
 * @param {Object} scores - Score data
 * @param {Object} session - SSI session with cookies
 * @param {Object} matchConfig - Match configuration
 * @returns {Promise<Object>} Submission result
 */
async function submitScores(competitorId, scores, session, matchConfig) {
  // Validate scores first
  validateScores(scores, matchConfig)
  
  try {
    // Get scoring page to extract CSRF token
    const scoringPage = await ssiGetScoringPage(competitorId, session.ssiCookies)
    
    // Build the Django formset data
    const ZONES = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']
    const ZONE_KEYS = ['xxx', 'ten', 'nine', 'eight', 'seven', 'six', 'five', 'four', 'three', 'two', 'one', 'miss']
    const numStrings = Object.keys(scores).length || 6

    const formData = new URLSearchParams()
    formData.append('csrfmiddlewaretoken', scoringPage.csrfToken)
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
    
    // Submit scores
    const result = await ssiSubmitScore(competitorId, formData, session.ssiCookies, scoringPage.csrfToken)
    
    log.debug(`Scores submitted for competitor ${competitorId}`)
    
    return {
      success: true,
      competitorId,
      submittedAt: new Date().toISOString()
    }
  } catch (err) {
    log.error('Failed to submit scores:', err.message)
    throw new SSIError('Failed to submit scores')
  }
}

export default {
  searchCups,
  getCupDetails,
  getMatchDetails,
  getCompetitorDetails,
  validateScores,
  submitScores
}
