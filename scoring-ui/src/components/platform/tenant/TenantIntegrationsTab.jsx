// ============================================================
// TenantIntegrationsTab — Dynamic integration settings (INT-1 Phase 4)
//
// Renders credential forms dynamically from credentialSchema
// fetched from GET /api/v1/platform/integration-types.
// Replaces hardcoded TenantSsiTab + TenantCalendarTab with a
// schema-driven approach — no frontend changes needed per integration.
// ============================================================

import { useState, useEffect } from 'react'
import { getIntegrationTypesApi, updateTenant } from '../../../platform-api.js'
import { SectionCard, StatusMessage } from './shared.jsx'
import { usePlatformT } from '../../../platform-i18n.jsx'

/**
 * Renders a single integration section (event system or calendar system).
 */
function IntegrationSection({ tenantId, category, categoryLabel, types, currentConfig, onSaved }) {
  const { t, lang } = usePlatformT()
  const [selectedType, setSelectedType] = useState(currentConfig?.type || 'none')
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  // Find the selected type's schema
  const typeConfig = types.find(t => t.type === selectedType)
  const schema = typeConfig?.credentialSchema || []

  // Initialize form from current config credentials
  useEffect(() => {
    const creds = currentConfig?.credentials || {}
    const initial = {}
    for (const field of schema) {
      // Write-only fields (passwords) are always empty — backend never returns them
      initial[field.key] = field.writeOnly ? '' : (creds[field.key] || '')
    }
    setForm(initial)
    setStatus(null)
  }, [selectedType, currentConfig?.type])

  function handleFieldChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      // Build credentials object — only include non-empty write-only fields
      const credentials = {}
      for (const field of schema) {
        const val = form[field.key]?.trim()
        if (field.writeOnly) {
          if (val) credentials[field.key] = val // only include if user entered a value
        } else {
          credentials[field.key] = val || null
        }
      }

      const slot = category === 'event_system' ? 'eventSystem' : 'calendarSystem'
      const integrations = {
        [slot]: selectedType === 'none' ? null : { type: selectedType, credentials },
      }

      await updateTenant(tenantId, { integrations })
      setStatus({ type: 'success', message: t('save') + ' ✓' })

      // Clear write-only fields after save
      const cleared = { ...form }
      for (const field of schema) {
        if (field.writeOnly) cleared[field.key] = ''
      }
      setForm(cleared)

      if (onSaved) onSaved()
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
      const slot = category === 'event_system' ? 'eventSystem' : 'calendarSystem'
      await updateTenant(tenantId, { integrations: { [slot]: null } })
      setSelectedType('none')
      setForm({})
      setStatus({ type: 'success', message: t('save') + ' ✓' })
      if (onSaved) onSaved()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const isConfigured = selectedType !== 'none' && currentConfig?.type === selectedType

  return (
    <SectionCard title={categoryLabel} description={typeConfig?.description || ''}>
      <StatusMessage {...(status || {})} />

      {/* Type selector */}
      <div className="mb-4">
        <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
          {t('select')}
        </label>
        <select
          value={selectedType}
          onChange={e => { setSelectedType(e.target.value); setStatus(null) }}
          className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none bg-white"
        >
          {types.map(t => (
            <option key={t.type} value={t.type}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Dynamic credential form */}
      {schema.length > 0 && (
        <form onSubmit={handleSave} className="space-y-4">
          {/* Status indicator */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
            isConfigured ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-gray-400'}`} />
            {isConfigured ? t('ssiConfigured') : t('ssiNotConfigured')}
          </div>

          {schema.map(field => (
            <div key={field.key}>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                {lang === 'fi' && field.labelFi ? field.labelFi : field.label}
                {field.writeOnly && isConfigured && (
                  <span className="normal-case text-green-600 font-normal ml-1">{t('ssiPasswordSaved')}</span>
                )}
              </label>
              <input
                type={field.type === 'password' ? 'password' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
                value={form[field.key] || ''}
                onChange={e => handleFieldChange(field.key, e.target.value)}
                placeholder={field.writeOnly && isConfigured ? t('ssiPasswordKeep') : (field.hint || '')}
                required={field.required && !isConfigured}
                autoComplete={field.writeOnly ? 'new-password' : 'off'}
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
              />
              {field.hint && !field.writeOnly && (
                <p className="text-xs text-gray-400 mt-1">{field.hint}</p>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            {isConfigured && (
              <button type="button" onClick={handleClear} disabled={saving}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50">
                {t('ssiClearCreds')}
              </button>
            )}
            <div className={isConfigured ? '' : 'ml-auto'}>
              <button type="submit" disabled={saving}
                className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </form>
      )}
    </SectionCard>
  )
}

/**
 * TenantIntegrationsTab — renders both event system and calendar system
 * integration settings with dynamic forms from credential schemas.
 */
export function TenantIntegrationsTab({ tenantId, tenant, onTenantUpdated }) {
  const { t } = usePlatformT()
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await getIntegrationTypesApi()
        setTypes(data.types || [])
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="text-sm text-gray-400 p-4">{t('loading')}</div>
  }

  const eventTypes = types.filter(t => t.category === 'event_system')
  const calendarTypes = types.filter(t => t.category === 'calendar_system')

  return (
    <div className="space-y-0">
      <IntegrationSection
        tenantId={tenantId}
        category="event_system"
        categoryLabel={t('ssiTitle')}
        types={eventTypes}
        currentConfig={tenant?.integrations?.eventSystem}
        onSaved={onTenantUpdated}
      />
      <IntegrationSection
        tenantId={tenantId}
        category="calendar_system"
        categoryLabel={t('calTitle')}
        types={calendarTypes}
        currentConfig={tenant?.integrations?.calendarSystem}
        onSaved={onTenantUpdated}
      />
    </div>
  )
}
