// ============================================================
// TenantDetailPage — Tenant settings and configuration
//
// Sections are split into individual files under ./tenant/:
//   GeneralSection, SSICredentialsSection, DisciplinesSection,
//   TemplatesSection, CalendarConfigSection
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { getTenantDetails, updateTenant } from '../../platform-api.js'
import {
  GeneralSection,
  SSICredentialsSection,
  DisciplinesSection,
  TemplatesSection,
  CalendarConfigSection,
} from './tenant/index.js'

export default function TenantDetailPage({ tenantId, account, onBack, onLogout, onEditTemplate, onSchedule }) {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Load tenant details on mount
  useEffect(() => {
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const data = await getTenantDetails(tenantId)
        setTenant(data.tenant)
      } catch (err) {
        setLoadError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tenantId])

  // Save handler — updates tenant and refreshes local state
  const handleSave = useCallback(async (updates) => {
    const data = await updateTenant(tenantId, updates)
    setTenant(data.tenant)
  }, [tenantId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading tenant...</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-sm mb-4">{loadError}</div>
          <button onClick={onBack} className="text-sky-600 text-sm hover:underline">
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Back to dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-lg font-bold text-sky-700">Match Management</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 text-sm font-semibold">
                {account?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
              </div>
              <span className="text-sm text-gray-600 hidden sm:inline">{account?.email}</span>
              <button
                onClick={onLogout}
                className="text-xs text-gray-400 hover:text-gray-600 ml-2"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Tenant header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-sky-100 rounded-lg flex items-center justify-center text-sky-700 text-xl font-bold">
            {tenant.name?.slice(0, 2).toUpperCase() || '??'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
            <p className="text-sm text-gray-500">Tenant settings and integrations</p>
          </div>
          {onSchedule && (
            <button
              onClick={onSchedule}
              className="ml-auto bg-sky-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 transition-colors"
            >
              Schedule Events
            </button>
          )}
        </div>

        {/* Settings sections */}
        <GeneralSection tenant={tenant} onSave={handleSave} />
        <SSICredentialsSection tenant={tenant} onSave={handleSave} />
        <DisciplinesSection tenantId={tenantId} />
        <TemplatesSection tenantId={tenantId} onEditTemplate={onEditTemplate} />
        <CalendarConfigSection tenant={tenant} />
      </div>
    </div>
  )
}
