// ============================================================
// SSI Core — Event Creation Domain
// ============================================================

import { ssiGraphQL, ssiGraphQLAuth } from './graphql.js'

const CREATE_EVENT_MUTATION = `
mutation CreateEvent($form_input: JSON!, $rule: String!, $sub_rule: String!, $serie_type: String, $firearms: String) {
  create_event(form_input: $form_input, rule: $rule, sub_rule: $sub_rule, serie_type: $serie_type, firearms: $firearms) {
    id
    name
    starts
    ends
    get_full_absolute_url
    get_content_type_key
  }
}
`

/**
 * Create an event using the SSI GraphQL API.
 * 
 * @param {object} params
 * @param {object} params.credentials - { email, password, apiKey }
 * @param {object} params.formInput - The form data object (will be serialized to JSON)
 * @param {string} params.rule - Rule code (e.g. 'sr' for SRA, 'rl' for RESUL)
 * @param {string} [params.subRule] - Sub-rule code
 * @param {string} [params.serieType] - 'cp' for cup, empty for match
 * @param {string} [params.firearms] - Comma separated firearms (e.g. 'rf,sg,hg')
 * @returns {Promise<object>} The created event data
 */
export async function ssiCreateEvent({ credentials, formInput, rule, subRule = '', serieType = '', firearms = '' }) {
  const jwt = await ssiGraphQLAuth(credentials)
  
  // The GraphQL schema expects form_input to be a JSON string, not a generic object
  const variables = {
    form_input: JSON.stringify(formInput),
    rule,
    sub_rule: subRule,
    serie_type: serieType,
    firearms
  }
  
  const result = await ssiGraphQL(jwt, CREATE_EVENT_MUTATION, variables)
  
  if (!result.create_event) {
    throw new Error('Event creation failed - no event returned from GraphQL')
  }
  
  return result.create_event
}
