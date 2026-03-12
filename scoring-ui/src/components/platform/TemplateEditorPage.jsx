// ============================================================
// TemplateEditorPage — Edit template overrides after seed import
//
// Sections:
//   1. Seed Structure (read-only) — imported cup/match/squad structure
//   2. Event Overrides — name template, descriptions, timing, registration
//   3. Calendar Template — title, location, content HTML
//   4. Staffing Rules — min/max instructors, required roles
//   5. Post-Event Workflows — complete SSI, update calendar, email report
//   6. Pre-Event Workflows — placeholder for future
//
// All edits are saved to the template's JSONB override columns.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { getTemplateApi, updateTemplateApi, importTemplateSeed, getTenantDetails } from '../../platform-api.js'
import { usePlatformT } from '../../platform-i18n.js'

// ---- Helpers ----

function SectionCard({ title, description, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        </div>
        <span className="text-gray-400 text-sm">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-6 pb-5 space-y-4">{children}</div>}
    </div>
  )
}

function FieldLabel({ label, hint }) {
  return (
    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
      {label}
      {hint && <span className="normal-case tracking-normal text-gray-400 ml-1">— {hint}</span>}
    </label>
  )
}

function TextInput({ label, hint, value, onChange, placeholder, ...props }) {
  return (
    <div>
      <FieldLabel label={label} hint={hint} />
      <input
        type="text" value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
        {...props}
      />
    </div>
  )
}

function TextArea({ label, hint, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      <FieldLabel label={label} hint={hint} />
      <textarea
        value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none font-mono"
      />
    </div>
  )
}

function NumberInput({ label, hint, value, onChange, min, max, placeholder }) {
  return (
    <div>
      <FieldLabel label={label} hint={hint} />
      <input
        type="number" value={value ?? ''} onChange={e => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
        min={min} max={max} placeholder={placeholder}
        className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
      />
    </div>
  )
}

// ---- Workflow Toggle ----

/**
 * Toggle a workflow type on/off in the postEventWorkflows array.
 * Supports optional children (config fields) shown when enabled.
 * @param {string} type — workflow type key (e.g. 'complete_ssi')
 * @param {string} label — display label
 * @param {string} description — short explanation
 * @param {Array} workflows — current postEventWorkflows array
 * @param {Function} onChange — called with updated array
 * @param {ReactNode} children — optional config fields shown when workflow is enabled
 */
function WorkflowToggle({ type, label, description, workflows, onChange, children }) {
  const { t } = usePlatformT()
  const existing = workflows.find(w => w.type === type)
  const enabled = existing?.enabled

  function handleToggle() {
    if (existing) {
      // Toggle existing entry
      onChange(workflows.map(w => w.type === type ? { ...w, enabled: !w.enabled } : w))
    } else {
      // Add new entry as enabled
      onChange([...workflows, { type, enabled: true }])
    }
  }

  return (
    <div className="p-3 rounded-lg border border-gray-100 bg-gray-50 space-y-3">
      <div className="flex items-start gap-3">
        <button
          onClick={handleToggle}
          className={`mt-0.5 w-9 h-5 rounded-full flex items-center px-0.5 shrink-0 transition-colors ${
            enabled ? 'bg-emerald-500 justify-end' : 'bg-gray-300 justify-start'
          }`}
          title={enabled ? t('disable') : t('enable')}
        >
          <div className="w-4 h-4 rounded-full bg-white shadow" />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-800">{label}</div>
          <div className="text-xs text-gray-500 mt-0.5">{description}</div>
        </div>
      </div>
      {enabled && children && (
        <div className="ml-12 space-y-3 border-t border-gray-200 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Email configuration sub-form for email_shooter_count workflow.
 * Fields: to (required), cc (optional), subject template, body template.
 * Placeholders: {eventName}, {eventDate}, {shooterCount}, {venue}
 */
function WorkflowEmailConfig({ workflows, onChange }) {
  const { t } = usePlatformT()
  const existing = workflows.find(w => w.type === 'email_shooter_count')
  const config = existing?.config || {}

  function updateConfig(key, value) {
    const updated = workflows.map(w => {
      if (w.type !== 'email_shooter_count') return w
      return { ...w, config: { ...w.config, [key]: value } }
    })
    // If the workflow entry doesn't exist yet, add it
    if (!existing) {
      updated.push({ type: 'email_shooter_count', enabled: true, config: { [key]: value } })
    }
    onChange(updated)
  }

  // Parse comma-separated string to/from array
  function toStr(arr) { return (arr || []).join(', ') }
  function toArr(str) { return str.split(',').map(s => s.trim()).filter(Boolean) }

  return (
    <>
      <div>
        <FieldLabel label={t('emailTo')} hint={t('emailToHint')} />
        <input
          type="text"
          value={toStr(config.to)}
          onChange={e => updateConfig('to', toArr(e.target.value))}
          placeholder="admin@club.fi, secretary@club.fi"
          className={`w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none ${
            !config.to?.length ? 'border-amber-400 bg-amber-50' : ''
          }`}
        />
      </div>
      <div>
        <FieldLabel label={t('emailCc')} hint={t('emailCcHint')} />
        <input
          type="text"
          value={toStr(config.cc)}
          onChange={e => updateConfig('cc', toArr(e.target.value))}
          placeholder="board@club.fi"
          className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
        />
      </div>
      <div>
        <FieldLabel label={t('emailSubjectTemplate')} hint={t('emailSubjectTemplateHint')} />
        <input
          type="text"
          value={config.subjectTemplate || ''}
          onChange={e => updateConfig('subjectTemplate', e.target.value)}
          placeholder="Shooter Count: {eventName} ({eventDate})"
          className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
        />
      </div>
      <div>
        <FieldLabel label={t('emailBodyTemplate')} hint={t('emailBodyTemplateHint')} />
        <textarea
          value={config.bodyTemplate || ''}
          onChange={e => updateConfig('bodyTemplate', e.target.value)}
          placeholder={`Event: {eventName}\nDate: {eventDate}\nVenue: {venue}\nApproved shooters: {shooterCount}`}
          rows={4}
          className="w-full border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky-200 focus:outline-none"
        />
      </div>
      {!config.to?.length && (
        <p className="text-xs text-amber-600">{t('emailRecipientRequired')}</p>
      )}
    </>
  )
}

// ---- Seed Structure Display (read-only) ----

function SeedStructure({ snapshot, onReimport, importing }) {
  const { t } = usePlatformT()
  if (!snapshot) {
    return (
      <div className="bg-amber-50 rounded-md border border-amber-200 p-4 flex items-center justify-between">
        <div className="text-amber-700 text-sm">
          {t('seedNotImported')}
        </div>
        <button
          onClick={onReimport} disabled={importing}
          className="bg-sky-600 text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
        >
          {importing ? t('importing') : t('importFromSsiBtn')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">{snapshot.name}</div>
          <div className="text-xs text-gray-400">
            {snapshot.isCup ? t('cupWithMatches', snapshot.matchCount) : t('singleMatch')}
            {snapshot.venue && ` • ${snapshot.venue}`}
          </div>
        </div>
        <button
          onClick={onReimport} disabled={importing}
          className="text-xs text-sky-500 hover:underline disabled:opacity-50"
        >
          {importing ? t('reimporting') : t('reimport')}
        </button>
      </div>

      {snapshot.description && (
        <div className="text-sm text-gray-600 bg-gray-50 rounded-md p-3">{snapshot.description}</div>
      )}

      {/* Component matches */}
      {snapshot.matches && snapshot.matches.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('componentMatches')}</div>
          {snapshot.matches.map((m, i) => (
            <div key={i} className="bg-gray-50 rounded-md p-3 border-l-3 border-sky-300">
              <div className="font-medium text-sm text-gray-800">{m.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {m.rule && <span className="mr-3">{t('rule')}: {m.rule}</span>}
                {m.squads && m.squads.length > 0 && (
                  <span>
                    {m.squads.length} squads: {m.squads.map(s => `${s.name} (max ${s.maxCompetitors})`).join(', ')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cup-level squads (non-cup events) */}
      {snapshot.squads && snapshot.squads.length > 0 && !snapshot.isCup && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('squads')}</div>
          {snapshot.squads.map((s, i) => (
            <div key={i} className="text-sm text-gray-600">{s.name} — max {s.maxCompetitors}</div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-gray-400">
        {t('importedAt')}: {new Date(snapshot.importedAt).toLocaleString('fi-FI')} • {t('source')}: {snapshot.sourceUrl}
      </div>
    </div>
  )
}

// ---- Main Component ----

export default function TemplateEditorPage({ tenantId, templateId, onBack }) {
  const { t } = usePlatformT()
  const [template, setTemplate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState(null)
  const [dirty, setDirty] = useState(false)

  // Editable state — initialized from template on load
  const [overrides, setOverrides] = useState({})
  const [calendarTemplate, setCalendarTemplate] = useState({})
  const [staffingRules, setStaffingRules] = useState({})
  const [postEventWorkflows, setPostEventWorkflows] = useState([])

  // Tenant integration flags (loaded once for conditional UI)
  const [hasSsi, setHasSsi] = useState(false)
  const [hasCalendar, setHasCalendar] = useState(false)

  // Load template
  useEffect(() => {
    async function load() {
      try {
        const data = await getTemplateApi(tenantId, templateId)
        setTemplate(data.template)

        // Merge overrides with seed snapshot defaults so text fields
        // show current values (editable) instead of empty with placeholder.
        // Only seed-sourced fields are pre-populated; user overrides take precedence.
        const snap = data.template.ssiSeedSnapshot || {}
        const saved = data.template.overrides || {}
        setOverrides({
          description: saved.description ?? snap.description ?? '',
          information: saved.information ?? snap.information ?? '',
          venue: saved.venue ?? snap.venue ?? '',
          url: saved.url ?? snap.url ?? '',
          urlDisplay: saved.urlDisplay ?? snap.urlDisplay ?? '',
          ...saved, // user-set overrides always win
        })
        setCalendarTemplate(data.template.calendarTemplate || {})
        setStaffingRules(data.template.staffingRules || {})
        setPostEventWorkflows(data.template.postEventWorkflows || [])

        // Load tenant to detect which integrations are configured
        try {
          const tenantData = await getTenantDetails(tenantId)
          const tenant = tenantData.tenant || tenantData
          setHasSsi(!!tenant.ssiCredentials?.email)
          setHasCalendar(!!tenant.calendarConfig?.wpBaseUrl)
        } catch { /* non-critical — toggles hidden if tenant load fails */ }
      } catch (err) {
        setStatus({ type: 'error', message: err.message })
      }
      setLoading(false)
    }
    load()
  }, [tenantId, templateId])

  // Override field updater
  function updateOverride(key, value) {
    setOverrides(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  function updateCalendar(key, value) {
    setCalendarTemplate(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  function updateStaffing(key, value) {
    setStaffingRules(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  // Validate staffing roles — every role must have non-empty key and label
  function getStaffingValidationErrors() {
    const errors = []
    for (const [idx, role] of (staffingRules.roles || []).entries()) {
      if (!role.key?.trim()) errors.push({ idx, field: 'key' })
      if (!role.label?.trim()) errors.push({ idx, field: 'label' })
    }
    return errors
  }

  // Save all changes
  async function handleSave() {
    const validationErrors = getStaffingValidationErrors()
    if (validationErrors.length > 0) {
      setStatus({ type: 'error', message: t('staffingValidationError') })
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      // Save postEventWorkflows as-is (user controls which are enabled)
      const finalWorkflows = [...postEventWorkflows]
      const data = await updateTemplateApi(tenantId, templateId, {
        overrides,
        calendarTemplate,
        staffingRules,
        postEventWorkflows: finalWorkflows,
      })
      setTemplate(data.template)
      setDirty(false)
      setStatus({ type: 'success', message: t('templateSaved') })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  // Re-import seed
  async function handleReimport() {
    setImporting(true)
    setStatus(null)
    try {
      const data = await importTemplateSeed(tenantId, templateId)
      setTemplate(data.template)
      if (data.warning) {
        setStatus({ type: 'warning', message: `Imported with warning: ${data.warning}` })
      } else {
        setStatus({ type: 'success', message: `Re-imported: "${data.snapshot.name}"` })
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400 text-sm">{t('loadingTemplate')}</div>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-500 text-sm">{t('templateNotFound')}</div>
      </div>
    )
  }

  const snapshot = template.ssiSeedSnapshot

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
              <h1 className="text-xl font-bold text-gray-900">{template.name}</h1>
            </div>
            <p className="text-sm text-gray-400">{t('templateEditor')}</p>
          </div>
          <button
            onClick={handleSave} disabled={saving || !dirty}
            className="bg-sky-600 text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? t('saving') : t('saveChanges')}
          </button>
        </div>

        {/* Status message */}
        {status && (
          <div className={`rounded-md px-4 py-2 text-sm ${
            status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {status.message}
          </div>
        )}

        {/* Section 1: Seed Structure (read-only) */}
        <SectionCard title={t('seedStructure')} description={t('seedStructureDesc')}>
          <SeedStructure snapshot={snapshot} onReimport={handleReimport} importing={importing} />
        </SectionCard>

        {/* Section 2: Event Overrides */}
        <SectionCard title={t('eventOverrides')} description={t('eventOverridesDesc')}>
          <TextInput
            label={t('nameTemplate')} hint={t('nameTemplateHint')}
            value={overrides.nameTemplate}
            onChange={v => updateOverride('nameTemplate', v)}
            placeholder={snapshot?.name ? `${snapshot.name} {date}` : 'e.g. TurRes Kupittaa CUP {date}'}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label={t('startTime')} hint={t('startTimeHint')}
              value={overrides.startTime}
              onChange={v => updateOverride('startTime', v)}
              placeholder="09.00"
            />
            <TextInput
              label={t('endTime')}
              value={overrides.endTime}
              onChange={v => updateOverride('endTime', v)}
              placeholder="12.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label={t('registrationOpens')} hint={t('registrationOpensHint')}
              value={overrides.registrationDaysBeforeEvent}
              onChange={v => updateOverride('registrationDaysBeforeEvent', v)}
              min={1} max={90} placeholder="7"
            />
            <TextInput
              label={t('registrationStartTime')}
              value={overrides.registrationStartTime}
              onChange={v => updateOverride('registrationStartTime', v)}
              placeholder="00.00"
            />
          </div>
          <TextArea
            label={t('description')} hint={t('descriptionHint')}
            value={overrides.description}
            onChange={v => updateOverride('description', v)}
            placeholder={snapshot?.description || 'Short event description...'}
            rows={3}
          />
          <TextArea
            label={t('information')} hint={t('informationHint')}
            value={overrides.information}
            onChange={v => updateOverride('information', v)}
            placeholder={snapshot?.information || 'Detailed event information...'}
            rows={6}
          />
          <TextInput
            label={t('venue')}
            value={overrides.venue}
            onChange={v => updateOverride('venue', v)}
            placeholder={snapshot?.venue || 'Event venue address'}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label={t('urlLabel')}
              value={overrides.url}
              onChange={v => updateOverride('url', v)}
              placeholder={snapshot?.url || 'https://...'}
            />
            <TextInput
              label={t('urlDisplayText')}
              value={overrides.urlDisplay}
              onChange={v => updateOverride('urlDisplay', v)}
              placeholder={snapshot?.urlDisplay || 'Lisätietoa'}
            />
          </div>
        </SectionCard>

        {/* Section 3: Calendar Template */}
        <SectionCard title={t('calendarTemplate')} description={t('calendarTemplateDesc')}>
          <TextInput
            label={t('calendarTitleTemplate')} hint={t('calendarTitleTemplateHint')}
            value={calendarTemplate.titleTemplate}
            onChange={v => updateCalendar('titleTemplate', v)}
            placeholder="e.g. Kupittaan ampumavuoro {date}"
          />
          <TextInput
            label={t('location')}
            value={calendarTemplate.location}
            onChange={v => updateCalendar('location', v)}
            placeholder="e.g. Kupittaan urheiluhallin ampumarata"
          />
          <TextInput
            label={t('mapLink')}
            value={calendarTemplate.mapLink}
            onChange={v => updateCalendar('mapLink', v)}
            placeholder="https://maps.app.goo.gl/..."
          />
          <TextArea
            label={t('shortDescription')} hint={t('shortDescriptionHint')}
            value={calendarTemplate.shortDescription}
            onChange={v => updateCalendar('shortDescription', v)}
            placeholder="Brief calendar listing description..."
            rows={2}
          />
          <TextArea
            label={t('calendarContent')} hint={t('calendarContentHint')}
            value={calendarTemplate.content}
            onChange={v => updateCalendar('content', v)}
            placeholder="<strong>Event details...</strong>"
            rows={12}
          />
          <TextInput
            label={t('shotsPerParticipant')} hint={t('shotsPerParticipantHint')}
            value={calendarTemplate.shotsPerParticipant ?? ''}
            onChange={v => updateCalendar('shotsPerParticipant', v === '' ? undefined : parseInt(v, 10) || 0)}
            placeholder="100"
            type="number"
          />
          <TextInput
            label={t('taxonomyIds')} hint={t('taxonomyIdsHint')}
            value={(calendarTemplate.taxonomyIds || []).join(', ')}
            onChange={v => updateCalendar('taxonomyIds', v.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="50, 52"
          />
        </SectionCard>

        {/* Section 4: Staffing Rules — roles array */}
        <SectionCard title={t('staffingRulesTitle')} description={t('staffingRulesDesc')}>
          <div className="mb-4 bg-white border border-gray-200 rounded-md p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-800">{t('ssiSyncSettings')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <TextInput
                label={t('staffSquadName')} hint={t('staffSquadNameHint')}
                value={staffingRules.staffSquadName}
                onChange={v => updateStaffing('staffSquadName', v)}
                placeholder="Squad 5"
              />
            </div>
            <p className="text-xs text-gray-500">
              {t('staffSquadExplanation')}
            </p>
          </div>

          {(staffingRules.roles || []).length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-4">
              {t('noStaffingRoles')}
            </div>
          ) : (
            <div className="space-y-3">
              {(staffingRules.roles || []).map((role, idx) => (
                <div key={idx} className="bg-gray-50 rounded-md p-3 border border-gray-200">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <FieldLabel label={t('keyLabel')} hint={t('keyHint')} />
                      <input type="text" value={role.key || ''} onChange={e => {
                        const updated = [...staffingRules.roles]
                        updated[idx] = { ...updated[idx], key: e.target.value }
                        updateStaffing('roles', updated)
                      }} placeholder="ro" className={`w-full border rounded-md px-2 py-1 text-sm ${!role.key?.trim() ? 'border-red-400 bg-red-50' : ''}`} />
                    </div>
                    <div className="col-span-4">
                      <FieldLabel label={t('labelField')} hint={t('labelHint')} />
                      <input type="text" value={role.label || ''} onChange={e => {
                        const updated = [...staffingRules.roles]
                        updated[idx] = { ...updated[idx], label: e.target.value }
                        updateStaffing('roles', updated)
                      }} placeholder="Range Officer" className={`w-full border rounded-md px-2 py-1 text-sm ${!role.label?.trim() ? 'border-red-400 bg-red-50' : ''}`} />
                    </div>
                    <div className="col-span-2">
                      <FieldLabel label={t('minLabel')} />
                      <input type="number" value={role.min ?? ''} min={0} max={20} onChange={e => {
                        const updated = [...staffingRules.roles]
                        updated[idx] = { ...updated[idx], min: parseInt(e.target.value) || 0 }
                        updateStaffing('roles', updated)
                      }} className="w-full border rounded-md px-2 py-1 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <FieldLabel label={t('maxLabel')} />
                      <input type="number" value={role.max ?? ''} min={0} max={50} onChange={e => {
                        const updated = [...staffingRules.roles]
                        updated[idx] = { ...updated[idx], max: parseInt(e.target.value) || 1 }
                        updateStaffing('roles', updated)
                      }} className="w-full border rounded-md px-2 py-1 text-sm" />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button onClick={() => {
                        const updated = staffingRules.roles.filter((_, i) => i !== idx)
                        updateStaffing('roles', updated)
                      }} className="text-red-400 hover:text-red-600 text-lg leading-none pb-1" title="Remove role">×</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 mt-2 pt-2 border-t border-gray-100">
                    <div className="col-span-4">
                      <FieldLabel label={t('ssiOfficialCode')} hint={t('ssiOfficialCodeHint')} />
                      <input type="text" value={role.ssiOfficialCode || ''} onChange={e => {
                        const updated = [...staffingRules.roles]
                        updated[idx] = { ...updated[idx], ssiOfficialCode: e.target.value }
                        updateStaffing('roles', updated)
                      }} placeholder="Leave empty for none" className="w-full border rounded-md px-2 py-1 text-sm" />
                    </div>
                    <div className="col-span-4">
                      <FieldLabel label={t('ssiMgmtRole')} hint={t('ssiMgmtRoleHint')} />
                      <select value={role.ssiMgmtRole || ''} onChange={e => {
                        const updated = [...staffingRules.roles]
                        updated[idx] = { ...updated[idx], ssiMgmtRole: e.target.value }
                        updateStaffing('roles', updated)
                      }} className="w-full border rounded-md px-2 py-1 text-sm">
                        <option value="">{t('noMgmtAccess')}</option>
                        <option value="1">{t('matchAdmin')}</option>
                        <option value="2">{t('staffRole')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => {
            const roles = [...(staffingRules.roles || []), { key: '', label: '', min: 1, max: 1, ssiOfficialCode: '', ssiMgmtRole: '' }]
            updateStaffing('roles', roles)
          }} className="mt-2 text-sm text-sky-600 hover:text-sky-800 font-medium">
            {t('addRole')}
          </button>

          {/* Quick-add SRA defaults */}
          {(staffingRules.roles || []).length === 0 && (
            <button onClick={() => {
              updateStaffing('roles', [
                { key: 'match_director', label: 'Match Director', min: 1, max: 1, ssiOfficialCode: 'MD', ssiMgmtRole: '1' },
                { key: 'ro', label: 'Range Officer', min: 2, max: 4, ssiOfficialCode: 'RO', ssiMgmtRole: '1' },
                { key: 'safety', label: 'Safety Officer', min: 1, max: 1, ssiOfficialCode: 'RM', ssiMgmtRole: '1' },
                { key: 'scorer', label: 'Scorer', min: 1, max: 2, ssiOfficialCode: '', ssiMgmtRole: '1' },
              ])
            }} className="ml-4 text-sm text-gray-400 hover:text-gray-600">
              {t('loadSraDefaults')}
            </button>
          )}
        </SectionCard>

        {/* Section 5: Post-Event Workflows */}
        <SectionCard title={t('postEventWorkflows')} description={t('postEventWorkflowsDesc')}>
          {/* Email shooter count — always available (no integration dependency) */}
          <WorkflowToggle
            type="email_shooter_count"
            label={t('emailShooterCount')}
            description={t('emailShooterCountDesc')}
            workflows={postEventWorkflows}
            onChange={wfs => { setPostEventWorkflows(wfs); setDirty(true) }}
          >
            <WorkflowEmailConfig
              workflows={postEventWorkflows}
              onChange={wfs => { setPostEventWorkflows(wfs); setDirty(true) }}
            />
          </WorkflowToggle>
          {/* Complete SSI — only if tenant has SSI credentials */}
          {hasSsi && (
            <WorkflowToggle
              type="complete_ssi"
              label={t('completeSsiWorkflow')}
              description={t('completeSsiWorkflowDesc')}
              workflows={postEventWorkflows}
              onChange={wfs => { setPostEventWorkflows(wfs); setDirty(true) }}
            />
          )}
          {/* Calendar stats — only if tenant has calendar config */}
          {hasCalendar && (
            <WorkflowToggle
              type="update_calendar_stats"
              label={t('updateCalendarStats')}
              description={t('updateCalendarStatsDesc')}
              workflows={postEventWorkflows}
              onChange={wfs => { setPostEventWorkflows(wfs); setDirty(true) }}
            />
          )}
          {!hasSsi && !hasCalendar && (
            <p className="text-xs text-gray-400">{t('noIntegrationsHint')}</p>
          )}
        </SectionCard>

        {/* Section 6: Pre-Event Workflows (placeholder) */}
        <SectionCard title={t('preEventWorkflows')} description={t('preEventWorkflowsDesc')} defaultOpen={false}>
          <div className="text-sm text-gray-400 text-center py-4">
            {t('preEventNotAvailable')}
          </div>
        </SectionCard>

        {/* Sticky save bar */}
        {dirty && (
          <div className="sticky bottom-4 bg-white rounded-xl shadow-lg border border-sky-200 px-6 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">{t('unsavedChanges')}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setOverrides(template.overrides || {})
                  setCalendarTemplate(template.calendarTemplate || {})
                  setStaffingRules(template.staffingRules || {})
                  setPostEventWorkflows(template.postEventWorkflows || [])
                  setDirty(false)
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {t('discardChanges')}
              </button>
              <button
                onClick={handleSave} disabled={saving}
                className="bg-sky-600 text-white px-5 py-1.5 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {saving ? t('saving') : t('saveChanges')}
              </button>
            </div>
          </div>
        )}
    </div>
  )
}
