import { describe, it, expect, beforeEach, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getStaffSite: vi.fn(),
  isDbAvailable: vi.fn(),
}))

vi.mock('../../lib/db/client.js', () => ({
  getStaffSite: dbMocks.getStaffSite,
  isDbAvailable: dbMocks.isDbAvailable,
}))

import {
  loadConfig,
  reloadConfig,
  isAdminEmail,
  isServiceAccount,
  DEFAULT_SITE_KEY,
} from '../../lib/staffing/config-loader.js'

describe('staffing config loader', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    dbMocks.isDbAvailable.mockReturnValue(false)
    dbMocks.getStaffSite.mockResolvedValue(null)
    await reloadConfig()
  })

  it('falls back to YAML config when database is unavailable', async () => {
    const config = await loadConfig('temppeli-sra')

    expect(config.organization.name).toBe('Temppelivuori SRA')
    expect(config.eventDiscovery.searchStrings).toContain('TEST TR-')
    expect(dbMocks.getStaffSite).not.toHaveBeenCalled()
  })

  it('loads and merges site config from database when available', async () => {
    dbMocks.isDbAvailable.mockReturnValue(true)
    dbMocks.getStaffSite.mockResolvedValue({
      key: 'temppeli-sra',
      organizationName: 'Temppeli SRA',
      organizationRange: 'Temppeli',
      timezone: 'Europe/Helsinki',
      config: {
        adminAllowlist: ['site-admin@example.com'],
        serviceAccounts: ['robot@example.com'],
        eventDiscovery: {
          searchStrings: ['Temppeli custom search'],
        },
        trainingTypes: {
          oldies: {
            maxTrainers: 12,
          },
        },
      },
    })

    const config = await loadConfig('Temppeli-SRA')

    expect(dbMocks.getStaffSite).toHaveBeenCalledWith('temppeli-sra')
    expect(config.organization.name).toBe('Temppeli SRA')
    expect(config.organization.range).toBe('Temppeli')
    expect(config.eventDiscovery.searchStrings).toEqual(['Temppeli custom search'])
    expect(config.trainingTypes.oldies.maxTrainers).toBe(12)
    expect(config.trainingTypes.oldies.staffSquad).toBeTruthy()
  })

  it('falls back to YAML template when requested site is missing from database', async () => {
    dbMocks.isDbAvailable.mockReturnValue(true)
    dbMocks.getStaffSite.mockResolvedValue(null)

    const config = await loadConfig('missing-site')

    expect(dbMocks.getStaffSite).toHaveBeenCalledWith('missing-site')
    expect(config.organization.name).toBe('Temppelivuori SRA')
  })

  it('normalizes invalid site key to default before database lookup', async () => {
    dbMocks.isDbAvailable.mockReturnValue(true)

    await reloadConfig('invalid site key')

    expect(dbMocks.getStaffSite).toHaveBeenCalledWith(DEFAULT_SITE_KEY)
  })

  it('resolves admin and service-account checks with site-aware config', async () => {
    dbMocks.isDbAvailable.mockReturnValue(true)
    dbMocks.getStaffSite.mockResolvedValue({
      key: 'temppeli-sra',
      organizationName: 'Temppeli SRA',
      organizationRange: 'Temppeli',
      timezone: 'Europe/Helsinki',
      config: {
        adminAllowlist: ['Admin@Test.com'],
        serviceAccounts: ['service@test.com'],
      },
    })

    expect(await isAdminEmail('admin@test.com', 'temppeli-sra')).toBe(true)
    expect(await isAdminEmail('other@test.com', 'temppeli-sra')).toBe(false)
    expect(await isServiceAccount('SERVICE@test.com', 'temppeli-sra')).toBe(true)
    expect(await isServiceAccount('person@test.com', 'temppeli-sra')).toBe(false)
  })
})
