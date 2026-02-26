// ============================================================
// TenantDetailPage — Tenant settings and configuration
//
// Sections:
//   1. General — name, subscription status, trial info
//   2. SSI Credentials — email, password, API key (encrypted)
//   3. Calendar Config — WordPress URL, auth (placeholder)
//
// SSI credentials are masked by default and revealed on demand.
// All saves go through PATCH /api/v1/platform/tenants/:id.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { getTenantDetails, updateTenant, listDisciplines, createDisciplineApi, updateDisciplineApi, deleteDisciplineApi, listTemplates, createTemplateApi, updateTemplateApi, deleteTemplateApi, importTemplateSeed } from '../../platform-api.js'

// ---- Helpers ----

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('fi-FI', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function daysUntil(ts) {
  if (!ts) return null
  const diff = ts - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

// ---- Sub-components ----

function SectionCard({ title, description, children }) {
  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{title}</h2>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {children}
    </div>
  )
}

function StatusMessage({ type, message }) {
  if (!message) return null
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-700',
    error: 'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={`border rounded-lg px-4 py-2.5 text-sm mb-4 ${styles[type] || styles.error}`}>
      {message}
    </div>
  )
}

// ---- General Section ----

function GeneralSection({ tenant, onSave }) {
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
      setStatus({ type: 'success', message: 'Name updated' })
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
    <SectionCard title="General" description="Basic tenant information and subscription status.">
      <StatusMessage {...(status || {})} />
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
            Organization Name
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
              Subscription
            </label>
            <div className="text-sm text-gray-800">
              {sub.plan === 'free_trial' ? 'Free Trial' : sub.plan || '—'}
              {isTrial && trialDays !== null && (
                <span className="ml-2 text-amber-600 text-xs">
                  ({trialDays} day{trialDays !== 1 ? 's' : ''} left)
                </span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
              Created
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
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </SectionCard>
  )
}

// ---- SSI Credentials Section ----

function SSICredentialsSection({ tenant, onSave }) {
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

// ---- Disciplines Section ----

function DisciplinesSection({ tenantId }) {
  const [disciplines, setDisciplines] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', labelFi: '', labelEn: '', ssiGroupId: '', ssiOrganizerId: '' })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  // Load disciplines on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await listDisciplines(tenantId)
        setDisciplines(data.disciplines || [])
      } catch { /* ignore load errors */ }
      setLoading(false)
    }
    load()
  }, [tenantId])

  function resetForm() {
    setForm({ name: '', labelFi: '', labelEn: '', ssiGroupId: '', ssiOrganizerId: '' })
    setShowForm(false)
    setEditingId(null)
    setStatus(null)
  }

  function startEdit(dis) {
    setForm({
      name: dis.name,
      labelFi: dis.labelFi || '',
      labelEn: dis.labelEn || '',
      ssiGroupId: dis.ssiGroupId || '',
      ssiOrganizerId: dis.ssiOrganizerId || '',
    })
    setEditingId(dis.id)
    setShowForm(true)
    setStatus(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      const payload = {
        name: form.name.trim(),
        labelFi: form.labelFi.trim(),
        labelEn: form.labelEn.trim(),
        ssiGroupId: form.ssiGroupId.trim() || null,
        ssiOrganizerId: form.ssiOrganizerId.trim() || null,
      }

      if (editingId) {
        const data = await updateDisciplineApi(tenantId, editingId, payload)
        setDisciplines(prev => prev.map(d => d.id === editingId ? data.discipline : d))
      } else {
        const data = await createDisciplineApi(tenantId, payload)
        setDisciplines(prev => [...prev, data.discipline])
      }
      resetForm()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(disId) {
    if (!confirm('Delete this discipline? This cannot be undone.')) return
    try {
      await deleteDisciplineApi(tenantId, disId)
      setDisciplines(prev => prev.filter(d => d.id !== disId))
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    }
  }

  return (
    <SectionCard
      title="Disciplines"
      description="Competition types this organization runs. Each discipline can have templates and scheduled events."
    >
      {loading ? (
        <div className="text-sm text-gray-400">Loading disciplines...</div>
      ) : (
        <>
          {/* Discipline list */}
          {disciplines.length === 0 && !showForm && (
            <div className="text-sm text-gray-400 mb-4">No disciplines defined yet.</div>
          )}
          {disciplines.length > 0 && (
            <div className="space-y-2 mb-4">
              {disciplines.map(dis => (
                <div key={dis.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div>
                    <div className="font-medium text-sm text-gray-900">
                      {dis.labelFi || dis.name}
                      {dis.labelEn && dis.labelFi && (
                        <span className="text-gray-400 ml-1">/ {dis.labelEn}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {dis.name}
                      {dis.ssiGroupId && <span> · SSI Group: {dis.ssiGroupId}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(dis)}
                      className="text-xs text-sky-600 hover:text-sky-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(dis.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit form */}
          {showForm ? (
            <form onSubmit={handleSave} className="border rounded-lg p-4 space-y-3 bg-gray-50">
              <StatusMessage {...(status || {})} />
              <div className="text-sm font-semibold text-gray-700 mb-2">
                {editingId ? 'Edit Discipline' : 'New Discipline'}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Internal Name</label>
                  <input
                    type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required minLength={2} placeholder="e.g. kupittaa_cup"
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Label (Finnish)</label>
                  <input
                    type="text" value={form.labelFi} onChange={e => setForm(f => ({ ...f, labelFi: e.target.value }))}
                    placeholder="e.g. Kupittaa Cup"
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Label (English)</label>
                  <input
                    type="text" value={form.labelEn} onChange={e => setForm(f => ({ ...f, labelEn: e.target.value }))}
                    placeholder="e.g. Kupittaa Cup"
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">SSI Group ID</label>
                  <input
                    type="text" value={form.ssiGroupId} onChange={e => setForm(f => ({ ...f, ssiGroupId: e.target.value }))}
                    placeholder="Optional"
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">SSI Organizer ID</label>
                <input
                  type="text" value={form.ssiOrganizerId} onChange={e => setForm(f => ({ ...f, ssiOrganizerId: e.target.value }))}
                  placeholder="Optional"
                  className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
                <button
                  type="submit" disabled={saving || form.name.trim().length < 2}
                  className="bg-sky-600 text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => { resetForm(); setShowForm(true) }}
              className="text-sm text-sky-600 hover:text-sky-800 font-medium"
            >
              + Add Discipline
            </button>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ---- Templates Section ----

// Parse SSI event URL → { eventType, eventId, url } or null
// Supports: https://shootnscoreit.com/event/{type}/{id}/
const SSI_EVENT_URL_RE = /shootnscoreit\.com\/event\/(\d+)\/(\d+)/
function parseSsiEventUrl(input) {
  if (!input) return null
  const m = input.match(SSI_EVENT_URL_RE)
  if (!m) return null
  return { eventType: m[1], eventId: m[2] }
}

function TemplatesSection({ tenantId, onEditTemplate }) {
  const [templates, setTemplates] = useState([])
  const [disciplines, setDisciplines] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', disciplineId: '', ssiSeedEventUrl: '' })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [importing, setImporting] = useState(null) // template ID being imported

  // Load templates and disciplines on mount
  useEffect(() => {
    async function load() {
      try {
        const [tplData, disData] = await Promise.all([
          listTemplates(tenantId),
          listDisciplines(tenantId),
        ])
        setTemplates(tplData.templates || [])
        setDisciplines(disData.disciplines || [])
      } catch { /* ignore load errors */ }
      setLoading(false)
    }
    load()
  }, [tenantId])

  function resetForm() {
    setForm({ name: '', disciplineId: '', ssiSeedEventUrl: '' })
    setShowForm(false)
    setEditingId(null)
    setStatus(null)
  }

  function startEdit(tpl) {
    setForm({
      name: tpl.name,
      disciplineId: tpl.disciplineId,
      ssiSeedEventUrl: tpl.ssiSeedEventId || '',
    })
    setEditingId(tpl.id)
    setShowForm(true)
    setStatus(null)
  }

  function startNew() {
    resetForm()
    // Pre-select first discipline if only one exists
    if (disciplines.length === 1) {
      setForm(f => ({ ...f, disciplineId: disciplines[0].id }))
    }
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      const url = form.ssiSeedEventUrl.trim()
      if (!url || !parseSsiEventUrl(url)) {
        setStatus({ type: 'error', message: 'Valid SSI event URL is required (e.g. https://shootnscoreit.com/event/136/160/)' })
        setSaving(false)
        return
      }
      const payload = {
        name: form.name.trim(),
        disciplineId: form.disciplineId,
        ssiSeedEventId: url,
      }

      if (editingId) {
        // Only send updatable fields (not disciplineId — immutable after creation)
        const { disciplineId: _, ...updates } = payload
        const data = await updateTemplateApi(tenantId, editingId, updates)
        setTemplates(prev => prev.map(t => t.id === editingId ? data.template : t))
      } else {
        const data = await createTemplateApi(tenantId, payload)
        setTemplates(prev => [...prev, data.template])
      }
      resetForm()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(tplId) {
    if (!confirm('Delete this template? This cannot be undone.')) return
    try {
      await deleteTemplateApi(tenantId, tplId)
      setTemplates(prev => prev.filter(t => t.id !== tplId))
      if (expandedId === tplId) setExpandedId(null)
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    }
  }

  async function handleImportSeed(tplId) {
    setImporting(tplId)
    setStatus(null)
    try {
      const data = await importTemplateSeed(tenantId, tplId)
      setTemplates(prev => prev.map(t => t.id === tplId ? data.template : t))
      setStatus({ type: 'success', message: `Imported: "${data.snapshot.name}" — ${data.snapshot.isCup ? data.snapshot.matchCount + ' matches' : 'single match'}` })
      setExpandedId(tplId)
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setImporting(null)
    }
  }

  // Map disciplineId → discipline label for display
  const disMap = Object.fromEntries(disciplines.map(d => [d.id, d.labelFi || d.name]))

  return (
    <SectionCard
      title="Match Templates"
      description="Event blueprints for each discipline. Templates define how matches are created in SSI."
    >
      {loading ? (
        <div className="text-sm text-gray-400">Loading templates...</div>
      ) : disciplines.length === 0 ? (
        <div className="text-sm text-gray-400">Add a discipline first before creating templates.</div>
      ) : (
        <>
          {/* Template list */}
          {templates.length === 0 && !showForm && (
            <div className="text-sm text-gray-400 mb-4">No templates defined yet.</div>
          )}
          {templates.length > 0 && (
            <div className="space-y-2 mb-4">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
                    >
                      <div className="font-medium text-sm text-gray-900">
                        {tpl.name}
                        <span className="text-gray-400 text-xs ml-2">
                          ({disMap[tpl.disciplineId] || tpl.disciplineId})
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {tpl.ssiSeedEventId
                          ? <a href={tpl.ssiSeedEventId.startsWith('http') ? tpl.ssiSeedEventId : `https://shootnscoreit.com/event/${tpl.ssiSeedEventId}/`} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline" onClick={e => e.stopPropagation()}>SSI Seed Event</a>
                          : 'No SSI seed linked'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tpl.ssiSeedSnapshot && onEditTemplate && (
                        <button onClick={() => onEditTemplate(tpl.id)} className="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 px-2 py-0.5 rounded font-medium">Open Editor</button>
                      )}
                      <button onClick={() => startEdit(tpl)} className="text-xs text-sky-600 hover:text-sky-800">Edit</button>
                      <button onClick={() => handleDelete(tpl.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    </div>
                  </div>
                  {/* Expanded detail */}
                  {expandedId === tpl.id && (
                    <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500 space-y-3">
                      {/* Seed snapshot */}
                      {tpl.ssiSeedSnapshot ? (
                        <div className="bg-white rounded-md border p-3 space-y-2">
                          <div className="font-semibold text-gray-700 text-sm">
                            {tpl.ssiSeedSnapshot.name}
                            <span className="ml-2 text-xs font-normal text-gray-400">
                              {tpl.ssiSeedSnapshot.isCup ? `Cup • ${tpl.ssiSeedSnapshot.matchCount} matches` : 'Single match'}
                            </span>
                          </div>
                          {tpl.ssiSeedSnapshot.description && (
                            <div className="text-gray-500">{tpl.ssiSeedSnapshot.description}</div>
                          )}
                          {tpl.ssiSeedSnapshot.matches && tpl.ssiSeedSnapshot.matches.length > 0 && (
                            <div className="space-y-1">
                              <div className="font-medium text-gray-600">Component Matches:</div>
                              {tpl.ssiSeedSnapshot.matches.map((m, i) => (
                                <div key={i} className="pl-3 border-l-2 border-sky-200">
                                  <span className="font-medium text-gray-700">{m.name}</span>
                                  <span className="text-gray-400 ml-2">
                                    {m.squads?.length || 0} squads
                                    {m.squads?.map(s => ` • ${s.name} (max ${s.maxCompetitors})`).join('')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {tpl.ssiSeedSnapshot.squads && tpl.ssiSeedSnapshot.squads.length > 0 && !tpl.ssiSeedSnapshot.isCup && (
                            <div className="space-y-1">
                              <div className="font-medium text-gray-600">Squads:</div>
                              {tpl.ssiSeedSnapshot.squads.map((s, i) => (
                                <div key={i} className="pl-3 text-gray-500">{s.name} (max {s.maxCompetitors})</div>
                              ))}
                            </div>
                          )}
                          <div className="text-gray-400 text-[10px]">
                            Imported: {formatDate(new Date(tpl.ssiSeedSnapshot.importedAt).getTime())}
                            {' • '}
                            <button onClick={() => handleImportSeed(tpl.id)} disabled={importing === tpl.id} className="text-sky-500 hover:underline disabled:opacity-50">
                              {importing === tpl.id ? 'Re-importing...' : 'Re-import from SSI'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-50 rounded-md border border-amber-200 p-3 flex items-center justify-between">
                          <div className="text-amber-700 text-xs">
                            Seed event structure not yet imported from SSI.
                          </div>
                          <button
                            onClick={() => handleImportSeed(tpl.id)}
                            disabled={importing === tpl.id}
                            className="bg-sky-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
                          >
                            {importing === tpl.id ? 'Importing...' : 'Import from SSI'}
                          </button>
                        </div>
                      )}

                      {/* Config sections */}
                      <div><span className="font-medium">Overrides:</span> {Object.keys(tpl.overrides || {}).length > 0 ? JSON.stringify(tpl.overrides) : 'None'}</div>
                      <div><span className="font-medium">Calendar:</span> {Object.keys(tpl.calendarTemplate || {}).length > 0 ? JSON.stringify(tpl.calendarTemplate) : 'Not configured'}</div>
                      <div><span className="font-medium">Staffing:</span> {Object.keys(tpl.staffingRules || {}).length > 0 ? JSON.stringify(tpl.staffingRules) : 'Not configured'}</div>
                      <div className="text-gray-400">Created: {formatDate(tpl.createdAt)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit form */}
          {showForm ? (
            <form onSubmit={handleSave} className="border rounded-lg p-4 space-y-3 bg-gray-50">
              <StatusMessage {...(status || {})} />
              <div className="text-sm font-semibold text-gray-700 mb-2">
                {editingId ? 'Edit Template' : 'New Template'}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Template Name</label>
                  <input
                    type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required minLength={2} placeholder="e.g. Kupittaa Cup Standard"
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Discipline</label>
                  <select
                    value={form.disciplineId}
                    onChange={e => setForm(f => ({ ...f, disciplineId: e.target.value }))}
                    required disabled={!!editingId}
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none disabled:bg-gray-100"
                  >
                    <option value="">Select discipline...</option>
                    {disciplines.map(d => (
                      <option key={d.id} value={d.id}>{d.labelFi || d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">SSI Event URL *</label>
                <input
                  type="url" value={form.ssiSeedEventUrl} onChange={e => setForm(f => ({ ...f, ssiSeedEventUrl: e.target.value }))}
                  required
                  placeholder="https://shootnscoreit.com/event/136/160/"
                  className={`w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none ${
                    form.ssiSeedEventUrl && !parseSsiEventUrl(form.ssiSeedEventUrl) ? 'border-red-300' : ''
                  }`}
                />
                {form.ssiSeedEventUrl && parseSsiEventUrl(form.ssiSeedEventUrl) && (
                  <p className="text-xs text-green-600 mt-1">
                    Event type: {parseSsiEventUrl(form.ssiSeedEventUrl).eventType}, Event ID: {parseSsiEventUrl(form.ssiSeedEventUrl).eventId}
                  </p>
                )}
                {form.ssiSeedEventUrl && !parseSsiEventUrl(form.ssiSeedEventUrl) && (
                  <p className="text-xs text-red-500 mt-1">
                    URL must be a ShootNScoreIt event link (e.g. https://shootnscoreit.com/event/136/160/)
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Open the seed event in SSI and paste its URL here. The event structure will be used as a blueprint.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                <button
                  type="submit" disabled={saving || form.name.trim().length < 2 || !form.disciplineId || !parseSsiEventUrl(form.ssiSeedEventUrl)}
                  className="bg-sky-600 text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          ) : (
            <button onClick={startNew} className="text-sm text-sky-600 hover:text-sky-800 font-medium">
              + Add Template
            </button>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ---- Calendar Config Section ----

function CalendarConfigSection({ tenant }) {
  return (
    <SectionCard
      title="Calendar Integration"
      description="WordPress / Tapahtumakalenteri settings for publishing events to your club calendar."
    >
      <div className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300 text-center">
        <p className="text-sm text-gray-400">
          Calendar integration configuration is coming in a future update.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          This will allow automatic publishing of match events to your club's WordPress calendar.
        </p>
      </div>
    </SectionCard>
  )
}

// ---- Main Page ----

export default function TenantDetailPage({ tenantId, account, onBack, onLogout, onEditTemplate }) {
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
