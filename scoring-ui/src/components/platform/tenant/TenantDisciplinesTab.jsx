// ============================================================
// TenantDisciplinesTab — Competition types this organization runs
// ============================================================

import { useState, useEffect } from 'react'
import { listDisciplines, createDisciplineApi, updateDisciplineApi, deleteDisciplineApi, getSsiDisciplineRegistry } from '../../../platform-api.js'
import { SectionCard, StatusMessage } from './shared.jsx'

export function TenantDisciplinesTab({ tenantId }) {
  const [disciplines, setDisciplines] = useState([])
  const [registry, setRegistry] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', labelFi: '', labelEn: '', ssiGroupId: '', ssiOrganizerId: '', ssiCreateUrl: '' })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)

  // Load disciplines and SSI type registry on mount
  useEffect(() => {
    async function load() {
      try {
        const [disData, regData] = await Promise.all([
          listDisciplines(tenantId),
          getSsiDisciplineRegistry().catch(() => ({ registry: [] })),
        ])
        setDisciplines(disData.disciplines || [])
        setRegistry(regData.registry || [])
      } catch { /* ignore load errors */ }
      setLoading(false)
    }
    load()
  }, [tenantId])

  function resetForm() {
    setForm({ name: '', labelFi: '', labelEn: '', ssiGroupId: '', ssiOrganizerId: '', ssiCreateUrl: '' })
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
      ssiCreateUrl: dis.ssiCreateUrl || '',
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
        ssiCreateUrl: form.ssiCreateUrl.trim() || null,
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
                <div key={dis.id}>
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
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
                        {dis.ssiCreateUrl && <span> · Create URL: {dis.ssiCreateUrl}</span>}
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

                  {/* Inline Edit Form */}
                  {showForm && editingId === dis.id && (
                    <div className="mt-2 border rounded-lg p-4 bg-white shadow-sm">
                      <form onSubmit={handleSave} className="space-y-3">
                        <StatusMessage {...(status || {})} />
                        <div className="text-sm font-semibold text-gray-700 mb-2">Edit Discipline</div>
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
                        <div>
                          <label className="flex items-center gap-2 text-sm text-gray-700 font-medium mt-2">
                            <input
                              type="checkbox"
                              checked={form.ssiLinked}
                              onChange={e => {
                                const checked = e.target.checked
                                setForm(f => ({
                                  ...f,
                                  ssiLinked: checked,
                                  ssiCreateUrl: checked ? '' : f.ssiCreateUrl
                                }))
                              }}
                              className="rounded text-sky-600 focus:ring-sky-500"
                            />
                            SSI-linked discipline
                          </label>
                        </div>

                        {form.ssiLinked ? (
                          <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1 mt-2">SSI Discipline Type</label>
                            <select
                              value={registry.some(r => r.ssiCreateUrl === form.ssiCreateUrl) ? form.ssiCreateUrl : ''}
                              onChange={e => setForm(f => ({ ...f, ssiCreateUrl: e.target.value }))}
                              className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none bg-white"
                            >
                              <option value="">Select type...</option>
                              {registry.filter(r => !r.lastSeenAt).length > 0 && (
                                <optgroup label="Built-in">
                                  {registry.filter(r => !r.lastSeenAt).map(r => (
                                    <option key={r.id} value={r.ssiCreateUrl}>{r.displayName} {r.isCup ? '(Cup)' : '(Match)'}</option>
                                  ))}
                                </optgroup>
                              )}
                              {registry.filter(r => r.lastSeenAt).length > 0 && (
                                <optgroup label="Auto-discovered from SSI">
                                  {registry.filter(r => r.lastSeenAt).map(r => (
                                    <option key={r.id} value={r.ssiCreateUrl}>{r.displayName} {r.isCup ? '(Cup)' : '(Match)'}</option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1 mt-2">SSI Create URL (Manual)</label>
                            <input
                              type="text" value={form.ssiCreateUrl} onChange={e => setForm(f => ({ ...f, ssiCreateUrl: e.target.value }))}
                              placeholder="e.g. /sra/create-match/"
                              className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                            />
                            <p className="text-xs text-gray-400 mt-0.5">SSI form URL for creating events in this discipline</p>
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                          <button
                            type="submit" disabled={saving || form.name.trim().length < 2}
                            className="bg-sky-600 text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {saving ? 'Saving...' : 'Update'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add New form (only shows when creating new, not editing) */}
          {showForm && !editingId ? (
            <form onSubmit={handleSave} className="border rounded-lg p-4 space-y-3 bg-gray-50">
              <StatusMessage {...(status || {})} />
              <div className="text-sm font-semibold text-gray-700 mb-2">New Discipline</div>
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
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700 font-medium mt-2">
                  <input
                    type="checkbox"
                    checked={form.ssiLinked}
                    onChange={e => {
                      const checked = e.target.checked
                      setForm(f => ({
                        ...f,
                        ssiLinked: checked,
                        ssiCreateUrl: checked ? '' : f.ssiCreateUrl
                      }))
                    }}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  SSI-linked discipline
                </label>
              </div>

              {form.ssiLinked ? (
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1 mt-2">SSI Discipline Type</label>
                  <select
                    value={registry.some(r => r.ssiCreateUrl === form.ssiCreateUrl) ? form.ssiCreateUrl : ''}
                    onChange={e => setForm(f => ({ ...f, ssiCreateUrl: e.target.value }))}
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none bg-white"
                  >
                    <option value="">Select type...</option>
                    {registry.filter(r => !r.lastSeenAt).length > 0 && (
                      <optgroup label="Built-in">
                        {registry.filter(r => !r.lastSeenAt).map(r => (
                          <option key={r.id} value={r.ssiCreateUrl}>{r.displayName} {r.isCup ? '(Cup)' : '(Match)'}</option>
                        ))}
                      </optgroup>
                    )}
                    {registry.filter(r => r.lastSeenAt).length > 0 && (
                      <optgroup label="Auto-discovered from SSI">
                        {registry.filter(r => r.lastSeenAt).map(r => (
                          <option key={r.id} value={r.ssiCreateUrl}>{r.displayName} {r.isCup ? '(Cup)' : '(Match)'}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1 mt-2">SSI Create URL (Manual)</label>
                  <input
                    type="text" value={form.ssiCreateUrl} onChange={e => setForm(f => ({ ...f, ssiCreateUrl: e.target.value }))}
                    placeholder="e.g. /sra/create-match/"
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">SSI form URL for creating events in this discipline</p>
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
                <button
                  type="submit" disabled={saving || form.name.trim().length < 2}
                  className="bg-sky-600 text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Create'}
                </button>
              </div>
            </form>
          ) : !showForm && (
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
