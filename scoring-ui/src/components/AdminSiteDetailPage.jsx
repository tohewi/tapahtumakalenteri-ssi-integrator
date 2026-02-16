import { useState, useEffect } from 'react'
import { AppHeader } from './shared'

const API_BASE = '/api/admin'

const FILTER_TYPE_LABELS = {
  name_contains: 'Name contains',
  cup_id: 'Cup ID',
  date_range: 'Date range',
  event_type: 'Event type',
  event_kind: 'Event type',
}

const EVENT_KIND_OPTIONS = [
  { value: 'match', label: 'Match' },
  { value: 'cup', label: 'Cup' },
  { value: 'league', label: 'League' },
]

function formatEventKindValue(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase())
    .join(', ')
}

function parseCsvStrings(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
}

function parseCsvNumbers(value) {
  return parseCsvStrings(value)
    .map(v => Number.parseInt(v, 10))
    .filter(Number.isFinite)
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function sanitizeTrainingTypes(trainingTypes) {
  const result = {}

  for (const [typeKey, typeCfg] of Object.entries(trainingTypes || {})) {
    const normalizedKey = String(typeKey || '').trim().toLowerCase()
    if (!normalizedKey) continue

    const searchPatterns = Array.isArray(typeCfg?.searchPatterns)
      ? typeCfg.searchPatterns.map(v => String(v || '').trim()).filter(Boolean)
      : parseCsvStrings(typeCfg?.searchPatterns)
    const shooterSquads = Array.isArray(typeCfg?.shooterSquads)
      ? typeCfg.shooterSquads.map(v => Number.parseInt(v, 10)).filter(Number.isFinite)
      : parseCsvNumbers(typeCfg?.shooterSquads)

    const maxSquads = parsePositiveInt(typeCfg?.maxSquads)
    const staffSquad = parsePositiveInt(typeCfg?.staffSquad)
    const minShootersPerSquad = parsePositiveInt(typeCfg?.minShootersPerSquad)
    const maxTrainers = parsePositiveInt(typeCfg?.maxTrainers)

    result[normalizedKey] = {
      searchPatterns: searchPatterns.length > 0 ? searchPatterns : [normalizedKey],
      label: {
        fi: String(typeCfg?.label?.fi || normalizedKey).trim(),
        en: String(typeCfg?.label?.en || normalizedKey).trim(),
      },
      ...(maxSquads ? { maxSquads } : {}),
      ...(shooterSquads.length > 0 ? { shooterSquads } : {}),
      ...(staffSquad ? { staffSquad } : {}),
      ...(minShootersPerSquad ? { minShootersPerSquad } : {}),
      ...(maxTrainers ? { maxTrainers } : {}),
    }
  }

  return result
}

function sanitizeEventDiscovery(eventDiscovery) {
  const next = { ...(eventDiscovery || {}) }
  const defaultTrainingType = String(next.defaultTrainingType || '').trim().toLowerCase()
  if (defaultTrainingType) {
    next.defaultTrainingType = defaultTrainingType
  } else {
    delete next.defaultTrainingType
  }
  return next
}

/**
 * Admin Site Detail Page
 *
 * Create or edit a staff management site configuration.
 * URL patterns:
 * - /admin/sites/new - Create new site
 * - /admin/sites/:key - Edit existing site
 */
export default function AdminSiteDetailPage({ siteKey }) {
  const isNew = siteKey === 'new'
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Site basic info
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [organizationRange, setOrganizationRange] = useState('')
  const [timezone, setTimezone] = useState('Europe/Helsinki')

  // Event filters
  const [filters, setFilters] = useState([])
  const [newFilterType, setNewFilterType] = useState('name_contains')
  const [newFilterValue, setNewFilterValue] = useState('')
  const [newFilterFutureOnly, setNewFilterFutureOnly] = useState(true)

  // Training type configuration
  const [trainingTypes, setTrainingTypes] = useState({})
  const [eventDiscoveryConfig, setEventDiscoveryConfig] = useState({})
  const [newTrainingTypeKey, setNewTrainingTypeKey] = useState('')
  const [hasTrainingTypesConfigSection, setHasTrainingTypesConfigSection] = useState(false)
  const [hasEventDiscoveryConfigSection, setHasEventDiscoveryConfigSection] = useState(false)

  useEffect(() => {
    if (!isNew) {
      loadSite()
    }
  }, [isNew, siteKey])

  function handleAddTrainingType() {
    const typeKey = newTrainingTypeKey.trim().toLowerCase()
    if (!typeKey) {
      alert('Training type key is required')
      return
    }
    if (!/^[a-z0-9-]+$/.test(typeKey)) {
      alert('Training type key must contain only lowercase letters, numbers, and hyphens')
      return
    }
    if (trainingTypes[typeKey]) {
      alert('Training type key already exists')
      return
    }

    setTrainingTypes(prev => ({
      ...prev,
      [typeKey]: {
        searchPatterns: [typeKey],
        label: { fi: typeKey, en: typeKey },
        maxSquads: 4,
        shooterSquads: [1, 2, 3, 4],
        staffSquad: 5,
        minShootersPerSquad: 5,
        maxTrainers: 6,
      },
    }))
    setHasTrainingTypesConfigSection(true)
    setNewTrainingTypeKey('')
  }

  function handleDeleteTrainingType(typeKey) {
    setTrainingTypes(prev => {
      const next = { ...prev }
      delete next[typeKey]
      return next
    })

    if (eventDiscoveryConfig.defaultTrainingType === typeKey) {
      setEventDiscoveryConfig(prev => ({
        ...prev,
        defaultTrainingType: '',
      }))
      setHasEventDiscoveryConfigSection(true)
    }
  }

  function updateTrainingType(typeKey, updater) {
    setTrainingTypes(prev => {
      const current = prev[typeKey] || {}
      const nextValue = updater(current)
      return {
        ...prev,
        [typeKey]: nextValue,
      }
    })
    setHasTrainingTypesConfigSection(true)
  }

  async function loadSite() {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`${API_BASE}/sites/${siteKey}`, {
        credentials: 'include'
      })

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Site not found')
        }
        if (res.status === 503) {
          const data = await res.json()
          throw new Error(data.error || 'Database not available. Admin features require DATABASE_URL to be configured.')
        }
        throw new Error('Failed to load site')
      }

      const site = await res.json()
      setKey(site.key)
      setName(site.name)
      setOrganizationName(site.organizationName || site.organization_name || '')
      setOrganizationRange(site.organizationRange || site.organization_range || '')
      setTimezone(site.timezone || 'Europe/Helsinki')
      setFilters(site.filters || [])

      const config = site.config || {}
      setTrainingTypes(config.trainingTypes || {})
      setEventDiscoveryConfig(config.eventDiscovery || {})
      setHasTrainingTypesConfigSection(Object.prototype.hasOwnProperty.call(config, 'trainingTypes'))
      setHasEventDiscoveryConfigSection(Object.prototype.hasOwnProperty.call(config, 'eventDiscovery'))
    } catch (err) {
      console.error('Load error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)
      setError(null)

      // Validate required fields
      if (!key || !name || !organizationName) {
        throw new Error('Please fill in all required fields')
      }

      // Validate key format
      if (!/^[a-z0-9-]+$/.test(key)) {
        throw new Error('Key must contain only lowercase letters, numbers, and hyphens')
      }

      const payload = {
        key,
        name,
        organizationName,
        organizationRange,
        timezone
      }

      const sanitizedTrainingTypes = sanitizeTrainingTypes(trainingTypes)
      const sanitizedEventDiscovery = sanitizeEventDiscovery(eventDiscoveryConfig)
      const configPayload = {}

      const hasTrainingTypes = Object.keys(sanitizedTrainingTypes).length > 0
      if (hasTrainingTypes || hasTrainingTypesConfigSection) {
        configPayload.trainingTypes = sanitizedTrainingTypes
      }

      if (sanitizedEventDiscovery.defaultTrainingType && !sanitizedTrainingTypes[sanitizedEventDiscovery.defaultTrainingType]) {
        throw new Error('Default training type must match one of the configured training type keys')
      }

      const hasEventDiscoveryValues = Object.keys(sanitizedEventDiscovery).length > 0
      if (hasEventDiscoveryValues || hasEventDiscoveryConfigSection) {
        configPayload.eventDiscovery = sanitizedEventDiscovery
      }

      if (Object.keys(configPayload).length > 0) {
        payload.config = configPayload
      }

      const url = isNew ? `${API_BASE}/sites` : `${API_BASE}/sites/${siteKey}`
      const method = isNew ? 'POST' : 'PUT'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const data = await res.json()
        if (res.status === 503) {
          throw new Error(data.error || 'Database not available. Admin features require DATABASE_URL to be configured.')
        }
        throw new Error(data.error || 'Failed to save site')
      }

      // Redirect to the site detail page if we just created a new site
      if (isNew) {
        window.location.href = `#/admin/sites/${key}`
      } else {
        // Reload to show updated data
        await loadSite()
        alert('Site saved successfully')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddFilter() {
    if (!newFilterValue.trim()) {
      alert('Please enter a filter value')
      return
    }

    try {
      const res = await fetch(`${API_BASE}/sites/${siteKey}/filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: newFilterType,
          value: newFilterValue.trim(),
          futureOnly: newFilterFutureOnly
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add filter')
      }

      // Clear form and reload
      setNewFilterValue('')
      await loadSite()
    } catch (err) {
      alert(`Error: ${err.message}`)
    }
  }

  async function handleDeleteFilter(filterId) {
    if (!confirm('Delete this filter?')) return

    try {
      const res = await fetch(`${API_BASE}/filters/${filterId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!res.ok) {
        throw new Error('Failed to delete filter')
      }

      await loadSite()
    } catch (err) {
      alert(`Error: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Loading..." subtitle="Please wait" />
        <div className="p-4 text-center text-gray-600">Loading site...</div>
      </div>
    )
  }

  if (error && !isNew) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Error" subtitle="Failed to load site" />
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
          <a
            href="#/admin"
            className="block mt-4 px-4 py-2 bg-gray-600 text-white text-center rounded-lg"
          >
            Back to Admin
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={isNew ? 'Create Staff Site' : `Edit: ${name}`}
        subtitle={isNew ? 'New staff management site' : `Site key: ${key}`}
      />

      <div className="p-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Basic Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-lg text-gray-800 mb-3">Basic Information</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site Key * <span className="text-gray-500 font-normal">(URL-safe identifier)</span>
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase())}
                disabled={!isNew}
                placeholder="e.g., sra-training or kupittaa-reservi"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Lowercase letters, numbers, and hyphens only. Cannot be changed after creation.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Temppeli-SRA Training"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name *
              </label>
              <input
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="e.g., Suomen Reserviupseeriliitto - Temppeli-SRA"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Range <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={organizationRange}
                onChange={(e) => setOrganizationRange(e.target.value)}
                placeholder="e.g., Pääkaupunkiseutu"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="Europe/Helsinki">Europe/Helsinki</option>
                <option value="Europe/Stockholm">Europe/Stockholm</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>

        {/* Training Types */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-lg text-gray-800 mb-2">Training Types</h2>
          <p className="text-sm text-gray-600 mb-4">
            Configure staffing profiles for match/cup event categories. These settings drive trainer limits,
            squad rules, and event-to-training-type mapping.
          </p>

          {Object.entries(trainingTypes).length > 0 ? (
            <div className="space-y-4 mb-4">
              {Object.entries(trainingTypes).map(([typeKey, typeCfg]) => (
                <div key={typeKey} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <code className="text-sm font-semibold text-gray-700">{typeKey}</code>
                    <button
                      type="button"
                      onClick={() => handleDeleteTrainingType(typeKey)}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Search patterns (comma separated)</label>
                      <input
                        type="text"
                        value={(typeCfg.searchPatterns || []).join(', ')}
                        onChange={(e) => updateTrainingType(typeKey, current => ({
                          ...current,
                          searchPatterns: parseCsvStrings(e.target.value),
                        }))}
                        placeholder="e.g., kupittaa cup, turres kupittaa"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Label (fi)</label>
                        <input
                          type="text"
                          value={typeCfg.label?.fi || ''}
                          onChange={(e) => updateTrainingType(typeKey, current => ({
                            ...current,
                            label: {
                              ...(current.label || {}),
                              fi: e.target.value,
                            },
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Label (en)</label>
                        <input
                          type="text"
                          value={typeCfg.label?.en || ''}
                          onChange={(e) => updateTrainingType(typeKey, current => ({
                            ...current,
                            label: {
                              ...(current.label || {}),
                              en: e.target.value,
                            },
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max trainers</label>
                        <input
                          type="number"
                          min="1"
                          value={typeCfg.maxTrainers ?? ''}
                          onChange={(e) => updateTrainingType(typeKey, current => ({
                            ...current,
                            maxTrainers: e.target.value,
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Staff squad</label>
                        <input
                          type="number"
                          min="1"
                          value={typeCfg.staffSquad ?? ''}
                          onChange={(e) => updateTrainingType(typeKey, current => ({
                            ...current,
                            staffSquad: e.target.value,
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max shooter squads</label>
                        <input
                          type="number"
                          min="1"
                          value={typeCfg.maxSquads ?? ''}
                          onChange={(e) => updateTrainingType(typeKey, current => ({
                            ...current,
                            maxSquads: e.target.value,
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Min shooters per squad</label>
                        <input
                          type="number"
                          min="1"
                          value={typeCfg.minShootersPerSquad ?? ''}
                          onChange={(e) => updateTrainingType(typeKey, current => ({
                            ...current,
                            minShootersPerSquad: e.target.value,
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Shooter squads (comma separated numbers)</label>
                      <input
                        type="text"
                        value={(typeCfg.shooterSquads || []).join(', ')}
                        onChange={(e) => updateTrainingType(typeKey, current => ({
                          ...current,
                          shooterSquads: parseCsvNumbers(e.target.value),
                        }))}
                        placeholder="e.g., 1, 2, 3, 4"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 mb-4 p-3 bg-gray-50 rounded-lg">
              No training types configured yet.
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <h3 className="font-medium text-gray-800">Add Training Type</h3>

            <div className="flex gap-2">
              <input
                type="text"
                value={newTrainingTypeKey}
                onChange={(e) => setNewTrainingTypeKey(e.target.value.toLowerCase())}
                placeholder="e.g., kupittaa-cup"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
              />
              <button
                type="button"
                onClick={handleAddTrainingType}
                className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg active:bg-green-700"
              >
                + Add
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default training type for unmatched events
              </label>
              <select
                value={eventDiscoveryConfig.defaultTrainingType || ''}
                onChange={(e) => {
                  setEventDiscoveryConfig(prev => ({
                    ...prev,
                    defaultTrainingType: e.target.value,
                  }))
                  setHasEventDiscoveryConfigSection(true)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">None (pattern match required)</option>
                {Object.keys(trainingTypes).map(typeKey => (
                  <option key={typeKey} value={typeKey}>{typeKey}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                If set, events that pass site filters but do not match any training type search pattern will use this type.
              </p>
            </div>
          </div>
        </div>

        {/* Save button for basic info */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-3 text-white font-semibold rounded-lg ${
            saving ? 'bg-blue-400' : 'bg-blue-600 active:bg-blue-700'
          }`}
        >
          {saving ? 'Saving...' : isNew ? 'Create Site' : 'Save Changes'}
        </button>

        {/* Event Filters (only for existing sites) */}
        {!isNew && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-lg text-gray-800 mb-2">Event Filters</h2>
            <p className="text-sm text-gray-600 mb-4">
              Define which events should appear in the staffing view for this site.
            </p>

            {/* Existing filters */}
            {filters.length > 0 ? (
              <div className="space-y-2 mb-4">
                {filters.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-700">
                        {(FILTER_TYPE_LABELS[f.type] || f.type) + ': '}
                      </span>
                      <code className="text-sm bg-white px-2 py-0.5 rounded border border-gray-300">
                        {f.type === 'event_type' || f.type === 'event_kind'
                          ? formatEventKindValue(f.value)
                          : f.value}
                      </code>
                      {f.futureOnly && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Future only
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteFilter(f.id)}
                      className="ml-2 px-3 py-1 bg-red-600 text-white text-sm rounded"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 mb-4 p-3 bg-gray-50 rounded-lg">
                No filters configured. All events will be visible.
              </div>
            )}

            {/* Add new filter */}
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <h3 className="font-medium text-gray-800">Add New Filter</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter Type
                </label>
                <select
                  value={newFilterType}
                  onChange={(e) => {
                    const nextType = e.target.value
                    setNewFilterType(nextType)
                    if ((nextType === 'event_type' || nextType === 'event_kind') && !newFilterValue.trim()) {
                      setNewFilterValue('match')
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="name_contains">Name contains</option>
                  <option value="cup_id">Cup ID</option>
                  <option value="date_range">Date range</option>
                  <option value="event_type">Event type (Cup / League / Match)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter Value
                </label>
                {newFilterType === 'event_type' || newFilterType === 'event_kind' ? (
                  <select
                    value={newFilterValue || 'match'}
                    onChange={(e) => setNewFilterValue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {EVENT_KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newFilterValue}
                    onChange={(e) => setNewFilterValue(e.target.value)}
                    placeholder={
                      newFilterType === 'name_contains' ? 'e.g., reservi' :
                      newFilterType === 'cup_id' ? 'e.g., 12345' :
                      'e.g., 2024-01-01:2024-12-31'
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="futureOnly"
                  checked={newFilterFutureOnly}
                  onChange={(e) => setNewFilterFutureOnly(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="futureOnly" className="ml-2 text-sm text-gray-700">
                  Future events only (hide past events)
                </label>
              </div>

              <button
                onClick={handleAddFilter}
                className="w-full py-2 bg-green-600 text-white font-semibold rounded-lg active:bg-green-700"
              >
                + Add Filter
              </button>
            </div>
          </div>
        )}

        {/* Back button */}
        <a
          href="#/admin"
          className="block w-full py-3 bg-gray-600 text-white text-center font-semibold rounded-lg"
        >
          Back to Admin
        </a>
      </div>
    </div>
  )
}
