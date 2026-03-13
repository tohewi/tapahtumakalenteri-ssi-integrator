// ============================================================
// TenantTemplatesTab — Event blueprints for each discipline
// ============================================================

import { useState, useEffect } from 'react'
import { listTemplates, createTemplateApi, updateTemplateApi, deleteTemplateApi, importTemplateSeed, listDisciplines } from '../../../platform-api.js'
import { SectionCard, StatusMessage, formatDate } from './shared.jsx'
import { usePlatformT } from '../../../platform-i18n.jsx'

// Parse SSI event URL → { eventType, eventId } or null
// Supports: https://shootnscoreit.com/event/{type}/{id}/
const SSI_EVENT_URL_RE = /shootnscoreit\.com\/event\/(\d+)\/(\d+)/
function parseSsiEventUrl(input) {
  if (!input) return null
  const m = input.match(SSI_EVENT_URL_RE)
  if (!m) return null
  return { eventType: m[1], eventId: m[2] }
}

export function TenantTemplatesTab({ tenantId, onEditTemplate }) {
  const { t } = usePlatformT()
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
    if (!confirm(t('tplDeleteConfirm'))) return
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
      if (data.warning) {
        setStatus({ type: 'warning', message: `Imported with warning: ${data.warning}` })
      } else {
        setStatus({ type: 'success', message: `Imported: "${data.snapshot.name}" — ${data.snapshot.isCup ? data.snapshot.matchCount + ' matches' : 'single match'}` })
      }
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
      title={t('tplTitle')}
      description={t('tplDesc')}
    >
      {loading ? (
        <div className="text-sm text-gray-400">{t('tplLoading')}</div>
      ) : disciplines.length === 0 ? (
        <div className="text-sm text-gray-400">{t('tplAddDisciplineFirst')}</div>
      ) : (
        <>
          {/* Template list */}
          {templates.length === 0 && !showForm && (
            <div className="text-sm text-gray-400 mb-4">{t('tplNone')}</div>
          )}
          {templates.length > 0 && (
            <div className="space-y-2 mb-4">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex-1 cursor-pointer flex items-center gap-2 group"
                      onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
                    >
                      {/* Chevron indicator for expand/collapse */}
                      <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${expandedId === tpl.id ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <div>
                        <div className="font-medium text-sm text-gray-900 group-hover:text-sky-700 transition-colors">
                          {tpl.name}
                          <span className="text-gray-400 text-xs ml-2">
                            ({disMap[tpl.disciplineId] || tpl.disciplineId})
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {tpl.ssiSeedEventId
                            ? <a href={tpl.ssiSeedEventId.startsWith('http') ? tpl.ssiSeedEventId : `https://shootnscoreit.com/event/${tpl.ssiSeedEventId}/`} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline" onClick={e => e.stopPropagation()}>{t('tplOpenSeed')}</a>
                            : t('tplNoSeed')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEdit(tpl)} className="text-xs text-sky-600 hover:text-sky-800">{t('edit')}</button>
                      <button onClick={() => handleDelete(tpl.id)} className="text-xs text-red-400 hover:text-red-600">{t('delete')}</button>
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
                              {tpl.ssiSeedSnapshot.isCup ? `${t('tplCup')} • ${tpl.ssiSeedSnapshot.matchCount} ${t('tplMatches')}` : t('tplSingleMatch')}
                            </span>
                          </div>
                          {tpl.ssiSeedSnapshot.description && (
                            <div className="text-gray-500">{tpl.ssiSeedSnapshot.description}</div>
                          )}
                          {tpl.ssiSeedSnapshot.matches && tpl.ssiSeedSnapshot.matches.length > 0 && (
                            <div className="space-y-1">
                              <div className="font-medium text-gray-600">{t('tplComponentMatches')}:</div>
                              {tpl.ssiSeedSnapshot.matches.map((m, i) => (
                                <div key={i} className="pl-3 border-l-2 border-sky-200">
                                  <span className="font-medium text-gray-700">{m.name}</span>
                                  <span className="text-gray-400 ml-2">
                                    {m.squads?.length || 0} {t('tplSquads')}
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
                            {t('tplImported')}: {formatDate(new Date(tpl.ssiSeedSnapshot.importedAt).getTime())}
                            {' • '}
                            <button onClick={() => handleImportSeed(tpl.id)} disabled={importing === tpl.id} className="text-sky-500 hover:underline disabled:opacity-50">
                              {importing === tpl.id ? t('tplReimporting') : t('tplReimport')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-50 rounded-md border border-amber-200 p-3 flex items-center justify-between">
                          <div className="text-amber-700 text-xs">
                            {t('tplSeedNotImported')}
                          </div>
                          <button
                            onClick={() => handleImportSeed(tpl.id)}
                            disabled={importing === tpl.id}
                            className="bg-sky-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
                          >
                            {importing === tpl.id ? t('tplImporting') : t('tplImportFromSsi')}
                          </button>
                        </div>
                      )}

                      {/* Open Template Editor — only when seed is imported */}
                      {tpl.ssiSeedSnapshot && onEditTemplate && (
                        <button
                          onClick={() => onEditTemplate(tpl.id)}
                          className="w-full text-sm bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 px-3 py-2 rounded-md font-medium transition-colors"
                        >
                          {t('tplOpenEditor')}
                        </button>
                      )}

                      {/* Config sections */}
                      <div><span className="font-medium">{t('tplOverrides')}:</span> {Object.keys(tpl.overrides || {}).length > 0 ? JSON.stringify(tpl.overrides) : t('tplNoneValue')}</div>
                      <div><span className="font-medium">{t('tplCalendar')}:</span> {Object.keys(tpl.calendarTemplate || {}).length > 0 ? JSON.stringify(tpl.calendarTemplate) : t('tplNotConfigured')}</div>
                      <div><span className="font-medium">{t('tplStaffing')}:</span> {Object.keys(tpl.staffingRules || {}).length > 0 ? JSON.stringify(tpl.staffingRules) : t('tplNotConfigured')}</div>
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
                {editingId ? t('tplEdit') : t('tplNew')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">{t('tplName')}</label>
                  <input
                    type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required minLength={2} placeholder="e.g. Kupittaa Cup Standard"
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">{t('tplDiscipline')}</label>
                  <select
                    value={form.disciplineId}
                    onChange={e => setForm(f => ({ ...f, disciplineId: e.target.value }))}
                    required disabled={!!editingId}
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none disabled:bg-gray-100"
                  >
                    <option value="">{t('tplSelectDiscipline')}</option>
                    {disciplines.map(d => (
                      <option key={d.id} value={d.id}>{d.labelFi || d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">{t('tplSsiEventUrl')}</label>
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
                <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700">{t('cancel')}</button>
                <button
                  type="submit" disabled={saving || form.name.trim().length < 2 || !form.disciplineId || !parseSsiEventUrl(form.ssiSeedEventUrl)}
                  className="bg-sky-600 text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? t('saving') : editingId ? t('discUpdate') : t('discCreate')}
                </button>
              </div>
            </form>
          ) : (
            <button onClick={startNew} className="text-sm text-sky-600 hover:text-sky-800 font-medium">
              {t('tplAddTemplate')}
            </button>
          )}
        </>
      )}
    </SectionCard>
  )
}
