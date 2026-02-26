// ============================================================
// TemplateEditorPage — Edit template overrides after seed import
//
// Sections:
//   1. Seed Structure (read-only) — imported cup/match/squad structure
//   2. Event Overrides — name template, descriptions, timing, registration
//   3. Calendar Template — title, location, content HTML
//   4. Staffing Rules — min/max instructors, required roles
//
// All edits are saved to the template's JSONB override columns.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { getTemplateApi, updateTemplateApi, importTemplateSeed } from '../../platform-api.js'

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

// ---- Seed Structure Display (read-only) ----

function SeedStructure({ snapshot, onReimport, importing }) {
  if (!snapshot) {
    return (
      <div className="bg-amber-50 rounded-md border border-amber-200 p-4 flex items-center justify-between">
        <div className="text-amber-700 text-sm">
          Seed event structure not yet imported from SSI.
        </div>
        <button
          onClick={onReimport} disabled={importing}
          className="bg-sky-600 text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
        >
          {importing ? 'Importing...' : 'Import from SSI'}
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
            {snapshot.isCup ? `Cup • ${snapshot.matchCount} component matches` : 'Single match'}
            {snapshot.venue && ` • ${snapshot.venue}`}
          </div>
        </div>
        <button
          onClick={onReimport} disabled={importing}
          className="text-xs text-sky-500 hover:underline disabled:opacity-50"
        >
          {importing ? 'Re-importing...' : 'Re-import'}
        </button>
      </div>

      {snapshot.description && (
        <div className="text-sm text-gray-600 bg-gray-50 rounded-md p-3">{snapshot.description}</div>
      )}

      {/* Component matches */}
      {snapshot.matches && snapshot.matches.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Component Matches</div>
          {snapshot.matches.map((m, i) => (
            <div key={i} className="bg-gray-50 rounded-md p-3 border-l-3 border-sky-300">
              <div className="font-medium text-sm text-gray-800">{m.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {m.rule && <span className="mr-3">Rule: {m.rule}</span>}
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
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Squads</div>
          {snapshot.squads.map((s, i) => (
            <div key={i} className="text-sm text-gray-600">{s.name} — max {s.maxCompetitors}</div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-gray-400">
        Imported: {new Date(snapshot.importedAt).toLocaleString('fi-FI')} • Source: {snapshot.sourceUrl}
      </div>
    </div>
  )
}

// ---- Main Component ----

export default function TemplateEditorPage({ tenantId, templateId, onBack }) {
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

  // Load template
  useEffect(() => {
    async function load() {
      try {
        const data = await getTemplateApi(tenantId, templateId)
        setTemplate(data.template)
        setOverrides(data.template.overrides || {})
        setCalendarTemplate(data.template.calendarTemplate || {})
        setStaffingRules(data.template.staffingRules || {})
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

  // Save all changes
  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const data = await updateTemplateApi(tenantId, templateId, {
        overrides,
        calendarTemplate,
        staffingRules,
      })
      setTemplate(data.template)
      setDirty(false)
      setStatus({ type: 'success', message: 'Template saved successfully' })
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
      setStatus({ type: 'success', message: `Re-imported: "${data.snapshot.name}"` })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading template...</div>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500 text-sm">Template not found</div>
      </div>
    )
  }

  const snapshot = template.ssiSeedSnapshot

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">
              ← Back
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{template.name}</h1>
              <p className="text-sm text-gray-400">Template Editor</p>
            </div>
          </div>
          <button
            onClick={handleSave} disabled={saving || !dirty}
            className="bg-sky-600 text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
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
        <SectionCard title="Imported Event Structure" description="Read-only snapshot from SSI — the blueprint for new events">
          <SeedStructure snapshot={snapshot} onReimport={handleReimport} importing={importing} />
        </SectionCard>

        {/* Section 2: Event Overrides */}
        <SectionCard title="Event Overrides" description="These values override the seed when creating new events. Use {date} for date substitution.">
          <TextInput
            label="Name Template" hint="Use {date} for the event date"
            value={overrides.nameTemplate}
            onChange={v => updateOverride('nameTemplate', v)}
            placeholder={snapshot?.name ? `${snapshot.name} {date}` : 'e.g. TurRes Kupittaa CUP {date}'}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label="Start Time" hint="Finnish format hh.mm"
              value={overrides.startTime}
              onChange={v => updateOverride('startTime', v)}
              placeholder="09.00"
            />
            <TextInput
              label="End Time"
              value={overrides.endTime}
              onChange={v => updateOverride('endTime', v)}
              placeholder="12.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Registration Opens" hint="days before event"
              value={overrides.registrationDaysBeforeEvent}
              onChange={v => updateOverride('registrationDaysBeforeEvent', v)}
              min={1} max={90} placeholder="7"
            />
            <TextInput
              label="Registration Start Time"
              value={overrides.registrationStartTime}
              onChange={v => updateOverride('registrationStartTime', v)}
              placeholder="00.00"
            />
          </div>
          <TextArea
            label="Description" hint="Max 300 chars — shown in event listings"
            value={overrides.description}
            onChange={v => updateOverride('description', v)}
            placeholder={snapshot?.description || 'Short event description...'}
            rows={3}
          />
          <TextArea
            label="Information" hint="Max 800 chars — detailed info on event page"
            value={overrides.information}
            onChange={v => updateOverride('information', v)}
            placeholder={snapshot?.information || 'Detailed event information...'}
            rows={6}
          />
          <TextInput
            label="Venue"
            value={overrides.venue}
            onChange={v => updateOverride('venue', v)}
            placeholder={snapshot?.venue || 'Event venue address'}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label="URL"
              value={overrides.url}
              onChange={v => updateOverride('url', v)}
              placeholder={snapshot?.url || 'https://...'}
            />
            <TextInput
              label="URL Display Text"
              value={overrides.urlDisplay}
              onChange={v => updateOverride('urlDisplay', v)}
              placeholder={snapshot?.urlDisplay || 'Lisätietoa'}
            />
          </div>
        </SectionCard>

        {/* Section 3: Calendar Template */}
        <SectionCard title="Calendar Template" description="WordPress / Tapahtumakalenteri publishing settings. Use {date} and {ssiCupLink} placeholders.">
          <TextInput
            label="Calendar Title Template" hint="Use {date} for date"
            value={calendarTemplate.titleTemplate}
            onChange={v => updateCalendar('titleTemplate', v)}
            placeholder="e.g. Kupittaan ampumavuoro {date}"
          />
          <TextInput
            label="Location"
            value={calendarTemplate.location}
            onChange={v => updateCalendar('location', v)}
            placeholder="e.g. Kupittaan urheiluhallin ampumarata"
          />
          <TextInput
            label="Map Link"
            value={calendarTemplate.mapLink}
            onChange={v => updateCalendar('mapLink', v)}
            placeholder="https://maps.app.goo.gl/..."
          />
          <TextArea
            label="Short Description" hint="Ingressi, ~300 chars"
            value={calendarTemplate.shortDescription}
            onChange={v => updateCalendar('shortDescription', v)}
            placeholder="Brief calendar listing description..."
            rows={2}
          />
          <TextArea
            label="Calendar Content" hint="HTML — use {ssiCupLink} for SSI registration link"
            value={calendarTemplate.content}
            onChange={v => updateCalendar('content', v)}
            placeholder="<strong>Event details...</strong>"
            rows={12}
          />
          <TextInput
            label="Event Format Taxonomy IDs" hint="Comma-separated WordPress taxonomy IDs"
            value={(calendarTemplate.taxonomyIds || []).join(', ')}
            onChange={v => updateCalendar('taxonomyIds', v.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="50, 52"
          />
        </SectionCard>

        {/* Section 4: Staffing Rules */}
        <SectionCard title="Staffing Rules" description="Instructor requirements for events created from this template.">
          <div className="grid grid-cols-2 gap-4">
            <NumberInput
              label="Minimum Instructors"
              value={staffingRules.minInstructors}
              onChange={v => updateStaffing('minInstructors', v)}
              min={0} max={20} placeholder="2"
            />
            <NumberInput
              label="Maximum Instructors"
              value={staffingRules.maxInstructors}
              onChange={v => updateStaffing('maxInstructors', v)}
              min={0} max={50} placeholder="4"
            />
          </div>
          <TextInput
            label="Required Roles" hint="Comma-separated, e.g. lead, equipment"
            value={(staffingRules.requiredRoles || []).join(', ')}
            onChange={v => updateStaffing('requiredRoles', v.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="lead, equipment"
          />
        </SectionCard>

        {/* Sticky save bar */}
        {dirty && (
          <div className="sticky bottom-4 bg-white rounded-xl shadow-lg border border-sky-200 px-6 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">You have unsaved changes</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setOverrides(template.overrides || {})
                  setCalendarTemplate(template.calendarTemplate || {})
                  setStaffingRules(template.staffingRules || {})
                  setDirty(false)
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Discard
              </button>
              <button
                onClick={handleSave} disabled={saving}
                className="bg-sky-600 text-white px-5 py-1.5 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
