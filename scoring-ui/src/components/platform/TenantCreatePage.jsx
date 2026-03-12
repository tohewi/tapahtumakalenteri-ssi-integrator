// ============================================================
// TenantCreatePage — Wizard for creating a new tenant
//
// Simple single-step form for now. Future phases will add
// SSI credential setup, calendar config, discipline selection.
// ============================================================

import { useState } from 'react'
import { usePlatformT } from '../../platform-i18n.jsx'

export default function TenantCreatePage({ error, onCreateTenant, onCancel }) {
  const { t } = usePlatformT()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError(null)
    setLoading(true)
    try {
      await onCreateTenant({ name })
    } catch (err) {
      setLocalError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const displayError = localError || error

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="text-lg font-bold text-sky-700">{t('appName')}</div>
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t('cancel')}
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('tenantCreateTitle')}</h1>
          <p className="text-gray-500 text-sm">
            {t('tenantCreateDesc')}
          </p>
        </div>

        {displayError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-6">
          {/* Step 1: Basic info */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-sky-600 rounded-full flex items-center justify-center text-white text-xs font-bold">1</div>
              <h3 className="font-semibold">{t('tenantCreateOrgDetails')}</h3>
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                {t('tenantCreateNameLabel')} *
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('tenantCreateNamePlaceholder')}
                required
                minLength={2}
                maxLength={100}
                autoFocus
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                {t('tenantCreateNameHint')}
              </p>
            </div>
          </div>

          {/* Step 2: Coming soon placeholders */}
          <div className="opacity-50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-white text-xs font-bold">2</div>
              <h3 className="font-semibold text-gray-400">{t('tenantCreateSsiCredentials')}</h3>
              <span className="text-xs text-gray-400 italic ml-2">— {t('tenantCreateConfigureLater')}</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300">
              <p className="text-xs text-gray-400">
                SSI email, password, and API key for event management. You can configure these in tenant settings after creation.
              </p>
            </div>
          </div>

          <div className="opacity-50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-white text-xs font-bold">3</div>
              <h3 className="font-semibold text-gray-400">{t('tenantCreateCalendarBackend')}</h3>
              <span className="text-xs text-gray-400 italic ml-2">— {t('tenantCreateConfigureLater')}</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300">
              <p className="text-xs text-gray-400">
                WordPress / Tapahtumakalenteri integration for publishing events to your club calendar.
              </p>
            </div>
          </div>

          {/* Trial info */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sky-600 text-lg">🎉</span>
              <div>
                <div className="text-sm font-medium text-sky-800">{t('tenantCreateTrialTitle')}</div>
                <div className="text-xs text-sky-600">{t('welcomeTrialSubtitle')}</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm border rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="bg-sky-600 text-white px-6 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t('tenantCreateCreating') : t('tenantCreateSubmit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
