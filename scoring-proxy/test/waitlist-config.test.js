import { describe, it, expect, beforeEach } from 'vitest'

describe('wait list config loader', () => {
  beforeEach(async () => {
    delete process.env.KUPITTAA_INDUCTION_WAITLIST_CONFIG_PATH
    const mod = await import('../lib/waitlist/config-loader.js')
    mod.reloadConfig()
  })

  it('loads the default threshold from config', async () => {
    const mod = await import('../lib/waitlist/config-loader.js')
    expect(mod.getInductionThreshold()).toBe(5)
  })

  it('matches allowlist entries case-insensitively', async () => {
    const mod = await import('../lib/waitlist/config-loader.js')
    const cfg = mod.loadConfig()
    cfg.adminAllowlist.push('Admin@Example.com')

    expect(mod.isAdminEmail('admin@example.com')).toBe(true)
    expect(mod.isAdminEmail('ADMIN@EXAMPLE.COM')).toBe(true)
    expect(mod.isAdminEmail('other@example.com')).toBe(false)
  })

  it('requires both Finnish and English support in config', async () => {
    const mod = await import('../lib/waitlist/config-loader.js')
    expect(mod.getSupportedLanguages()).toEqual(['fi', 'en'])
  })

  it('loads the wait list SSI validation group from config', async () => {
    const mod = await import('../lib/waitlist/config-loader.js')
    expect(mod.getValidationGroupId()).toBe('26740')
  })

  it('rejects invalid config objects', async () => {
    const mod = await import('../lib/waitlist/config-loader.js')

    expect(() => mod.validateConfig({
      adminAllowlist: 'not-an-array',
      induction: { threshold: 0 },
      routes: {},
      notifications: { supportedLanguages: [] },
    })).toThrow(/Wait list config validation failed/)
  })
})