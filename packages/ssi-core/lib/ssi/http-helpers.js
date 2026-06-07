// ============================================================
// SSI Core — HTTP Helpers
// ============================================================

import { SSI_BASE_URL } from './constants.js'
import { formatCookies } from './graphql.js'

// Fetch any authenticated SSI web page (HTML scraping)
export async function ssiFetchPage(path, cookies) {
  const url = `${SSI_BASE_URL}${path}`
  const resp = await fetch(url, {
    headers: {
      'Cookie': formatCookies(cookies),
    },
    redirect: 'follow',
  })
  if (!resp.ok) {
    throw new Error(`SSI page HTTP ${resp.status} for ${path}`)
  }
  return await resp.text()
}
