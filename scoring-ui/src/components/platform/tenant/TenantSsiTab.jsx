// ============================================================
// TenantSsiTab — SSI credentials (email, password, API key)
//
// Password and API key values are NEVER returned from the backend
// (write-only fields). Only email comes back as a masked credential.
// ============================================================

import { useState, useEffect } from 'react'
import { SectionCard, StatusMessage } from './shared.jsx'
import { usePlatformT } from '../../../platform-i18n.jsx'

export function TenantSsiTab({ tenant, onSave }) {
  const { t } = usePlatformT()
  const creds = tenant.ssiCredentials || {}
  // Backend returns masked credentials: { email, hasPassword, hasApiKey }
  // Password and API key values are NEVER returned — write-only fields
  const [form, setForm] = useState({
    email: creds.email || '',
    password: '',
    apiKey: '',
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  // Reset form when tenant changes — only email comes from backend
  useEffect(() => {
    const c = tenant.ssiCredentials || {}
    setForm({ email: c.email || '', password: '', apiKey: '' })
  }, [tenant.id, tenant.ssiCredentials])

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const hasCredentials = creds.email && creds.hasPassword
  const hasChanges = form.email !== (creds.email || '') || form.password || form.apiKey

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      // Only send fields that have values — empty password/apiKey means "keep existing"
      const value = { email: form.email.trim() }
      if (form.password) value.password = form.password
      if (form.apiKey) value.apiKey = form.apiKey.trim()

      // If no email and no password, clear everything
      if (!form.email && !form.password) {
        await onSave({ ssiCredentials: null })
        setForm({ email: '', password: '', apiKey: '' })
        setStatus({ type: 'success', message: t('ssiCleared') })
      } else {
        await onSave({ ssiCredentials: value })
        setForm(prev => ({ ...prev, password: '', apiKey: '' })) // Clear write-only fields after save
        setStatus({ type: 'success', message: t('ssiSaved') })
      }
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
      await onSave({ ssiCredentials: null })
      setForm({ email: '', password: '', apiKey: '' })
      setStatus({ type: 'success', message: t('ssiCleared') })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      title={t('ssiTitle')}
      description={t('ssiDesc')}
    >
      <StatusMessage {...(status || {})} />

      {/* Connection status indicator */}
      <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-md text-sm ${
        hasCredentials ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
      }`}>
        <span className={`w-2 h-2 rounded-full ${hasCredentials ? 'bg-green-500' : 'bg-gray-400'}`} />
        {hasCredentials ? t('ssiConfigured') : t('ssiNotConfigured')}
        {hasCredentials && creds.hasApiKey && <span className="text-green-600 text-xs ml-1">(+ API key)</span>}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            {t('ssiEmail')}
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="your-ssi-account@example.com"
            autoComplete="off"
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            {t('ssiPassword')} {creds.hasPassword && <span className="normal-case text-green-600 font-normal">{t('ssiPasswordSaved')}</span>}
          </label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder={creds.hasPassword ? t('ssiPasswordKeep') : t('ssiPasswordNew')}
            autoComplete="new-password"
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            {t('ssiApiKey')} {creds.hasApiKey && <span className="normal-case text-green-600 font-normal">{t('ssiPasswordSaved')}</span>}
          </label>
          <input
            type="password"
            name="apiKey"
            value={form.apiKey}
            onChange={handleChange}
            placeholder={creds.hasApiKey ? t('ssiApiKeyKeep') : t('ssiApiKeyNew')}
            autoComplete="off"
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
          <p className="text-xs text-gray-400 mt-1">
            {t('ssiApiKeyHint')}
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          {hasCredentials && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              {t('ssiClearCreds')}
            </button>
          )}
          <div className={hasCredentials ? '' : 'ml-auto'}>
            <button
              type="submit"
              disabled={saving || !hasChanges}
              className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? t('saving') : t('ssiSaveCreds')}
            </button>
          </div>
        </div>
      </form>
    </SectionCard>
  )
}
