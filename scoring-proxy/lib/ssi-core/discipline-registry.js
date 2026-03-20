/**
 * Built-in registry of known SSI discipline types.
 * Replaces manual URL entry with guided selection for event creation.
 * Requirement: SSI-R1
 */

export const SSI_DISCIPLINE_REGISTRY = [
  {
    id: 'sra_match',
    displayName: 'SRA Match',
    ssiCreateUrl: '/sra/create-match/',
    isCup: false,
    ruleCode: 'sra',
    description: 'Standard SRA Match'
  },
  {
    id: 'resul_cup',
    displayName: 'RESUL Cup',
    ssiCreateUrl: '/series/nordic/create-resul-cup/',
    isCup: true,
    ruleCode: 'resul',
    description: 'RESUL Cup (contains multiple matches)'
  },
  {
    id: 'resul_25m_kuvio',
    displayName: 'RESUL 25m Kuvio Pistol',
    ssiCreateUrl: '/nordic/create-resul-25-kuvio-pistol/',
    isCup: false,
    ruleCode: 'resul',
    description: 'RESUL 25m Kuvio Pistol Match'
  }
]

/**
 * Get a discipline type by ID.
 * @param {string} id 
 * @returns {Object|undefined}
 */
export function getSsiDisciplineType(id) {
  return SSI_DISCIPLINE_REGISTRY.find(d => d.id === id)
}

/**
 * Find a discipline type by SSI event properties (rule code + cup flag).
 * Used by SSI-R4 to detect the type of an imported seed event.
 * @param {string} rule - SSI rule code (e.g. 'sra', 'rl', 'resul')
 * @param {boolean} isCup - whether the event is a cup/series
 * @param {string} [eventTypeName] - optional event type name for disambiguation
 * @returns {Object|undefined}
 */
export function getSsiDisciplineByProperties(rule, isCup, eventTypeName) {
  return SSI_DISCIPLINE_REGISTRY.find(d => d.ruleCode === rule && d.isCup === isCup)
}

/**
 * Find a discipline type by its SSI create URL.
 * Used by SSI-R4 to resolve the expected type from a template's discipline config.
 * @param {string} ssiCreateUrl
 * @returns {Object|undefined}
 */
export function getSsiDisciplineByUrl(ssiCreateUrl) {
  return SSI_DISCIPLINE_REGISTRY.find(d => d.ssiCreateUrl === ssiCreateUrl)
}
