// ============================================================
// TenantCalendarTab — WordPress / Tapahtumakalenteri calendar config
//
// Manages calendarConfig JSONB on the tenant:
//   - WordPress base URL, username, password
//   - Gmail OTP automation (address, app password, sender/subject filters)
//   - Adapter type (currently only 'wordpress')
//
// Password fields are write-only — backend never returns actual values.
// ============================================================

import { useState, useEffect } from 'react'
import { SectionCard, StatusMessage } from './shared.jsx'

export function TenantCalendarTab({ tenant, onSave }) {
  const cfg = tenant.calendarConfig || {}

  // Form state — passwords are always empty (write-only)
  const [form, setForm] = useState({
    wpBaseUrl: cfg.wpBaseUrl || '',
    wpUsername: cfg.wpUsername || '',
    wpPassword: '',
    gmailAddress: cfg.gmailAddress || '',
    gmailAppPassword: '',
    gmailSenderFilter: cfg.gmailSenderFilter || '',
    gmailSubjectFilter: cfg.gmailSubjectFilter || '',
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  // Reset form when tenant changes
  useEffect(() => {
    const c = tenant.calendarConfig || {}
    setForm({
      wpBaseUrl: c.wpBaseUrl || '',
      wpUsername: c.wpUsername || '',
      wpPassword: '',
      gmailAddress: c.gmailAddress || '',
      gmailAppPassword: '',
      gmailSenderFilter: c.gmailSenderFilter || '',
      gmailSubjectFilter: c.gmailSubjectFilter || '',
    })
  }, [tenant.id, tenant.calendarConfig])

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const isConfigured = cfg.wpBaseUrl && cfg.wpUsername && cfg.hasWpPassword
  const hasChanges = form.wpBaseUrl !== (cfg.wpBaseUrl || '') ||
    form.wpUsername !== (cfg.wpUsername || '') ||
    form.wpPassword ||
    form.gmailAddress !== (cfg.gmailAddress || '') ||
    form.gmailAppPassword ||
    form.gmailSenderFilter !== (cfg.gmailSenderFilter || '') ||
    form.gmailSubjectFilter !== (cfg.gmailSubjectFilter || '')

  async function handleSave(e) {
    e.preventDefault()
    if (!form.wpBaseUrl.trim() || !form.wpUsername.trim()) {
      setStatus({ type: 'error', message: 'WordPress URL and username are required' })
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      // Build config — only include password fields if they have values
      const value = {
        adapter: 'wordpress',
        wpBaseUrl: form.wpBaseUrl.trim().replace(/\/wp-admin\/?.*$/i, '').replace(/\/+$/, ''), // strip /wp-admin and trailing slashes
        wpUsername: form.wpUsername.trim(),
        gmailAddress: form.gmailAddress.trim(),
        gmailSenderFilter: form.gmailSenderFilter.trim(),
        gmailSubjectFilter: form.gmailSubjectFilter.trim(),
      }
      if (form.wpPassword) value.wpPassword = form.wpPassword
      if (form.gmailAppPassword) value.gmailAppPassword = form.gmailAppPassword

      await onSave({ calendarConfig: value })
      setForm(prev => ({ ...prev, wpPassword: '', gmailAppPassword: '' }))
      setStatus({ type: 'success', message: 'Calendar configuration saved' })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    setStatus(null)
    try {
      await onSave({ calendarConfig: null })
      setForm({
        wpBaseUrl: '', wpUsername: '', wpPassword: '',
        gmailAddress: '', gmailAppPassword: '',
        gmailSenderFilter: '', gmailSubjectFilter: '',
      })
      setStatus({ type: 'success', message: 'Calendar configuration cleared' })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-0">
      <SectionCard
        title="Calendar Integration"
        description="WordPress / Tapahtumakalenteri settings for automatic event publishing to your club calendar."
      >
        <StatusMessage {...(status || {})} />

        {/* Connection status indicator */}
        <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-md text-sm ${
          isConfigured ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-gray-400'}`} />
          {isConfigured ? 'WordPress configured' : 'Not configured'}
          {isConfigured && cfg.gmailAddress && <span className="text-green-600 text-xs ml-1">(+ Gmail OTP)</span>}
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* WordPress credentials section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 border-b pb-1">WordPress Admin</h3>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                WordPress URL
              </label>
              <input
                type="url" name="wpBaseUrl" value={form.wpBaseUrl} onChange={handleChange}
                placeholder="https://your-site.fi"
                autoComplete="off"
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Base URL of your WordPress site (no trailing slash)</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                WordPress Username
              </label>
              <input
                type="text" name="wpUsername" value={form.wpUsername} onChange={handleChange}
                placeholder="admin"
                autoComplete="off"
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                WordPress Password {cfg.hasWpPassword && <span className="normal-case text-green-600 font-normal">(saved)</span>}
              </label>
              <input
                type="password" name="wpPassword" value={form.wpPassword} onChange={handleChange}
                placeholder={cfg.hasWpPassword ? 'Leave blank to keep current password' : 'WordPress admin password'}
                autoComplete="new-password"
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
            </div>
          </div>

          {/* Gmail OTP section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 border-b pb-1">
              Gmail OTP Automation
              <span className="font-normal text-gray-400 text-xs ml-2">— for WordPress email-based 2FA</span>
            </h3>
            <p className="text-xs text-gray-500">
              If your WordPress uses Two-Factor email verification, configure Gmail access here so the system can automatically fetch the OTP code. Requires a Gmail App Password (not your Google account password).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                  Gmail Address
                </label>
                <input
                  type="email" name="gmailAddress" value={form.gmailAddress} onChange={handleChange}
                  placeholder="your-account@gmail.com"
                  autoComplete="off"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                  Gmail App Password {cfg.hasGmailAppPassword && <span className="normal-case text-green-600 font-normal">(saved)</span>}
                </label>
                <input
                  type="password" name="gmailAppPassword" value={form.gmailAppPassword} onChange={handleChange}
                  placeholder={cfg.hasGmailAppPassword ? 'Leave blank to keep current' : 'xxxx xxxx xxxx xxxx'}
                  autoComplete="new-password"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                  Sender Filter
                </label>
                <input
                  type="text" name="gmailSenderFilter" value={form.gmailSenderFilter} onChange={handleChange}
                  placeholder="wordpress@your-site.fi"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Email "From" to look for in Gmail</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                  Subject Filter
                </label>
                <input
                  type="text" name="gmailSubjectFilter" value={form.gmailSubjectFilter} onChange={handleChange}
                  placeholder="Login Confirmation"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Email subject to look for</p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            {isConfigured && (
              <button
                type="button" onClick={handleClear} disabled={saving}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                Clear configuration
              </button>
            )}
            <div className={isConfigured ? '' : 'ml-auto'}>
              <button
                type="submit"
                disabled={saving || !hasChanges}
                className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </form>
      </SectionCard>
    </div>
  )
}
