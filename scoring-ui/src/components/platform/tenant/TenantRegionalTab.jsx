// ============================================================
// TenantRegionalTab — City, country, timezone, locale settings
//
// These values affect event creation (date formatting, timezone)
// and calendar publishing (location defaults).
// ============================================================

import { useState } from 'react'
import { SectionCard, StatusMessage } from './shared.jsx'
import { usePlatformT } from '../../../platform-i18n.jsx'

export function TenantRegionalTab({ tenant, onSave }) {
  const { t } = usePlatformT()
  const [city, setCity] = useState(tenant.city || '')
  const [country, setCountry] = useState(tenant.country || '')
  const [timezone, setTimezone] = useState(tenant.timezone || '')
  const [locale, setLocale] = useState(tenant.locale || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  const hasChanges =
    city.trim() !== (tenant.city || '') ||
    country.trim() !== (tenant.country || '') ||
    timezone.trim() !== (tenant.timezone || '') ||
    locale.trim() !== (tenant.locale || '')

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      await onSave({
        city: city.trim() || null,
        country: country.trim() || null,
        timezone: timezone.trim() || null,
        locale: locale.trim() || null,
      })
      setStatus({ type: 'success', message: t('regionalSaved') })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard title={t('regionalSettings')} description={t('regionalSettingsDesc')}>
      <StatusMessage {...(status || {})} />
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t('cityLabel')}
            </label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder={t('cityHint')}
              maxLength={100}
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t('countryLabel')}
            </label>
            <input
              type="text"
              value={country}
              onChange={e => setCountry(e.target.value)}
              placeholder={t('countryHint')}
              maxLength={100}
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t('timezoneLabel')}
            </label>
            <input
              type="text"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              placeholder={t('timezoneHint')}
              maxLength={50}
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t('localeLabel')}
            </label>
            <input
              type="text"
              value={locale}
              onChange={e => setLocale(e.target.value)}
              placeholder={t('localeHint')}
              maxLength={10}
              className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !hasChanges}
            className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </SectionCard>
  )
}
