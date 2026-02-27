// SSICredentialsSection — ShootNScoreIt account credentials (AES-256-GCM encrypted)

import { useState, useEffect } from 'react'
import { SectionCard, StatusMessage } from './shared.jsx'

export default function SSICredentialsSection({ tenant, onSave }) {
  const creds = tenant.ssiCredentials || {}
  const [form, setForm] = useState({
    email: creds.email || '',
    password: creds.password || '',
    apiKey: creds.apiKey || '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  // Reset form when tenant changes
  useEffect(() => {
    const c = tenant.ssiCredentials || {}
    setForm({ email: c.email || '', password: c.password || '', apiKey: c.apiKey || '' })
  }, [tenant.id, tenant.ssiCredentials])

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const hasCredentials = creds.email && creds.password
  const hasChanges = form.email !== (creds.email || '') ||
    form.password !== (creds.password || '') ||
    form.apiKey !== (creds.apiKey || '')

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      // Send null if all fields are empty (clear credentials)
      const value = form.email || form.password || form.apiKey
        ? { email: form.email.trim(), password: form.password, apiKey: form.apiKey.trim() }
        : null
      await onSave({ ssiCredentials: value })
      setStatus({ type: 'success', message: 'SSI credentials saved (encrypted)' })
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
      setStatus({ type: 'success', message: 'SSI credentials cleared' })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      title="SSI Credentials"
      description="ShootNScoreIt account used for event management. Credentials are encrypted with AES-256-GCM before storage."
    >
      <StatusMessage {...(status || {})} />

      {/* Connection status indicator */}
      <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-md text-sm ${
        hasCredentials ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
      }`}>
        <span className={`w-2 h-2 rounded-full ${hasCredentials ? 'bg-green-500' : 'bg-gray-400'}`} />
        {hasCredentials ? 'Credentials configured' : 'Not configured'}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            SSI Email
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
            SSI Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="SSI account password"
              autoComplete="new-password"
              className="w-full border rounded-md px-3 py-2 pr-16 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            SSI API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              name="apiKey"
              value={form.apiKey}
              onChange={handleChange}
              placeholder="API key (optional)"
              autoComplete="off"
              className="w-full border rounded-md px-3 py-2 pr-16 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1"
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Found in SSI under My Account &rarr; API Keys.
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
              Clear credentials
            </button>
          )}
          <div className={hasCredentials ? '' : 'ml-auto'}>
            <button
              type="submit"
              disabled={saving || !hasChanges || (!form.email && !form.password)}
              className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Credentials'}
            </button>
          </div>
        </div>
      </form>
    </SectionCard>
  )
}
