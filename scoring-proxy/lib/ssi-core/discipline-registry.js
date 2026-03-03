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
