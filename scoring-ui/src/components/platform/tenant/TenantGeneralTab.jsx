// ============================================================
// TenantGeneralTab — Name, subscription status, trial info
// ============================================================

import { useState } from 'react'
import { SectionCard, StatusMessage, formatDate, daysUntil } from './shared.jsx'
import { usePlatformT } from '../../../platform-i18n.jsx'

export function TenantGeneralTab({ tenant, onSave }) {
  const { t } = usePlatformT()
  const [name, setName] = useState(tenant.name || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)
  const hasChanges = name.trim() !== tenant.name

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      await onSave({ name: name.trim() })
      setStatus({ type: 'success', message: t('tenantNameUpdated') })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const sub = tenant.subscription || {}
  const isTrial = sub.status === 'trial'
  const trialDays = isTrial ? daysUntil(sub.trialEndsAt) : null

  return (
    <SectionCard title={t('tenantGeneralTitle')} description={t('tenantGeneralDesc')}>
      <StatusMessage {...(status || {})} />
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            {t('tenantOrgNameLabel')}
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
          />
        </div>

        {/* Subscription info (read-only) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t('tenantSubscriptionLabel')}
            </label>
            <div className="text-sm text-gray-800">
              {sub.plan === 'free_trial' ? t('tenantFreeTrial') : sub.plan || '—'}
              {isTrial && trialDays !== null && (
                <span className="ml-2 text-amber-600 text-xs">
                  {t('tenantDaysLeft', trialDays)}
                </span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t('tenantCreatedLabel')}
            </label>
            <div className="text-sm text-gray-800">{formatDate(tenant.createdAt)}</div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !hasChanges || name.trim().length < 2}
            className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </SectionCard>
  )
}
