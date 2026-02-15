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

  useEffect(() => {
    if (!isNew) {
      loadSite()
    }
  }, [siteKey])

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
