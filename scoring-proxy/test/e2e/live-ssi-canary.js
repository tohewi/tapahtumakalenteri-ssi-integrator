// ============================================================
// Tier 3 UAT: Live-SSI Upstream Compatibility Canary (R90-TEST10)
// Read-only contract check against ShootNScoreIt (SSI)
// ============================================================

import { ssiLogin, ssiGraphQL } from '../../lib/ssi-core/graphql.js'
import { ssiGetGroupMembers } from '../../lib/ssi-core/management.js'

export async function runLiveSsiCanary({
  email = process.env.SSI_ADMIN_EMAIL,
  password = process.env.SSI_ADMIN_PASSWORD,
  apiKey = process.env.SSI_ADMIN_API_KEY,
  groupId = process.env.SSI_GUN_INVENTORY_GROUP_ID || '25874',
} = {}) {
  if (!email || !password || !apiKey) {
    throw new Error('SSI_ADMIN_EMAIL, SSI_ADMIN_PASSWORD, and SSI_ADMIN_API_KEY are required for Live-SSI canary')
  }

  // 1. Verify web login + session/CSRF cookie acquisition
  const cookies = await ssiLogin(email, password)
  if (!cookies || !cookies.sessionid) {
    throw new Error('SSI web login did not return sessionid cookie')
  }

  // 2. Verify GraphQL token_auth and { me } query
  const authResult = await ssiGraphQL(null, `
    mutation CanaryAuth($email: String!, $password: String!) {
      token_auth(email: $email, password: $password) {
        token { token }
      }
    }
  `, { email, password }, apiKey)

  const jwt = authResult?.token_auth?.token?.token
  if (!jwt) {
    throw new Error('SSI GraphQL token_auth did not return a JWT token')
  }

  const meResult = await ssiGraphQL(jwt, '{ me { email first_name last_name } }', {}, apiKey)
  if (!meResult?.me?.email) {
    throw new Error('SSI GraphQL { me } query did not return user email')
  }

  // 3. Verify GraphQL events + NordicSerieNode + NordicSquadNode inline fragment contract
  const eventsResult = await ssiGraphQL(jwt, `
    query CanaryEvents {
      events(search: "Kupittaa CUP") {
        id name get_content_type_key status starts
        ... on NordicSerieNode {
          component_matches {
            number included
            match {
              id name
              squads {
                id number comment
                ... on NordicSquadNode {
                  max_competitors
                  competitors { id status }
                }
              }
            }
          }
        }
      }
    }
  `, {}, apiKey)

  if (!Array.isArray(eventsResult?.events)) {
    throw new Error('SSI GraphQL events query did not return an array')
  }

  // 4. Verify SSI Group 25874 HTML table scraping
  const members = await ssiGetGroupMembers(groupId, cookies)
  const admins = members.filter(m => m.role === 'admin')
  if (admins.length === 0) {
    throw new Error(`SSI /groups/${groupId}/ scraping returned 0 admins (total members: ${members.length})`)
  }

  return {
    ok: true,
    me: meResult.me,
    eventsFound: eventsResult.events.length,
    groupId: String(groupId),
    groupMembersCount: members.length,
    groupAdminsCount: admins.length,
  }
}

if (process.argv[1] && process.argv[1].endsWith('live-ssi-canary.js')) {
  runLiveSsiCanary()
    .then(res => {
      console.log('[ssi-canary] PASS:', JSON.stringify(res))
      process.exit(0)
    })
    .catch(err => {
      console.error('[ssi-canary] FAIL:', err.message)
      process.exit(1)
    })
}
